// summarize-agent (epic B, Q06). Given a prompt, rank mechanics from the catalog
// and return top-3 + a "superbutton" (the #1 one-tap recommendation).
//
// Deterministic now (keyword overlap + v1 bonus) so it's headless & free; swap
// the scorer for an LLM later behind the same signature — callers don't change.

import { listMechanics } from "../mechanics.js";

export interface Suggestion {
  id: string;
  name: string;
  score: number;
  matched: string[]; // prompt words that hit this mechanic
}

export interface BriefSummary {
  top3: Suggestion[];
  superbutton: Suggestion | null; // #1 — the one-tap "just do this"
}

function words(s: string): string[] {
  return (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length >= 3);
}

export async function summarizeBrief(prompt: string): Promise<BriefSummary> {
  const promptWords = [...new Set(words(prompt))];
  const mechs = await listMechanics("dev"); // suggest from all (incl. candidates)

  const scored: Suggestion[] = mechs
    .map((m) => {
      const hay = `${m.name} ${m.description}`.toLowerCase();
      const matched = promptWords.filter((w) => hay.includes(w));
      let score = matched.length;
      if (m.catalog === "v1") score += 1; // curated, meets the bar → prefer
      return { id: m.id, name: m.name, score, matched };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const top3 = scored.slice(0, 3);
  return { top3, superbutton: top3[0] ?? null };
}
