import "dotenv/config";
import OpenAI from "openai";
import { mkdirSync, writeFileSync } from "node:fs";
const OUT = "/tmp/bebop-full";
const PROMPT = [
  "Full-body character of a lanky adult man, retro 1990s anime cel style (Cowboy Bebop / Spike Spiegel): messy dark teal-green hair, navy-blue casual suit jacket, mustard-yellow shirt, slim dark navy trousers, brown leather shoes.",
  "STRICT LEFT-FACING SIDE PROFILE, captured in a clear mid-stride WALKING pose: the front leg is stepping forward, the back leg is extended behind (legs clearly SPLIT apart), and the arms counter-swing — one arm forward, the other arm back — so ALL FOUR limbs are separated from the torso and from each other with clear gaps between them.",
  "FLAT even cel shading, single soft shadow tone, clean thin dark outlines, no dramatic lighting.",
  "The ENTIRE figure fully in frame with generous margin: all hair, both hands, both shoes visible and NOT cropped.",
  "Transparent background, only the character, no ground, no cast shadow, no text.",
].join("\n\n");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
console.log("stride figure...");
const res = await client.images.generate({ model:"gpt-image-1.5", prompt:PROMPT, size:"1024x1536", quality:"high", output_format:"png", background:"transparent" } as any);
mkdirSync(OUT,{recursive:true}); writeFileSync(`${OUT}/stride.png`, Buffer.from((res as any).data[0].b64_json,"base64"));
console.log("WROTE", `${OUT}/stride.png`);
