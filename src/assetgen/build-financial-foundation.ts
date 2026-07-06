// Standalone labs builder for "Financial Foundation" (Stage 1 greybox prototype).
// Mirrors build-fix-the-floor.ts: entry lives in labs/, output goes to test/ — so
// the game builds without being promoted to templates/. (`bundleTemplate` accepts
// any entry path, so no templates/ move is required.)
//   npx tsx src/assetgen/build-financial-foundation.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { bundleTemplate } from "../build/bundler.js";
import { buildHtml, loadAssets } from "../build/inliner.js";
import { validate } from "../build/validator.js";
import { fontFace } from "./kit/kit.js";
import { loadStyle, ROOT } from "../loader.js";
import type { PlayableConfig, TemplateManifest } from "../types.js";

const GAME_DIR = path.join(ROOT, "labs", "financial-foundation");
const OUT_DIR = path.join(ROOT, "test", "financial-foundation");
// Premium rounded font (Baloo 2, weight 800) — embedded base64, self-contained,
// no network. Matches the soft-clay claymation art direction; Pixi text uses it
// once the game awaits document.fonts.load("Baloo 2").
const FONT_FACE = fontFace("Baloo 2", path.join(ROOT, "src", "assetgen", "fonts", "Baloo2-800-Latin.woff2"), 800);

async function loadLabsManifest(): Promise<TemplateManifest> {
  const raw = await readFile(path.join(GAME_DIR, "manifest.json"), "utf8");
  return JSON.parse(raw) as TemplateManifest;
}

export async function buildFinancialFoundation(styleId = "financial-foundation") {
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
    copy: { title: "Financial Foundation", cta: "Calculate My Coverage" },
    lang: "en",
    style,
    params: manifest.params,
    assets,
  };
  const js = await bundleTemplate(path.join(GAME_DIR, manifest.entry), config);
  // Inject the embedded @font-face into the document head so the canvas font is
  // available (the game awaits its load before drawing any text).
  const html = buildHtml(js, config.copy.title).replace("</style>", `${FONT_FACE}</style>`);
  const validation = validate(html);
  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, "index.html");
  writeFileSync(outPath, html);
  return { outPath, validation, rawBytes };
}

async function main(): Promise<void> {
  const { outPath, validation, rawBytes } = await buildFinancialFoundation();
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
