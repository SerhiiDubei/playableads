// Live progress dashboard GENERATOR. Reads the real source of truth — the
// status tables in docs/ROADMAP.md + docs/audit-2026-06-02/backlog.md — computes
// per-epic progress, and renders docs/dashboard.html. Re-run to refresh:
//
//   npm run dashboard
//
// Because it's generated from the backlogs, the bars can never lie: change a
// status from `todo` to `done` in the backlog, regenerate, watch the bar move.

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

type Status = "done" | "wip" | "review" | "blocked" | "deferred" | "todo";
interface Item {
  id: string;
  title: string;
  epic: string;
  status: Status;
}

const ROADMAP = "docs/ROADMAP.md";
const BACKLOG = "docs/audit-2026-06-02/backlog.md";
const OUT = "docs/dashboard.html";

const STATUS_ORDER: Status[] = ["done", "wip", "review", "blocked", "deferred", "todo"];

function detectStatus(cell: string): Status {
  const s = cell.toLowerCase();
  for (const kw of STATUS_ORDER) if (s.includes(kw)) return kw;
  return "todo";
}

// Map an item ID to its epic bucket.
function epicOf(id: string): string | null {
  if (/^Z-/.test(id)) return "Z · Зони/шаблони";
  if (/^M-/.test(id)) return "M · Модульність";
  if (/^I-/.test(id)) return "I · Інфраструктура";
  if (/^S-/.test(id)) return "S · Структура";
  if (/^T-/.test(id)) return "T · Стандарт шаблонів";
  if (/^P\d-/.test(id)) return "Pipeline";
  return null;
}

function parseTables(md: string): Item[] {
  const items: Item[] = [];
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("|") || /^\|[\s|:-]+\|?$/.test(line)) continue; // skip non-rows + separators
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 3) continue;
    let id = cells[0].replace(/[*`]/g, "").trim();
    const last = cells[cells.length - 1];
    if (/ID/i.test(id) || id === "----") continue; // header

    // checkpoint rows: id cell is "—", title carries CHECKPOINT
    const cpCell = cells.find((c) => /CHECKPOINT/i.test(c));
    if (cpCell) {
      const m = cpCell.match(/CHECKPOINT\s+([A-F])/i);
      id = m ? `CHK-${m[1].toUpperCase()}` : "CHK";
      items.push({ id, title: cpCell.replace(/[🛑*`]/g, "").trim(), epic: "Pipeline", status: detectStatus(last) });
      continue;
    }

    const epic = epicOf(id);
    if (!epic) continue;
    const title = (cells[2] && /^\d$/.test(cells[1]) ? cells[2] : cells[1]).replace(/[*`]/g, "").trim();
    items.push({ id, title, epic, status: detectStatus(last) });
  }
  return items;
}

// Last N commits via execFile (no shell → no injection; args are fixed).
function recentCommits(n: number): string[] {
  try {
    return execFileSync("git", ["log", "--oneline", `-${n}`], { encoding: "utf8" }).trim().split("\n");
  } catch {
    return [];
  }
}

// ── render ──────────────────────────────────────────────────────────────────
const PILL: Record<Status, string> = {
  done: "ok", wip: "wip", review: "wip", blocked: "block", deferred: "dim", todo: "todo",
};

function bar(done: number, total: number): string {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return `<div class="bar"><div class="fill" style="width:${pct}%"></div></div><div class="pctline"><span>${done}/${total}</span><span>${pct}%</span></div>`;
}

function render(items: Item[]): string {
  const epics = [...new Set(items.map((i) => i.epic))];
  const counted = items.filter((i) => i.status !== "deferred");
  const overallDone = counted.filter((i) => i.status === "done").length;
  const overallPct = counted.length ? Math.round((overallDone / counted.length) * 100) : 0;

  const epicBlocks = epics.map((ep) => {
    const list = items.filter((i) => i.epic === ep);
    const eff = list.filter((i) => i.status !== "deferred");
    const done = eff.filter((i) => i.status === "done").length;
    const rows = list
      .slice()
      .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.id.localeCompare(b.id))
      .map(
        (i) =>
          `<div class="row"><span class="dot ${PILL[i.status]}"></span><span class="rid">${i.id}</span><span class="rt">${i.title}</span><span class="pill ${PILL[i.status]}">${i.status}</span></div>`,
      )
      .join("");
    return `<div class="card"><h3>${ep}</h3>${bar(done, eff.length)}<div class="rows">${rows}</div></div>`;
  });

  const wip = items.filter((i) => i.status === "wip" || i.status === "review");
  const wipBlock = wip.length
    ? `<div class="card hot"><h3>🔥 Зараз у роботі</h3>${wip
        .map((i) => `<div class="row"><span class="rid">${i.id}</span><span class="rt">${i.title}</span><span class="pill ${PILL[i.status]}">${i.status}</span></div>`)
        .join("")}</div>`
    : "";

  const commits = recentCommits(10)
    .map((c) => `<div class="commit">${c.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</div>`)
    .join("");

  const counts = STATUS_ORDER.map((s) => ({ s, n: items.filter((i) => i.status === s).length })).filter((x) => x.n);

  return `<!doctype html><html lang="uk"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>playable-forge — прогрес</title>
<style>
  :root{--bg:#0c0e13;--panel:#161922;--p2:#1e222d;--line:#2a2f3c;--txt:#e8eaed;--dim:#9aa1ad;
    --ok:#3fb950;--wip:#d29922;--block:#f85149;--accent:#7aa2ff;--gold:#ffce6b;color-scheme:dark}
  *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{background:var(--bg);color:var(--txt);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    line-height:1.45;padding:0 0 48px;-webkit-text-size-adjust:100%}
  .wrap{max-width:760px;margin:0 auto;padding:22px 16px}
  h1{font-size:24px}h1 .f{color:var(--gold)}
  .sub{color:var(--dim);font-size:13px;margin-top:4px}
  code{background:#000a;border:1px solid var(--line);border-radius:5px;padding:1px 5px;font-size:12px;color:#cdd3df}
  .overall{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px;margin:16px 0}
  .overall .big{font-size:40px;font-weight:800;color:var(--gold);line-height:1}
  .overall .lbl{color:var(--dim);font-size:13px;margin-bottom:10px}
  .bar{height:12px;background:#000a;border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-top:8px}
  .fill{height:100%;background:linear-gradient(90deg,#2a7d3f,#3fb950);border-radius:8px;transition:width .4s}
  .pctline{display:flex;justify-content:space-between;color:var(--dim);font-size:12px;margin-top:4px}
  .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 15px;margin:12px 0}
  .card.hot{border-color:#d2992255;background:#1c1a12}
  .card h3{font-size:15px;margin-bottom:8px}
  .rows{margin-top:10px}
  .row{display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px solid #20242f;font-size:13px}
  .row:first-child{border-top:0}
  .rid{color:var(--accent);font-weight:700;font-size:12px;flex:0 0 auto;min-width:46px}
  .rt{color:var(--dim);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto;background:#39404f}
  .dot.ok{background:var(--ok)}.dot.wip{background:var(--wip)}.dot.block{background:var(--block)}
  .pill{font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;flex:0 0 auto}
  .pill.ok{background:#15351f;color:var(--ok)}.pill.wip{background:#36280a;color:var(--wip)}
  .pill.block{background:#3a1714;color:var(--block)}.pill.todo{background:#222734;color:var(--dim)}
  .pill.dim{background:#1a1d26;color:#5b6270}
  .commit{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:var(--dim);padding:3px 0;border-top:1px solid #20242f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .commit:first-child{border-top:0}
  footer{color:#5b6270;font-size:11px;margin-top:18px;text-align:center}
</style></head><body><div class="wrap">
  <h1>playable-<span class="f">forge</span> · прогрес</h1>
  <div class="sub">Генерується з <code>ROADMAP.md</code> + <code>backlog.md</code> · <code>npm run dashboard</code></div>

  <div class="overall">
    <div class="big">${overallPct}%</div>
    <div class="lbl">загальний прогрес (${overallDone}/${counted.length} задач, без deferred)</div>
    ${bar(overallDone, counted.length)}
    <div class="chips">${counts.map((c) => `<span class="pill ${PILL[c.s]}">${c.s} ${c.n}</span>`).join("")}</div>
  </div>

  ${wipBlock}
  ${epicBlocks.join("")}

  <div class="card"><h3>📜 Останні коміти (momentum)</h3>${commits}</div>

  <footer>живий трекер · перегенеровуй після зміни статусів у беклозі</footer>
</div></body></html>`;
}

function main() {
  const md = readFileSync(ROADMAP, "utf8") + "\n" + readFileSync(BACKLOG, "utf8");
  const items = parseTables(md);
  writeFileSync(OUT, render(items));
  const done = items.filter((i) => i.status === "done").length;
  console.log(`dashboard: ${items.length} items, ${done} done -> ${OUT}`);
  console.log(`epics: ${[...new Set(items.map((i) => i.epic))].join(" · ")}`);
}

main();
