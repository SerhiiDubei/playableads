import "dotenv/config";
import OpenAI from "openai";
import { mkdirSync, writeFileSync } from "node:fs";

// Generate ONE full-body Cowboy-Bebop character in a clean, riggable side
// profile. We then segment THIS single image at the joints (edges match → no
// seam problems, proportions are inherent). Run:
//   npx tsx src/assetgen/gen-bebop-full.ts
const OUT = "/tmp/bebop-full";

const PROMPT = [
  "Full-body character sheet of a lanky adult man in retro 1990s anime cel style (Cowboy Bebop / Spike Spiegel aesthetic): messy dark teal-green hair, navy-blue casual suit jacket, mustard-yellow shirt, slim dark navy trousers, brown leather shoes.",
  "STRICT LEFT-FACING SIDE PROFILE (head, torso, legs all in pure side view, the face looks to the LEFT).",
  "Relaxed neutral standing pose for rigging: arms hang down but held SLIGHTLY AWAY from the torso so there is a clear gap between each arm and the body; legs straight with the feet slightly apart (one foot a little forward) so both legs are distinguishable; elbows and knees very slightly bent.",
  "FLAT even cel shading with a single soft shadow tone and clean thin dark outlines — no dramatic directional lighting, so the figure can be cut into pieces that tile cleanly.",
  "The ENTIRE figure fully inside the frame with generous margin on all sides: all of the hair, both hands, and both shoes visible and NOT cropped. The whole body from head to shoes is shown, standing upright and centered.",
  "Transparent background. Only the single character, no ground, no shadow on the floor, no text, no labels, no extra props.",
].join("\n\n");

async function main() {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log("Generating full figure (gpt-image-1.5, high)...");
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
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/full.png`, Buffer.from(b64, "base64"));
  console.log("WROTE", `${OUT}/full.png`);
}
main().catch((e) => { console.error(e); process.exit(1); });
