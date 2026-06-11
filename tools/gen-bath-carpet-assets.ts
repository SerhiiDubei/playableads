// Asset batch for: (A) bath-morph rebuild as ONE coherent room with separate
// object sprites, (B) 5 carpet-cleaning variants (carpet + tool each).
//   npx tsx tools/gen-bath-carpet-assets.ts [bath|carpets]
//
// BATH strategy — one space, layered:
//   shell-base  : EMPTY bathroom room (walls/floor/window/door), no furniture
//   shell-mid   : images.edit(shell-base) warm tile walls + wood floor (same room)
//   shell-lux   : images.edit(shell-base) marble walls + stone floor (same room)
//   12 object cutouts on transparent bg, straight-on front view, consistent
//   soft daylight — placed by the game at fixed slots, swapped per threshold.
//
// CARPETS strategy — same stamp-mask engine, new surfaces/tools:
//   5 × (clean carpet full-frame top-down + cleaning tool cutout).

import "dotenv/config";
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const RATE_MS = 13_000;

const BATH_DIR = path.join("labs", "budget-slider-bath-morph", "assets");
const BATH_SRC = path.join(BATH_DIR, "_src");

const AD_BATH = "Photorealistic interior magazine style, soft natural daylight from a window on the right, straight-on eye-level camera, clean lines.";
const AD_OBJ  = "Photorealistic product cutout, straight-on front view at eye level, soft even daylight, FULLY ISOLATED on a transparent background, no floor, no wall, no shadow on background, no text.";

type Size = "1024x1024" | "1024x1536" | "1536x1024";
interface GenJob { dir: string; key: string; prompt: string; size: Size; transparent: boolean; outW: number; }
interface EditJob { dir: string; key: string; from: string; prompt: string; outW: number; }

// ── BATH: shell (1 gen + 2 edits) ─────────────────────────────────────────────
const BATH_SHELL_GEN: GenJob = {
  dir: BATH_DIR, key: "shell-base",
  prompt: `An EMPTY bathroom room with NO furniture and NO fixtures at all: plain white painted walls with simple half-height white square tile, plain light-grey ceramic floor tiles, a window with white frame on the right wall, white ceiling. Completely empty floor and walls — no bathtub, no sink, no vanity, no mirror, no shower, no towels, no plants, no people, no text. ${AD_BATH}`,
  size: "1024x1536", transparent: false, outW: 540,
};
const BATH_SHELL_EDITS: EditJob[] = [
  { dir: BATH_DIR, key: "shell-mid", from: "shell-base",
    prompt: `Upgrade ONLY the surfaces of this empty bathroom: walls now covered floor-to-ceiling in warm beige stone-look tiles, floor now warm herringbone wood-look tile. Keep the room EMPTY (no furniture, no fixtures), same window on the right, same camera, same lighting. ${AD_BATH}`, outW: 540 },
  { dir: BATH_DIR, key: "shell-lux", from: "shell-base",
    prompt: `Upgrade ONLY the surfaces of this empty bathroom: walls now large-format white-grey marble slabs with subtle veining, floor large-format polished stone tiles, a warm LED light strip where wall meets ceiling. Keep the room EMPTY (no furniture, no fixtures), same window on the right, same camera, same lighting. ${AD_BATH}`, outW: 540 },
];

// ── BATH: 12 object cutouts ───────────────────────────────────────────────────
const BATH_OBJECTS: GenJob[] = [
  { dir: BATH_DIR, key: "tub-basic",        prompt: `A basic plain white rectangular built-in bathtub with a simple chrome wall faucet, modest and clean. ${AD_OBJ}`, size: "1536x1024", transparent: true, outW: 360 },
  { dir: BATH_DIR, key: "tub-freestanding", prompt: `An elegant white freestanding oval bathtub with a brushed-nickel floor-standing faucet. ${AD_OBJ}`, size: "1536x1024", transparent: true, outW: 380 },
  { dir: BATH_DIR, key: "shower-glass",     prompt: `A luxurious walk-in glass shower enclosure with brass rain shower head and a glass door, tall rectangular structure. ${AD_OBJ}`, size: "1024x1536", transparent: true, outW: 260 },
  { dir: BATH_DIR, key: "vanity-basic",     prompt: `A simple white bathroom vanity cabinet with a small white ceramic sink and a basic chrome faucet, two plain doors. ${AD_OBJ}`, size: "1024x1024", transparent: true, outW: 220 },
  { dir: BATH_DIR, key: "vanity-wood",      prompt: `A warm oak wood bathroom vanity with two drawers, white ceramic countertop sink, brushed-nickel faucet. ${AD_OBJ}`, size: "1024x1024", transparent: true, outW: 230 },
  { dir: BATH_DIR, key: "vanity-float",     prompt: `A floating walnut double bathroom vanity with two white vessel sinks and brass faucets, modern minimal. ${AD_OBJ}`, size: "1536x1024", transparent: true, outW: 300 },
  { dir: BATH_DIR, key: "mirror-basic",     prompt: `A simple rectangular bathroom mirror with a thin white frame. ${AD_OBJ}`, size: "1024x1024", transparent: true, outW: 140 },
  { dir: BATH_DIR, key: "mirror-round-led", prompt: `A round bathroom mirror with a warm LED backlight glow ring around it. ${AD_OBJ}`, size: "1024x1024", transparent: true, outW: 150 },
  { dir: BATH_DIR, key: "mirror-wide-led",  prompt: `A wide rectangular frameless bathroom mirror with warm LED backlighting glowing from behind. ${AD_OBJ}`, size: "1536x1024", transparent: true, outW: 260 },
  { dir: BATH_DIR, key: "plant",            prompt: `A lush green potted plant (monstera) in a woven basket pot. ${AD_OBJ}`, size: "1024x1536", transparent: true, outW: 150 },
  { dir: BATH_DIR, key: "towel-bar",        prompt: `A wall-mounted heated towel rail in brushed brass with two neatly folded cream towels hanging on it. ${AD_OBJ}`, size: "1024x1024", transparent: true, outW: 150 },
  { dir: BATH_DIR, key: "stool-towels",     prompt: `A small wooden stool with rolled cream towels and a lit candle on it, spa style. ${AD_OBJ}`, size: "1024x1024", transparent: true, outW: 130 },
];

// ── CARPETS: 5 variants (carpet full-frame + tool cutout) ─────────────────────
const AD_CARPET = "Strictly top-down view filling the entire frame edge-to-edge, photorealistic, soft even light, freshly cleaned look, no furniture, no people, no text.";
const CARPETS: Array<{ id: string; carpet: string; tool: string; toolW: number }> = [
  { id: "carpet-clean-v1",
    carpet: `A rich red Persian rug with an ornate traditional medallion pattern and detailed border. ${AD_CARPET}`,
    tool: `A modern vacuum cleaner floor head attachment seen from a three-quarter top angle, dark grey with teal accents. ${AD_OBJ}`, toolW: 200 },
  { id: "carpet-clean-v2",
    carpet: `A modern geometric area rug in navy blue, white and mustard triangles pattern. ${AD_CARPET}`,
    tool: `A stiff-bristle scrub brush with a wooden handle, foam suds on the bristles, three-quarter top view. ${AD_OBJ}`, toolW: 180 },
  { id: "carpet-clean-v3",
    carpet: `A soft beige shaggy high-pile rug with subtle texture. ${AD_CARPET}`,
    tool: `A steam mop head emitting a gentle white steam puff, white and turquoise plastic, three-quarter top view. ${AD_OBJ}`, toolW: 200 },
  { id: "carpet-clean-v4",
    carpet: `A colorful children's playroom rug with a cheerful rainbow stripes and stars pattern. ${AD_CARPET}`,
    tool: `A large yellow cleaning sponge with foam bubbles, slightly squeezed, three-quarter top view. ${AD_OBJ}`, toolW: 170 },
  { id: "carpet-clean-v5",
    carpet: `An elegant grey-and-teal striped wool rug with a minimal Scandinavian pattern. ${AD_CARPET}`,
    tool: `A carpet roller brush with a long handle and teal rotating bristle drum, three-quarter top view. ${AD_OBJ}`, toolW: 200 },
];

// ── engine ────────────────────────────────────────────────────────────────────
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

async function editImage(fromPng: string, prompt: string): Promise<Buffer> {
  for (let a = 1; a <= 4; a++) {
    try {
      const res = await client.images.edit({
        model: "gpt-image-1.5",
        image: await toFile(createReadStream(fromPng), path.basename(fromPng), { type: "image/png" }),
        prompt, size: "1024x1536", quality: "medium",
      } as never);
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

async function optimize(dir: string, key: string, raw: Buffer, outW: number, transparent: boolean): Promise<void> {
  let img = sharp(raw);
  if (transparent) img = img.trim();
  const data = await img.resize({ width: outW, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  writeFileSync(path.join(dir, `${key}.webp`), data);
  console.log(`      -> ${key}.webp ${(data.length / 1024).toFixed(1)}KB`);
}

async function runGen(job: GenJob): Promise<void> {
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
  await optimize(job.dir, job.key, raw, job.outW, job.transparent);
}

async function runEdit(job: EditJob): Promise<void> {
  const srcDir = path.join(job.dir, "_src");
  const srcPng = path.join(srcDir, `${job.key}.png`);
  let raw: Buffer;
  if (existsSync(srcPng)) { console.log(`  [skip] ${job.key}`); raw = readFileSync(srcPng); }
  else {
    process.stdout.write(`  [edit] ${job.key} (from ${job.from}) ...`);
    const t0 = Date.now();
    raw = await editImage(path.join(srcDir, `${job.from}.png`), job.prompt);
    writeFileSync(srcPng, raw);
    console.log(` ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    await new Promise(r => setTimeout(r, RATE_MS));
  }
  await optimize(job.dir, job.key, raw, job.outW, false);
}

async function main(): Promise<void> {
  const only = process.argv[2];
  if (!only || only === "bath") {
    console.log("\n== BATH: shell + 12 objects ==");
    await runGen(BATH_SHELL_GEN);
    for (const e of BATH_SHELL_EDITS) await runEdit(e);
    for (const o of BATH_OBJECTS) await runGen(o);
  }
  if (!only || only === "carpets") {
    console.log("\n== CARPETS: 5 variants ==");
    for (const v of CARPETS) {
      const dir = path.join("labs", v.id, "assets");
      mkdirSync(dir, { recursive: true });
      await runGen({ dir, key: "carpet-clean", prompt: v.carpet, size: "1024x1536", transparent: false, outW: 540 });
      await runGen({ dir, key: "tool", prompt: v.tool, size: "1024x1024", transparent: true, outW: v.toolW });
    }
  }
  console.log("\nAll done.");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
