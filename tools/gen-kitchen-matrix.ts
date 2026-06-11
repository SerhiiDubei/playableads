// Dream-kitchen full-frame matrix via images.edit (geometry-preserving).
//   npx tsx tools/gen-kitchen-matrix.ts
//
// 8 combo frames = 2 style bases (already generated) + 6 edits derived from
// them. images.edit keeps the camera/layout of the source, so every variant
// within a style lines up — crossfades stay clean, no procedural overlays.
//
// Matrix (style-counter-splash):
//   m-q-w  = modern base            (quartz counter, white slab splash)
//   m-b-w  = edit(m): butcher-block counter
//   m-q-h  = edit(m): herringbone tile splash
//   m-b-h  = edit(m-b-w): + herringbone splash
//   f-b-s  = farmhouse base         (butcher counter, subway splash)
//   f-q-s  = edit(f): white quartz counter
//   f-b-h  = edit(f): herringbone splash
//   f-q-h  = edit(f-q-s): + herringbone splash

import "dotenv/config";
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const DIR = path.join("labs", "dream-kitchen-three-picks", "assets");
const SRC = path.join(DIR, "_src");

interface EditJob {
  out: string;          // output key (webp name without ext)
  from: string;         // source png in _src (must exist before this job runs)
  prompt: string;
}

const KEEP = "Keep everything else exactly the same: same camera, same layout, same lighting, same cabinets, same window, same sink and fixtures. Photorealistic interior, clean magazine style.";

const JOBS: EditJob[] = [
  { out: "m-b-w", from: "kitchen-modern",
    prompt: `Replace the white quartz countertop with a warm butcher-block wood countertop (golden oak tone, visible wood grain). ${KEEP}` },
  { out: "m-q-h", from: "kitchen-modern",
    prompt: `Replace the plain white backsplash with a herringbone-pattern tile backsplash in soft warm grey-beige. ${KEEP}` },
  { out: "m-b-h", from: "m-b-w",
    prompt: `Replace the plain white backsplash with a herringbone-pattern tile backsplash in soft warm grey-beige. ${KEEP}` },
  { out: "f-q-s", from: "kitchen-farmhouse",
    prompt: `Replace the wooden butcher-block countertop with a polished white quartz countertop. ${KEEP}` },
  { out: "f-b-h", from: "kitchen-farmhouse",
    prompt: `Replace the subway tile backsplash with a herringbone-pattern tile backsplash in warm cream tones. ${KEEP}` },
  { out: "f-q-h", from: "f-q-s",
    prompt: `Replace the subway tile backsplash with a herringbone-pattern tile backsplash in warm cream tones. ${KEEP}` },
];

async function editOne(job: EditJob): Promise<Buffer> {
  const srcPath = path.join(SRC, `${job.from}.png`);
  if (!existsSync(srcPath)) throw new Error(`source missing: ${srcPath}`);
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await client.images.edit({
        model: "gpt-image-1.5",
        image: await toFile(createReadStream(srcPath), `${job.from}.png`, { type: "image/png" }),
        prompt: job.prompt,
        size: "1024x1536",
        quality: "medium",
      } as never);
      const b64 = (res as { data?: Array<{ b64_json?: string }> }).data?.[0]?.b64_json;
      if (!b64) throw new Error("empty b64_json");
      return Buffer.from(b64, "base64");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === 4) throw err;
      const wait = msg.includes("429") ? 30_000 * attempt : 8_000 * attempt;
      console.log(`    retry ${attempt} in ${wait / 1000}s (${msg.slice(0, 90)})`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error("unreachable");
}

async function optimize(key: string, raw: Buffer): Promise<void> {
  const data = await sharp(raw).resize({ width: 540 }).webp({ quality: 82 }).toBuffer();
  writeFileSync(path.join(DIR, `${key}.webp`), data);
  console.log(`      -> ${key}.webp ${(data.length / 1024).toFixed(1)}KB`);
}

async function main(): Promise<void> {
  mkdirSync(SRC, { recursive: true });
  // Re-emit the two bases under matrix names for a uniform 8-key set.
  await optimize("m-q-w", readFileSync(path.join(SRC, "kitchen-modern.png")));
  await optimize("f-b-s", readFileSync(path.join(SRC, "kitchen-farmhouse.png")));

  for (const job of JOBS) {
    const srcPng = path.join(SRC, `${job.out}.png`);
    let raw: Buffer;
    if (existsSync(srcPng)) {
      console.log(`  [skip-gen] ${job.out}`);
      raw = readFileSync(srcPng);
    } else {
      process.stdout.write(`  [edit] ${job.out} (from ${job.from}) ...`);
      const t0 = Date.now();
      raw = await editOne(job);
      writeFileSync(srcPng, raw);
      console.log(` ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      await new Promise((r) => setTimeout(r, 13_000));
    }
    await optimize(job.out, raw);
  }
  console.log("\nMatrix done: 8 frames.");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
