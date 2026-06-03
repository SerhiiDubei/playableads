#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { buildFromBriefFile } from "./builder.js";
import { buildKitPlayable } from "./assetgen/build-test-playable.js";
import { validate } from "./build/validator.js";
import { listStyles, listTemplates, OUT_DIR } from "./loader.js";
import { logStage, timed, summary } from "./assetgen/stage-log.js";
import { writeHtmlReport } from "./assetgen/log-report.js";
import { runAssetGen } from "./assetgen/run.js";
import { listStyles as listStylesFn } from "./loader.js";
import { writeCatalogHtml } from "./assetgen/catalog.js";
import { listLayouts, DEFAULT_LAYOUT } from "./assetgen/layouts/index.js";
import { scaffoldMechanic } from "./assetgen/scaffold.js";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

function getFlag(rest: string[], name: string): string | undefined {
  const idx = rest.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return rest[idx + 1];
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "list":
      return cmdList();
    case "build":
      return cmdBuild(rest[0]);
    case "menu":
      return cmdMenu(rest[0], { layout: getFlag(rest, "layout") });
    case "forge":
      return cmdForge(rest[0], {
        force: rest.includes("--force"),
        open: !rest.includes("--no-open"),
        layout: getFlag(rest, "layout"),
      });
    case "catalog":
      return cmdCatalog({ open: !rest.includes("--no-open") });
    case "validate":
      return cmdValidate(rest[0]);
    case "new":
      return cmdNew(rest[0]);
    default:
      usage();
  }
}

function usage(): void {
  console.log(`playable — Meta playable ad toolchain

Usage:
  playable list                                    List mechanics, styles, layouts
  playable forge <styleId> [--layout <id>]         Full pipeline: gen assets + build playable
                            [--force] [--no-open]
  playable menu  <styleId> [--layout <id>]         Phase 2 only: build playable from existing assets
  playable build <brief.json>                      Build from a custom brief
  playable catalog [--no-open]                     Scan all out/<style>/ → out/catalog.html
  playable validate <file.html>                    Meta requirements check
  playable new <mechanic-id>                       Scaffold a new mechanic DRAFT in labs/
`);
}

async function cmdList(): Promise<void> {
  const [templates, styles] = await Promise.all([listTemplates(), listStyles()]);
  console.log(`\nMechanics (${templates.length}):`);
  for (const t of templates) {
    console.log(`  ${GREEN}${t.id}${RESET} — ${t.description}`);
  }
  console.log(`\nStyles (${styles.length}):`);
  for (const s of styles) {
    console.log(`  ${GREEN}${s.id}${RESET} — ${s.name}`);
  }
  const layouts = listLayouts();
  console.log(`\nLayouts (${layouts.length}):`);
  for (const l of layouts) {
    console.log(`  ${GREEN}${l.id}${RESET} — ${l.description}`);
  }
  console.log("");
}

async function cmdBuild(briefFile?: string): Promise<void> {
  if (!briefFile) {
    console.error(`${RED}error:${RESET} provide a brief file, e.g. playable build briefs/example.json`);
    process.exit(1);
  }
  const result = await buildFromBriefFile(path.resolve(briefFile));
  const { validation: v, outPath } = result;
  const kb = (v.bytes / 1024).toFixed(1);
  const limitKb = (v.maxBytes / 1024).toFixed(0);

  console.log(`\nBuilt ${GREEN}${path.relative(process.cwd(), outPath)}${RESET}`);
  console.log(`  size: ${kb} KB / ${limitKb} KB`);
  for (const w of v.warnings) console.log(`  ${YELLOW}warn:${RESET} ${w}`);
  for (const e of v.errors) console.log(`  ${RED}fail:${RESET} ${e}`);

  if (v.ok) {
    console.log(`  ${GREEN}PASS${RESET} — meets Meta single-file requirements\n`);
  } else {
    console.log(`  ${RED}REJECTED${RESET} — fix the errors above before uploading\n`);
    process.exit(1);
  }
}

async function cmdMenu(styleId = "heroes3", opts: { layout?: string } = {}): Promise<void> {
  const { html, assetBytes, layoutId } = await buildKitPlayable(styleId, { layout: opts.layout });
  const v = await timed("validate", "meta.checks", () => validate(html), {
    note: "size + CTA + no-external + no-redirect",
  });
  await fs.mkdir(OUT_DIR, { recursive: true });
  const suffix = layoutId === DEFAULT_LAYOUT ? "" : `-${layoutId}`;
  const outPath = path.join(OUT_DIR, `menu-${styleId}${suffix}.html`);
  await timed("write", `file.${path.basename(outPath)}`, () => fs.writeFile(outPath, html, "utf8"), {
    bytesFromResult: () => Buffer.byteLength(html, "utf8"),
    note: outPath,
  });

  const s = summary();
  logStage("summary", "done", {
    durationMs: s.totalMs,
    note: `phases: ${Object.entries(s.byPhase).map(([k, v]) => `${k}=${v}ms`).join(" ")}`,
  });

  const reportPath = path.join(OUT_DIR, `log-${styleId}${suffix}.html`);
  writeHtmlReport({
    styleId,
    outPath: reportPath,
    playablePath: outPath,
    validateOk: v.ok,
    finalBytes: v.bytes,
  });

  console.log(`\nBuilt ${GREEN}${path.relative(process.cwd(), outPath)}${RESET}`);
  console.log(`  assets: ${(assetBytes / 1024).toFixed(1)} KB`);
  console.log(`  size: ${(v.bytes / 1024).toFixed(1)} KB / ${(v.maxBytes / 1024).toFixed(0)} KB`);
  for (const w of v.warnings) console.log(`  ${YELLOW}warn:${RESET} ${w}`);
  for (const e of v.errors) console.log(`  ${RED}fail:${RESET} ${e}`);
  console.log(v.ok ? `  ${GREEN}PASS${RESET} — meets Meta single-file requirements` : `  ${RED}REJECTED${RESET}`);
  console.log(`  log report: ${GREEN}${path.relative(process.cwd(), reportPath)}${RESET}\n`);
  if (!v.ok) process.exit(1);
}

async function cmdValidate(file?: string): Promise<void> {
  if (!file) {
    console.error(`${RED}error:${RESET} provide an HTML file, e.g. playable validate out/coin-rush-en.html`);
    process.exit(1);
  }
  const html = await fs.readFile(path.resolve(file), "utf8");
  const v = validate(html);
  console.log(`\n${file}`);
  console.log(`  size: ${(v.bytes / 1024).toFixed(1)} KB / ${(v.maxBytes / 1024).toFixed(0)} KB`);
  for (const w of v.warnings) console.log(`  ${YELLOW}warn:${RESET} ${w}`);
  for (const e of v.errors) console.log(`  ${RED}fail:${RESET} ${e}`);
  console.log(v.ok ? `  ${GREEN}PASS${RESET}\n` : `  ${RED}REJECTED${RESET}\n`);
  if (!v.ok) process.exit(1);
}

async function cmdNew(id?: string): Promise<void> {
  if (!id) {
    console.error(`${RED}error:${RESET} provide a kebab-case id, e.g. playable new swipe-to-slice`);
    process.exit(1);
  }
  try {
    // labs-first: new mechanics start as drafts in labs/, promoted later (T-01).
    const { dir } = scaffoldMechanic({ id });
    console.log(`${GREEN}Created draft${RESET} ${dir}/ (manifest.json, game.ts)`);
    console.log(`  Build it, then promote to templates/ per docs/TEMPLATE-STANDARD.md.`);
  } catch (e) {
    console.error(`${RED}error:${RESET} ${(e as Error).message}`);
    process.exit(1);
  }
}

async function cmdForge(styleId?: string, opts: { force?: boolean; open?: boolean; layout?: string } = {}): Promise<void> {
  if (!styleId) {
    console.error(`${RED}error:${RESET} provide a style id, e.g. playable forge cyber-heist`);
    console.log(`available styles:`);
    const styles = await listStylesFn();
    for (const s of styles) console.log(`  ${GREEN}${s.id}${RESET} — ${s.name}`);
    process.exit(1);
  }
  const briefPath = path.resolve(`styles/${styleId}.brief.json`);
  try {
    await fs.access(briefPath);
  } catch {
    console.error(`${RED}error:${RESET} brief not found at ${briefPath}`);
    process.exit(1);
  }

  // ── Phase 1: AI asset generation ───────────────────────────────────────────
  console.log(`${YELLOW}━━ Phase 1: asset generation ━━${RESET}`);
  const gen = await runAssetGen({
    briefPath,
    force: opts.force,
    onLog: (msg) => logStage("gen", "openai", { note: msg.trim() }),
  });
  console.log(`${GREEN}Phase 1 done:${RESET} ${gen.generated} generated, ${gen.skipped} skipped, ${gen.errors} errors · $${gen.totalCost.toFixed(3)} · ${(gen.wallTimeMs / 1000).toFixed(1)}s`);
  if (gen.errors > 0) {
    console.error(`${RED}error:${RESET} Phase 1 had ${gen.errors} failures — aborting before Phase 2`);
    process.exit(1);
  }

  // ── Phase 2: HTML playable build ───────────────────────────────────────────
  console.log(`\n${YELLOW}━━ Phase 2: HTML playable build${opts.layout ? ` (layout=${opts.layout})` : ""} ━━${RESET}`);
  await cmdMenu(styleId, { layout: opts.layout });

  // ── Open results if requested ──────────────────────────────────────────────
  if (opts.open) {
    const suffix = !opts.layout || opts.layout === DEFAULT_LAYOUT ? "" : `-${opts.layout}`;
    const playablePath = path.join(OUT_DIR, `menu-${styleId}${suffix}.html`);
    const logPath = path.join(OUT_DIR, `log-${styleId}${suffix}.html`);
    await openInBrowser([playablePath, logPath]);
    console.log(`${GREEN}opened:${RESET} ${path.relative(process.cwd(), playablePath)} + log report`);
  }
}

async function cmdCatalog(opts: { open?: boolean } = {}): Promise<void> {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const r = writeCatalogHtml(path.join(OUT_DIR, "catalog.html"));
  console.log(`${GREEN}catalog:${RESET} ${r.styles} styles, ${r.assets} assets, $${r.cost.toFixed(2)} total spend`);
  console.log(`  -> ${path.relative(process.cwd(), r.path)}`);
  if (opts.open) await openInBrowser([r.path]);
}

async function openInBrowser(paths: string[]): Promise<void> {
  const opener = process.platform === "win32" ? "start" : process.platform === "darwin" ? "open" : "xdg-open";
  const { spawn } = await import("node:child_process");
  for (const p of paths) {
    spawn(opener, ["", p], { shell: true, stdio: "ignore", detached: true }).unref();
  }
}

main().catch((err: unknown) => {
  console.error(`${RED}error:${RESET} ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
