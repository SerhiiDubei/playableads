import { promises as fs } from "node:fs";
import path from "node:path";
import { bundleTemplate } from "./build/bundler.js";
import { buildHtml, loadAssets } from "./build/inliner.js";
import { validate, type ValidationResult } from "./build/validator.js";
import { loadBrief, loadManifest, loadStyle, TEMPLATES_DIR, OUT_DIR } from "./loader.js";
import type { BuildBrief, PlayableConfig } from "./types.js";

export interface BuildResult {
  outPath: string;
  validation: ValidationResult;
  brief: BuildBrief;
}

export async function buildFromBriefFile(briefFile: string): Promise<BuildResult> {
  const brief = await loadBrief(briefFile);
  return buildFromBrief(brief);
}

export async function buildFromBrief(brief: BuildBrief): Promise<BuildResult> {
  const manifest = await loadManifest(brief.mechanic);
  const style = await loadStyle(brief.style);

  const templateDir = path.join(TEMPLATES_DIR, brief.mechanic);
  const entry = path.join(templateDir, manifest.entry);
  const { assets, rawBytes } = await loadAssets(path.join(templateDir, "assets"));

  if (rawBytes > manifest.assetBudgetBytes) {
    throw new Error(
      `Assets are ${(rawBytes / 1024).toFixed(1)} KB, over the template budget of ` +
        `${(manifest.assetBudgetBytes / 1024).toFixed(1)} KB for "${brief.mechanic}".`,
    );
  }

  // Manifest defaults first, brief params override.
  const params = { ...manifest.params, ...brief.params };

  const config: PlayableConfig = {
    copy: brief.copy,
    lang: brief.lang,
    style,
    params,
    assets,
  };

  const js = await bundleTemplate(entry, config);
  const html = buildHtml(js, brief.copy.title);
  const validation = validate(html);

  await fs.mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${brief.name}.html`);
  await fs.writeFile(outPath, html, "utf8");

  return { outPath, validation, brief };
}
