import "dotenv/config";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import OpenAI from "openai";
import { resolveAsset, type ResolvedAsset } from "./compose.js";

const RATE = 40; // $ per 1M output img-tokens (approx)

export type GenRec = ResolvedAsset & { ms: number; tokens: number; cost: number; colorType: number | null; error?: string };

export type RunAssetGenOpts = {
  briefPath: string;
  force?: boolean;
  concurrency?: number;
  onLog?: (msg: string) => void;
};

export type RunAssetGenResult = {
  briefId: string;
  briefVersion: string;
  outDir: string;
  results: GenRec[];
  wallTimeMs: number;
  totalCost: number;
  generated: number;
  skipped: number;
  errors: number;
  reportPath: string;
  manifestPath: string;
};

function colorType(buf: Buffer): number | null {
  if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  return buf[25];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function generateWithRetry(client: OpenAI, req: any, log: (s: string) => void, maxRetries = 4): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.images.generate(req);
    } catch (e: any) {
      const is429 = e?.status === 429 || /rate limit/i.test(e?.message ?? "");
      if (!is429 || attempt >= maxRetries) throw e;
      const m = /try again in (\d+(?:\.\d+)?)s/i.exec(e?.message ?? "");
      const waitMs = (m ? parseFloat(m[1]) : 13) * 1000 + 1500 * attempt;
      log(`    waiting ${(waitMs / 1000).toFixed(0)}s on 429 (attempt ${attempt + 1}/${maxRetries})`);
      await sleep(waitMs);
    }
  }
}

async function genOne(client: OpenAI, a: ResolvedAsset, outDir: string, brief: any, log: (s: string) => void): Promise<GenRec> {
  const t0 = Date.now();
  try {
    const req: any = { model: a.model, prompt: a.prompt, size: a.size, quality: a.quality, output_format: "png" };
    if (a.transparent) req.background = "transparent";
    const res = await generateWithRetry(client, req, log);
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image data");
    const buf = Buffer.from(b64, "base64");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(`${outDir}/${a.key}.png`, buf);
    const tokens = res.usage?.output_tokens ?? 0;
    const rec: GenRec = { ...a, ms: Date.now() - t0, tokens, cost: (tokens / 1e6) * RATE, colorType: colorType(buf) };
    writeFileSync(`${outDir}/${a.key}.json`, JSON.stringify({ briefId: brief.id, briefVersion: brief.version, ...rec }, null, 2));
    log(`  ✓ ${a.key}: ${rec.ms}ms ${tokens}tok ~$${rec.cost.toFixed(3)} ct=${rec.colorType}`);
    return rec;
  } catch (e: any) {
    log(`  ✗ ${a.key}: ${e?.message ?? e}`);
    return { ...a, ms: Date.now() - t0, tokens: 0, cost: 0, colorType: null, error: e?.message ?? String(e) };
  }
}

async function pool<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}

function buildReportHtml(brief: any, results: GenRec[]): string {
  const card = (r: GenRec) => {
    if (r.error) return `<div class="cell err"><b>${r.key}</b><br>${r.error}</div>`;
    return `<div class="cell"><img src="${r.key}.png"/><div class="meta"><b>${r.key}</b> · ${r.kind}<br>${r.ms}ms · ~$${r.cost.toFixed(3)} · ct=${r.colorType}${r.colorType === 6 ? " alpha" : ""}</div></div>`;
  };
  return `<!doctype html><meta charset="utf-8"><title>${brief.name} assets</title>
  <style>body{font-family:system-ui;margin:24px;background:#15151a;color:#ddd}
  .grid{display:flex;gap:14px;flex-wrap:wrap}
  .cell{background:repeating-conic-gradient(#2a2a30 0% 25%,#1d1d22 0% 50%) 50%/20px 20px;border:1px solid #333;border-radius:8px;padding:8px;width:240px}
  .cell img{width:100%;display:block;border-radius:4px}
  .meta{font-size:11px;margin-top:6px;background:#000;padding:4px 6px;border-radius:4px}
  .err{background:#3a1010;color:#f88}</style>
  <h1>${brief.name} <small>v${brief.version} · ${brief.derivedFrom}</small></h1>
  <div class="grid">${results.map(card).join("")}</div>`;
}

export async function runAssetGen(opts: RunAssetGenOpts): Promise<RunAssetGenResult> {
  const log = opts.onLog ?? ((s: string) => console.log(s));
  const concurrency = opts.concurrency ?? 3;
  const force = opts.force ?? false;

  const brief = JSON.parse(readFileSync(opts.briefPath, "utf8"));
  const outDir = `out/${brief.id}`;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const all: ResolvedAsset[] = brief.assets.map((a: any) => resolveAsset(brief, a));
  const toGen = force ? all : all.filter((a) => !existsSync(`${outDir}/${a.key}.png`));
  const skipped = all.length - toGen.length;
  log(`${brief.name} v${brief.version} — ${all.length} assets (${toGen.length} to gen, ${skipped} skipped existing), model=${all[0]?.model}, concurrency=${concurrency}\n`);

  const results: GenRec[] = [];
  for (const a of all) {
    if (!toGen.includes(a) && existsSync(`${outDir}/${a.key}.json`)) {
      try { results.push(JSON.parse(readFileSync(`${outDir}/${a.key}.json`, "utf8"))); } catch { /* ignore */ }
    }
  }

  const t0 = Date.now();
  await pool(toGen, concurrency, async (a) => { results.push(await genOne(client, a, outDir, brief, log)); });
  const wallTimeMs = Date.now() - t0;

  results.sort((a, b) => a.key.localeCompare(b.key));

  mkdirSync(outDir, { recursive: true });
  const reportPath = `${outDir}/report.html`;
  const manifestPath = `${outDir}/manifest.json`;
  writeFileSync(reportPath, buildReportHtml(brief, results));
  writeFileSync(manifestPath, JSON.stringify({ brief: { id: brief.id, version: brief.version }, results }, null, 2));

  const ok = results.filter((r) => !r.error);
  const errors = results.length - ok.length;
  const totalCost = ok.reduce((s, r) => s + r.cost, 0);
  log(`\nwall time: ${(wallTimeMs / 1000).toFixed(1)}s (паралельно)`);
  log(`generated: ${ok.length}/${results.length}, ~$${totalCost.toFixed(2)}`);
  log(`report: ${reportPath}`);

  return {
    briefId: brief.id,
    briefVersion: brief.version,
    outDir,
    results,
    wallTimeMs,
    totalCost,
    generated: toGen.length - errors,
    skipped,
    errors,
    reportPath,
    manifestPath,
  };
}

async function cliMain() {
  const briefPath = process.argv[2] ?? "styles/diablo2.brief.json";
  const force = process.argv.includes("--force");
  await runAssetGen({ briefPath, force });
}

const invokedAsScript = process.argv[1]?.endsWith("run.ts") || process.argv[1]?.endsWith("run.js");
if (invokedAsScript) {
  cliMain().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
}
