// Validate stage (Phase 1, AC1.1). Wraps the deterministic Meta validator
// (src/build/validator.ts) as a pipeline Stage: reads the built HTML from
// envelope.build.htmlPath, runs validate(), and writes the result into
// envelope.validation. Enrich-only — it does NOT throw on ok=false (the run
// completes; a higher layer / gate decides what to do with a failed creative).

import { promises as fs } from "node:fs";
import { validate } from "../../../build/validator.js";
import type { Envelope, Stage } from "../types.js";

export const validateStage: Stage<Envelope, Envelope> = {
  name: "validate",
  async run(env) {
    if (!env.build?.htmlPath) {
      throw new Error(
        "validate stage: envelope.build.htmlPath is missing — the build stage must run first.",
      );
    }
    const html = await fs.readFile(env.build.htmlPath, "utf8");
    const r = validate(html);
    return {
      ...env,
      validation: {
        ok: r.ok,
        checks: {
          bytes: r.bytes,
          maxBytes: r.maxBytes,
          errors: r.errors,
          warnings: r.warnings,
        },
      },
    };
  },
};
