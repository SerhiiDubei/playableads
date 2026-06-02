/**
 * Asset catalog scanner.
 *
 * Reads all out/<style>/manifest.json + sidecars і будує єдиний HTML-каталог
 * усіх згенерованих ассетів. Це інструмент «що я насправді маю», без якого
 * через місяць не пам'ятатимеш які стилі і скільки що коштувало.
 *
 * Usage:
 *   npm run catalog              -> out/catalog.html (відкривається у браузері)
 *   npx tsx src/assetgen/catalog.ts
 */

import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";

export type CatalogAsset = {
  key: string;
  kind: string;
  style: string;
  pngPath: string;
  webpPath?: string;
  bytes: number;
  ms?: number;
  tokens?: number;
  cost?: number;
  size?: string;
  quality?: string;
  prompt?: string;
  briefVersion?: string;
  error?: string;
};

export type CatalogStyle = {
  id: string;
  briefVersion?: string;
  briefName?: string;
  totalAssets: number;
  totalCost: number;
  totalMs: number;
  totalBytes: number;
  assets: CatalogAsset[];
};

const OUT = "out";

function listStyleDirs(): string[] {
  if (!existsSync(OUT)) return [];
  return readdirSync(OUT)
    .map((name) => join(OUT, name))
    .filter((p) => {
      try { return statSync(p).isDirectory(); } catch { return false; }
    })
    .map((p) => basename(p));
}

function scanStyle(styleId: string): CatalogStyle | null {
  const dir = join(OUT, styleId);
  const manifestPath = join(dir, "manifest.json");
  let manifest: any = null;
  if (existsSync(manifestPath)) {
    try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); } catch { /* ignore */ }
  }

  const assets: CatalogAsset[] = [];
  const entries = readdirSync(dir);
  const pngs = entries.filter((f) => f.endsWith(".png") && !f.startsWith("_"));

  for (const png of pngs) {
    const key = png.replace(/\.png$/, "");
    const pngPath = join(dir, png);
    let bytes = 0;
    try { bytes = statSync(pngPath).size; } catch { /* ignore */ }
    const sidecarPath = join(dir, `${key}.json`);
    let sidecar: any = null;
    if (existsSync(sidecarPath)) {
      try { sidecar = JSON.parse(readFileSync(sidecarPath, "utf8")); } catch { /* ignore */ }
    }
    const webpCandidate = join(dir, `${key}.webp`);
    assets.push({
      key,
      kind: sidecar?.kind ?? "unknown",
      style: styleId,
      pngPath: pngPath.replace(/\\/g, "/"),
      webpPath: existsSync(webpCandidate) ? webpCandidate.replace(/\\/g, "/") : undefined,
      bytes,
      ms: sidecar?.ms,
      tokens: sidecar?.tokens,
      cost: sidecar?.cost,
      size: sidecar?.size,
      quality: sidecar?.quality,
      prompt: sidecar?.prompt,
      briefVersion: sidecar?.briefVersion,
      error: sidecar?.error,
    });
  }
  // sprite-derived стилі (наприклад cyber-heist-sprite) можуть не мати самостійних png-ассетів,
  // тоді все одно повертаємо style-картку але порожню
  if (assets.length === 0 && !manifest) return null;

  return {
    id: styleId,
    briefVersion: manifest?.brief?.version,
    briefName: manifest?.brief?.id ?? styleId,
    totalAssets: assets.length,
    totalCost: assets.reduce((s, a) => s + (a.cost ?? 0), 0),
    totalMs: assets.reduce((s, a) => s + (a.ms ?? 0), 0),
    totalBytes: assets.reduce((s, a) => s + a.bytes, 0),
    assets: assets.sort((a, b) => a.key.localeCompare(b.key)),
  };
}

export function scanCatalog(): CatalogStyle[] {
  return listStyleDirs()
    .map(scanStyle)
    .filter((s): s is CatalogStyle => s != null)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function kb(n: number): string {
  return n >= 1024 ? `${(n / 1024).toFixed(1)}KB` : `${n}B`;
}

function styleColor(kind: string): string {
  return ({ icon: "#79c0ff", button: "#d2a8ff", background: "#3fb950", sprite: "#e3b341", logo: "#ff7b72" } as Record<string, string>)[kind] ?? "#8b949e";
}

export function buildCatalogHtml(styles: CatalogStyle[]): string {
  const totalCost = styles.reduce((s, st) => s + st.totalCost, 0);
  const totalAssets = styles.reduce((s, st) => s + st.totalAssets, 0);
  const totalMs = styles.reduce((s, st) => s + st.totalMs, 0);

  const summary = `
    <div class="cards">
      <div class="card"><div class="label">Styles</div><div class="value">${styles.length}</div></div>
      <div class="card"><div class="label">Total assets</div><div class="value">${totalAssets}</div></div>
      <div class="card"><div class="label">Total spent</div><div class="value">$${totalCost.toFixed(2)}</div></div>
      <div class="card"><div class="label">Total gen time</div><div class="value">${(totalMs / 60000).toFixed(1)}m</div></div>
    </div>`;

  const styleSections = styles
    .map((st) => {
      const grid = st.assets
        .map((a) => {
          const promptHtml = a.prompt ? `<details><summary>prompt</summary><code>${esc(a.prompt)}</code></details>` : "";
          const errHtml = a.error ? `<div class="err">${esc(a.error)}</div>` : "";
          const reusePath = a.pngPath.replace(/^out\//, "");
          return `<div class="asset">
            <div class="thumb-wrap"><img class="thumb" src="${esc(reusePath)}" alt="${esc(a.key)}"></div>
            <div class="key" style="color:${styleColor(a.kind)}">${esc(a.key)}</div>
            <div class="meta">${esc(a.kind)} · ${esc(a.size ?? "?")} · ${esc(a.quality ?? "?")}</div>
            <div class="meta">${kb(a.bytes)}${a.cost != null ? ` · $${a.cost.toFixed(3)}` : ""}${a.ms != null ? ` · ${a.ms}ms` : ""}</div>
            <div class="path">out/${esc(reusePath)}</div>
            ${promptHtml}
            ${errHtml}
          </div>`;
        })
        .join("");
      return `<section class="style">
        <h2>${esc(st.id)}${st.briefVersion ? ` <small>v${esc(st.briefVersion)}</small>` : ""}
          <span class="totals">${st.totalAssets} assets · $${st.totalCost.toFixed(3)} · ${kb(st.totalBytes)} · ${(st.totalMs / 1000).toFixed(1)}s</span></h2>
        <div class="grid">${grid}</div>
        <div class="links">
          <a href="${esc(st.id)}/report.html">asset gallery</a> ·
          ${existsSync(`out/menu-${st.id}.html`) ? `<a href="menu-${esc(st.id)}.html">playable</a> · ` : ""}
          ${existsSync(`out/log-${st.id}.html`) ? `<a href="log-${esc(st.id)}.html">build log</a>` : ""}
        </div>
      </section>`;
    })
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Asset catalog</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,system-ui,sans-serif;background:#0e1116;color:#d1d5db;padding:24px;max-width:1400px;margin:0 auto;line-height:1.5}
h1{color:#fff;font-size:28px;margin-bottom:6px}
h1 .sub{color:#8b949e;font-size:13px;font-weight:400}
h2{color:#fff;font-size:18px;margin:18px 0 12px;padding:6px 0;border-bottom:1px solid #30363d}
h2 small{color:#8b949e;font-weight:400;font-size:12px}
h2 .totals{float:right;color:#8b949e;font-size:12px;font-weight:400}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:18px 0}
.card{background:#1f2630;padding:14px 18px;border-radius:10px;border:1px solid #30363d}
.card .label{font-size:11px;color:#8b949e;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:4px}
.card .value{font-size:22px;font-weight:600;color:#fff}
.style{margin-bottom:34px}
.links{margin-top:10px;font-size:13px}
.links a{color:#58a6ff;text-decoration:none;margin-right:4px}
.links a:hover{text-decoration:underline}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}
.asset{background:#161b22;padding:10px;border-radius:8px;border:1px solid #30363d;display:flex;flex-direction:column}
.thumb-wrap{background:repeating-conic-gradient(#2a2a30 0% 25%,#1d1d22 0% 50%) 50%/16px 16px;border-radius:6px;padding:6px;margin-bottom:8px;text-align:center;height:140px;display:flex;align-items:center;justify-content:center}
.thumb{max-width:100%;max-height:120px;display:block;object-fit:contain}
.key{font-family:Consolas,Menlo,monospace;font-size:13px;font-weight:600;margin-bottom:2px}
.meta{color:#8b949e;font-size:11px}
.path{color:#666;font-size:10px;font-family:Consolas,Menlo,monospace;margin-top:4px;word-break:break-all}
details{margin-top:6px;font-size:11px}
summary{cursor:pointer;color:#8b949e}
details code{display:block;margin-top:4px;padding:6px;background:#0e1116;border:1px solid #30363d;border-radius:4px;color:#8b949e;font-size:10px;white-space:pre-wrap;word-break:break-word;max-height:120px;overflow:auto}
.err{margin-top:6px;color:#f85149;background:#3a1010;padding:4px 6px;border-radius:4px;font-size:11px}
</style></head><body>
<h1>Asset catalog <span class="sub">${new Date().toISOString()}</span></h1>
<div class="sub" style="color:#8b949e;font-size:12px">Усе що накопичено в <code>out/</code>. Кожен ассет можна повторно використати у будь-якому стилі через копіювання шляху.</div>
${summary}
${styleSections}
</body></html>`;
}

export function writeCatalogHtml(outPath = "out/catalog.html"): { path: string; styles: number; assets: number; cost: number } {
  const styles = scanCatalog();
  const html = buildCatalogHtml(styles);
  writeFileSync(outPath, html);
  return {
    path: outPath,
    styles: styles.length,
    assets: styles.reduce((s, st) => s + st.totalAssets, 0),
    cost: styles.reduce((s, st) => s + st.totalCost, 0),
  };
}

async function cliMain() {
  const r = writeCatalogHtml();
  console.log(`catalog: ${r.styles} styles, ${r.assets} assets, $${r.cost.toFixed(2)} total spend`);
  console.log(`-> ${r.path}`);
}

const invokedAsScript = process.argv[1]?.endsWith("catalog.ts") || process.argv[1]?.endsWith("catalog.js");
if (invokedAsScript) {
  cliMain().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
}
