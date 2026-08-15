import "dotenv/config";
import OpenAI from "openai";
import { mkdirSync, writeFileSync } from "node:fs";
const OUT = "/tmp/bebop-full";
const PROMPT = [
  "A horizontal sprite sheet: 8 evenly-spaced frames of ONE consistent character walking, a smooth left-facing side-view walk cycle read left to right, frame 1 and frame 8 loop seamlessly.",
  "Character (identical in every frame — same design, colors, proportions, size): lanky adult man, retro 1990s anime cel style (Cowboy Bebop / Spike Spiegel), messy dark teal-green hair, navy-blue suit jacket, mustard-yellow shirt, slim navy trousers, brown shoes, STRICT LEFT-FACING SIDE PROFILE.",
  "Each of the 8 frames shows the next pose of one natural walk cycle (contact, down, passing, up, contact, ...). Even spacing, equal transparent gutters between frames, each figure the same height and vertically aligned on the same ground line, fully in frame, not cropped.",
  "FLAT even cel shading, clean outlines. Transparent background, no ground line drawn, no shadow, no text, no numbers, no grid.",
].join("\n\n");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
console.log("walk strip...");
const res = await client.images.generate({ model:"gpt-image-1.5", prompt:PROMPT, size:"1536x1024", quality:"high", output_format:"png", background:"transparent" } as any);
mkdirSync(OUT,{recursive:true}); writeFileSync(`${OUT}/strip.png`, Buffer.from((res as any).data[0].b64_json,"base64"));
console.log("WROTE", `${OUT}/strip.png`);
