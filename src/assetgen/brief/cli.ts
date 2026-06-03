// brief CLI (epic B). Headless intake of a user-brief + suggestions.
//
//   brief new "<prompt>" --ref <path> [--ref <path>] [--style <id>] [--audience <x>] ...
//   brief list
//   brief show <id> [version]
//   brief rollback <id> <version>

import { createBrief, listBriefs, listVersions, readBrief, rollback, currentVersion } from "./store.js";
import { summarizeBrief } from "./summarize.js";
import { yellowWarnings } from "./types.js";

const G = "\x1b[32m", Y = "\x1b[33m", R = "\x1b[31m", DIM = "\x1b[90m", B = "\x1b[1m", X = "\x1b[0m";

function flags(args: string[]): { positional: string[]; refs: string[]; opt: Record<string, string> } {
  const positional: string[] = [], refs: string[] = [], opt: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--ref") refs.push(args[++i] ?? "");
    else if (a.startsWith("--")) opt[a.slice(2)] = args[++i] ?? "";
    else positional.push(a);
  }
  return { positional, refs, opt };
}

async function cmdNew(args: string[]): Promise<void> {
  const { positional, refs, opt } = flags(args);
  const prompt = positional.join(" ").trim();
  if (!prompt) return fail('new needs a prompt: brief new "make a slot game" --ref a.png');
  if (refs.length === 0) return fail("new needs ≥1 --ref (references are mandatory).");

  const b = createBrief(
    { prompt, refs, style: opt.style, audience: opt.audience, niche: opt.niche, tone: opt.tone },
    new Date().toISOString(),
  );
  console.log(`${G}✓ brief created:${X} ${b.id} (v${b.version})  ${DIM}briefs/user/${b.id}/${X}`);
  for (const w of yellowWarnings(b)) console.log(`  ${Y}⚠ ${w}${X}`);

  const { top3, superbutton } = await summarizeBrief(prompt);
  console.log(`\n${B}Топ-3 механіки під твій промт:${X}`);
  top3.forEach((s, i) => {
    const tag = s.id === superbutton?.id ? `${G}★ суперкнопка${X}` : `${DIM}#${i + 1}${X}`;
    console.log(`  ${tag}  ${s.name} ${DIM}(${s.id}, score ${s.score}${s.matched.length ? ", hit: " + s.matched.join("/") : ""})${X}`);
  });
  if (superbutton) console.log(`\n→ one-tap: ${G}npm run pipeline -- run <style> ${superbutton.id}${X}`);
}

function cmdList(): void {
  const ids = listBriefs();
  console.log(`\nuser briefs: ${ids.length}`);
  for (const id of ids) console.log(`  ${id} ${DIM}(current v${currentVersion(id)}, ${listVersions(id).length} versions)${X}`);
}

function cmdShow(id: string, version?: string): void {
  if (!id) return fail("show needs an <id>");
  const b = readBrief(id, version ? Number(version) : undefined);
  console.log(`${B}${b.id}${X} v${b.version}  ${DIM}${b.createdAt}${X}`);
  console.log(`  prompt: ${b.prompt}`);
  console.log(`  refs:   ${b.refs.join(", ")}`);
  for (const f of ["style", "audience", "niche", "tone"] as const) if (b[f]) console.log(`  ${f}: ${b[f]}`);
  console.log(`  versions: ${listVersions(id).join(", ")} (current: v${currentVersion(id)})`);
}

function cmdRollback(id: string, version: string): void {
  if (!id || !version) return fail("rollback needs <id> <version>");
  const b = rollback(id, Number(version));
  console.log(`${G}✓ rolled back${X} ${id} → v${b.version} ${DIM}(pointer only — no regeneration)${X}`);
}

function usage(): void {
  console.log(`brief — user-brief intake (epic B)

  brief new "<prompt>" --ref <path> [--ref ...] [--style <id>] [--audience <x>]
  brief list
  brief show <id> [version]
  brief rollback <id> <version>`);
}

function fail(msg: string): void {
  console.error(`${R}error:${X} ${msg}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "new": return cmdNew(rest);
    case "list": return cmdList();
    case "show": return cmdShow(rest[0], rest[1]);
    case "rollback": return cmdRollback(rest[0], rest[1]);
    default: usage();
  }
}

main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
