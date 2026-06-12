// Asset batch for the 5-group fix pass:
//   smoothie: fruit cutouts (fly/slice), blender base+jar, 9-slice UI frame
//   greens:   new background photo
//   kitchen:  second pendant variant (linear bar) for the 4th pick step
//   npx tsx tools/gen-fix-batch.ts

import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import sharp from "sharp";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const RATE_MS = 13_000;

const CUT = "FULLY ISOLATED on a transparent background, nothing else in frame, no shadows on background, no text.";
const TOON = "Vibrant stylized 3D-render look (Fruit Ninja / Candy Crush ad style), juicy saturated colors, soft studio light.";

type Size = "1024x1024" | "1024x1536" | "1536x1024";
interface Job { dir: string; key: string; prompt: string; size: Size; transparent: boolean; outW: number; }

const SMOOTHIE = path.join("labs", "slice-your-spark-smoothie", "assets");
const GREENS = path.join("labs", "greens-catch-glass", "assets");
const KITCHEN = path.join("labs", "dream-kitchen-three-picks", "assets");

const JOBS: Job[] = [
  // smoothie fruits — whole, readable at 60px
  { dir: SMOOTHIE, key: "fruit-strawberry", prompt: `One glossy ripe strawberry with a green leafy top, slight 3/4 angle. ${TOON} ${CUT}`, size: "1024x1024", transparent: true, outW: 180 },
  { dir: SMOOTHIE, key: "fruit-orange",     prompt: `One bright whole orange with a single green leaf, slight 3/4 angle. ${TOON} ${CUT}`, size: "1024x1024", transparent: true, outW: 180 },
  { dir: SMOOTHIE, key: "fruit-kiwi",       prompt: `One whole fuzzy brown kiwi fruit, slight 3/4 angle. ${TOON} ${CUT}`, size: "1024x1024", transparent: true, outW: 170 },
  { dir: SMOOTHIE, key: "fruit-banana",     prompt: `One bright yellow banana, gentle curve, slight 3/4 angle. ${TOON} ${CUT}`, size: "1024x1024", transparent: true, outW: 200 },
  // sliced halves (juicy cross-sections) — shown when a fruit is cut
  { dir: SMOOTHIE, key: "half-strawberry",  prompt: `A strawberry cut in half showing the juicy pale-red cross-section with seeds, both halves slightly apart. ${TOON} ${CUT}`, size: "1024x1024", transparent: true, outW: 190 },
  { dir: SMOOTHIE, key: "half-orange",      prompt: `An orange cut in half showing the juicy segmented cross-section, both halves slightly apart. ${TOON} ${CUT}`, size: "1024x1024", transparent: true, outW: 190 },
  { dir: SMOOTHIE, key: "half-kiwi",        prompt: `A kiwi cut in half showing the bright green cross-section with black seeds, both halves slightly apart. ${TOON} ${CUT}`, size: "1024x1024", transparent: true, outW: 180 },
  { dir: SMOOTHIE, key: "half-banana",      prompt: `A peeled banana snapped in two pieces showing the creamy cross-section. ${TOON} ${CUT}`, size: "1024x1024", transparent: true, outW: 200 },
  // blender: base + transparent jar (liquid is drawn procedurally behind the jar)
  { dir: SMOOTHIE, key: "blender-base",     prompt: `The motor BASE of a modern kitchen blender only (no jar): matte dark-teal body with orange dial and steel trim, front view. ${TOON} ${CUT}`, size: "1024x1024", transparent: true, outW: 280 },
  { dir: SMOOTHIE, key: "blender-jar",      prompt: `An EMPTY transparent glass blender jar with measurement marks and a pouring lip, no lid, front view, mostly clear see-through glass. ${TOON} ${CUT}`, size: "1024x1536", transparent: true, outW: 280 },
  // 9-slice UI frame: symmetric rounded panel
  { dir: SMOOTHIE, key: "ui-frame",         prompt: `A clean rounded-rectangle UI panel frame for a mobile game: cream background, bold orange rounded border with a subtle inner glow, PERFECTLY SYMMETRIC both axes, empty center, flat front view. ${CUT}`, size: "1024x1024", transparent: true, outW: 300 },
  // greens new background
  { dir: GREENS, key: "bg-new", prompt: `A bright airy kitchen breakfast bar scene for a wellness drink ad: blurred sunny window light, light wood counter edge at the bottom, green plants bokeh, generous empty space in the middle for gameplay. Photorealistic with soft depth of field, no people, no text, portrait orientation.`, size: "1024x1536", transparent: false, outW: 600 },
  // kitchen pendant variant for the 4th pick
  { dir: KITCHEN, key: "pendants-bar", prompt: `One modern LINEAR BAR pendant light hanging on two thin black cords from the top of the frame: a slim matte-black horizontal bar with a warm glowing LED strip underneath, brass end caps. ${CUT} Photorealistic interior magazine style.`, size: "1024x1024", transparent: true, outW: 300 },
];

async function genImage(prompt: string, size: Size, transparent: boolean): Promise<Buffer> {
  const req: Record<string, unknown> = { model: "gpt-image-1.5", prompt, size, quality: "medium", output_format: "png" };
  if (transparent) req.background = "transparent";
  for (let a = 1; a <= 4; a++) {
    try {
      const res = await client.images.generate(req as never);
      const b64 = (res as { data?: Array<{ b64_json?: string }> }).data?.[0]?.b64_json;
      if (!b64) throw new Error("empty b64");
      return Buffer.from(b64, "base64");
    } catch (e) {
      if (a === 4) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      await new Promise(r => setTimeout(r, (msg.includes("429") ? 30_000 : 8_000) * a));
    }
  }
  throw new Error("unreachable");
}

async function run(job: Job): Promise<void> {
  const srcDir = path.join(job.dir, "_src");
  mkdirSync(srcDir, { recursive: true });
  const srcPng = path.join(srcDir, `${job.key}.png`);
  let raw: Buffer;
  if (existsSync(srcPng)) { console.log(`  [skip] ${job.key}`); raw = readFileSync(srcPng); }
  else {
    process.stdout.write(`  [gen] ${job.key} ...`);
    const t0 = Date.now();
    raw = await genImage(job.prompt, job.size, job.transparent);
    writeFileSync(srcPng, raw);
    console.log(` ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    await new Promise(r => setTimeout(r, RATE_MS));
  }
  let img = sharp(raw);
  if (job.transparent) img = img.trim();
  const data = await img.resize({ width: job.outW, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  writeFileSync(path.join(job.dir, `${job.key}.webp`), data);
  console.log(`      -> ${job.key}.webp ${(data.length / 1024).toFixed(1)}KB`);
}

async function main(): Promise<void> {
  console.log("== FIX BATCH ==");
  for (const j of JOBS) await run(j);
  console.log("\nAll done.");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
