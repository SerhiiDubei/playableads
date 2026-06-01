import "dotenv/config";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import OpenAI, { toFile } from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = "gpt-image-1.5";
const SIZE = "1024x1536" as const;
const RATE = 40;
const REF = "out/prompt-lab/heroes3-knight/4-ip-anchored.png";
const OUT = "out/ref-test";

const KEEP = "Keep the SAME character identical: same face, same hairstyle, same silver-and-gold plate armor, same red cape, same blue shield with the golden lion crest. Same Heroes-III bright painterly art style. Perfectly isolated on a fully transparent background, no scenery, clean cutout.";

const VARIATIONS = [
  { name: "v1-raise-sword", prompt: `The same knight in a heroic action pose, raising his sword high overhead, shield forward. ${KEEP}` },
  { name: "v2-portrait", prompt: `A close-up bust portrait of the same knight, head and shoulders, confident expression. ${KEEP}` },
  { name: "v3-walking", prompt: `The same knight walking forward in a three-quarter side view, sword lowered at his side. ${KEEP}` },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function pngColorType(b: Buffer) { return b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" ? b[25] : null; }

async function editWithRetry(refFile: any, prompt: string, tries = 4): Promise<any> {
  for (let i = 0; ; i++) {
    try {
      return await client.images.edit({ model: MODEL, image: refFile, prompt, size: SIZE, background: "transparent", output_format: "png" } as any);
    } catch (e: any) {
      const is429 = e?.status === 429 || /rate limit/i.test(e?.message ?? "");
      if (!is429 || i >= tries) throw e;
      const m = /try again in (\d+(?:\.\d+)?)s/i.exec(e?.message ?? "");
      const w = (m ? parseFloat(m[1]) : 13) * 1000 + 1500 * i;
      console.log(`    waiting ${(w / 1000).toFixed(0)}s on 429`);
      await sleep(w);
    }
  }
}

type Rec = { name: string; ms: number; tokens: number; cost: number; colorType: number | null; error?: string };
const results: Rec[] = [];

async function gen(v: { name: string; prompt: string }): Promise<Rec> {
  const t0 = Date.now();
  try {
    const refFile = await toFile(readFileSync(REF), "ref.png", { type: "image/png" });
    const res = await editWithRetry(refFile, v.prompt);
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image data");
    const buf = Buffer.from(b64, "base64");
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/${v.name}.png`, buf);
    const tokens = res.usage?.output_tokens ?? 0;
    const rec: Rec = { name: v.name, ms: Date.now() - t0, tokens, cost: (tokens / 1e6) * RATE, colorType: pngColorType(buf) };
    console.log(`  done ${v.name}: ${rec.ms}ms ${tokens}tok ~$${rec.cost.toFixed(3)} ct=${rec.colorType}`);
    return rec;
  } catch (e: any) {
    console.log(`  fail ${v.name}: ${e?.message ?? e}`);
    return { name: v.name, ms: Date.now() - t0, tokens: 0, cost: 0, colorType: null, error: e?.message ?? String(e) };
  }
}

async function pool<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

async function main() {
  console.log(`ref-test: ${VARIATIONS.length} variations from ${REF} via images.edit (${MODEL})\n`);
  const t0 = Date.now();
  await pool(VARIATIONS, 3, async (v) => { results.push(await gen(v)); });
  const ok = results.filter((r) => !r.error);
  console.log(`\nwall: ${((Date.now() - t0) / 1000).toFixed(1)}s, ${ok.length}/${results.length}, ~$${ok.reduce((s, r) => s + r.cost, 0).toFixed(2)}`);
  console.log(`-> ${OUT}/`);
}
main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
