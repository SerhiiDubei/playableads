// Optimize raw generated PNGs into template-local webp sprites.
// Uses the SAME recipe as kit.ts toWebp (trim -> resize inside -> webp 82/alpha90)
// to avoid a divergent optimizer (CLAUDE.md rule #1, #6).
import { mkdirSync } from "node:fs";
import sharp from "sharp";

// args: <srcDir> <outDir> <maxPx> <key1> <key2> ...
const [srcDir, outDir, maxPxArg, ...keys] = process.argv.slice(2);
const maxPx = Number(maxPxArg) || 512;

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  for (const key of keys) {
    const { data, info } = await sharp(`${srcDir}/${key}.png`)
      .trim()
      .resize({ width: maxPx, height: maxPx, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, alphaQuality: 90 })
      .toBuffer({ resolveWithObject: true });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(`${outDir}/${key}.webp`, data);
    console.log(`  ${key}.webp — ${info.width}x${info.height}, ${(data.length / 1024).toFixed(1)} KB`);
  }
}

main().catch((e) => {
  console.error("optimize failed:", e?.message ?? e);
  process.exit(1);
});
