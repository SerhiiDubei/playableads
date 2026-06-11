// Full-flow QA for dream-kitchen-three-picks on real GPU (ANGLE).
// Walks the whole FSM twice (left-picks path, right-picks path) and
// screenshots EVERY state: hook, step1, step2, step3, reveal, endcard.
//   node tools/qa-kitchen-flow.mjs

import { chromium } from "playwright";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const file = path.join(root, "test", "dream-kitchen-three-picks", "index.html");
const qaDir = path.join(root, "test", "dream-kitchen-three-picks", "qa");
mkdirSync(qaDir, { recursive: true });

const W = 375, H = 667;
// Swatch card tap points (design 540x960 → scaled to viewport; cards sit at
// CARDS_Y≈KITCHEN_H+46..+126 → bottom band). Tap simply left/right halves of
// the bottom strip — pick handler falls back to dx<DW/2 split.
const LEFT  = { x: Math.round(W * 0.27), y: Math.round(H * 0.86) };
const RIGHT = { x: Math.round(W * 0.73), y: Math.round(H * 0.86) };

const browser = await chromium.launch({
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
});

async function runPath(name, pick) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`CONSOLE: ${m.text().slice(0, 140)}`); });
  await page.goto(pathToFileURL(file).href);

  await page.waitForTimeout(1600);
  await page.screenshot({ path: path.join(qaDir, `flow-${name}-1-hook.png`) });

  await page.mouse.click(pick.x, pick.y);            // style pick
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(qaDir, `flow-${name}-2-after-style.png`) });

  await page.mouse.click(pick.x, pick.y);            // counter pick
  await page.waitForTimeout(1600);
  await page.screenshot({ path: path.join(qaDir, `flow-${name}-3-after-counter.png`) });

  await page.mouse.click(pick.x, pick.y);            // splash pick
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(qaDir, `flow-${name}-4-reveal.png`) });

  await page.waitForTimeout(3500);                   // reveal hold → endcard
  await page.screenshot({ path: path.join(qaDir, `flow-${name}-5-endcard.png`) });

  console.log(`[${name}] ${errors.length ? "ERRORS:\n  " + [...new Set(errors)].slice(0, 5).join("\n  ") : "no errors"}`);
  await ctx.close();
}

await runPath("L", LEFT);    // Modern → Quartz → Classic
await runPath("R", RIGHT);   // Farmhouse → Butcher → Herringbone
await browser.close();
console.log(`shots -> test/dream-kitchen-three-picks/qa/flow-*.png`);
