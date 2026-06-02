// Маленький MD→HTML конвертер для доків: темна тема, бічний TOC, стилізовані таблиці/код.
// Запуск: tsx src/assetgen/md-to-html.ts <in.md> <out.html> ["Заголовок"]
import { readFileSync, writeFileSync } from "node:fs";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(s: string): string {
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t, u) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  return s;
}

type Toc = { level: number; id: string; text: string };

function convert(md: string): { body: string; toc: Toc[] } {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  const toc: Toc[] = [];
  let i = 0, hid = 0;

  const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

  while (i < lines.length) {
    const line = lines[i];

    // code fence
    if (/^\s*```/.test(line)) {
      const buf: string[] = []; i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }
    // table
    if (isTableRow(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const head = cells(line); i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) { rows.push(cells(lines[i])); i++; }
      out.push(
        `<div class="tw"><table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join("")}</tr></thead>` +
        `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
      );
      continue;
    }
    // heading
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length, id = "h" + (++hid), txt = h[2];
      if (lvl <= 2) toc.push({ level: lvl, id, text: txt.replace(/[#*`]/g, "") });
      out.push(`<h${lvl} id="${id}">${inline(txt)}</h${lvl}>`);
      i++; continue;
    }
    // hr
    if (/^\s*---+\s*$/.test(line)) { out.push("<hr>"); i++; continue; }
    // blockquote
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
      out.push(`<blockquote>${inline(buf.join(" "))}</blockquote>`);
      continue;
    }
    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { buf.push(lines[i].replace(/^\s*[-*]\s+/, "")); i++; }
      out.push(`<ul>${buf.map((b) => `<li>${inline(b)}</li>`).join("")}</ul>`);
      continue;
    }
    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { buf.push(lines[i].replace(/^\s*\d+\.\s+/, "")); i++; }
      out.push(`<ol>${buf.map((b) => `<li>${inline(b)}</li>`).join("")}</ol>`);
      continue;
    }
    // blank
    if (/^\s*$/.test(line)) { i++; continue; }
    // paragraph
    const buf: string[] = [];
    while (
      i < lines.length && !/^\s*$/.test(lines[i]) &&
      !/^(#{1,4})\s|^\s*[-*]\s|^\s*\d+\.\s|^\s*>|^\s*```|^\s*---+\s*$/.test(lines[i]) &&
      !isTableRow(lines[i])
    ) { buf.push(lines[i]); i++; }
    if (buf.length) out.push(`<p>${inline(buf.join(" "))}</p>`);
  }
  return { body: out.join("\n"), toc };
}

function page(title: string, body: string, toc: Toc[]): string {
  const nav = toc.map((t) => `<a class="lv${t.level}" href="#${t.id}">${esc(t.text)}</a>`).join("");
  return `<!doctype html><html lang="uk"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
:root{--bg:#0e0e12;--card:#16161d;--line:#262631;--txt:#e7e7f0;--dim:#9a9ab0;--acc:#5b8cff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--txt);font:15px/1.7 system-ui,"Segoe UI",Roboto,sans-serif}
.layout{display:grid;grid-template-columns:280px 1fr;max-width:1280px;margin:0 auto}
nav{position:sticky;top:0;align-self:start;height:100vh;overflow:auto;padding:26px 18px;border-right:1px solid var(--line)}
nav .tt{font-size:12px;letter-spacing:.6px;text-transform:uppercase;color:var(--dim);margin-bottom:12px}
nav a{display:block;color:var(--dim);text-decoration:none;padding:5px 10px;border-radius:7px;font-size:13.5px}
nav a:hover{color:var(--txt);background:var(--card)}
nav a.lv1{font-weight:700;color:var(--txt);margin-top:8px}
nav a.lv2{padding-left:20px}
main{padding:34px 46px;min-width:0}
h1{font-size:27px;margin:.2em 0 .5em;line-height:1.25}
h2{font-size:20px;margin:1.5em 0 .5em;padding-top:.5em;border-top:1px solid var(--line)}
h3{font-size:16px;margin:1.3em 0 .4em;color:#cfd2ff}
h4{font-size:14px;margin:1.1em 0 .3em;color:var(--dim);text-transform:uppercase;letter-spacing:.4px}
p{margin:.6em 0}a{color:var(--acc)}
code{background:#20202a;border:1px solid var(--line);border-radius:5px;padding:1px 6px;font:13px/1.5 ui-monospace,Menlo,monospace}
pre{background:#0a0a0f;border:1px solid var(--line);border-radius:10px;padding:16px 18px;overflow:auto}
pre code{background:none;border:none;padding:0;font-size:12.5px;color:#bfe3d2;white-space:pre}
blockquote{margin:.8em 0;padding:10px 16px;border-left:3px solid var(--acc);background:#161824;border-radius:0 8px 8px 0;color:#cfd0e6}
hr{border:none;border-top:1px solid var(--line);margin:1.8em 0}
ul,ol{margin:.5em 0;padding-left:22px}li{margin:.25em 0}
strong{color:#fff}em{color:#cfd2ff;font-style:normal;background:#1c1c28;padding:0 4px;border-radius:4px}
.tw{overflow:auto;margin:1em 0;border:1px solid var(--line);border-radius:10px}
table{border-collapse:collapse;width:100%;font-size:13.5px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{background:#1b1b24;color:#cfd2ff;font-weight:700}
tbody tr:hover{background:#15151d}
td code{font-size:12px}
@media(max-width:880px){.layout{grid-template-columns:1fr}nav{position:static;height:auto;border-right:none;border-bottom:1px solid var(--line)}}
</style></head>
<body><div class="layout">
<nav><div class="tt">Зміст</div>${nav}</nav>
<main>${body}</main>
</div></body></html>`;
}

const [, , inPath, outPath, titleArg] = process.argv;
if (!inPath || !outPath) { console.error("usage: md-to-html <in.md> <out.html> [title]"); process.exit(1); }
const { body, toc } = convert(readFileSync(inPath, "utf8"));
const title = titleArg ?? (toc.find((t) => t.level === 1)?.text ?? "Doc");
writeFileSync(outPath, page(title, body, toc));
console.log(`-> ${outPath} (${toc.length} TOC entries)`);
