// Endcard verification QA: plays each game with a generic interaction profile
// until its endcard appears, then screenshots it (real GPU / ANGLE).
//   node tools/qa-endcard-monkey.mjs <id>...

import { chromium } from "playwright";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

const W = 375, H = 667;
const root = process.cwd();

// Per-game interaction profiles.
const PROFILES = {
  "slice-your-spark-smoothie": async (page) => {
    // Diagonal slice swipes through the play area for the 20s round.
    for (let i = 0; i < 26; i++) {
      const y = 180 + (i % 5) * 60;
      await page.mouse.move(40, y); await page.mouse.down();
      for (let x = 40; x <= 335; x += 24) await page.mouse.move(x, y - (x - 40) * 0.3);
      await page.mouse.up();
      await page.waitForTimeout(700);
    }
    await page.waitForTimeout(5000);
  },
  "routine-tower-stack": async (page) => {
    for (let i = 0; i < 30; i++) {
      await page.mouse.click(W / 2, H * 0.55);
      await page.waitForTimeout(1100);
    }
    await page.waitForTimeout(6000);
  },
  "health-planmatch-30s-quiz": async (page) => {
    // Tap through answer cards: cycle several likely button bands.
    const bands = [0.42, 0.52, 0.62, 0.72, 0.80];
    for (let i = 0; i < 36; i++) {
      await page.mouse.click(W / 2, H * bands[i % bands.length]);
      await page.waitForTimeout(1300);
    }
    await page.waitForTimeout(6000);
  },
  "greens-catch-glass": async (page) => {
    // Drag the glass left-right along the bottom for the timed round.
    await page.mouse.move(W / 2, H * 0.8); await page.mouse.down();
    for (let i = 0; i < 220; i++) {
      const x = W / 2 + Math.sin(i / 6) * W * 0.36;
      await page.mouse.move(x, H * 0.8);
      await page.waitForTimeout(160);
    }
    await page.mouse.up();
    await page.waitForTimeout(8000);
  },
  "life-umbrella-drag-catch": async (page) => {
    await page.mouse.move(W / 2, H * 0.55); await page.mouse.down();
    for (let i = 0; i < 220; i++) {
      const x = W / 2 + Math.sin(i / 5) * W * 0.34;
      await page.mouse.move(x, H * 0.55 + Math.cos(i / 9) * 40);
      await page.waitForTimeout(160);
    }
    await page.mouse.up();
    await page.waitForTimeout(8000);
  },
  "home-kitchen-hotspot-stamp": async (page) => {
    // Tap a dense grid so every hotspot gets hit.
    const pts = [];
    for (let fy = 0.15; fy <= 0.85; fy += 0.1) {
      for (let fx = 0.15; fx <= 0.85; fx += 0.14) pts.push([fx, fy]);
    }
    for (let i = 0; i < pts.length * 2; i++) {
      const [fx, fy] = pts[i % pts.length];
      await page.mouse.click(W * fx, H * fy);
      await page.waitForTimeout(420);
    }
    await page.waitForTimeout(9000);
  },
};

const ids = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });

for (const id of ids) {
  const profile = PROFILES[id];
  if (!profile) { console.log(`[${id}] no profile, skipped`); continue; }
  const file = path.join(root, "test", id, "index.html");
  const qaDir = path.join(root, "test", id, "qa");
  mkdirSync(qaDir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`CONSOLE: ${m.text().slice(0, 140)}`); });
  await page.goto(pathToFileURL(file).href);
  await page.waitForTimeout(1500);
  try { await profile(page); } catch (e) { errors.push("PROFILE: " + e.message); }
  await page.screenshot({ path: path.join(qaDir, "endcard-check.png") });
  console.log(`[${id}] ${errors.length ? "ERRORS:\n  " + [...new Set(errors)].slice(0, 4).join("\n  ") : "no errors"}`);
  await ctx.close();
}
await browser.close();
console.log("done");
