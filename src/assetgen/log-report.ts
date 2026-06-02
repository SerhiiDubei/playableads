/**
 * HTML log report generator.
 *
 * Бере дані з двох джерел і збирає один HTML-файл з повною картиною запуску:
 *   1) Фаза 1 (AI генерація)  — читає `out/<style>/manifest.json` (його пише run.ts)
 *   2) Фаза 2 (HTML build)    — читає `events[]` із stage-log.ts (in-memory цієї сесії)
 *
 * Output: out/log-<style>-<timestamp>.html — самодостатній файл, відкриваєш у браузері.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { events, summary, type StageEvent } from "./stage-log.js";

type Phase1Result = {
  key: string;
  kind: string;
  prompt: string;
  size: string;
  quality: string;
  model: string;
  ms: number;
  tokens: number;
  cost: number;
  colorType: number | null;
  error?: string;
};

type Phase1Manifest = {
  brief: { id: string; version: string };
  results: Phase1Result[];
};

const C = {
  bg: "#0e1116",
  panel: "#161b22",
  panel2: "#1f2630",
  border: "#30363d",
  text: "#d1d5db",
  textMute: "#8b949e",
  textBright: "#ffffff",
  ok: "#3fb950",
  warn: "#e3b341",
  err: "#f85149",
  blue: "#58a6ff",
  purple: "#d2a8ff",
  cyan: "#79c0ff",
  green: "#56d364",
};

const phaseColor: Record<string, string> = {
  gen: C.purple,
  build: C.blue,
  validate: C.warn,
  write: C.green,
  summary: C.textBright,
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!)
  );
}

function loadPhase1(styleId: string): Phase1Manifest | null {
  const path = `out/${styleId}/manifest.json`;
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function styles(): string {
  return `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;background:${C.bg};color:${C.text};padding:24px;max-width:1280px;margin:0 auto;line-height:1.5}
    h1{color:${C.textBright};font-size:26px;margin-bottom:4px}
    h1 .sub{color:${C.textMute};font-size:13px;font-weight:400}
    h2{color:${C.textBright};font-size:18px;margin:28px 0 12px;padding-bottom:6px;border-bottom:1px solid ${C.border}}
    h2 .hint{color:${C.textMute};font-size:12px;font-weight:400;margin-left:8px}
    .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:18px 0 4px}
    .card{background:${C.panel2};padding:14px 18px;border-radius:10px;border:1px solid ${C.border}}
    .card .label{font-size:11px;color:${C.textMute};text-transform:uppercase;letter-spacing:0.6px;margin-bottom:4px}
    .card .value{font-size:24px;font-weight:600;color:${C.textBright}}
    .card .value.ok{color:${C.ok}}
    .card .value.err{color:${C.err}}
    .card .sub{font-size:11px;color:${C.textMute};margin-top:2px}
    table{width:100%;border-collapse:collapse;background:${C.panel};border-radius:8px;overflow:hidden;font-size:13px}
    th,td{padding:9px 12px;text-align:left;border-bottom:1px solid ${C.border};vertical-align:top}
    tr:last-child td{border-bottom:none}
    th{background:${C.panel2};color:${C.textMute};text-transform:uppercase;font-size:10px;letter-spacing:0.6px;font-weight:600}
    td.num{text-align:right;font-variant-numeric:tabular-nums;color:${C.textBright}}
    td.k{color:${C.cyan};font-family:Consolas,Menlo,monospace;font-size:12px;white-space:nowrap}
    td.tag{color:${C.textMute};font-size:11px}
    .preview{width:64px;height:64px;object-fit:contain;background:repeating-conic-gradient(#2a2a30 0% 25%,#1d1d22 0% 50%) 50%/14px 14px;border-radius:4px;border:1px solid ${C.border};display:block}
    details{font-size:11px}
    details summary{cursor:pointer;color:${C.textMute}}
    details code{display:block;margin-top:4px;padding:6px 8px;background:${C.bg};border:1px solid ${C.border};border-radius:4px;color:${C.textMute};font-family:Consolas,Menlo,monospace;font-size:11px;white-space:pre-wrap;word-break:break-word;max-height:140px;overflow:auto}
    .gantt{background:${C.panel};padding:14px 16px;border-radius:8px;border:1px solid ${C.border}}
    .gantt .row{display:grid;grid-template-columns:280px 1fr 90px;align-items:center;gap:10px;font-size:12px;padding:3px 0}
    .gantt .name{color:${C.text};font-family:Consolas,Menlo,monospace}
    .gantt .name .ph{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;vertical-align:middle}
    .gantt .bar-wrap{position:relative;height:14px;background:${C.bg};border-radius:3px;overflow:hidden;border:1px solid ${C.border}}
    .gantt .bar{position:absolute;top:0;bottom:0;border-radius:3px;opacity:0.85}
    .gantt .dur{text-align:right;color:${C.textMute};font-variant-numeric:tabular-nums}
    .legend{font-size:11px;color:${C.textMute};margin-top:10px}
    .legend span{display:inline-block;margin-right:14px}
    .legend i{display:inline-block;width:10px;height:10px;border-radius:2px;vertical-align:middle;margin-right:4px}
    .pass{color:${C.ok};font-weight:600}
    .fail{color:${C.err};font-weight:600}
    .note{font-size:12px;color:${C.textMute};margin-top:6px}
    a{color:${C.blue};text-decoration:none}
    a:hover{text-decoration:underline}
    .rate-limit-row{color:${C.warn}}
    .footer{margin-top:32px;padding-top:14px;border-top:1px solid ${C.border};color:${C.textMute};font-size:11px;text-align:center}
  `;
}

function ms(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${n}ms`;
}

function summaryCards(p1: Phase1Manifest | null, p2Events: StageEvent[], outPath: string, validateOk: boolean, finalBytes: number): string {
  const p1Total = p1?.results.reduce((s, r) => s + (r.ms ?? 0), 0) ?? 0;
  const p1Cost = p1?.results.reduce((s, r) => s + (r.cost ?? 0), 0) ?? 0;
  const p1Tokens = p1?.results.reduce((s, r) => s + (r.tokens ?? 0), 0) ?? 0;
  const p1Errors = p1?.results.filter((r) => r.error).length ?? 0;
  const p2Total = p2Events.length ? p2Events[p2Events.length - 1].elapsedMs : 0;
  const cards = [
    { label: "Phase 1 wall time", value: p1 ? ms(p1Total) : "—", sub: p1 ? `${p1.results.length} assets · concurrency=3` : "no manifest" },
    { label: "Phase 1 cost", value: p1 ? `$${p1Cost.toFixed(3)}` : "—", sub: p1 ? `${p1Tokens.toLocaleString()} tokens` : "" },
    { label: "Phase 2 wall time", value: ms(p2Total), sub: `${p2Events.length} stages logged` },
    { label: "Output size", value: `${(finalBytes / 1024).toFixed(1)} KB`, sub: `/ 2048 KB Meta limit` },
    { label: "Validation", value: validateOk ? "PASS" : "FAIL", valueClass: validateOk ? "ok" : "err", sub: outPath },
    { label: "Errors", value: String(p1Errors), valueClass: p1Errors ? "err" : "ok", sub: "Phase 1 failures" },
  ];
  return `<div class="cards">${cards
    .map((c) => `<div class="card"><div class="label">${escapeHtml(c.label)}</div><div class="value ${c.valueClass ?? ""}">${escapeHtml(c.value)}</div>${c.sub ? `<div class="sub">${escapeHtml(c.sub)}</div>` : ""}</div>`)
    .join("")}</div>`;
}

function phase1Section(p1: Phase1Manifest | null, styleId: string): string {
  if (!p1) return `<h2>Phase 1 · AI generation <span class="hint">(no manifest found at out/${escapeHtml(styleId)}/manifest.json)</span></h2>`;
  const totalMs = p1.results.reduce((s, r) => s + (r.ms ?? 0), 0);
  const rows = p1.results
    .slice()
    .sort((a, b) => b.ms - a.ms)
    .map((r) => {
      const imgPath = `${styleId}/${r.key}.png`;
      const previewExists = existsSync(`out/${imgPath}`);
      const cell = previewExists
        ? `<img class="preview" src="../${imgPath}" alt="${escapeHtml(r.key)}">`
        : `<div class="preview" title="not found"></div>`;
      const err = r.error
        ? `<span class="fail">${escapeHtml(r.error)}</span>`
        : `<span class="pass">ok</span>`;
      return `<tr>
        <td>${cell}</td>
        <td class="k">${escapeHtml(r.key)}</td>
        <td class="tag">${escapeHtml(r.kind)}</td>
        <td class="tag">${escapeHtml(r.size)} · ${escapeHtml(r.quality)}</td>
        <td class="num">${ms(r.ms)}</td>
        <td class="num">${(r.tokens ?? 0).toLocaleString()}</td>
        <td class="num">$${(r.cost ?? 0).toFixed(3)}</td>
        <td>${err}</td>
        <td><details><summary>view</summary><code>${escapeHtml(r.prompt)}</code></details></td>
      </tr>`;
    })
    .join("");
  return `
    <h2>Phase 1 · AI generation <span class="hint">${escapeHtml(p1.brief.id)} v${escapeHtml(p1.brief.version)} · sorted by duration desc</span></h2>
    <table>
      <thead><tr><th></th><th>key</th><th>kind</th><th>size · quality</th><th>time</th><th>tokens</th><th>cost</th><th>status</th><th>prompt</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="note">Σ time (sum) ${ms(totalMs)} — wall time is lower because pool runs 3 in parallel; 429-retry pauses are counted in per-asset time when sleep happens during it.</div>
  `;
}

function gantt(p2Events: StageEvent[]): string {
  const max = p2Events.reduce((m, e) => Math.max(m, e.elapsedMs), 0) || 1;
  const rows = p2Events
    .map((e) => {
      const dur = e.durationMs ?? 0;
      const start = Math.max(0, e.elapsedMs - dur);
      const startPct = (start / max) * 100;
      const widthPct = Math.max(0.5, (dur / max) * 100);
      const color = phaseColor[e.phase] ?? C.text;
      return `<div class="row">
        <div class="name"><span class="ph" style="background:${color}"></span>${escapeHtml(e.phase)}/${escapeHtml(e.stage)}</div>
        <div class="bar-wrap"><div class="bar" style="left:${startPct.toFixed(2)}%;width:${widthPct.toFixed(2)}%;background:${color}"></div></div>
        <div class="dur">${dur ? ms(dur) : "·"}</div>
      </div>`;
    })
    .join("");
  const legend = Object.entries(phaseColor)
    .map(([k, v]) => `<span><i style="background:${v}"></i>${k}</span>`)
    .join("");
  return `
    <h2>Phase 2 · HTML build timeline <span class="hint">${p2Events.length} events, in execution order</span></h2>
    <div class="gantt">${rows}</div>
    <div class="legend">${legend}</div>
  `;
}

function phase2Table(p2Events: StageEvent[]): string {
  const rows = p2Events
    .map((e) => `<tr>
      <td class="num">${ms(e.elapsedMs)}</td>
      <td class="tag" style="color:${phaseColor[e.phase] ?? C.text}">${escapeHtml(e.phase)}</td>
      <td class="k">${escapeHtml(e.stage)}</td>
      <td class="num">${e.durationMs != null ? ms(e.durationMs) : "·"}</td>
      <td class="num">${e.bytes != null ? `${(e.bytes / 1024).toFixed(1)} KB` : "·"}</td>
      <td class="tag">${e.note ? escapeHtml(e.note) : ""}</td>
    </tr>`)
    .join("");
  return `
    <h2>Phase 2 · raw event log</h2>
    <table>
      <thead><tr><th>t+</th><th>phase</th><th>stage</th><th>duration</th><th>bytes</th><th>note</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

export type LogReportOpts = {
  styleId: string;
  outPath: string;        // де зберігати HTML-репорт
  playablePath: string;   // шлях до згенерованого playable HTML
  validateOk: boolean;
  finalBytes: number;
};

export function writeHtmlReport(opts: LogReportOpts): string {
  const p1 = loadPhase1(opts.styleId);
  const p2Events = events.slice();
  const s = summary();
  const generated = new Date().toISOString();
  const playableRel = opts.playablePath.replace(/\\/g, "/").split("/").pop() ?? opts.playablePath;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Build log · ${escapeHtml(opts.styleId)}</title>
<style>${styles()}</style></head>
<body>
  <h1>Build log · ${escapeHtml(opts.styleId)} <span class="sub">${escapeHtml(generated)}</span></h1>
  <div class="note">Playable: <a href="${escapeHtml(playableRel)}">${escapeHtml(playableRel)}</a> · Asset gallery: <a href="${escapeHtml(opts.styleId)}/report.html">${escapeHtml(opts.styleId)}/report.html</a></div>
  ${summaryCards(p1, p2Events, opts.playablePath, opts.validateOk, opts.finalBytes)}
  ${phase1Section(p1, opts.styleId)}
  ${gantt(p2Events)}
  ${phase2Table(p2Events)}
  <div class="footer">stage-log.ts · ${p2Events.length} events captured · total wall ${ms(s.totalMs)} · per-phase ${Object.entries(s.byPhase).map(([k, v]) => `${k}=${ms(v)}`).join(" ")}</div>
</body></html>`;
  writeFileSync(opts.outPath, html, "utf8");
  return opts.outPath;
}
