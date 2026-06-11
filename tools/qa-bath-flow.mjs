// Full-flow QA for budget-slider-bath-morph on real GPU (ANGLE).
// Drags the budget slider through every upgrade state, screenshots each,
// then locks the style and screenshots the endcard.
//   node tools/qa-bath-flow.mjs

import { chromium } from "playwright";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const id = "budget-slider-bath-morph";
const file = path.join(root, "test", id, "index.html");
const qaDir = path.join(root, "test", id, "qa");
mkdirSync(qaDir, { recursive: true });

const W = 375, H = 667;
// Design 400x680 contain-fit → s=0.9375, ox=0, oy=14.75
const S = Math.min(W / 400, H / 680);
const OX = (W - 400 * S) / 2, OY = (H - 680 * S) / 2;
const dx2sx = (dx) => OX + dx * S;
const dy2sy = (dy) => OY + dy * S;

const TRACK_Y = dy2sy(586);
const budgetToX = (b) => dx2sx(32 + ((b - 6000) / 19000) * 336);

// Mid-band budget per state (state = #thresholds passed).
const STATE_BUDGETS = [7000, 9000, 11500, 14000, 16500, 19000, 21500, 24500];

const browser = await chromium.launch({
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`CONSOLE: ${m.text().slice(0, 140)}`); });
await page.goto(pathToFileURL(file).href);

await page.waitForTimeout(1600);
await page.screenshot({ path: path.join(qaDir, "flow-0-hook.png") });

// Drag through every state, pausing for the swap animation at each.
await page.mouse.move(budgetToX(7000), TRACK_Y);
await page.mouse.down();
for (let i = 0; i < STATE_BUDGETS.length; i++) {
  const tx = budgetToX(STATE_BUDGETS[i]);
  for (let k = 1; k <= 6; k++) await page.mouse.move(tx - (6 - k) * 4, TRACK_Y);
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(qaDir, `flow-state-${i}.png`) });
}
await page.mouse.up();

// Lock chip appears after max state seen → tap it (design 200, 424).
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(qaDir, "flow-lockchip.png") });
await page.mouse.click(dx2sx(200), dy2sy(424));
await page.waitForTimeout(1800);
await page.screenshot({ path: path.join(qaDir, "flow-endcard.png") });

console.log(errors.length ? "ERRORS:\n  " + [...new Set(errors)].slice(0, 6).join("\n  ") : "no errors");
await browser.close();
console.log(`shots -> test/${id}/qa/flow-*.png`);
