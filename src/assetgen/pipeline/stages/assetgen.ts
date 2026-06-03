// assetgen stage (Phase 2, AC2.3). Emits envelope.assets[] describing the
// assets present in out/<style>/ — this is the contract the build stage will
// read (P2-2), replacing the builder's hardcoded asset list.
//
// READ-ONLY: it does NOT call OpenAI. Generation is a separate concern
// (run.ts / `forge`); this stage just describes what already exists on disk,
// so wiring the pipeline never costs money or changes pixels. Sidecar
// <key>.json (written by run.ts) supplies prompt + briefVersion for repro.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { Envelope, AssetEntry, Stage } from "../types.js";

export interface AssetgenOptions {
  /** Where style asset dirs live. Default "out". Injectable for tests. */
  baseDir?: string;
}

export function assetgenStage(opts: AssetgenOptions = {}): Stage<Envelope, Envelope> {
  const base = opts.baseDir ?? "out";
  return {
    name: "assetgen",
    async run(env) {
      const style = env.brief.style;
      const dir = path.join(base, style);

      let files: string[];
      try {
        files = await fs.readdir(dir);
      } catch {
        throw new Error(`assetgen: assets dir not found: ${dir} (style "${style}")`);
      }

      const pngs = files.filter((f) => f.toLowerCase().endsWith(".png")).sort();
      const assets: AssetEntry[] = [];
      for (const file of pngs) {
        const key = file.slice(0, -4);
        const full = path.join(dir, file);
        const { size } = await fs.stat(full);
        let prompt = "";
        let briefVersion = "";
        try {
          const side = JSON.parse(await fs.readFile(path.join(dir, `${key}.json`), "utf8"));
          prompt = typeof side.prompt === "string" ? side.prompt : "";
          briefVersion = side.briefVersion != null ? String(side.briefVersion) : "";
        } catch {
          /* sidecar optional */
        }
        assets.push({ key, path: full, bytes: size, prompt, briefVersion });
      }

      if (assets.length === 0) {
        throw new Error(`assetgen: no .png assets in ${dir}`);
      }
      return { ...env, assets };
    },
  };
}
