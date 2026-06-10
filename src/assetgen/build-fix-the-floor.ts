// Standalone labs builder for "Fix the Floor" (Stage 1 greybox prototype).
// Mirrors src/builder.ts `buildFromBrief`, but the entry lives in labs/ and the
// output goes to test/ — so the game builds without being promoted to templates/.
// (`bundleTemplate` accepts any entry path, so no templates/ move is required.)
//   npx tsx src/assetgen/build-fix-the-floor.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { bundleTemplate } from "../build/bundler.js";
import { buildHtml, loadAssets } from "../build/inliner.js";
import { validate } from "../build/validator.js";
import { loadStyle, ROOT } from "../loader.js";
import type { PlayableConfig, TemplateManifest } from "../types.js";

const GAME_DIR = path.join(ROOT, "labs", "fix-the-floor");
const OUT_DIR = path.join(ROOT, "test", "fix-the-floor");

async function loadLabsManifest(): Promise<TemplateManifest> {
  const raw = await readFile(path.join(GAME_DIR, "manifest.json"), "utf8");
  return JSON.parse(raw) as TemplateManifest;
}

export async function buildFixTheFloor(styleId = "fix-the-floor") {
  const manifest = await loadLabsManifest();
  const style = await loadStyle(styleId);
  // Greybox: assets/ is empty → procedural fallback. Stage 2 drops webp here.
  const { assets, rawBytes } = await loadAssets(path.join(GAME_DIR, "assets"));
  if (rawBytes > manifest.assetBudgetBytes) {
    throw new Error(
      `Assets are ${(rawBytes / 1024).toFixed(1)} KB, over the budget of ` +
        `${(manifest.assetBudgetBytes / 1024).toFixed(1)} KB for "${manifest.id}".`,
    );
  }
  const config: PlayableConfig = {
    copy: { title: "Fix the Floor", cta: "Shop Real Flooring" },
    lang: "en",
    style,
    params: manifest.params,
    assets,
  };
  const js = await bundleTemplate(path.join(GAME_DIR, manifest.entry), config);
  const html = buildHtml(js, config.copy.title);
  const validation = validate(html);
  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, "index.html");
  writeFileSync(outPath, html);
  return { outPath, validation, rawBytes };
}

async function main(): Promise<void> {
  const { outPath, validation, rawBytes } = await buildFixTheFloor();
  const kb = validation.bytes / 1024;
  console.log(`assets: ${(rawBytes / 1024).toFixed(1)} KB (raw)`);
  console.log(
    `index.html: ${kb.toFixed(1)} KB (${((kb / 2048) * 100).toFixed(1)}% of 2MB) -> ${outPath}`,
  );
  if (validation.warnings.length) {
    console.log("warnings:\n  " + validation.warnings.join("\n  "));
  }
  if (!validation.ok) {
    console.error("VALIDATION FAILED:\n  " + validation.errors.join("\n  "));
    process.exit(1);
  }
  console.log("validation: OK");
}

main().catch((e) => {
  console.error("FATAL:", e?.message ?? e);
  process.exit(1);
});
