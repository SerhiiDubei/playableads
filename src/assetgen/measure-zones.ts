// Одноразовий діагностичний вимірювач: відкриває зібраний playable, друкує rect
// кожної .zone-* та елементів, що вилазять за свою зону. Не частина пайплайну.
//   tsx src/assetgen/measure-zones.ts [file] [viewportW] [viewportH]
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";

const file = process.argv[2] ?? "test/menu-playable/index.html";
const W = Number(process.argv[3] ?? 390);
const H = Number(process.argv[4] ?? 844);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto(pathToFileURL(file).href);
await page.waitForTimeout(400);

const report = await page.evaluate(() => {
  const out: string[] = [];
  const active = document.querySelector(".screen.active");
  if (!active) return "no active screen";
  const zones = active.querySelectorAll<HTMLElement>(".zone:not(.zdbg)");
  for (const z of zones) {
    const name = z.getAttribute("data-zone");
    const zr = z.getBoundingClientRect();
    out.push(`zone ${name}: top=${zr.top.toFixed(0)} bottom=${zr.bottom.toFixed(0)} h=${zr.height.toFixed(0)} left=${zr.left.toFixed(0)} right=${zr.right.toFixed(0)}`);
    for (const el of z.querySelectorAll<HTMLElement>("*")) {
      const r = el.getBoundingClientRect();
      const over: string[] = [];
      if (r.top < zr.top - 1) over.push(`top ${(zr.top - r.top).toFixed(0)}px`);
      if (r.bottom > zr.bottom + 1) over.push(`bottom ${(r.bottom - zr.bottom).toFixed(0)}px`);
      if (r.left < zr.left - 1) over.push(`left ${(zr.left - r.left).toFixed(0)}px`);
      if (r.right > zr.right + 1) over.push(`right ${(r.right - zr.right).toFixed(0)}px`);
      if (over.length) out.push(`   OVER ${el.className || el.tagName}: ${over.join(", ")} (${r.width.toFixed(0)}×${r.height.toFixed(0)})`);
    }
  }
  return out.join("\n");
});
console.log(`measure @ ${W}×${H}: ${file}\n${report}`);
await browser.close();
