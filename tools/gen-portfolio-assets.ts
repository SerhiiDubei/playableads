// Generate AI sprites for 6 portfolio playables via gpt-image-1.5.
//   npx tsx tools/gen-portfolio-assets.ts [game-id]   (default: all)
//
// Per game: a consistent art-direction line is embedded in every prompt so the
// pieces look organic together. Raw PNGs go to labs/<id>/assets/_src/ (skip-
// existing), optimized webp to labs/<id>/assets/ (inlined by build-lab).
// Sheets (grid prompts) are split into individual sprites before optimize.
// Rate limit: gpt-image ~5 img/min -> sequential with retry/backoff.

import "dotenv/config";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import sharp from "sharp";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Size = "1024x1024" | "1024x1536" | "1536x1024";
interface Job {
  game: string;
  key: string;             // output name without ext; _name = sheet (split below)
  prompt: string;
  size: Size;
  transparent: boolean;
  // sheet split: cols x rows -> outKeys in reading order
  sheet?: { cols: number; rows: number; outKeys: string[] };
  // optimize target width (px) for final webp
  outW: number;
}

// ── Art direction per game (repeated in every prompt for coherence) ──────────
const AD = {
  greens: "Glossy cartoon mobile-game style, thick clean dark outlines, juicy saturated colors, soft top-left highlight, flat shading.",
  haven: "Warm flat illustration, cozy American home interior, soft rounded edges, muted terracotta-sage-cream palette, subtle grain, no people.",
  umbrella: "Soft storybook children illustration, gentle warm colors, rounded friendly shapes, flat shading with soft shadows.",
  hydro: "Clean painterly backyard scene, slightly stylized realism, warm late-afternoon light.",
  bath: "Interior design magazine flat render, soft natural daylight from a window top right, slightly stylized, clean lines. Camera: straight-on eye-level view of the same bathroom, bathtub centered, window upper right, consistent layout.",
  kitchen: "Interior design magazine flat render, soft natural daylight, slightly stylized, clean lines. Camera: straight-on eye-level view of a kitchen wall with upper cabinets, window center, backsplash, countertop with sink and stove, lower cabinets, consistent layout.",
};

const JOBS: Job[] = [
  // ── greens-catch-glass (Brimful) ──────────────────────────────────────────
  {
    game: "greens-catch-glass", key: "_ingsheet",
    prompt: `A 3x2 grid (3 columns, 2 rows) of healthy smoothie ingredients for a mobile catch game. ${AD.greens} Each item centered in its own cell, equal size, fully isolated on transparent background, no text, no grid lines. Cell order left-to-right top-to-bottom: 1 fresh spinach leaf, 2 blueberry, 3 strawberry, 4 kiwi slice showing green flesh, 5 ginger root piece, 6 glowing golden vitamin capsule with sparkle.`,
    size: "1024x1024", transparent: true,
    sheet: { cols: 3, rows: 2, outKeys: ["ing-spinach", "ing-blueberry", "ing-strawberry", "ing-kiwi", "ing-ginger", "ing-golden"] },
    outW: 140,
  },
  {
    game: "greens-catch-glass", key: "_junksheet",
    prompt: `A 2x1 grid (2 columns, 1 row) of junk food items for a mobile game. ${AD.greens} Each centered in its cell, fully isolated on transparent background, no text. Cell order: 1 pink frosted donut with sprinkles, 2 red soda can.`,
    size: "1024x1024", transparent: true,
    sheet: { cols: 2, rows: 1, outKeys: ["junk-donut", "junk-soda"] },
    outW: 140,
  },
  {
    game: "greens-catch-glass", key: "glass",
    prompt: `A tall empty drinking glass for a smoothie, slight taper, visible rim and base, subtle blue-teal glass tint with white highlights. ${AD.greens} Centered, fully isolated on transparent background, no liquid inside, no text.`,
    size: "1024x1024", transparent: true, outW: 220,
  },
  {
    game: "greens-catch-glass", key: "bg",
    prompt: `Vertical mobile game background: softly blurred cozy kitchen counter scene in morning light, warm teal-and-cream tones, depth of field, empty counter space in lower third, light rays from upper window. ${AD.greens} No characters, no text, calm backdrop that does not compete with foreground.`,
    size: "1024x1536", transparent: false, outW: 540,
  },

  // ── home-kitchen-hotspot-stamp (HavenNest) ────────────────────────────────
  {
    game: "home-kitchen-hotspot-stamp", key: "kitchen-bg",
    prompt: `Vertical full-view of a cozy clean American kitchen wall: upper cabinets left, window with blue sky upper right, ceiling strip at very top, tiled backsplash, counter with sink (faucet) center-left, lower cabinets, tall dishwasher unit right side, small ceiling vent. ${AD.haven} Everything tidy and undamaged, balanced composition with clear space around the sink, window, ceiling, lower-left cabinet and dishwasher (interactive hotspots will be placed there). No text.`,
    size: "1024x1536", transparent: false, outW: 540,
  },
  {
    game: "home-kitchen-hotspot-stamp", key: "_dmgsheet",
    prompt: `A 2x2 grid of household water-damage decals for a home-insurance game, ${AD.haven} each fully isolated on transparent background, no text, painterly soft: 1 brown water stain blotch with drip streaks (for a ceiling), 2 burst-pipe spray of blue water arcs with droplets, 3 blue water puddle pooling flat oval, 4 white soap foam burst cluster of bubbles.`,
    size: "1024x1024", transparent: true,
    sheet: { cols: 2, rows: 2, outKeys: ["dmg-stain", "dmg-spray", "dmg-puddle", "dmg-foam"] },
    outW: 200,
  },
  {
    game: "home-kitchen-hotspot-stamp", key: "window-crack",
    prompt: `Glass crack pattern: radiating fracture lines from an impact point with small shards, thin dark-blue lines, semi-transparent look. ${AD.haven} Isolated on transparent background, fits over a window pane, no text.`,
    size: "1024x1024", transparent: true, outW: 200,
  },
  {
    game: "home-kitchen-hotspot-stamp", key: "bucket",
    prompt: `A small metal bucket viewed slightly from above, catching water, tiny ripple inside. ${AD.haven} Isolated on transparent background, no text.`,
    size: "1024x1024", transparent: true, outW: 120,
  },

  // ── life-umbrella-drag-catch (Evergreen) ──────────────────────────────────
  {
    game: "life-umbrella-drag-catch", key: "umbrella",
    prompt: `An open forest-green umbrella seen from a three-quarter top angle, visible curved canopy panels with warm golden trim, short handle below. ${AD.umbrella} Centered, fully isolated on transparent background, no text, no rain.`,
    size: "1024x1024", transparent: true, outW: 280,
  },
  {
    game: "life-umbrella-drag-catch", key: "family",
    prompt: `A happy family group standing together: father, mother and a small child between them, holding hands, viewed from the front, simple rounded character design, warm clothing colors (forest green, golden yellow, cream). ${AD.umbrella} Fully isolated on transparent background, full bodies with feet, no text.`,
    size: "1024x1024", transparent: true, outW: 260,
  },
  {
    game: "life-umbrella-drag-catch", key: "tree",
    prompt: `A single evergreen tree with a rounded soft canopy, simple trunk. ${AD.umbrella} Fully isolated on transparent background, no text.`,
    size: "1024x1024", transparent: true, outW: 180,
  },
  {
    game: "life-umbrella-drag-catch", key: "bg",
    prompt: `Vertical storybook background: soft overcast sky with layered gentle rain clouds in the upper half, calm green meadow in the lower third, distant hills, muted but warm. ${AD.umbrella} No characters, no rain drops, no text.`,
    size: "1024x1536", transparent: false, outW: 540,
  },
  {
    game: "life-umbrella-drag-catch", key: "sun",
    prompt: `A warm smiling-style sun with soft rays (no face), golden yellow with cream glow. ${AD.umbrella} Fully isolated on transparent background, no text.`,
    size: "1024x1024", transparent: true, outW: 160,
  },

  // ── power-wash-patio-reveal (HydroHaven) ──────────────────────────────────
  {
    game: "power-wash-patio-reveal", key: "patio-clean",
    prompt: `Top-down view of a beautiful clean backyard stone patio filling the whole frame: large warm-beige square pavers in a regular grid with thin joints, a decorative circular mosaic medallion of small colored tiles in the center, pristine and freshly washed with a subtle wet sheen. ${AD.hydro} Strictly top-down (no perspective), edge-to-edge pavers, no furniture, no people, no text.`,
    size: "1024x1536", transparent: false, outW: 540,
  },
  {
    game: "power-wash-patio-reveal", key: "house-wall",
    prompt: `A horizontal strip of a house exterior seen straight-on: warm white clapboard siding, one window with dark frame and soft curtain, a few planter boxes with green plants at the bottom edge. ${AD.hydro} Fills the frame edge-to-edge, no sky, no text.`,
    size: "1536x1024", transparent: false, outW: 540,
  },
  {
    game: "power-wash-patio-reveal", key: "string-lights",
    prompt: `A gentle drooping string of warm glowing cafe lights (8-10 bulbs) on a dark wire, soft golden glow around each bulb. ${AD.hydro} Isolated on transparent background, horizontal sweep, no text.`,
    size: "1536x1024", transparent: true, outW: 540,
  },
  {
    game: "power-wash-patio-reveal", key: "nozzle",
    prompt: `A power-washer spray gun nozzle seen from a three-quarter top angle, teal and dark-grey body, short handle, emitting a tight white-blue water jet cone with fine mist droplets at the tip. ${AD.hydro} Isolated on transparent background, pointing down-left, no text.`,
    size: "1024x1024", transparent: true, outW: 200,
  },

  // ── budget-slider-bath-morph (RenoScope) — 3 tiers, same camera ───────────
  {
    game: "budget-slider-bath-morph", key: "bath-basic",
    prompt: `${AD.bath} BASIC budget tier: plain white walls with simple half-height tile, standard white bathtub with a basic chrome faucet, small framed mirror over a simple white vanity left side, plain floor tiles, modest and tidy but minimal. No text, no people.`,
    size: "1024x1536", transparent: false, outW: 540,
  },
  {
    game: "budget-slider-bath-morph", key: "bath-mid",
    prompt: `${AD.bath} MID-RANGE tier: the same bathroom upgraded — warm beige stone-look wall tiles to the ceiling, the same white bathtub now with a sleeker brushed-nickel faucet, larger round backlit mirror over a wooden two-drawer vanity left side, herringbone floor tile, a green plant. Same layout and camera as the basic version. No text, no people.`,
    size: "1024x1536", transparent: false, outW: 540,
  },
  {
    game: "budget-slider-bath-morph", key: "bath-premium",
    prompt: `${AD.bath} PREMIUM tier: the same bathroom luxuriously remodeled — large-format marble wall slabs, a glass walk-in rain shower replacing the tub area center, LED-backlit wide mirror, floating walnut double vanity with vessel sink left side, brass fixtures, large-format stone floor, warm accent lighting strip. Same layout and camera as the other versions. No text, no people.`,
    size: "1024x1536", transparent: false, outW: 540,
  },

  // ── dream-kitchen-three-picks (DreamSlate) — 2 styles, same camera ────────
  {
    game: "dream-kitchen-three-picks", key: "kitchen-modern",
    prompt: `${AD.kitchen} MODERN style: matte charcoal flat-front cabinets, white quartz countertop, sleek stainless fixtures, minimal hardware, white large-format backsplash, cool clean look. No text, no people.`,
    size: "1024x1536", transparent: false, outW: 540,
  },
  {
    game: "dream-kitchen-three-picks", key: "kitchen-farmhouse",
    prompt: `${AD.kitchen} FARMHOUSE style: the same kitchen layout in warm cream shaker cabinets with brass knobs, butcher-block wooden countertop, white apron-front sink, subway tile backsplash, cozy warm look. Same layout and camera as the modern version. No text, no people.`,
    size: "1024x1536", transparent: false, outW: 540,
  },
];

const RATE_DELAY_MS = 13_000; // ~4.6/min, под лимит 5/min

async function genOne(job: Job): Promise<Buffer> {
  const req: Record<string, unknown> = {
    model: "gpt-image-1.5",
    prompt: job.prompt,
    size: job.size,
    quality: "medium",
    output_format: "png",
  };
  if (job.transparent) req.background = "transparent";
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await client.images.generate(req as never);
      const b64 = (res as { data?: Array<{ b64_json?: string }> }).data?.[0]?.b64_json;
      if (!b64) throw new Error("empty b64_json");
      return Buffer.from(b64, "base64");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === 4) throw err;
      const wait = msg.includes("429") ? 30_000 * attempt : 8_000 * attempt;
      console.log(`    retry ${attempt} after ${wait / 1000}s (${msg.slice(0, 80)})`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error("unreachable");
}

async function optimizeTo(outPath: string, buf: Buffer, outW: number, transparent: boolean): Promise<number> {
  let img = sharp(buf);
  if (transparent) img = img.trim();
  const data = await img
    .resize({ width: outW, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  writeFileSync(outPath, data);
  return data.length;
}

async function main(): Promise<void> {
  const only = process.argv[2];
  const jobs = only ? JOBS.filter((j) => j.game === only) : JOBS;
  console.log(`\n${jobs.length} generation jobs${only ? ` for ${only}` : ""}\n`);
  let totalGen = 0;
  for (const job of jobs) {
    const srcDir = path.join("labs", job.game, "assets", "_src");
    const outDir = path.join("labs", job.game, "assets");
    mkdirSync(srcDir, { recursive: true });
    const srcPath = path.join(srcDir, `${job.key}.png`);

    let raw: Buffer;
    if (existsSync(srcPath)) {
      console.log(`  [skip-gen] ${job.game}/${job.key}`);
      raw = readFileSync(srcPath);
    } else {
      process.stdout.write(`  [gen] ${job.game}/${job.key} (${job.size}) ...`);
      const t0 = Date.now();
      raw = await genOne(job);
      writeFileSync(srcPath, raw);
      totalGen++;
      console.log(` ${((Date.now() - t0) / 1000).toFixed(0)}s, ${(raw.length / 1024).toFixed(0)}KB raw`);
      await new Promise((r) => setTimeout(r, RATE_DELAY_MS));
    }

    if (job.sheet) {
      const meta = await sharp(raw).metadata();
      const W = meta.width ?? 1024, H = meta.height ?? 1024;
      const cw = Math.floor(W / job.sheet.cols), ch = Math.floor(H / job.sheet.rows);
      // 7% inset per cell edge — neighbouring sprites often bleed across cell
      // borders in grid generations; cropping the margin removes the tails.
      const inX = Math.floor(cw * 0.07), inY = Math.floor(ch * 0.07);
      for (let i = 0; i < job.sheet.outKeys.length; i++) {
        const cx = (i % job.sheet.cols) * cw + inX;
        const cy = Math.floor(i / job.sheet.cols) * ch + inY;
        const cell = await sharp(raw).extract({ left: cx, top: cy, width: cw - 2 * inX, height: ch - 2 * inY }).png().toBuffer();
        const bytes = await optimizeTo(path.join(outDir, `${job.sheet.outKeys[i]}.webp`), cell, job.outW, true);
        console.log(`      -> ${job.sheet.outKeys[i]}.webp ${(bytes / 1024).toFixed(1)}KB`);
      }
    } else {
      const bytes = await optimizeTo(path.join(outDir, `${job.key}.webp`), raw, job.outW, job.transparent);
      console.log(`      -> ${job.key}.webp ${(bytes / 1024).toFixed(1)}KB`);
    }
  }
  console.log(`\nDone. ${totalGen} new generations.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
