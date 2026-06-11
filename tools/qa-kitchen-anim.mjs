// Captures the swap CHOREOGRAPHY frame-by-frame: after each pick, screenshots
// every 150ms so the cascade/flip phases are visible for review.
//   node tools/qa-kitchen-anim.mjs

import { chromium } from "playwright";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const id = "dream-kitchen-three-picks";
const file = path.join(root, "test", id, "index.html");
const qaDir = path.join(root, "test", id, "qa");
mkdirSync(qaDir, { recursive: true });

const W = 375, H = 667;
const RIGHT = { x: Math.round(W * 0.73), y: Math.round(H * 0.86) };

const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
const page = await ctx.newPage();
await page.goto(pathToFileURL(file).href);
await page.waitForTimeout(1600);

async function burst(tag, n) {
  for (let i = 1; i <= n; i++) {
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(qaDir, `anim-${tag}-${String(i * 150).padStart(4, "0")}ms.png`) });
  }
}

await page.mouse.click(RIGHT.x, RIGHT.y);   // style → Farmhouse (cascade both rows)
await burst("style", 10);
await page.waitForTimeout(600);
await page.mouse.click(RIGHT.x, RIGHT.y);   // counter → Butcher (strip cascade + glint)
await burst("counter", 7);
await page.waitForTimeout(600);
await page.mouse.click(RIGHT.x, RIGHT.y);   // splash → Herringbone (flip wave)
await burst("splash", 7);
await page.waitForTimeout(800);
await burst("reveal", 12);

await browser.close();
console.log("anim frames -> test/" + id + "/qa/anim-*.png");
