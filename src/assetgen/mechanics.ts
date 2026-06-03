// Mechanics catalog (epic D). A "mechanic" = a full playable GAME
// (templates/<id>/ with a manifest), distinct from ad-screen formats (layouts/).
//
// v1 catalog = curated games that meet TEMPLATE-STANDARD (manifest.catalog ===
// "v1"). Everything else is a candidate, shown only in dev mode. Extensible:
// drop a template dir + manifest and it appears automatically.
//
//   npm run mechanics            # user mode — curated v1 only
//   npm run mechanics -- --dev   # dev mode — all (v1 + candidates)

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { listTemplates } from "../loader.js";
import { LABS_DIR } from "./scaffold.js";
import type { TemplateManifest } from "../types.js";

export type CatalogMode = "user" | "dev";

export async function listMechanics(mode: CatalogMode = "user"): Promise<TemplateManifest[]> {
  const all = (await listTemplates()).sort((a, b) => a.id.localeCompare(b.id));
  return mode === "dev" ? all : all.filter((m) => m.catalog === "v1");
}

// Draft mechanics in labs/ (created via `playable new` / Studio). Not yet
// promoted to templates/ → not in the curated catalog.
export function listDrafts(): TemplateManifest[] {
  if (!existsSync(LABS_DIR)) return [];
  const out: TemplateManifest[] = [];
  for (const d of readdirSync(LABS_DIR)) {
    const mf = path.join(LABS_DIR, d, "manifest.json");
    if (!existsSync(mf)) continue;
    try {
      out.push(JSON.parse(readFileSync(mf, "utf8")) as TemplateManifest);
    } catch {
      /* skip malformed draft */
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
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
