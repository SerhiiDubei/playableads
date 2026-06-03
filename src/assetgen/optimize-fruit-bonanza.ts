// Optimize generated Fruit Bonanza PNGs → trimmed/resized WebP in the template
// assets/ folder so the single-file build stays under the 2 MB budget.
//   npx tsx src/assetgen/optimize-fruit-bonanza.ts
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SRC = "out/fruit-bonanza";
const DST = "templates/fruit-bonanza/assets";

// key → target dimensions / quality. Symbols are square sprites (max ~340px),
// background is the dominant cost so we resize it to ~720h with q=70.
const SPEC: Record<string, { w?: number; h?: number; q: number; trim: boolean }> = {
  "fruit-grape":           { w: 340, q: 82, trim: true },
  "fruit-watermelon":      { w: 340, q: 82, trim: true },
  "fruit-blueberry":       { w: 340, q: 82, trim: true },
  "fruit-apple":           { w: 340, q: 82, trim: true },
  "fruit-banana":          { w: 340, q: 82, trim: true },
  "fruit-candy-green":     { w: 340, q: 82, trim: true },
  "fruit-heart-red":       { w: 340, q: 82, trim: true },
  "fruit-scatter-lollipop":{ w: 360, q: 86, trim: true },
  "bomb":                  { w: 340, q: 86, trim: true },
  "bg-candy":              { h: 720, q: 70, trim: false },
  "logo-fruits":           { w: 520, q: 84, trim: true },
  "endcard-frame":         { w: 540, q: 84, trim: true },
  "endcard-crown":         { w: 540, q: 86, trim: true },
  "coin":                  { w: 140, q: 88, trim: true },
};

async function main(): Promise<void> {
  await fs.mkdir(DST, { recursive: true });
  let total = 0;
  for (const [key, s] of Object.entries(SPEC)) {
    const src = path.join(SRC, `${key}.png`);
    try {
      await fs.access(src);
    } catch {
      console.warn(`  skip ${key} (missing ${src})`);
      continue;
    }
    let img = sharp(src);
    if (s.trim) img = img.trim({ threshold: 12 });
    img = img.resize({
      width: s.w,
      height: s.h,
      fit: "inside",
      withoutEnlargement: true,
    });
    const { data, info } = await img
      .webp({ quality: s.q, alphaQuality: 90 })
      .toBuffer({ resolveWithObject: true });
    const dst = path.join(DST, `${key}.webp`);
    await fs.writeFile(dst, data);
    total += data.length;
    console.log(`  ${key}.webp — ${info.width}x${info.height}, ${(data.length / 1024).toFixed(1)} KB`);
  }
  console.log(`\ntotal: ${(total / 1024).toFixed(1)} KB (budget ~1430 KB before base64)`);
}

main().catch((e) => {
  console.error("optimize failed:", e?.message ?? e);
  process.exit(1);
});
