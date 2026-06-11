// Full-flow QA for scrub-to-clean labs (power-wash, carpet-clean-v*) on real
// GPU (ANGLE). Simulates dense scrubbing sweeps across the whole screen and
// screenshots: hook, mid-clean, near-done, endcard.
//   node tools/qa-scrub-flow.mjs <lab-id> [more-ids...]

import { chromium } from "playwright";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ids = process.argv.slice(2);
if (!ids.length) { console.error("usage: node tools/qa-scrub-flow.mjs <lab-id>..."); process.exit(1); }

const root = process.cwd();
const W = 375, H = 667;

const browser = await chromium.launch({
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
});

async function sweep(page, yTop, yBot, rowStep, xStep) {
  // One full scrub pass: rows top→bottom, serpentine x sweeps, single drag.
  await page.mouse.move(10, yTop);
  await page.mouse.down();
  let dir = 1;
  for (let y = yTop; y <= yBot; y += rowStep) {
    const xs = [];
    for (let x = 8; x <= W - 8; x += xStep) xs.push(x);
    if (dir < 0) xs.reverse();
    for (const x of xs) await page.mouse.move(x, y);
    dir *= -1;
  }
  await page.mouse.up();
}

for (const id of ids) {
  const file = path.join(root, "test", id, "index.html");
  const qaDir = path.join(root, "test", id, "qa");
  mkdirSync(qaDir, { recursive: true });

  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`CONSOLE: ${m.text().slice(0, 140)}`); });
  await page.goto(pathToFileURL(file).href);

  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(qaDir, "flow-1-hook.png") });

  await sweep(page, 8, H - 10, 16, 18);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(qaDir, "flow-2-mid.png") });

  // Two more passes (stubborn spot needs 3 hits; edges need re-cover).
  await sweep(page, 8, H - 10, 12, 14);
  await sweep(page, 8, H - 10, 12, 14);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(qaDir, "flow-3-after-scrub.png") });

  // Wait out win sequence and/or idle auto-demo top-ups, then endcard.
  await page.waitForTimeout(9000);
  await page.screenshot({ path: path.join(qaDir, "flow-4-endcard.png") });

  console.log(`[${id}] ${errors.length ? "ERRORS:\n  " + [...new Set(errors)].slice(0, 5).join("\n  ") : "no errors"}`);
  await ctx.close();
}

await browser.close();
console.log("done");
