// Agent-2 LLM brain — turns free-text into a mechanic brief, via the Claude
// Agent SDK using the local Claude Code subscription (no API key needed).
//
// Single point of LLM use: free text → { reply, briefPatch }. Deterministic
// card/chip clicks in the UI do NOT call this. Pure text task: no tools, no
// project settings loaded (settingSources:[]) → lean, focused, predictable.

import { query } from "@anthropic-ai/claude-agent-sdk";

export interface MechanicBrief {
  ref?: string | null;
  coreAction?: string | null;
  objects?: string[] | null;
  goal?: string | null;
  tension?: string | null;
  ahaMoment?: string | null;
  loop?: string | null;
  ctaHook?: string | null;
  name?: string | null;
}

export interface AgentTurn {
  reply: string;
  briefPatch: Partial<MechanicBrief>;
  costUsd: number;
}

const SYSTEM = `Ти — досвідчений експерт зі створення playable-ads (міні-ігор для реклами).
Постава: помічник-експерт, не допитувач. Ведеш дизайнера через РЕФЕРЕНС до готового брифу.

Бриф механіки (предмет збору):
- ref: 1+ конкретна гра-орієнтир (як "Fruit Ninja", "Stack"). Якщо юзер не може назвати — ЗАПРОПОНУЙ 2-3 РЕАЛЬНІ відомі ігри що пасують, з коротким чому.
- coreAction: головна дія пальцем — рівно одне з: tap, swipe, drag, aim.
- objects: що на екрані (масив, напр. ["фрукти","бомби","лезо"]).
- goal: ціль + умова виграшу.
- tension: що створює ставку (таймер / життя / промах).
- ahaMoment: ОДИН смаковий біт, який реклама продає.
- loop: тривалість ~15-30с і як росте складність.
- ctaHook: момент що рве на install.

Правила:
- Відповідай ЛИШЕ українською. Ніколи російською.
- Пропонуй тільки РЕАЛЬНІ ігри (не вигадуй назв).
- Став максимум одне коротке питання за раз. Не дави.
- Якщо з тексту юзера можеш впевнено витягти поля — заповни їх у briefPatch.
- Заповнюй лише ті поля, в яких упевнений; решту лиши порожніми.

ФОРМАТ ВІДПОВІДІ — суворо ОДИН JSON-обʼєкт, без жодного тексту довкола:
{"reply": "<коротка репліка українською>", "briefPatch": {<лише впевнені поля>}}`;

function extractJson(s: string): { reply: string; briefPatch: Partial<MechanicBrief> } {
  // Strip ```json fences and grab the first {...} block.
  const fenced = s.replace(/```(?:json)?/gi, "").trim();
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1) return { reply: fenced || "…", briefPatch: {} };
  const parsed = JSON.parse(fenced.slice(start, end + 1)) as {
    reply?: string;
    briefPatch?: Partial<MechanicBrief>;
  };
  return { reply: parsed.reply ?? "…", briefPatch: parsed.briefPatch ?? {} };
}

export async function agentTurn(userText: string, brief: MechanicBrief): Promise<AgentTurn> {
  const prompt = `Поточний бриф (JSON): ${JSON.stringify(brief)}

Юзер написав: """${userText}"""

Онови бриф із цього тексту й відповідай за форматом.`;

  const q = query({
    prompt,
    options: {
      systemPrompt: SYSTEM,
      allowedTools: [], // pure text — no file/bash tools
      settingSources: [], // don't load project CLAUDE.md/settings — lean & focused
      maxTurns: 1,
      permissionMode: "bypassPermissions",
    },
  });

  let result = "";
  let costUsd = 0;
  for await (const m of q) {
    if (m.type === "result") {
      if (m.subtype === "success") result = m.result;
      costUsd = m.total_cost_usd ?? 0;
    }
  }

  try {
    const { reply, briefPatch } = extractJson(result);
    return { reply, briefPatch, costUsd };
  } catch {
    return { reply: result || "Не зрозумів — спробуй переформулювати.", briefPatch: {}, costUsd };
  }
}
