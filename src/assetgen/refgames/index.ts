// Reference-games loader — validates the JSON base against the schema on load
// (a broken/incomplete entry fails loudly, not silently). This is the
// deterministic retrieval source for Agent 2.

import { readFileSync } from "node:fs";
import path from "node:path";
import { ReferenceGameSchema, type ReferenceGame } from "./schema.js";

const DB = path.join(import.meta.dirname, "games.json");

let cache: ReferenceGame[] | null = null;

export function loadReferenceGames(): ReferenceGame[] {
  if (cache) return cache;
  const raw = JSON.parse(readFileSync(DB, "utf8")) as unknown[];
  cache = raw.map((r, i) => {
    const parsed = ReferenceGameSchema.safeParse(r);
    if (!parsed.success) {
      throw new Error(`reference-game #${i} invalid:\n${parsed.error.issues.map((x) => `  ${x.path.join(".")}: ${x.message}`).join("\n")}`);
    }
    return parsed.data;
  });
  return cache;
}

export function getReferenceGame(id: string): ReferenceGame | undefined {
  return loadReferenceGames().find((g) => g.id === id);
}

// Lightweight deterministic search: rank by overlap of query words against
// game name / genre / mood / objects. (Embeddings can swap in later.)
export function searchReferenceGames(query: string, limit = 3): ReferenceGame[] {
  const q = new Set((query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length >= 3));
  const scored = loadReferenceGames().map((g) => {
    const hay = `${g.game} ${g.tags.genre} ${g.tags.mood.join(" ")} ${g.objects.join(" ")} ${g.coreAction}`.toLowerCase();
    let score = 0;
    for (const w of q) if (hay.includes(w)) score++;
    return { g, score };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).filter((s) => s.score > 0).map((s) => s.g);
}

// CLI: `tsx src/assetgen/refgames/index.ts` → validate + list the base.
const entry = process.argv[1]?.replace(/\\/g, "/") ?? "";
const invoked = entry.endsWith("refgames/index.ts") || entry.endsWith("refgames/index.js");
if (invoked) {
  const games = loadReferenceGames();
  console.log(`\nReference-games base: ${games.length} validated ✓`);
  for (const g of games) {
    console.log(`  ${g.id.padEnd(16)} ${g.game.padEnd(18)} [${g.tags.coreAction}] aha:${g.ahaMoments.length} screens:${g.screens.length} maps→${g.mapsToTemplate ?? "—"}`);
  }
}
