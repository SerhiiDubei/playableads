import { writeFileSync, mkdirSync, statSync } from "node:fs";
import { loadKit, makeKit, kitBytes, NINE, fontFace } from "./kit/kit.js";

const SRC = "out/heroes3";
const OUT = "test/components";
const ASSET_DIR = `${OUT}/assets`;
const ICONS = ["ic-settings", "ic-sound", "ic-plus", "ic-check", "ic-close", "ic-back"];

const FONT_FACE = fontFace("Cinzel", "src/assetgen/kit/cinzel-700.woff2");
const FONT = `"Cinzel",Georgia,serif`;

const pageCss = `
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:${FONT};color:#f7ead0;
    background:radial-gradient(120% 120% at 50% 0%,#6b4a22,#2c1d0c 70%,#160f06);min-height:100vh;padding:24px}
  h2{font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#c9a86a;margin:26px 0 12px;border-bottom:1px solid #c9962f33;padding-bottom:6px}
  .wrap{max-width:460px;margin:0 auto}
  .sub{color:#cbb78d;font-size:13px}
  .stack{display:flex;flex-direction:column;align-items:stretch;gap:12px}
`;

function page(k: ReturnType<typeof makeKit>): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Heroes III — component kit</title><style>${FONT_FACE}${pageCss}${k.css}</style></head>
<body><div class="wrap">

  ${k.banner("Realm of Valor")}

  <h2>Avatar + Panel</h2>
  <div class="k-row" style="align-items:stretch">
    ${k.avatar("portrait")}
    ${k.panel(`<div class="gold" style="font-size:20px;text-align:center">Sir Roland</div>
      <div class="sub" style="text-align:center;margin:4px 0 10px">Knight · Level 7</div>${k.bar(65)}`, "flex:1")}
  </div>

  <h2>Resource pills</h2>
  <div class="k-row">${k.pill("ic-plus", "1 250")}${k.pill("ic-check", "48")}${k.pill("ic-settings", "12")}</div>

  <h2>Buttons (9-slice · any width)</h2>
  <div class="stack">
    ${k.button("New Game", "", { block: true })}
    ${k.button("Continue Campaign", "", { block: true })}
    <div class="k-row">${k.button("OK")}${k.button("Cancel")}</div>
  </div>

  <h2>Progress bar</h2>
  ${k.bar(35)}

  <h2>Icon buttons</h2>
  <div class="k-row">${ICONS.map((i) => k.iconBtn(i)).join("")}</div>

</div></body></html>`;
}

async function main() {
  const assets = await loadKit(SRC, {
    keys: [...Object.keys(NINE), "banner", "avatar-frame", ...ICONS],
    extra: [{ key: "portrait", src: "out/prompt-lab/heroes3-knight/4-ip-anchored.png", size: 200, cover: true }],
    writeDir: ASSET_DIR,
  });
  const k = makeKit(assets, { font: FONT });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/index.html`, page(k));
  const kb = statSync(`${OUT}/index.html`).size / 1024;
  console.log(`assets: ${(kitBytes(assets) / 1024).toFixed(1)} KB`);
  console.log(`index.html: ${kb.toFixed(1)} KB (${(kb / 2048 * 100).toFixed(1)}% of 2MB)`);
  console.log(`-> ${OUT}/index.html`);
}
main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
