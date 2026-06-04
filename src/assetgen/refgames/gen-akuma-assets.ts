// PIXEL-ART assets for the akuma-no-yoru playable — a Castlevania-like 2D action
// PLATFORMER (controllable heroine: run/jump/sword). Weight pipeline: trim→resize→webp.
//   npx tsx src/assetgen/refgames/gen-akuma-assets.ts

import "dotenv/config";
import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from "node:fs";
import OpenAI from "openai";
import sharp from "sharp";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const RATE = 40;
const ASSETS = "labs/akuma-no-yoru-gen/assets";
const SRC = `${ASSETS}/_src`;

interface Job { key: string; prompt: string; size: "1024x1024" | "1024x1536" | "1536x1024"; transparent: boolean; }

const PIXEL = "Crisp PIXEL ART, retro 16-bit Castlevania style, limited gothic palette, clean hard pixels, no anti-aliasing, no text.";

const JOBS: Job[] = [
  {
    key: "_herosheet",
    prompt:
      `A 2x2 grid (2 cols, 2 rows) of the SAME female vampire-hunter heroine sprite, side view facing RIGHT, in 4 poses. ${PIXEL} ` +
      "Same character, same size & palette in every cell (dark armor, flowing red scarf, silver sword): " +
      "cell1 = standing idle; cell2 = mid-run stride; cell3 = sword attack swing forward; cell4 = jump (legs tucked). " +
      "Each pose centered in its cell, fully isolated on a transparent background, no shadows on background, no borders, no grid lines.",
    size: "1024x1024",
    transparent: true,
  },
  {
    key: "_enemysheet",
    prompt:
      `A 3x1 row of 3 different small PIXEL ART gothic enemies, side view facing LEFT. ${PIXEL} ` +
      "1 = shambling zombie/ghoul, 2 = winged demon-bat, 3 = armored skeleton with shield. " +
      "Same pixel scale, each centered in its cell, fully isolated on a transparent background, no text, no borders.",
    size: "1536x1024",
    transparent: true,
  },
  {
    key: "bg",
    prompt:
      `A horizontal PIXEL ART side-scrolling background: the interior hall of a gothic demon castle at night. ${PIXEL} ` +
      "Stone-brick walls, tall arched windows with a blood-red moon, candelabras, torn banners, deep shadow, parallax depth. " +
      "Empty lower third for a floor/gameplay area. No characters, no UI, no text. Wide cinematic composition.",
    size: "1536x1024",
    transparent: false,
  },
  {
    key: "ground",
    prompt:
      `A horizontal PIXEL ART stone-floor / platform strip for a gothic castle, top edge is the walkable surface (cracked stone bricks, moss). ${PIXEL} ` +
      "Seamless left-right tiling, dark palette, isolated on a transparent background above the strip, no text.",
    size: "1536x1024",
    transparent: true,
  },
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

async function optimize(buf: Buffer, out: string, maxDim: number, q: number, trim: boolean): Promise<number> {
  let img = sharp(buf);
  if (trim) { try { img = sharp(await img.trim({ threshold: 10 }).png().toBuffer()); } catch { img = sharp(buf); } }
  const o = await img.resize({ width: maxDim, height: maxDim, fit: "inside", withoutEnlargement: true }).webp({ quality: q }).toBuffer();
  writeFileSync(out, o);
  return o.length;
}

async function sliceGrid(buf: Buffer, cols: number, rows: number, name: (i: number) => string, maxDim: number): Promise<number> {
  const { width = 1024, height = 1024 } = await sharp(buf).metadata();
  const cw = Math.floor(width / cols), ch = Math.floor(height / rows);
  let bytes = 0, i = 1;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const cell = await sharp(buf).extract({ left: c * cw, top: r * ch, width: cw, height: ch }).png().toBuffer();
    bytes += await optimize(cell, `${ASSETS}/${name(i)}`, maxDim, 88, true);
    i++;
  }
  return bytes;
}

async function main(): Promise<void> {
  mkdirSync(SRC, { recursive: true });
  let total = 0, bytes = 0;
  for (const job of JOBS) {
    const sp = `${SRC}/${job.key}.png`;
    let buf: Buffer;
    if (existsSync(sp)) { buf = readFileSync(sp); console.log(`↻ ${job.key} reuse`); }
    else { process.stdout.write(`🎨 ${job.key}… `); const r = await gen(job); buf = r.buf; total += r.cost; writeFileSync(sp, buf); console.log(`✓ $${r.cost.toFixed(3)}`); }

    if (job.key === "_herosheet") { bytes += await sliceGrid(buf, 2, 2, (i) => ["hero_idle.webp","hero_run.webp","hero_attack.webp","hero_jump.webp"][i - 1], 200); console.log("  ✂ hero_idle/run/attack/jump.webp"); }
    else if (job.key === "_enemysheet") { bytes += await sliceGrid(buf, 3, 1, (i) => `demon${i}.webp`, 180); console.log("  ✂ demon1..3.webp"); }
    else if (job.key === "bg") bytes += await optimize(buf, `${ASSETS}/bg.webp`, 900, 74, false);
    else if (job.key === "ground") bytes += await optimize(buf, `${ASSETS}/ground.webp`, 900, 82, true);
  }
  // reuse fruit-ninja SFX, renamed for platformer combat events
  const FN = "labs/fruit-ninja-gen/assets";
  for (const [from, to] of [["slice.wav", "slash.wav"], ["bomb.wav", "kill.wav"], ["throw.wav", "jump.wav"], ["combo.wav", "hurt.wav"]] as [string, string][]) {
    if (existsSync(`${FN}/${from}`)) copyFileSync(`${FN}/${from}`, `${ASSETS}/${to}`);
  }
  console.log(`\n💰 gen ~$${total.toFixed(3)} · webp ${(bytes / 1024).toFixed(0)}KB + reused sfx → ${ASSETS}/`);
}

main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
