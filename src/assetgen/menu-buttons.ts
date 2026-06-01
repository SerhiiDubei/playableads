import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- config ----------------------------------------------------------------
const LABELS = ["PLAY", "SHOP", "SETTINGS"];
const STYLE =
  "casual mobile game main-menu button, glossy rounded rectangle, blue gradient, " +
  "bold white uppercase text, thick clean cartoon outline, mobile UI";
const NEG = "no white outline halo, no sticker border, no padding, no extra background";

type Caps = { transparent: boolean; rate: number }; // rate = $ per 1M output img-tokens
const MODELS: Record<string, Caps> = {
  "gpt-image-1": { transparent: true, rate: 40 },
  "gpt-image-1.5": { transparent: true, rate: 40 },
  "gpt-image-2": { transparent: false, rate: 40 },
};

// --- types -----------------------------------------------------------------
type Variant = {
  model: string;
  mode: "sheet" | "individual";
  label: string; // "ALL" for sheet
  path: string;
  ms: number;
  tokens: number;
  costUsd: number;
  transparent: boolean;
  colorType: number | null;
  error?: string;
};

const results: Variant[] = [];

function pngColorType(buf: Buffer): number | null {
  if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  return buf[25]; // 6 = RGBA, 2 = RGB
}

async function generate(opts: {
  model: string;
  prompt: string;
  size: "1024x1024" | "1024x1536" | "1536x1024";
  transparent: boolean;
  outPath: string;
}) {
  const t0 = Date.now();
  const req: any = {
    model: opts.model,
    prompt: opts.prompt,
    size: opts.size,
    output_format: "png",
    quality: "medium",
  };
  if (opts.transparent) req.background = "transparent";

  const res = await client.images.generate(req);
  const ms = Date.now() - t0;
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("no image data");
  const buf = Buffer.from(b64, "base64");
  mkdirSync(opts.outPath.substring(0, opts.outPath.lastIndexOf("/")), { recursive: true });
  writeFileSync(opts.outPath, buf);
  const tokens = res.usage?.output_tokens ?? 0;
  return { ms, tokens, colorType: pngColorType(buf), buf };
}

async function runModel(model: string, caps: Caps) {
  console.log(`\n=== ${model} (transparent=${caps.transparent}) ===`);

  // Mode A: sheet (all buttons in one image)
  {
    const path = `out/menu-buttons/${model}/sheet.png`;
    const prompt =
      `Three ${STYLE}, stacked vertically and evenly spaced, ` +
      `top button text "PLAY", middle button text "SHOP", bottom button text "SETTINGS", ` +
      `all identical style and width, centered. ${NEG}`;
    try {
      const r = await generate({ model, prompt, size: "1024x1536", transparent: caps.transparent, outPath: path });
      const cost = (r.tokens / 1e6) * caps.rate;
      results.push({ model, mode: "sheet", label: "ALL", path, ms: r.ms, tokens: r.tokens, costUsd: cost, transparent: caps.transparent, colorType: r.colorType });
      console.log(`  sheet: ${r.ms}ms ${r.tokens}tok ~$${cost.toFixed(3)} colortype=${r.colorType}`);
    } catch (e: any) {
      results.push({ model, mode: "sheet", label: "ALL", path, ms: 0, tokens: 0, costUsd: 0, transparent: caps.transparent, colorType: null, error: e?.message ?? String(e) });
      console.log(`  sheet: FAILED ${e?.message ?? e}`);
    }
  }

  // Mode B: individual buttons
  for (const label of LABELS) {
    const path = `out/menu-buttons/${model}/individual/${label.toLowerCase()}.png`;
    const prompt = `A single ${STYLE}, button text reading exactly "${label}", centered. ${NEG}`;
    try {
      const r = await generate({ model, prompt, size: "1024x1024", transparent: caps.transparent, outPath: path });
      const cost = (r.tokens / 1e6) * caps.rate;
      results.push({ model, mode: "individual", label, path, ms: r.ms, tokens: r.tokens, costUsd: cost, transparent: caps.transparent, colorType: r.colorType });
      console.log(`  ${label}: ${r.ms}ms ${r.tokens}tok ~$${cost.toFixed(3)} colortype=${r.colorType}`);
    } catch (e: any) {
      results.push({ model, mode: "individual", label, path, ms: 0, tokens: 0, costUsd: 0, transparent: caps.transparent, colorType: null, error: e?.message ?? String(e) });
      console.log(`  ${label}: FAILED ${e?.message ?? e}`);
    }
  }
}

function writeReport() {
  const byModel = Object.keys(MODELS);
  const card = (v: Variant) => {
    if (v.error) return `<div class="cell err"><b>${v.label}</b><br><span>${v.error}</span></div>`;
    const rel = v.path.replace("out/menu-buttons/", "");
    return `<div class="cell"><img src="${rel}" /><div class="meta"><b>${v.label}</b> · ${v.ms}ms · ~$${v.costUsd.toFixed(3)} · ct=${v.colorType}${v.colorType === 6 ? " (alpha)" : ""}</div></div>`;
  };
  const section = (model: string) => {
    const sheet = results.find((r) => r.model === model && r.mode === "sheet");
    const indiv = results.filter((r) => r.model === model && r.mode === "individual");
    return `<h2>${model}</h2>
      <div class="row"><div class="col"><h3>A · sheet (комплексно)</h3><div class="grid">${sheet ? card(sheet) : ""}</div></div>
      <div class="col"><h3>B · individual (по одній)</h3><div class="grid">${indiv.map(card).join("")}</div></div></div>`;
  };
  const html = `<!doctype html><meta charset="utf-8"><title>Menu buttons bench</title>
  <style>
    body{font-family:system-ui;margin:24px;background:#f4f4f6}
    h2{margin-top:40px}
    .row{display:flex;gap:40px;flex-wrap:wrap}
    .col{flex:1;min-width:320px}
    .grid{display:flex;gap:12px;flex-wrap:wrap}
    .cell{background:repeating-conic-gradient(#ddd 0% 25%,#fff 0% 50%) 50%/20px 20px;border:1px solid #ccc;border-radius:8px;padding:8px;width:200px}
    .cell img{width:100%;display:block;border-radius:4px}
    .meta{font-size:11px;margin-top:6px;color:#333;background:#fff;padding:3px 5px;border-radius:4px}
    .err{background:#fee;color:#900;font-size:12px}
  </style>
  <h1>Main menu buttons — model & mode comparison</h1>
  <p>Checkerboard = прозорий фон. ct=6 → RGBA (alpha), ct=2 → RGB (без alpha).</p>
  ${byModel.map(section).join("")}`;
  writeFileSync("out/menu-buttons/report.html", html);
  writeFileSync("out/menu-buttons/manifest.json", JSON.stringify(results, null, 2));
}

async function main() {
  for (const [model, caps] of Object.entries(MODELS)) {
    await runModel(model, caps);
  }
  writeReport();
  const ok = results.filter((r) => !r.error);
  const total = ok.reduce((s, r) => s + r.costUsd, 0);
  console.log(`\n--- summary ---`);
  console.log(`generated: ${ok.length}/${results.length}, est total cost ~$${total.toFixed(2)}`);
  console.log(`report: out/menu-buttons/report.html`);
  console.log(`manifest: out/menu-buttons/manifest.json`);
}

main().catch((e) => {
  console.error("FATAL:", e?.message ?? e);
  process.exit(1);
});
