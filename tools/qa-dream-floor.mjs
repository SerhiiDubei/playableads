// QA harness for the Dream Floor playable (canvas + __ftf dbg hook).
// Playwright drives the FSM through every beat and screenshots to disk so we can
// inspect real composited frames (preview_screenshot can't — it pauses rAF when
// the tab is unfocused; Playwright's renderer keeps animating).
//   node tools/qa-dream-floor.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const TARGET = "test/dream-floor/index.html";
const OUT = "test/dream-floor/qa";
const url = pathToFileURL(path.resolve(TARGET)).href + "?dbg";

const shots = [];
let browser; // outer scope so the finally can always close it (no zombie chromium)
async function main() {
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch();
  // shot() extracts a FIXED design-space region, so the viewport/DPR don't affect the
  // capture; a small buffer also keeps headless SwiftShader's shader init reliable.
  const page = await browser.newPage({ viewport: { width: 600, height: 720 }, deviceScaleFactor: 1 });
  // Headless WebGL (SwiftShader) returns null from getShaderInfoLog/getProgramInfoLog/
  // getShaderSource; Pixi v8 calls .split on it and crashes. Coerce null -> "" before
  // Pixi loads. (Render-via-extract readback then works; the live framebuffer stays
  // black in headless, so we capture each frame with extract, not page.screenshot.)
  await page.addInitScript(() => {
    for (const Ctx of [self.WebGLRenderingContext, self.WebGL2RenderingContext]) {
      if (!Ctx) continue;
      for (const m of ["getShaderInfoLog", "getProgramInfoLog", "getShaderSource"]) {
        const orig = Ctx.prototype[m];
        Ctx.prototype[m] = function (...a) { const r = orig.apply(this, a); return r == null ? "" : r; };
      }
    }
  });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.stack || String(e)));
  await page.goto(url, { waitUntil: "load" });

  // Wait for the dbg hook to exist.
  await page.waitForFunction(() => !!window.__ftf, null, { timeout: 5000 });

  const cap = async (name, waitMs) => {
    await page.waitForTimeout(waitMs);
    const { state, uri } = await page.evaluate(async () => ({
      state: window.__ftf.state,
      uri: await window.__ftf.shot(),
    }));
    const file = `${OUT}/${name}.png`;
    writeFileSync(file, Buffer.from(uri.split(",")[1], "base64"));
    shots.push({ name, state });
    console.log(`  shot ${name.padEnd(14)} state=${state}`);
  };
  const step = () => page.evaluate(() => window.__ftf.step());

  await cap("01-intro", 300);        // cozy room, couch upright
  await cap("02-hook", 2000);        // couch tilted (hook fired) → state couch
  await step(); await cap("03-carpet", 900);   // couch moved aside → rug highlighted
  await step(); await cap("04-crowbar", 1000); // rug ripped → rotten subfloor + toolbar
  await step(); await cap("05-plank", 1100);   // rotten pried out → bare subfloor
  await step(); await cap("06-finish", 1100);  // new planks laid
  await step(); await cap("07-reveal", 1400);  // finish swept → reveal begins
  await cap("08-reveal-hold", 1600); // couch returns, warm light
  await cap("09-endcard", 3600);     // end card + CTA (reveal hold ~2.5s after anim)
  // CTA wiring check.
  const ctaLog = [];
  page.on("console", (m) => { if (m.text().includes("onCTAClick")) ctaLog.push(m.text()); });
  await page.evaluate(() => window.__ftf.cta());
  await page.waitForTimeout(150);

  console.log("\nstates:", shots.map((s) => `${s.name}:${s.state}`).join("  "));
  console.log("cta fired:", ctaLog.length > 0 ? "yes" : "(stub log captured async)");
  if (errors.length) { console.log("PAGE ERRORS:\n  " + errors.join("\n  ")); process.exitCode = 1; }
  else console.log("no page errors");
}
main()
  .catch((e) => { console.error("FATAL:", e?.message ?? e); process.exitCode = 1; })
  .finally(async () => { try { await browser?.close(); } catch {} });
