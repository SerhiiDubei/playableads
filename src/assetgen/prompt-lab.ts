import "dotenv/config";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const RATE = 40;
const CONCURRENCY = 5;

// lab-конфіг: { target, model, size, quality, strategies:[{name,prompt}] }
const labPath = process.argv[2] ?? "src/assetgen/labs/diablo2-hero.json";
const lab = JSON.parse(readFileSync(labPath, "utf8"));
const outDir = `out/prompt-lab/${lab.target}`;

function colorType(buf: Buffer): number | null {
  if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  return buf[25];
}

type Rec = { name: string; prompt: string; ms: number; tokens: number; cost: number; colorType: number | null; error?: string };
const results: Rec[] = [];

async function gen(s: { name: string; prompt: string }): Promise<Rec> {
  const t0 = Date.now();
  try {
    const res = await client.images.generate({
      model: lab.model, prompt: s.prompt, size: lab.size, quality: lab.quality,
      output_format: "png", background: "transparent",
    });
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image data");
    const buf = Buffer.from(b64, "base64");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(`${outDir}/${s.name}.png`, buf);
    const tokens = res.usage?.output_tokens ?? 0;
    const rec: Rec = { name: s.name, prompt: s.prompt, ms: Date.now() - t0, tokens, cost: (tokens / 1e6) * RATE, colorType: colorType(buf) };
    writeFileSync(`${outDir}/${s.name}.json`, JSON.stringify(rec, null, 2));
    console.log(`  ✓ ${s.name}: ${rec.ms}ms ${tokens}tok ~$${rec.cost.toFixed(3)} ct=${rec.colorType}`);
    return rec;
  } catch (e: any) {
    console.log(`  ✗ ${s.name}: ${e?.message ?? e}`);
    return { name: s.name, prompt: s.prompt, ms: Date.now() - t0, tokens: 0, cost: 0, colorType: null, error: e?.message ?? String(e) };
  }
}

async function pool<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

function report() {
  const card = (r: Rec) =>
    r.error
      ? `<div class="cell err"><b>${r.name}</b><br>${r.error}</div>`
      : `<div class="cell"><img src="${r.name}.png"/><div class="meta"><b>${r.name}</b> · ${r.ms}ms · ~$${r.cost.toFixed(3)} · ct=${r.colorType}${r.colorType === 6 ? " alpha" : ""}</div><pre>${r.prompt}</pre></div>`;
  const html = `<!doctype html><meta charset="utf-8"><title>prompt lab — ${lab.target}</title>
  <style>body{font-family:system-ui;margin:24px;background:#15151a;color:#ddd}
  .grid{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start}
  .cell{background:repeating-conic-gradient(#2a2a30 0% 25%,#1d1d22 0% 50%) 50%/20px 20px;border:1px solid #333;border-radius:8px;padding:8px;width:300px}
  .cell img{width:100%;display:block;border-radius:4px}
  .meta{font-size:12px;margin-top:6px;background:#000;padding:4px 6px;border-radius:4px}
  pre{white-space:pre-wrap;font-size:10px;color:#9a9;background:#0c0c0f;padding:6px;border-radius:4px;margin-top:6px}
  .err{background:#3a1010;color:#f88}</style>
  <h1>Prompt strategies — ${lab.target} (${lab.model}, ${lab.size}, ${lab.quality})</h1>
  <div class="grid">${results.map(card).join("")}</div>`;
  writeFileSync(`${outDir}/report.html`, html);
}

async function main() {
  console.log(`prompt-lab [${lab.target}]: ${lab.strategies.length} strategies, ${lab.model} ${lab.size} ${lab.quality}, concurrency=${CONCURRENCY}\n`);
  const t0 = Date.now();
  await pool(lab.strategies, CONCURRENCY, async (s: any) => { results.push(await gen(s)); });
  results.sort((a, b) => a.name.localeCompare(b.name));
  report();
  const ok = results.filter((r) => !r.error);
  console.log(`\nwall: ${((Date.now() - t0) / 1000).toFixed(1)}s, generated ${ok.length}/${results.length}, ~$${ok.reduce((s, r) => s + r.cost, 0).toFixed(2)}`);
  console.log(`report: ${outDir}/report.html`);
}

main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
