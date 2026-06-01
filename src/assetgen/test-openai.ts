import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const NEG = "no white outline, no sticker border, no padding, no drop shadow background";

const ASSETS = [
  {
    name: "coin",
    prompt: `A shiny golden coin game icon, casual mobile game style, thick clean outline, vibrant, centered. ${NEG}`,
    size: "1024x1024" as const,
  },
  {
    name: "cta-button",
    prompt: `A glossy green "PLAY NOW" call-to-action button for a mobile game, rounded rectangle, bold white uppercase text reading exactly "PLAY NOW", playful casual UI style, centered. ${NEG}`,
    size: "1536x1024" as const,
  },
  {
    name: "star-icon",
    prompt: `A bright yellow star reward icon, casual mobile game UI, glossy, thick outline, centered. ${NEG}`,
    size: "1024x1024" as const,
  },
];

async function gen(a: (typeof ASSETS)[number]) {
  const t0 = Date.now();
  const res = await client.images.generate({
    model: "gpt-image-1",
    prompt: a.prompt,
    size: a.size,
    background: "transparent",
    output_format: "png",
  });
  const ms = Date.now() - t0;
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image data");
  const buf = Buffer.from(b64, "base64");
  mkdirSync("out", { recursive: true });
  writeFileSync(`out/test-${a.name}.png`, buf);
  const tokens = res.usage?.output_tokens ?? 0;
  console.log(`${a.name}: ${ms}ms, ${(buf.length / 1024).toFixed(0)}KB, ${tokens} img-tokens -> out/test-${a.name}.png`);
}

async function main() {
  console.log("Generating playable asset set with gpt-image-1...");
  for (const a of ASSETS) await gen(a);
  console.log("done.");
}

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
