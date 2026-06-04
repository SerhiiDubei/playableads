// AI assets for the akuma-no-yoru (Demon Slayer Night) playable.
// Dark horror style. Weight pipeline: trim→resize→webp; sources in _src/ (not inlined).
//   npx tsx src/assetgen/refgames/gen-akuma-assets.ts

import "dotenv/config";
import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from "node:fs";
import OpenAI from "openai";
import sharp from "sharp";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const RATE = 40;
const ASSETS = "labs/akuma-no-yoru-gen/assets";
const SRC = `${ASSETS}/_src`;
const FN = "labs/fruit-ninja-gen/assets"; // reuse sfx from here

interface Job { key: string; prompt: string; size: "1024x1024" | "1024x1536" | "1536x1024"; transparent: boolean; }

const JOBS: Job[] = [
  {
    key: "_enemysheet",
    prompt:
      "A 3x2 grid (3 columns, 2 rows) of 6 different CARTOON DEMON enemies for a dark fantasy slasher mobile game. " +
      "Menacing but stylized (not gory): 1 green frog-demon with fangs, 2 black crow-demon with red eyes, 3 purple shadow imp, " +
      "4 horned red demon, 5 grey skull-bat, 6 dark slime-demon with glowing eyes. " +
      "Bold clean outlines, eerie glowing eyes, saturated dark palette, each centered in its own cell, " +
      "fully ISOLATED on a transparent background, no shadows on background, no text, no borders, no grid lines.",
    size: "1024x1024",
    transparent: true,
  },
  {
    key: "warrior",
    prompt:
      "A lone dark demon-slayer warrior, hooded silhouette with a glowing katana, facing the viewer, heroic stance, " +
      "moody rim light (blue/violet), stylized cartoon game style, thick clean outline, centered, " +
      "fully isolated on a transparent background, no text.",
    size: "1024x1024",
    transparent: true,
  },
  {
    key: "bg",
    prompt:
      "A vertical mobile game background: a dark haunted forest/temple at night, large pale moon, drifting fog, " +
      "silhouetted dead trees and torii gate, deep blue-violet palette, eerie but clean, painterly, " +
      "no characters, no demons, no text, no UI. A moody backdrop with empty center for gameplay.",
    size: "1024x1536",
    transparent: false,
  },
  {
    key: "_bloodsheet",
    prompt:
      "A 2x2 grid of 4 different paint-splat shapes, each a COMPLETELY FILLED SOLID WHITE blob (100% opaque white interior, " +
      "like a white sticker cut-out), organic splatter silhouette with scattered droplets. NO outline, NO line art, NO black stroke, " +
      "NO color, NO gradient — just a solid filled white shape on a fully transparent background. Each centered in its cell, no text.",
    size: "1024x1024",
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
    bytes += await optimize(cell, `${ASSETS}/${name(i)}`, maxDim, 82, true);
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

    if (job.key === "_enemysheet") { bytes += await sliceGrid(buf, 3, 2, (i) => `demon${i}.webp`, 200); console.log("  ✂ demon1..6.webp"); }
    else if (job.key === "_bloodsheet") { bytes += await sliceGrid(buf, 2, 2, (i) => `splat${i}.webp`, 256); console.log("  ✂ splat1..4.webp"); }
    else if (job.key === "warrior") bytes += await optimize(buf, `${ASSETS}/warrior.webp`, 280, 85, true);
    else if (job.key === "bg") bytes += await optimize(buf, `${ASSETS}/bg.webp`, 540, 72, false);
  }

  // reuse fruit-ninja SFX, renamed for combat events
  const sfxMap: [string, string][] = [["slice.wav", "slash.wav"], ["combo.wav", "combo.wav"], ["bomb.wav", "hurt.wav"], ["throw.wav", "spawn.wav"]];
  for (const [from, to] of sfxMap) {
    if (existsSync(`${FN}/${from}`)) { copyFileSync(`${FN}/${from}`, `${ASSETS}/${to}`); }
  }
  console.log(`\n💰 gen ~$${total.toFixed(3)} · webp ${(bytes / 1024).toFixed(0)}KB + reused sfx → ${ASSETS}/`);
}

main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
