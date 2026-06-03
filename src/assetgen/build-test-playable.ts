import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { loadKit, makeKit, kitBytes, NINE, fontFace, type KitAssets } from "./kit/kit.js";
import { stageCss, stageJs } from "./kit/stage.js";
import { logStage, timed } from "./stage-log.js";
import { getLayout, DEFAULT_LAYOUT, type Layout } from "./layouts/index.js";
import { resolveLayout, zoneCss, OVERLAY_CSS } from "./kit/layout.js";
import { screenBaseCss } from "./kit/screen-css.js";

/** Zone CSS for every archetype a template declares (deduped). Empty for legacy templates. */
function zoneCssFor(layout: Layout): string {
  const types = [...new Set(Object.values(layout.meta.zoneTypes ?? {}))];
  if (types.length === 0) return "";
  return types.map((t) => zoneCss(resolveLayout(t))).join("") + OVERLAY_CSS;
}

const OUT = "test/menu-playable";
const ASSET_DIR = `${OUT}/assets`;
const ICONS = ["ic-settings", "ic-back", "ic-sound", "ic-plus", "ic-check", "ic-close"];
const KNIGHT_SRC = "out/prompt-lab/heroes3-knight/4-ip-anchored.png";

const FONT_FACE = fontFace("Cinzel", "src/assetgen/kit/cinzel-700.woff2");
const FONT = `"Cinzel",Georgia,serif`;

function html(layout: Layout, k: ReturnType<typeof makeKit>, a: KitAssets, pixelated = false): string {
  const pixCss = pixelated ? "img{image-rendering:pixelated}#viewport{image-rendering:pixelated}" : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>${layout.name} — playable</title>
<style>${FONT_FACE}${stageCss(a["bg-castle"].dataUri)}${screenBaseCss(FONT)}${layout.pageCss(FONT)}${zoneCssFor(layout)}${k.css}${pixCss}</style></head>
<body><div id="viewport"><div id="stage">${layout.screens(k, a)}</div></div>
<script>window.FbPlayableAd=window.FbPlayableAd||{onCTAClick:function(){try{console.log("[FbPlayableAd] onCTAClick (stub)")}catch(e){}}};</script>
<script>
  var cur=document.querySelector('.screen.active')?.id||'';
  function go(id){var a=document.getElementById(cur),b=document.getElementById(id);
    if(a)a.classList.remove('active');if(b)b.classList.add('active');cur=id;}
  function cta(){try{window.FbPlayableAd.onCTAClick();}catch(e){}}
  function endCard(){cta();}
  if(/zones/.test(location.search+location.hash))document.body.classList.add('show-zones');
</script>
<script>${stageJs()}</script></body></html>`;
}

/** Asset plan = which assets a build loads (keys + extra with sizes). It is the
 *  contract between asset resolution and the build. Extracted out of the build
 *  flow so the list is no longer hardcoded inline — a pipeline assetgen stage can
 *  produce a plan and inject it via `opts.plan` (P2-3). The default reproduces the
 *  exact previous behavior (byte-identical output — verified against .golden). */
export interface AssetPlan {
  keys: string[];
  extra: { key: string; src: string; size: number }[];
}

export function defaultAssetPlan(src: string, layout: Layout): AssetPlan {
  const bgSrc = existsSync(`${src}/bg.png`) ? `${src}/bg.png` : `${src}/bg-castle.png`;
  const heroSrc = existsSync(`${src}/hero.png`) ? `${src}/hero.png` : KNIGHT_SRC;
  return {
    keys: [...Object.keys(NINE), "banner", ...ICONS],
    extra: [
      // base: every template gets the bg + main hero
      { key: "bg-castle", src: bgSrc, size: 680 },
      { key: "knight", src: heroSrc, size: 520 },
      // template-declared extras (meta.assets) — asset list lives WITH the template
      ...(layout.meta.assets ?? []).map((as) => ({
        key: as.key,
        src: as.fallbackHero && !existsSync(as.src) ? heroSrc : as.src,
        size: as.size ?? 520,
      })),
    ],
  };
}

export type BuildKitOpts = { layout?: string; plan?: AssetPlan };

export async function buildKitPlayable(styleId = "heroes3", opts: BuildKitOpts = {}): Promise<{ html: string; assetBytes: number; layoutId: string }> {
  const layout = getLayout(opts.layout ?? DEFAULT_LAYOUT);
  logStage("build", `start.${styleId}.${layout.id}`);
  const src = `out/${styleId}`;
  const pixelated = /pixel/i.test(styleId);
  // Build reads an asset plan (injected or default). No hardcoded list in the flow.
  const plan = opts.plan ?? defaultAssetPlan(src, layout);
  logStage("build", "resolve.plan", { note: `layout=${layout.id} keys=${plan.keys.length} extra=${plan.extra.length} pixelated=${pixelated}` });

  const assets = await timed(
    "build",
    "loadKit",
    () => loadKit(src, {
      keys: plan.keys,
      extra: plan.extra,
      writeDir: ASSET_DIR,
      pixelated,
      onProgress: (key, ms, bytes) =>
        logStage("build", `load.${key}`, { durationMs: ms, bytes }),
    }),
    { bytesFromResult: kitBytes, note: "sharp: trim→resize→webp + dataURI" }
  );

  const kitInstance = await timed("build", "makeKit", () => makeKit(assets, { font: FONT }), {
    note: `${Object.keys(assets).length} assets ready`,
  });
  const htmlStr = await timed(
    "build",
    `compose.html.${layout.id}`,
    () => html(layout, kitInstance, assets, pixelated),
    { bytesFromResult: (s) => Buffer.byteLength(s, "utf8") }
  );
  return { html: htmlStr, assetBytes: kitBytes(assets), layoutId: layout.id };
}

async function main() {
  const styleId = process.argv[2] ?? "heroes3";
  const layoutId = process.argv[3] ?? DEFAULT_LAYOUT;
  const { html: out, assetBytes } = await buildKitPlayable(styleId, { layout: layoutId });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/index.html`, out);
  const kb = Buffer.byteLength(out, "utf8") / 1024;
  console.log(`assets: ${(assetBytes / 1024).toFixed(1)} KB`);
  console.log(`index.html: ${kb.toFixed(1)} KB (${(kb / 2048 * 100).toFixed(1)}% of 2MB)`);
  console.log(`-> ${OUT}/index.html`);
}

const invokedAsScript = process.argv[1]?.endsWith("build-test-playable.ts") || process.argv[1]?.endsWith("build-test-playable.js");
if (invokedAsScript) {
  main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
}
