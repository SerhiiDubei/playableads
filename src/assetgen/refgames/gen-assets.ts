// Generate AI sprites for the fruit-ninja playable + OPTIMIZE them to fit the
// 2MB single-file budget (CLAUDE.md weight pipeline: trim → resize → webp).
//
//   npx tsx src/assetgen/refgames/gen-assets.ts
//
// Layout:
//   assets/_src/   ← raw gpt-image PNGs (sources; NOT inlined; skip-existing here)
//   assets/        ← optimized .webp + SFX .wav (these get inlined into cfg.assets)
//
// gpt-image-1.5, native transparent PNG. ~3 calls, ~$0.13.

import "dotenv/config";
import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync, rmSync } from "node:fs";
import OpenAI from "openai";
import sharp from "sharp";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const RATE = 40;
const ASSETS = "labs/fruit-ninja-gen/assets";
const SRC = `${ASSETS}/_src`;

interface Job { key: string; prompt: string; size: "1024x1024" | "1024x1536" | "1536x1024"; transparent: boolean; }

const FRUIT_SHEET_PROMPT =
  "A 3x2 grid (3 columns, 2 rows) of whole cartoon fruits for a mobile fruit-slicing game. " +
  "Vibrant glossy flat-shaded style, thick clean outlines, juicy saturated colors, soft top highlight. " +
  "Each fruit centered in its own cell, equal size, fully ISOLATED on a transparent background, " +
  "no shadows on background, no text, no borders, no grid lines. " +
  "Cell order left-to-right, top-to-bottom: 1 watermelon, 2 red apple, 3 orange, 4 strawberry, 5 lemon, 6 purple plum.";

const JOBS: Job[] = [
  { key: "_fruitsheet", prompt: FRUIT_SHEET_PROMPT, size: "1024x1024", transparent: true },
  { key: "bomb", prompt: "A single cartoon black bomb, round glossy body with a short lit fuse and a bright spark, mobile game style, thick clean outline, soft highlight, centered, fully isolated on a transparent background, no text.", size: "1024x1024", transparent: true },
  { key: "bg", prompt: "A vertical mobile game background: a dark wooden dojo wall with subtle bamboo, warm moody vignette, soft depth, painterly but clean, no characters, no fruit, no text, no UI. A calm backdrop.", size: "1024x1536", transparent: false },
];

async function gen(job: Job): Promise<{ buf: Buffer; cost: number }> {
  const req: Record<string, unknown> = { model: "gpt-image-1.5", prompt: job.prompt, size: job.size, quality: "medium", output_format: "png" };
  if (job.transparent) req.background = "transparent";
  const res = await client.images.generate(req as never);
  const b64 = (res as { data?: { b64_json?: string }[] }).data?.[0]?.b64_json;
  if (!b64) throw new Error(`${job.key}: no image data`);
  const tokens = (res as { usage?: { output_tokens?: number } }).usage?.output_tokens ?? 0;
  return { buf: Buffer.from(b64, "base64"), cost: (tokens / 1e6) * RATE };
}

// resize + webp; trim transparent padding for sprites
async function optimize(buf: Buffer, outWebp: string, maxDim: number, quality: number, trim: boolean): Promise<number> {
  let img = sharp(buf);
  if (trim) { try { img = sharp(await img.trim({ threshold: 10 }).png().toBuffer()); } catch { img = sharp(buf); } }
  const out = await img.resize({ width: maxDim, height: maxDim, fit: "inside", withoutEnlargement: true }).webp({ quality }).toBuffer();
  writeFileSync(outWebp, out);
  return out.length;
}

async function main(): Promise<void> {
  mkdirSync(SRC, { recursive: true });
  // migrate any previously-generated top-level source PNGs into _src/
  for (const k of ["_fruitsheet", "bomb", "bg"]) {
    if (existsSync(`${ASSETS}/${k}.png`) && !existsSync(`${SRC}/${k}.png`)) renameSync(`${ASSETS}/${k}.png`, `${SRC}/${k}.png`);
  }
  // remove stale heavy top-level pngs (old fruit cells) — webp replaces them
  for (let i = 1; i <= 6; i++) { try { rmSync(`${ASSETS}/fruit${i}.png`); } catch { /* none */ } }

  let total = 0, bytes = 0;
  for (const job of JOBS) {
    const srcPath = `${SRC}/${job.key}.png`;
    let buf: Buffer;
    if (existsSync(srcPath)) { buf = readFileSync(srcPath); console.log(`↻ ${job.key}: reuse ($0)`); }
    else { process.stdout.write(`🎨 ${job.key}… `); const r = await gen(job); buf = r.buf; total += r.cost; writeFileSync(srcPath, buf); console.log(`✓ ~$${r.cost.toFixed(3)}`); }

    if (job.key === "_fruitsheet") {
      const { width = 1024, height = 1024 } = await sharp(buf).metadata();
      const cw = Math.floor(width / 3), ch = Math.floor(height / 2);
      let i = 1;
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
        const cell = await sharp(buf).extract({ left: c * cw, top: r * ch, width: cw, height: ch }).png().toBuffer();
        bytes += await optimize(cell, `${ASSETS}/fruit${i}.webp`, 220, 82, true);
        i++;
      }
      console.log(`  ✂ → fruit1..6.webp`);
    } else if (job.key === "bomb") {
      bytes += await optimize(buf, `${ASSETS}/bomb.webp`, 200, 82, true);
    } else {
      bytes += await optimize(buf, `${ASSETS}/bg.webp`, 520, 70, false); // bg: opaque, larger
    }
  }
  console.log(`\n💰 gen ~$${total.toFixed(3)} · optimized assets ${(bytes / 1024).toFixed(0)} KB (webp) → base64 ≈ ${(bytes * 1.33 / 1024).toFixed(0)} KB`);
}

main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
