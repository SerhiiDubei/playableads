// Layered FRAME assets for dream-kitchen-three-picks.
//   npx tsx tools/gen-kitchen-layers.ts
//
// Architecture (per the layered-frame rule): bottom photo = empty room
// (wall+floor), then every changeable element is its OWN transparent cutout
// stacked on top: backsplash panel -> upper cabinets -> lower cabinets ->
// countertop -> pendants. A pick swaps ONLY its layer.
// Straight-on front elevation everywhere so alignment is rectangular.

import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import sharp from "sharp";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const RATE_MS = 13_000;
const DIR = path.join("labs", "dream-kitchen-three-picks", "assets");

const AD = "Photorealistic interior magazine style, perfectly straight-on front elevation view (no perspective, flat frontal), soft even daylight, no people, no text.";
const CUT = "FULLY ISOLATED on a transparent background, nothing else in frame, no floor, no wall, no ceiling, no shadows cast on the background.";

type Size = "1024x1024" | "1024x1536" | "1536x1024";
interface GenJob { key: string; prompt: string; size: Size; transparent: boolean; outW: number; }

const JOBS: GenJob[] = [
  { key: "room", size: "1024x1536", transparent: false, outW: 600,
    prompt: `A completely EMPTY kitchen-ready room seen as a flat frontal elevation: one plain warm off-white painted wall filling most of the frame, light oak wood plank floor in the bottom fifth, simple white ceiling strip at the very top. NO cabinets, NO furniture, NO window, NO appliances, NO decor — just bare wall, floor and ceiling. ${AD}` },

  { key: "uppers-modern", size: "1536x1024", transparent: true, outW: 600,
    prompt: `A single continuous row of MODERN handleless flat-slab upper wall kitchen cabinets in matte graphite grey, with a sleek stainless range hood integrated in the middle of the row, thin warm LED strip under the cabinets. Straight-on front elevation, the row spans the full frame width. ${CUT} ${AD}` },
  { key: "uppers-farm", size: "1536x1024", transparent: true, outW: 600,
    prompt: `A single continuous row of FARMHOUSE shaker-style upper wall kitchen cabinets in warm cream white with brass knobs, a classic cream range hood with wood trim integrated in the middle of the row, one open shelf section with rustic crockery. Straight-on front elevation, the row spans the full frame width. ${CUT} ${AD}` },

  { key: "lowers-modern", size: "1536x1024", transparent: true, outW: 600,
    prompt: `A single continuous row of MODERN handleless flat-slab base kitchen cabinets in matte graphite grey WITHOUT any countertop on top (bare cabinet carcass row, flat top edge), with a built-in stainless steel oven in the middle. Straight-on front elevation, the row spans the full frame width. ${CUT} ${AD}` },
  { key: "lowers-farm", size: "1536x1024", transparent: true, outW: 600,
    prompt: `A single continuous row of FARMHOUSE shaker-style base kitchen cabinets in warm cream white with brass knobs and one white apron-front farmhouse sink front panel, WITHOUT any countertop on top (bare cabinet row, flat top edge), a classic cream range with brass details in the middle. Straight-on front elevation, the row spans the full frame width. ${CUT} ${AD}` },

  { key: "counter-quartz", size: "1536x1024", transparent: true, outW: 600,
    prompt: `ONLY a long thin horizontal white QUARTZ kitchen countertop slab with subtle grey veining, seen straight-on from the front with a slight top surface visible, a brushed steel gooseneck faucet rising in the centre and an undermount sink hint. A long thin slab strip ONLY — no cabinets below, no wall behind. ${CUT} ${AD}` },
  { key: "counter-butcher", size: "1536x1024", transparent: true, outW: 600,
    prompt: `ONLY a long thin horizontal BUTCHER BLOCK wood kitchen countertop slab in warm oiled oak with visible wood strips, seen straight-on from the front with a slight top surface visible, a black bridge faucet rising in the centre and a sink hint. A long thin slab strip ONLY — no cabinets below, no wall behind. ${CUT} ${AD}` },

  { key: "splash-classic", size: "1536x1024", transparent: false, outW: 700,
    prompt: `A flat backsplash tile texture filling the ENTIRE frame edge-to-edge: classic glossy white subway tiles in running bond with light grey grout. Perfectly flat frontal texture, even light. ${AD}` },
  { key: "splash-herring", size: "1536x1024", transparent: false, outW: 700,
    prompt: `A flat backsplash tile texture filling the ENTIRE frame edge-to-edge: warm beige-and-white marble tiles laid in a HERRINGBONE pattern with thin grout lines. Perfectly flat frontal texture, even light. ${AD}` },

  { key: "pendants", size: "1024x1024", transparent: true, outW: 300,
    prompt: `Two matching modern pendant lights hanging side by side on thin black cords from the top of the frame, warm glowing glass globes with brass fittings. ${CUT} ${AD}` },
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

async function runGen(job: GenJob): Promise<void> {
  const srcDir = path.join(DIR, "_src");
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
  writeFileSync(path.join(DIR, `${job.key}.webp`), data);
  console.log(`      -> ${job.key}.webp ${(data.length / 1024).toFixed(1)}KB`);
}

async function main(): Promise<void> {
  console.log("== KITCHEN LAYERS ==");
  for (const j of JOBS) await runGen(j);
  console.log("\nAll done.");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
