import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const TARGET = process.argv[2] ?? "test/menu-playable/index.html";
const OUT = process.argv[3] ?? "test/visual";
const url = pathToFileURL(path.resolve(TARGET)).href;

const VIEWPORTS = [
  { name: "small-360", w: 360, h: 640 },
  { name: "iphone-se", w: 375, h: 667 },
  { name: "iphone-14", w: 390, h: 844 },
  { name: "pixel-7", w: 412, h: 915 },
  { name: "tall-960", w: 412, h: 960 },
  { name: "tablet", w: 768, h: 1024 },
  { name: "landscape", w: 740, h: 360 },
  { name: "square", w: 600, h: 600 },
];
// екрани визначаються з DOM автоматично (працює на будь-якому білді: menu / experiments / ...)
let SCREENS: string[] = [];

// перевірка: жоден інтерактивний елемент активного екрана не вилазить за viewport
const OVERFLOW_CHECK = `(() => {
  const vw = innerWidth, vh = innerHeight, tol = 1;
  const els = [...document.querySelectorAll('.screen.active .c-btn, .screen.active .c-banner, .screen.active .icon, .screen.active .c-pill, .screen.active .c-panel, .screen.active .knight')];
  const off = els.filter(e => { const r = e.getBoundingClientRect();
    return r.width > 0 && (r.left < -tol || r.top < -tol || r.right > vw + tol || r.bottom > vh + tol); })
    .map(e => e.className.split(' ')[0] + ' [' + [e.getBoundingClientRect().left|0, e.getBoundingClientRect().top|0, e.getBoundingClientRect().right|0, e.getBoundingClientRect().bottom|0].join(',') + ']');
  return { checked: els.length, offscreen: off };
})()`;

// перевірка зон: кожен елемент у межах своєї зони + primary CTA у thumb-зоні (actions)
const ZONE_CHECK = `(() => {
  const tol = 3;
  const els = [...document.querySelectorAll('.screen.active .c-btn, .screen.active .icon, .screen.active .c-pill, .screen.active .c-panel, .screen.active .c-banner, .screen.active .knight')];
  const bad = [];
  for (const e of els) {
    const z = e.closest('.zone:not(.zdbg)');
    if (!z) { bad.push((e.className.split(' ')[0]) + ':no-zone'); continue; }
    const zr = z.getBoundingClientRect(), er = e.getBoundingClientRect();
    if (er.width && (er.left < zr.left - tol || er.top < zr.top - tol || er.right > zr.right + tol || er.bottom > zr.bottom + tol))
      bad.push((e.className.split(' ')[0]) + '>' + z.getAttribute('data-zone'));
  }
  const prim = document.querySelector('.screen.active .c-btn.primary');
  const pz = prim ? prim.closest('.zone:not(.zdbg)')?.getAttribute('data-zone') : 'none';
  if (prim && pz !== 'actions') bad.push('primary-not-in-actions(' + pz + ')');
  return { checked: els.length, bad, primaryZone: pz };
})()`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  let fails = 0;
  console.log(`visual-test: ${url}\n`);

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 2 });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${vp.name}.png` });
    const res = (await page.evaluate(OVERFLOW_CHECK)) as { checked: number; offscreen: string[] };
    const ok = res.offscreen.length === 0;
    if (!ok) fails++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${vp.name.padEnd(11)} ${vp.w}x${vp.h}  checked=${res.checked}${ok ? "" : "  OFF: " + res.offscreen.join(" | ")}`);
    await page.close();
  }

  // усі екрани на одному референсі + zone-асерти
  console.log("");
  const ref = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ref.goto(url, { waitUntil: "networkidle" });
  SCREENS = (await ref.evaluate(() => [...document.querySelectorAll(".screen")].map((s) => s.id))) as string[];
  for (const s of SCREENS) {
    await ref.evaluate((id) => (window as any).go(id), s);
    await ref.waitForTimeout(350);
    await ref.screenshot({ path: `${OUT}/screen-${s}.png` });
    const z = (await ref.evaluate(ZONE_CHECK)) as { checked: number; bad: string[]; primaryZone: string };
    const ok = z.bad.length === 0;
    if (!ok) fails++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  zones:${s.padEnd(8)} checked=${z.checked} primary=${z.primaryZone}${ok ? "" : "  BAD: " + z.bad.join(" | ")}`);
  }
  await ref.close();
  await browser.close();

  console.log(`\nscreenshots -> ${OUT}/  (${VIEWPORTS.length} viewports + ${SCREENS.length} screens)`);
  console.log(fails === 0 ? `ALL PASS — no overflow + zones valid` : `${fails} check(s) FAILED`);
  if (fails > 0) process.exit(1);
}
main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
