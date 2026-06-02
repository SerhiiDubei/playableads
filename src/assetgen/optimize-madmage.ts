// Optimize generated Mad Mage Tower PNGs → trimmed/resized WebP in the template
// assets/ folder so the single-file build stays under the 2 MB budget.
//   npx tsx src/assetgen/optimize-madmage.ts
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SRC = "out/mad-mage-tower";
const DST = "templates/mad-mage-tower/assets";

// key → { w?: target width, h?: target height, q: webp quality, trim }
const SPEC: Record<string, { w?: number; h?: number; q: number; trim: boolean }> = {
  "floor-0": { w: 340, q: 82, trim: true },
  "floor-1": { w: 340, q: 82, trim: true },
  "floor-2": { w: 340, q: 82, trim: true },
  "floor-3": { w: 340, q: 82, trim: true },
  "floor-4": { w: 340, q: 82, trim: true },
  "floor-5": { w: 340, q: 82, trim: true },
  "floor-6": { w: 340, q: 82, trim: true },
  spire: { w: 230, q: 86, trim: true },
  "mage-idle": { h: 380, q: 86, trim: true },
  "mage-sad": { h: 380, q: 86, trim: true },
  cloud: { w: 210, q: 86, trim: true },
  ground: { w: 480, q: 82, trim: true },
  "sky-bg": { h: 780, q: 72, trim: false },
};

async function main(): Promise<void> {
  await fs.mkdir(DST, { recursive: true });
  let total = 0;
  for (const [key, s] of Object.entries(SPEC)) {
    const src = path.join(SRC, `${key}.png`);
    let img = sharp(src);
    if (s.trim) img = img.trim({ threshold: 12 });
    img = img.resize({
      width: s.w,
      height: s.h,
      fit: "inside",
      withoutEnlargement: true,
    });
    const out = path.join(DST, `${key}.webp`);
    const info = await img.webp({ quality: s.q, effort: 6 }).toFile(out);
    total += info.size;
    console.log(`${key.padEnd(12)} ${info.width}x${info.height}  ${(info.size / 1024).toFixed(1)} KB`);
  }
  console.log(`\nTOTAL assets: ${(total / 1024).toFixed(1)} KB  (raw budget 1468 KB; base64 ≈ +33%)`);
}

void main();
