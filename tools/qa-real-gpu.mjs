// Real-GPU QA: same as qa-lab but forces ANGLE D3D11 instead of SwiftShader.
// Verifies whether se-viewport empty-text is a SwiftShader-only artefact.
//   node tools/qa-real-gpu.mjs <game-id>

import { chromium } from "playwright";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

const id = process.argv[2];
const root = process.cwd();
const file = path.join(root, "test", id, "index.html");
const qaDir = path.join(root, "test", id, "qa");
mkdirSync(qaDir, { recursive: true });

const browser = await chromium.launch({
  args: [
    "--use-angle=d3d11",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
  ],
});
const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`CONSOLE: ${m.text().slice(0, 150)}`); });
await page.goto(pathToFileURL(file).href);
await page.waitForTimeout(2000);
await page.screenshot({ path: path.join(qaDir, "gpu-se-t0.png") });
await page.mouse.click(187, 333);
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(qaDir, "gpu-se-t1.png") });
console.log(errors.length ? errors.slice(0, 5).join("\n") : "no errors");
console.log(`saved gpu-se-t0/t1 -> test/${id}/qa/`);
await browser.close();
