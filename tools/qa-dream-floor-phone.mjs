// Mobile-phone preview of Dream Floor: captures beats at a 9:19.5 phone frame
// (design + top/bottom "beyond" bands, exactly how a tall phone shows it) and drops
// each into a simple phone mockup (rounded screen + dark bezel + notch).
//   node tools/qa-dream-floor-phone.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import sharp from "sharp";

const OUT = "test/dream-floor/phone";
const url = pathToFileURL(path.resolve("test/dream-floor/index.html")).href + "?dbg";
// Phone screen at res:2 → 1080×2340 (9:19.5). Frame includes 105px beyond top & bottom.
const FRAME = { x: 0, y: -105, w: 540, h: 1170, res: 2 };
const SW = FRAME.w * FRAME.res, SH = FRAME.h * FRAME.res; // 1080 × 2340

const GL_PATCH = () => {
  for (const Ctx of [self.WebGLRenderingContext, self.WebGL2RenderingContext]) {
    if (!Ctx) continue;
    for (const m of ["getShaderInfoLog", "getProgramInfoLog", "getShaderSource"]) {
      const orig = Ctx.prototype[m];
      Ctx.prototype[m] = function (...a) { const r = orig.apply(this, a); return r == null ? "" : r; };
    }
  }
};

function dataUriToBuf(uri) { return Buffer.from(uri.split(",")[1], "base64"); }
async function meanRgb(buf) {
  const st = await sharp(buf).stats();
  return (st.channels[0].mean + st.channels[1].mean + st.channels[2].mean) / 3;
}

// Wrap a screen PNG in a phone mockup.
async function phoneMock(screenBuf) {
  const SR = 92, BZ = 24, BW = SW + BZ * 2, BH = SH + BZ * 2, BR = SR + BZ;
  const rounded = await sharp(screenBuf).resize(SW, SH)
    .composite([{ input: Buffer.from(`<svg width="${SW}" height="${SH}"><rect width="${SW}" height="${SH}" rx="${SR}" ry="${SR}"/></svg>`), blend: "dest-in" }])
    .png().toBuffer();
  return sharp({ create: { width: BW, height: BH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: Buffer.from(`<svg width="${BW}" height="${BH}"><rect width="${BW}" height="${BH}" rx="${BR}" ry="${BR}" fill="#16161b"/></svg>`), top: 0, left: 0 },
      { input: rounded, top: BZ, left: BZ },
      { input: Buffer.from(`<svg width="${BW}" height="${BH}"><rect x="${BW / 2 - 118}" y="${BZ - 2}" width="236" height="34" rx="17" fill="#0a0a0c"/></svg>`), top: 0, left: 0 },
    ]).png().toBuffer();
}

async function attempt() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 480, height: 640 }, deviceScaleFactor: 1 });
    await page.addInitScript(GL_PATCH);
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => !!window.__ftf, null, { timeout: 5000 });
    const shot = () => page.evaluate((f) => window.__ftf.shot(f), FRAME);
    const step = () => page.evaluate(() => window.__ftf.step());

    const caps = {};
    await page.waitForTimeout(2000);                 // hook fired → couch tilted
    caps.hook = dataUriToBuf(await shot());
    if ((await meanRgb(caps.hook)) < 20) return null; // blank → caller retries
    await step(); await page.waitForTimeout(850);     // carpet
    await step(); await page.waitForTimeout(1000);    // crowbar
    caps.crowbar = dataUriToBuf(await shot());
    await step(); await page.waitForTimeout(1050);    // plank
    await step(); await page.waitForTimeout(1100);    // finish
    caps.finish = dataUriToBuf(await shot());
    await step(); await page.waitForTimeout(1400);    // reveal
    await page.waitForTimeout(4200);                  // end card
    caps.endcard = dataUriToBuf(await shot());
    return caps;
  } finally {
    try { await browser.close(); } catch {}
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  let caps = null;
  for (let i = 1; i <= 8 && !caps; i++) {
    process.stdout.write(`attempt ${i}… `);
    try { caps = await attempt(); } catch (e) { console.log("error:", e?.message ?? e); continue; }
    console.log(caps ? "GOOD" : "blank (SwiftShader), retrying");
  }
  if (!caps) { console.error("Could not get a non-blank render after 8 tries."); process.exit(1); }
  for (const [name, buf] of Object.entries(caps)) {
    const mock = await phoneMock(buf);
    await sharp(mock).toFile(`${OUT}/phone-${name}.png`);
    console.log(`wrote ${OUT}/phone-${name}.png`);
  }
}
main();
