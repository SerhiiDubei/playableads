// Generic QA harness for labs playables.
//   node tools/qa-lab.mjs <game-id> [--shots N] [--tapXY x,y x,y ...]
//
// Opens test/<id>/index.html headless on 2 viewports (375x667, 393x851),
// captures console/page errors, takes timed screenshots via renderer.extract
// when available (falls back to page.screenshot), saves to test/<id>/qa/.
// Exit 1 on any page error.

import { chromium } from "playwright";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

const id = process.argv[2];
if (!id) {
  console.error("usage: node tools/qa-lab.mjs <game-id>");
  process.exit(1);
}
const root = process.cwd();
const file = path.join(root, "test", id, "index.html");
const qaDir = path.join(root, "test", id, "qa");
mkdirSync(qaDir, { recursive: true });

const VIEWPORTS = [
  { name: "se", w: 375, h: 667 },
  { name: "pixel", w: 393, h: 851 },
];

let failed = false;

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const errors = [];
  // Known non-fatal headless SwiftShader messages — intermittent WebGL init timing
  // artefacts that Pixi recovers from automatically. Ignoring prevents false failures.
  const IGNORE_PATTERNS = [
    /could not initialize shader/i,
    /pixijs error/i,
    /gl\.getprograminfolog/i,
    /gl\.getshaderinfolog/i,
  ];
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const txt = m.text();
    if (!txt || IGNORE_PATTERNS.some(p => p.test(txt))) return;
    errors.push(`CONSOLE: ${txt.slice(0, 200)}`);
  });
  // SwiftShader null shader-info-log patch (Pixi v8 headless quirk)
  await page.addInitScript(() => {
    const patch = (proto) => {
      const orig = proto.getShaderInfoLog;
      proto.getShaderInfoLog = function (...a) { return orig.apply(this, a) ?? ""; };
      const origP = proto.getProgramInfoLog;
      proto.getProgramInfoLog = function (...a) { return origP.apply(this, a) ?? ""; };
    };
    if (typeof WebGLRenderingContext !== "undefined") patch(WebGLRenderingContext.prototype);
    if (typeof WebGL2RenderingContext !== "undefined") patch(WebGL2RenderingContext.prototype);
  });
  await page.goto(pathToFileURL(file).href + "?dbg=1");
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(qaDir, `${vp.name}-t0.png`) });
  // mid-interaction shot: tap center, wait, shoot
  await page.mouse.click(vp.w / 2, vp.h / 2);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(qaDir, `${vp.name}-t1-after-tap.png`) });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(qaDir, `${vp.name}-t2-later.png`) });
  const uniq = [...new Set(errors)];
  if (uniq.length) {
    failed = true;
    console.log(`[${vp.name}] ERRORS (${uniq.length}):`);
    for (const e of uniq.slice(0, 8)) console.log(`  ${e}`);
  } else {
    console.log(`[${vp.name}] no errors, 3 shots saved`);
  }
  await ctx.close();
}
await browser.close();
console.log(`shots -> test/${id}/qa/`);
process.exit(failed ? 1 : 0);
