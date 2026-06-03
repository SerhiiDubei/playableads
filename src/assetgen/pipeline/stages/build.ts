// build stage (Phase 2, AC2.2). Runs the kit builder for the run's style +
// layout THROUGH the orchestrator, writes the playable into the run dir, and
// sets envelope.build. Output is identical to a direct buildKitPlayable call —
// the pipeline only adds run.json / envelope / resumability around it.

import { writeFileSync } from "node:fs";
import path from "node:path";
import { buildKitPlayable } from "../../build-test-playable.js";
import type { Envelope, Stage } from "../types.js";

export function buildStage(opts: { layout: string }): Stage<Envelope, Envelope> {
  return {
    name: "build",
    async run(env, ctx) {
      const { html, layoutId } = await buildKitPlayable(env.brief.style, { layout: opts.layout });
      const htmlPath = path.join(ctx.runDir, `${layoutId}.html`);
      writeFileSync(htmlPath, html);
      return { ...env, build: { htmlPath, bytes: Buffer.byteLength(html, "utf8") } };
    },
  };
}
