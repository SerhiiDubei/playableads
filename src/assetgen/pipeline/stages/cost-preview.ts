// cost-preview stage (Phase 4, AC4.1/4.3). A GATE: it estimates how much an
// asset generation would cost, writes cost.json next to run.json, and pauses the
// run (status "needs-approval"). The human approves the sum with
// `pipeline approve <runId>` before anything that spends money proceeds.
//
// Envelope schema is frozen (CHECKPOINT A) → cost lives in its own run artifact,
// not in the envelope.

import { writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Envelope, Stage } from "../types.js";

// Rough gpt-image-1.5 per-image cost (USD). Tune as pricing changes.
export const PER_IMAGE_USD = 0.08;

export interface CostEstimate {
  style: string;
  cachedAssets: number;
  willGenerateNow: number;
  perImageUsd: number;
  chargeNowUsd: number;
  fullRegenUsd: number;
}

export function estimateCost(style: string, baseDir = "out"): CostEstimate {
  let pngs = 0;
  try {
    pngs = readdirSync(path.join(baseDir, style)).filter((f) => f.toLowerCase().endsWith(".png")).length;
  } catch {
    /* style dir missing → 0 cached */
  }
  return {
    style,
    cachedAssets: pngs,
    willGenerateNow: 0, // menu pipeline reuses cached assets; a real forge run sets this
    perImageUsd: PER_IMAGE_USD,
    chargeNowUsd: 0,
    fullRegenUsd: +(pngs * PER_IMAGE_USD).toFixed(2),
  };
}

export function costPreviewStage(opts: { baseDir?: string } = {}): Stage<Envelope, Envelope> {
  return {
    name: "cost-preview",
    gate: true,
    async run(env, ctx) {
      const cost = estimateCost(env.brief.style, opts.baseDir ?? "out");
      writeFileSync(path.join(ctx.runDir, "cost.json"), JSON.stringify(cost, null, 2) + "\n");
      console.log(
        `💰 cost-preview: ${cost.cachedAssets} assets cached → charge now $${cost.chargeNowUsd.toFixed(2)}. ` +
          `Full regen ≈ $${cost.fullRegenUsd.toFixed(2)}. Approve with: pipeline approve ${ctx.runId}`,
      );
      return env;
    },
  };
}
