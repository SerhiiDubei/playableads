import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import sharp from "sharp";

/** @font-face з вшитим base64-woff2 (self-contained, без мережі в playable). */
export function fontFace(name: string, woff2Path: string, weight = 700): string {
  const b64 = readFileSync(woff2Path).toString("base64");
  return `@font-face{font-family:"${name}";font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${b64}) format("woff2")}`;
}

// ── 9-slice шаблони: розтягуються в будь-який розмір. frac = частка [top,right,bottom,left]
export const NINE: Record<string, { size: number; frac: [number, number, number, number] }> = {
  "btn-frame": { size: 360, frac: [0.42, 0.20, 0.42, 0.20] },
  "panel-frame": { size: 320, frac: [0.30, 0.30, 0.30, 0.30] },
  "bar-track": { size: 360, frac: [0.42, 0.16, 0.42, 0.16] },
};
export const FIXED_DEFAULT: Record<string, number> = {
  "avatar-frame": 220, banner: 340,
  "ic-settings": 96, "ic-sound": 96, "ic-plus": 96, "ic-check": 96, "ic-close": 96, "ic-back": 96,
};

export type KitAsset = { dataUri: string; bytes: number; w: number; h: number; slice?: string };
export type KitAssets = Record<string, KitAsset>;

async function toWebp(pipe: sharp.Sharp): Promise<{ data: Buffer; w: number; h: number }> {
  const r = await pipe.webp({ quality: 82, alphaQuality: 90 }).toBuffer({ resolveWithObject: true });
  return { data: r.data, w: r.info.width, h: r.info.height };
}
const uri = (b: Buffer) => `data:image/webp;base64,${b.toString("base64")}`;

/** ML background removal (для портретів/бюстів, де ізоляція в генерації не тримається). Lazy-import важкої моделі. */
export async function stripBackground(src: string | Buffer): Promise<Buffer> {
  const { removeBackground } = await import("@imgly/background-removal-node");
  const blob = await removeBackground(src as any);
  return Buffer.from(await blob.arrayBuffer());
}

/** Оптимізує всі потрібні шаблони + (опційно) додаткові fixed-зображення (напр. портрет cover). */
export async function loadKit(
  srcDir: string,
  opts: { keys?: string[]; fixed?: Record<string, number>; extra?: { key: string; src: string; size: number; cover?: boolean; strip?: boolean }[]; writeDir?: string; pixelated?: boolean } = {}
): Promise<KitAssets> {
  const assets: KitAssets = {};
  const fixed = opts.fixed ?? FIXED_DEFAULT;
  const want = opts.keys ?? [...Object.keys(NINE), ...Object.keys(fixed)];
  const rk = opts.pixelated ? { kernel: "nearest" as const } : {}; // nearest для пікс-арту
  if (opts.writeDir) mkdirSync(opts.writeDir, { recursive: true });
  const save = (key: string, data: Buffer) => { if (opts.writeDir) writeFileSync(`${opts.writeDir}/${key}.webp`, data); };

  for (const key of want) {
    if (NINE[key]) {
      const c = NINE[key];
      const { data, w, h } = await toWebp(sharp(`${srcDir}/${key}.png`).trim().resize({ width: c.size, height: c.size, fit: "inside", withoutEnlargement: true, ...rk }));
      const [t, ri, b, l] = c.frac;
      assets[key] = { dataUri: uri(data), bytes: data.length, w, h, slice: `${Math.round(h * t)} ${Math.round(w * ri)} ${Math.round(h * b)} ${Math.round(w * l)}` };
      save(key, data);
    } else if (fixed[key]) {
      const m = fixed[key];
      const { data, w, h } = await toWebp(sharp(`${srcDir}/${key}.png`).trim().resize({ width: m, height: m, fit: "inside", withoutEnlargement: true, ...rk }));
      assets[key] = { dataUri: uri(data), bytes: data.length, w, h };
      save(key, data);
    }
  }
  for (const e of opts.extra ?? []) {
    const input = e.strip ? await stripBackground(e.src) : e.src;
    const { data, w, h } = await toWebp(sharp(input).trim().resize({ width: e.size, height: e.size, fit: e.cover ? "cover" : "inside", ...rk }));
    assets[e.key] = { dataUri: uri(data), bytes: data.length, w, h };
    save(e.key, data);
  }
  return assets;
}

export const kitBytes = (a: KitAssets) => Object.values(a).reduce((s, x) => s + x.bytes, 0);

/** Фабрика кіту: повертає CSS + render-функції компонентів, прив'язані до набору ассетів. */
export function makeKit(a: KitAssets, opts: { font?: string } = {}) {
  const u = (k: string) => a[k].dataUri;
  const font = opts.font ?? `Georgia,"Times New Roman",serif`;

  const css = `
  .gold{color:#f7ead0;text-shadow:0 1px 0 #6b4a1e,0 2px 3px rgba(0,0,0,.55)}
  .k-row{display:flex;gap:14px;align-items:center;flex-wrap:wrap}

  .c-banner{position:relative;width:100%;max-width:340px;aspect-ratio:${a.banner ? a.banner.w + "/" + a.banner.h : "340/180"};margin:0 auto}
  .c-banner img{width:100%;display:block;filter:drop-shadow(0 4px 6px #0008)}
  .c-banner .t{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:${font};
    font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:24px;padding-bottom:8%}

  .c-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-family:${font};
    min-height:58px;padding:6px 22px;border-style:solid;border-width:28px 48px;border-color:transparent;white-space:nowrap;
    border-image:url(${u("btn-frame")}) ${a["btn-frame"].slice} fill;
    font-weight:700;text-transform:uppercase;font-size:17px;letter-spacing:.5px;transition:transform .12s}
  .c-btn:active{transform:scale(.95)}
  .c-btn.block{display:flex;width:100%}

  .c-panel{border-style:solid;border-width:40px;border-color:transparent;font-family:${font};
    border-image:url(${u("panel-frame")}) ${a["panel-frame"].slice} fill;padding:6px 10px}

  .c-bar{position:relative;display:flex;align-items:center;height:42px;border-style:solid;border-width:13px 26px;border-color:transparent;
    border-image:url(${u("bar-track")}) ${a["bar-track"].slice} fill}
  .c-bar .fill{height:100%;border-radius:99px;background:linear-gradient(#ffe08a,#d2922b);
    box-shadow:0 0 8px #ffd86688,inset 0 1px 0 #fff8;transition:width .4s}

  .c-pill{display:inline-flex;align-items:center;gap:8px;border-style:solid;border-width:22px;border-color:transparent;font-family:${font};
    border-image:url(${u("panel-frame")}) ${a["panel-frame"].slice} fill;padding:0 8px;min-height:30px;font-weight:700}
  .c-pill img{width:30px;height:30px}

  .c-avatar{position:relative;width:120px;height:120px}
  .c-avatar .p{position:absolute;inset:13%;width:74%;height:74%;object-fit:cover;border-radius:50%}
  .c-avatar .r{position:absolute;inset:0;width:100%;height:100%;filter:drop-shadow(0 3px 5px #0008)}

  .icon{width:60px;height:60px;cursor:pointer;filter:drop-shadow(0 3px 5px #0008);transition:transform .12s}
  .icon:active{transform:scale(.9)}
  `;

  return {
    css,
    banner: (title: string) => `<div class="c-banner"><img src="${u("banner")}"><div class="t gold">${title}</div></div>`,
    button: (text: string, onclick = "", o: { block?: boolean } = {}) =>
      `<div class="c-btn gold${o.block ? " block" : ""}" onclick="${onclick}">${text}</div>`,
    iconBtn: (key: string, onclick = "", extra = "") => `<img class="icon" src="${u(key)}" onclick="${onclick}" ${extra}>`,
    panel: (inner: string, style = "") => `<div class="c-panel"${style ? ` style="${style}"` : ""}>${inner}</div>`,
    bar: (pct: number) => `<div class="c-bar"><div class="fill" style="width:${pct}%"></div></div>`,
    pill: (iconKey: string, value: string) => `<span class="c-pill gold"><img src="${u(iconKey)}">${value}</span>`,
    avatar: (portraitKey: string) => `<div class="c-avatar"><img class="p" src="${u(portraitKey)}"><img class="r" src="${u("avatar-frame")}"></div>`,
  };
}
