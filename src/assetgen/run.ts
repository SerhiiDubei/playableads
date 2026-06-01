import "dotenv/config";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import OpenAI from "openai";
import { resolveAsset, type ResolvedAsset } from "./compose.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const CONCURRENCY = 3;
const RATE = 40; // $ per 1M output img-tokens (approx)

const briefPath = process.argv[2] ?? "styles/diablo2.brief.json";
const brief = JSON.parse(readFileSync(briefPath, "utf8"));
const outDir = `out/${brief.id}`;

type Rec = ResolvedAsset & { ms: number; tokens: number; cost: number; colorType: number | null; error?: string };
const results: Rec[] = [];

function colorType(buf: Buffer): number | null {
  if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  return buf[25];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// виклик із retry+backoff на 429 (rate-limit OpenAI: 5 img/min для gpt-image)
async function generateWithRetry(req: any, maxRetries = 4) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.images.generate(req);
    } catch (e: any) {
      const is429 = e?.status === 429 || /rate limit/i.test(e?.message ?? "");
      if (!is429 || attempt >= maxRetries) throw e;
      const m = /try again in (\d+(?:\.\d+)?)s/i.exec(e?.message ?? "");
      const waitMs = (m ? parseFloat(m[1]) : 13) * 1000 + 1500 * attempt;
      console.log(`    waiting ${(waitMs / 1000).toFixed(0)}s on 429 (attempt ${attempt + 1}/${maxRetries})`);
      await sleep(waitMs);
    }
  }
}

async function genOne(a: ResolvedAsset): Promise<Rec> {
  const t0 = Date.now();
  try {
    const req: any = { model: a.model, prompt: a.prompt, size: a.size, quality: a.quality, output_format: "png" };
    if (a.transparent) req.background = "transparent";
    const res = await generateWithRetry(req);
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image data");
    const buf = Buffer.from(b64, "base64");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(`${outDir}/${a.key}.png`, buf);
    const tokens = res.usage?.output_tokens ?? 0;
    const rec: Rec = { ...a, ms: Date.now() - t0, tokens, cost: (tokens / 1e6) * RATE, colorType: colorType(buf) };
    // sidecar: точна відтворюваність (промпт + версія брифа + параметри)
    writeFileSync(`${outDir}/${a.key}.json`, JSON.stringify({ briefId: brief.id, briefVersion: brief.version, ...rec }, null, 2));
    console.log(`  ✓ ${a.key}: ${rec.ms}ms ${tokens}tok ~$${rec.cost.toFixed(3)} ct=${rec.colorType}`);
    return rec;
  } catch (e: any) {
    console.log(`  ✗ ${a.key}: ${e?.message ?? e}`);
    return { ...a, ms: Date.now() - t0, tokens: 0, cost: 0, colorType: null, error: e?.message ?? String(e) };
  }
}

// паралельний пул із лімітом конкурентності
async function pool<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}

function report() {
  const card = (r: Rec) => {
    if (r.error) return `<div class="cell err"><b>${r.key}</b><br>${r.error}</div>`;
    return `<div class="cell"><img src="${r.key}.png"/><div class="meta"><b>${r.key}</b> · ${r.kind}<br>${r.ms}ms · ~$${r.cost.toFixed(3)} · ct=${r.colorType}${r.colorType === 6 ? " alpha" : ""}</div></div>`;
  };
  const html = `<!doctype html><meta charset="utf-8"><title>${brief.name} assets</title>
  <style>body{font-family:system-ui;margin:24px;background:#15151a;color:#ddd}
  .grid{display:flex;gap:14px;flex-wrap:wrap}
  .cell{background:repeating-conic-gradient(#2a2a30 0% 25%,#1d1d22 0% 50%) 50%/20px 20px;border:1px solid #333;border-radius:8px;padding:8px;width:240px}
  .cell img{width:100%;display:block;border-radius:4px}
  .meta{font-size:11px;margin-top:6px;background:#000;padding:4px 6px;border-radius:4px}
  .err{background:#3a1010;color:#f88}</style>
  <h1>${brief.name} <small>v${brief.version} · ${brief.derivedFrom}</small></h1>
  <div class="grid">${results.map(card).join("")}</div>`;
  writeFileSync(`${outDir}/report.html`, html);
  writeFileSync(`${outDir}/manifest.json`, JSON.stringify({ brief: { id: brief.id, version: brief.version }, results }, null, 2));
}

async function main() {
  const force = process.argv.includes("--force");
  const all: ResolvedAsset[] = brief.assets.map((a: any) => resolveAsset(brief, a));
  const resolved = force ? all : all.filter((a) => !existsSync(`${outDir}/${a.key}.png`));
  const skipped = all.length - resolved.length;
  console.log(`${brief.name} v${brief.version} — ${all.length} assets (${resolved.length} to gen, ${skipped} skipped existing), model=${all[0]?.model}, concurrency=${CONCURRENCY}\n`);
  // підтягнути вже наявні (skip) із sidecar-ів, щоб звіт був повним
  for (const a of all) {
    if (!resolved.includes(a) && existsSync(`${outDir}/${a.key}.json`)) {
      try { results.push(JSON.parse(readFileSync(`${outDir}/${a.key}.json`, "utf8"))); } catch {}
    }
  }
  const t0 = Date.now();
  await pool(resolved, CONCURRENCY, async (a) => { results.push(await genOne(a)); });
  results.sort((a, b) => a.key.localeCompare(b.key));
  report();
  const ok = results.filter((r) => !r.error);
  console.log(`\nwall time: ${((Date.now() - t0) / 1000).toFixed(1)}s (паралельно)`);
  console.log(`generated: ${ok.length}/${results.length}, ~$${ok.reduce((s, r) => s + r.cost, 0).toFixed(2)}`);
  console.log(`report: ${outDir}/report.html`);
}

main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
