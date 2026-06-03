// planner stage (Phase 5, AC5.1/5.2). Turns intent (style + chosen layout) into
// a screen plan: plan.screens[] (from the template) + plan.assetKeys[] (the
// source assets available for the style). gate:true → pauses so the plan is
// REVIEWABLE/EDITABLE in envelope.json before any asset work runs (Q29).
//
// Planner decides WHAT; assetgen executes it (filters to plan.assetKeys).

import { readdirSync } from "node:fs";
import path from "node:path";
import { getLayout } from "../../layouts/index.js";
import type { Envelope, Stage } from "../types.js";

export function plannerStage(layout: string, opts: { baseDir?: string } = {}): Stage<Envelope, Envelope> {
  const base = opts.baseDir ?? "out";
  return {
    name: "planner",
    gate: true,
    async run(env) {
      const tpl = getLayout(layout);
      const screens = (tpl.meta.screenIds ?? [layout]).map((id) => ({ id }));

      let assetKeys: string[] = [];
      try {
        assetKeys = readdirSync(path.join(base, env.brief.style))
          .filter((f) => f.toLowerCase().endsWith(".png"))
          .map((f) => f.slice(0, -4))
          .sort();
      } catch {
        /* missing style dir → empty asset list (plan still valid) */
      }
      return { ...env, plan: { screens, assetKeys } };
    },
  };
}
