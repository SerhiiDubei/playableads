// Generic labs builder — builds ANY labs/<id>/ playable without promoting it
// to templates/. Parameterized version of build-dream-floor.ts.
//
//   npx tsx src/assetgen/build-lab.ts <game-id> [style-id]
//
// Reads labs/<id>/manifest.json (extended: may carry `style` and `copy`),
// bundles labs/<id>/<entry>, inlines labs/<id>/assets/, validates against the
// Meta spec and writes test/<id>/index.html.

import { mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { bundleTemplate } from "../build/bundler.js";
import { buildHtml, loadAssets } from "../build/inliner.js";
import { validate } from "../build/validator.js";
import { loadStyle, ROOT } from "../loader.js";
import type { PlayableConfig, TemplateManifest } from "../types.js";

interface LabManifest extends TemplateManifest {
  style?: string;
  copy?: { title: string; cta: string };
}

export async function buildLab(gameId: string, styleOverride?: string) {
  const gameDir = path.join(ROOT, "labs", gameId);
  const outDir = path.join(ROOT, "test", gameId);

  const manifest = JSON.parse(
    await readFile(path.join(gameDir, "manifest.json"), "utf8"),
  ) as LabManifest;

  const styleId = styleOverride ?? manifest.style ?? "default";
  const style = await loadStyle(styleId);

  const { assets, rawBytes } = await loadAssets(path.join(gameDir, "assets"));
  if (rawBytes > manifest.assetBudgetBytes) {
    throw new Error(
      `Assets are ${(rawBytes / 1024).toFixed(1)} KB, over the budget of ` +
        `${(manifest.assetBudgetBytes / 1024).toFixed(1)} KB for "${manifest.id}".`,
    );
  }

  const config: PlayableConfig = {
    copy: manifest.copy ?? { title: manifest.name, cta: "Learn More" },
    lang: "en",
    style,
    params: manifest.params,
    assets,
  };

  const js = await bundleTemplate(path.join(gameDir, manifest.entry), config);
  const html = buildHtml(js, config.copy.title);
  const validation = validate(html);
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "index.html");
  writeFileSync(outPath, html);
  return { outPath, validation, rawBytes };
}

async function main(): Promise<void> {
  const gameId = process.argv[2];
  if (!gameId) {
    console.error("usage: tsx src/assetgen/build-lab.ts <game-id> [style-id]");
    process.exit(1);
  }
  const { outPath, validation, rawBytes } = await buildLab(gameId, process.argv[3]);
  const kb = validation.bytes / 1024;
  console.log(`assets: ${(rawBytes / 1024).toFixed(1)} KB (raw)`);
  console.log(
    `index.html: ${kb.toFixed(1)} KB (${((kb / 2048) * 100).toFixed(1)}% of 2MB) -> ${outPath}`,
  );
  if (validation.warnings.length) {
    console.log("warnings:\n  " + validation.warnings.join("\n  "));
  }
  if (!validation.ok) {
    console.error("validation FAILED:\n  " + validation.errors.join("\n  "));
    process.exit(1);
  }
  console.log("validation: OK");
}

const entry = process.argv[1]?.replace(/\\/g, "/") ?? "";
if (entry.endsWith("build-lab.ts") || entry.endsWith("build-lab.js")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
