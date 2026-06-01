#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { buildFromBriefFile } from "./builder.js";
import { buildKitPlayable } from "./assetgen/build-test-playable.js";
import { validate } from "./build/validator.js";
import { listStyles, listTemplates, TEMPLATES_DIR, OUT_DIR } from "./loader.js";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "list":
      return cmdList();
    case "build":
      return cmdBuild(rest[0]);
    case "menu":
      return cmdMenu(rest[0]);
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
  playable list                 List available mechanics and styles
  playable build <brief.json>   Build a single-file playable from a brief
  playable menu [styleId]       Build a kit-based menu playable (default: heroes3)
  playable validate <file.html> Validate an HTML file against Meta requirements
  playable new <mechanic-id>    Scaffold a new mechanic template
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

async function cmdMenu(styleId = "heroes3"): Promise<void> {
  const { html, assetBytes } = await buildKitPlayable(styleId);
  const v = validate(html);
  await fs.mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `menu-${styleId}.html`);
  await fs.writeFile(outPath, html, "utf8");

  console.log(`\nBuilt ${GREEN}${path.relative(process.cwd(), outPath)}${RESET}`);
  console.log(`  assets: ${(assetBytes / 1024).toFixed(1)} KB`);
  console.log(`  size: ${(v.bytes / 1024).toFixed(1)} KB / ${(v.maxBytes / 1024).toFixed(0)} KB`);
  for (const w of v.warnings) console.log(`  ${YELLOW}warn:${RESET} ${w}`);
  for (const e of v.errors) console.log(`  ${RED}fail:${RESET} ${e}`);
  console.log(v.ok ? `  ${GREEN}PASS${RESET} — meets Meta single-file requirements\n` : `  ${RED}REJECTED${RESET}\n`);
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
  if (!id || !/^[a-z0-9-]+$/.test(id)) {
    console.error(`${RED}error:${RESET} provide a kebab-case id, e.g. playable new swipe-to-slice`);
    process.exit(1);
  }
  const dir = path.join(TEMPLATES_DIR, id);
  await fs.mkdir(dir, { recursive: true });
  const manifest = {
    id,
    name: id,
    description: "TODO: describe the mechanic.",
    entry: "game.ts",
    assetBudgetBytes: 1468006,
    params: {},
  };
  await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  const stub = `import { Application } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

async function main(): Promise<void> {
  const app = new Application();
  await app.init({ resizeTo: window, background: 0x000000 });
  document.body.appendChild(app.canvas);
  // TODO: build the "${id}" mechanic. Call window.FbPlayableAd.onCTAClick() on the CTA.
  void cfg;
  void gsap;
}

void main();
`;
  await fs.writeFile(path.join(dir, "game.ts"), stub);
  console.log(`${GREEN}Created${RESET} templates/${id}/ (manifest.json, game.ts)`);
}

main().catch((err: unknown) => {
  console.error(`${RED}error:${RESET} ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
