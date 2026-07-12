import "dotenv/config";
import OpenAI from "openai";
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

// Generate a CUT-OUT BODY-PARTS sheet for a 90s-anime (Cowboy Bebop aesthetic)
// character, slice it by transparent gutters into named parts, and emit a
// dataURI TypeScript module for the Remotion walker (Tower 11).
//
// Sheet layout (rows by transparent gaps): [head, torso] / [upper arm,
// forearm+hand, shoe] / [thigh, shin]. All limb parts VERTICAL (pivot at top).
// Run: npx tsx src/assetgen/gen-bebop-parts.ts

const OUT_PNG_DIR = "/tmp/bebop-parts";
const OUT_TS = "/Users/serhiidubei/remotion-test/src/tower11/bebop-parts.ts";
const ROW_NAMES: string[][] = [["head", "torso"], ["uarm", "farm", "shoe"], ["thigh", "shin"]];

const PROMPT = [
  "Body-parts sheet for cut-out puppet animation. Retro 1990s anime cel style (Cowboy Bebop aesthetic): a lanky adult man — messy dark teal-green hair, navy-blue suit jacket, mustard-yellow shirt, slim dark navy trousers, dark brown leather shoes. Flat cel shading with one shadow tone, clean thin dark outlines, muted retro palette.",
  "Transparent background. EXACTLY 7 separate isolated parts, generous transparent gaps between all parts, nothing touching or overlapping, no text, no labels, no grid lines, no extra parts, no full-body figure.",
  "Arrange in 3 rows:",
  "Row 1 (top): (a) HEAD in strict side profile facing RIGHT with short neck stub at the bottom; (b) TORSO in side view facing right wearing the suit jacket, from neck stub down to hip line, NO arms, NO legs, NO head.",
  "Row 2 (middle): (c) one UPPER-ARM sleeve segment, perfectly VERTICAL, shoulder end at top, elbow end at bottom; (d) one FOREARM segment with bare HAND, perfectly VERTICAL, elbow end at top, relaxed hand at bottom; (e) one SHOE in side view, toe pointing RIGHT, sole at the bottom.",
  "Row 3 (bottom): (f) one THIGH trouser segment, perfectly VERTICAL, hip end at top, knee end at bottom; (g) one SHIN trouser segment with ankle, perfectly VERTICAL, knee end at top, ankle at bottom.",
  "Each limb segment is a straight clean capsule-like piece, consistent suit colors across parts, same character throughout.",
].join("\n\n");

async function findGaps(alphaSums: number[], minRun: number): Promise<[number, number][]> {
  // return [start,end) runs of CONTENT (non-empty) separated by empty runs
  const bands: [number, number][] = [];
  let s = -1;
  for (let i = 0; i < alphaSums.length; i++) {
    const filled = alphaSums[i] > 0;
    if (filled && s < 0) s = i;
    if (!filled && s >= 0) { if (i - s >= minRun) bands.push([s, i]); s = -1; }
  }
  if (s >= 0 && alphaSums.length - s >= minRun) bands.push([s, alphaSums.length]);
  return bands;
}

async function main() {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log("Generating parts sheet (gpt-image-1.5)...");
  const res = await client.images.generate({
    model: "gpt-image-1.5",
    prompt: PROMPT,
    size: "1024x1536",
    quality: "high",
    output_format: "png",
    background: "transparent",
  } as any);
  const b64 = (res as any).data?.[0]?.b64_json;
  if (!b64) throw new Error("no image data");
  const sheet = Buffer.from(b64, "base64");
  mkdirSync(OUT_PNG_DIR, { recursive: true });
  writeFileSync(`${OUT_PNG_DIR}/sheet.png`, sheet);
  console.log("sheet saved →", `${OUT_PNG_DIR}/sheet.png`);

  // alpha raster
  const { data, info } = await sharp(sheet).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const rowSum = new Array(H).fill(0), colSumAll = new Array(W).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = data[(y * W + x) * 4 + 3];
    if (a > 16) { rowSum[y]++; colSumAll[x]++; }
  }
  const rows = await findGaps(rowSum, 24);
  console.log("row bands:", rows.length, rows);

  const parts: { name: string; png: Buffer; w: number; h: number }[] = [];
  for (let r = 0; r < rows.length; r++) {
    const [y0, y1] = rows[r];
    const colSum = new Array(W).fill(0);
    for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > 16) colSum[x]++;
    }
    const cols = await findGaps(colSum, 16);
    console.log(`row ${r}: ${cols.length} parts`, cols);
    const names = ROW_NAMES[r] ?? [];
    for (let c = 0; c < cols.length; c++) {
      const [x0, x1] = cols[c];
      const box = await sharp(sheet)
        .extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 })
        .png()
        .toBuffer();
      const cut = await sharp(box).trim({ threshold: 10 }).png().toBuffer();
      const meta = await sharp(cut).metadata();
      const name = names[c] ?? `extra_r${r}c${c}`;
      parts.push({ name, png: cut, w: meta.width!, h: meta.height! });
      writeFileSync(`${OUT_PNG_DIR}/${name}.png`, cut);
    }
  }
  console.log("parts:", parts.map((p) => `${p.name} ${p.w}x${p.h}`).join(", "));

  const expected = ["head", "torso", "uarm", "farm", "shoe", "thigh", "shin"];
  const got = new Set(parts.map((p) => p.name));
  const missing = expected.filter((e) => !got.has(e));
  if (missing.length) console.warn("⚠ MISSING parts:", missing, "— inspect", OUT_PNG_DIR);

  const lines = parts
    .filter((p) => expected.includes(p.name))
    .map((p) => `  ${p.name}: { uri: "data:image/png;base64,${p.png.toString("base64")}", w: ${p.w}, h: ${p.h} },`);
  const ts = `// AUTO-GENERATED by playable/src/assetgen/gen-bebop-parts.ts — do not edit.\n// Cowboy-Bebop-style cut-out body parts (gpt-image-1.5, transparent PNG).\nexport type Part = { uri: string; w: number; h: number };\nexport const BEBOP: Record<string, Part> = {\n${lines.join("\n")}\n};\n`;
  writeFileSync(OUT_TS, ts);
  console.log("WROTE", OUT_TS, `(${(ts.length / 1024).toFixed(0)} KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
