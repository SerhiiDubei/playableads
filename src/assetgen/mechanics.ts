// Mechanics catalog (epic D). A "mechanic" = a full playable GAME
// (templates/<id>/ with a manifest), distinct from ad-screen formats (layouts/).
//
// v1 catalog = curated games that meet TEMPLATE-STANDARD (manifest.catalog ===
// "v1"). Everything else is a candidate, shown only in dev mode. Extensible:
// drop a template dir + manifest and it appears automatically.
//
//   npm run mechanics            # user mode — curated v1 only
//   npm run mechanics -- --dev   # dev mode — all (v1 + candidates)

import { listTemplates } from "../loader.js";
import type { TemplateManifest } from "../types.js";

export type CatalogMode = "user" | "dev";

export async function listMechanics(mode: CatalogMode = "user"): Promise<TemplateManifest[]> {
  const all = (await listTemplates()).sort((a, b) => a.id.localeCompare(b.id));
  return mode === "dev" ? all : all.filter((m) => m.catalog === "v1");
}

async function main(): Promise<void> {
  const dev = process.argv.includes("--dev");
  const list = await listMechanics(dev ? "dev" : "user");
  console.log(`\nMechanics catalog (${dev ? "dev — all" : "v1 — curated"}): ${list.length}`);
  for (const m of list) {
    const tier = m.catalog === "v1" ? "v1  " : m.catalog === "candidate" ? "cand" : "—   ";
    console.log(`  [${tier}] ${m.id.padEnd(22)} ${m.name}`);
  }
  if (!dev) {
    const total = (await listMechanics("dev")).length;
    console.log(`\n${total - list.length} candidate(s) hidden — show with: npm run mechanics -- --dev`);
  }
}

const invoked = process.argv[1]?.endsWith("mechanics.ts") || process.argv[1]?.endsWith("mechanics.js");
if (invoked) main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
