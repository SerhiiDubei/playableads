// Layout zoning: BASE (універсальні правила) ⊕ ARCHETYPE (під тип екрану).
// Екран оголошує screenType -> resolveLayout дає зони -> компоненти лягають у зони, не ad-hoc.
import { DESIGN } from "./stage.js";
import { deepMerge } from "../compose.js";

export type Zone = {
  top: number; bottom: number;          // частки висоти DESIGN
  align?: "start" | "center" | "end";   // cross-axis
  justify?: "start" | "center" | "end" | "between";
  gap?: number; row?: boolean;
};
export type Layout = {
  type: string;
  safe: { top: number; bottom: number; left: number; right: number };
  zones: Record<string, Zone>;
  rules: { minTapPx: number; primaryZone: string };
};

// Інваріанти — діють на КОЖНОМУ екрані (thumb-зона, safe-поля, HUD у кутах).
const BASE: Layout = {
  type: "base",
  safe: { top: 0.05, bottom: 0.04, left: 0.06, right: 0.06 },
  zones: {
    hud: { top: 0.0, bottom: 0.14, row: true, justify: "between", align: "center" },
    title: { top: 0.14, bottom: 0.30, align: "center", justify: "center" },
    stage: { top: 0.30, bottom: 0.62, align: "center", justify: "center", gap: 14 },
    actions: { top: 0.62, bottom: 0.88, align: "center", justify: "center", gap: 13 }, // 🟢 thumb
    footer: { top: 0.88, bottom: 1.0, align: "center", justify: "center" },
  },
  rules: { minTapPx: 44, primaryZone: "actions" },
};

// Специфіка під тип екрану (оверрайди зон поверх BASE).
const ARCHETYPES: Record<string, Partial<Layout>> = {
  menu: {
    zones: {
      hud: { top: 0.0, bottom: 0.16, row: true, justify: "between", align: "center" },
      title: { top: 0.16, bottom: 0.40, align: "center", justify: "center" },
      stage: { top: 0.40, bottom: 0.46, align: "center", justify: "center" },
      actions: { top: 0.46, bottom: 0.94, align: "center", justify: "center", gap: 11 },
    } as Record<string, Zone>,
  },
  "pick-hero": {
    zones: {
      hud: { top: 0.0, bottom: 0.13, row: true, justify: "between", align: "center" },
      title: { top: 0.13, bottom: 0.22, align: "center", justify: "center" },
      stage: { top: 0.22, bottom: 0.70, align: "center", justify: "center", gap: 12 },
      actions: { top: 0.70, bottom: 0.93, align: "center", justify: "center" },
    } as Record<string, Zone>,
  },
  endcard: {
    zones: {
      hud: { top: 0.0, bottom: 0.13, row: true, justify: "between", align: "center" },
      title: { top: 0.13, bottom: 0.23, align: "center", justify: "center" },
      stage: { top: 0.21, bottom: 0.70, align: "center", justify: "center" },
      actions: { top: 0.70, bottom: 0.93, align: "center", justify: "center" },
    } as Record<string, Zone>,
  },

  // ── експериментальні архетипи: різні художні підходи до організації екрана (усі в межах зон) ──
  // 1. immersive — арт-домінанта: герой майже на весь екран, UI мінімальний, 1 CTA внизу
  immersive: {
    zones: {
      hud: { top: 0.0, bottom: 0.13, row: true, justify: "between", align: "center" },
      title: { top: 0.13, bottom: 0.22, align: "center", justify: "center" },
      stage: { top: 0.16, bottom: 0.80, align: "center", justify: "center" },
      actions: { top: 0.80, bottom: 0.95, align: "center", justify: "center" },
    } as Record<string, Zone>,
  },
  // 2. focal — мінімалізм: лого по центру, багато «повітря», фокус на одній дії
  focal: {
    zones: {
      hud: { top: 0.0, bottom: 0.13, row: true, justify: "between", align: "center" },
      title: { top: 0.20, bottom: 0.40, align: "center", justify: "center" },
      stage: { top: 0.40, bottom: 0.56, align: "center", justify: "center" },
      actions: { top: 0.60, bottom: 0.86, align: "center", justify: "center", gap: 12 },
    } as Record<string, Zone>,
  },
  // 3. split — дашборд: HUD-валюта зверху, портрет + статпанель, стек дій
  split: {
    zones: {
      hud: { top: 0.0, bottom: 0.15, row: true, justify: "between", align: "center" },
      title: { top: 0.15, bottom: 0.22, align: "center", justify: "center" },
      stage: { top: 0.22, bottom: 0.66, align: "center", justify: "center", gap: 10 },
      actions: { top: 0.66, bottom: 0.95, align: "center", justify: "center", gap: 9 },
    } as Record<string, Zone>,
  },
  // 4. grid — галерея вибору: сітка карток у stage, 1 CTA-підтвердження
  grid: {
    zones: {
      hud: { top: 0.0, bottom: 0.13, row: true, justify: "between", align: "center" },
      title: { top: 0.13, bottom: 0.21, align: "center", justify: "center" },
      stage: { top: 0.21, bottom: 0.76, align: "center", justify: "center" },
      actions: { top: 0.76, bottom: 0.95, align: "center", justify: "center" },
    } as Record<string, Zone>,
  },
  // battle — ігровий екран: тап-ціль домінує в stage, HP-gauge у actions, інструкція в title
  battle: {
    zones: {
      hud: { top: 0.0, bottom: 0.13, row: true, justify: "between", align: "center" },
      title: { top: 0.13, bottom: 0.20, align: "center", justify: "center" },
      stage: { top: 0.20, bottom: 0.80, align: "center", justify: "center" },
      actions: { top: 0.80, bottom: 0.95, align: "center", justify: "center" },
    } as Record<string, Zone>,
  },
  // puzzle — drag-to-connect: сокети зверху + фішки знизу в stage (justify between), actions вільна
  puzzle: {
    zones: {
      hud: { top: 0.0, bottom: 0.13, row: true, justify: "between", align: "center" },
      title: { top: 0.13, bottom: 0.21, align: "center", justify: "center" },
      stage: { top: 0.21, bottom: 0.92, align: "center", justify: "between" },
      actions: { top: 0.92, bottom: 0.97, align: "center", justify: "center" },
    } as Record<string, Zone>,
  },
  // 5. dense — аркадне меню: стек із багатьох кнопок, stage стиснутий
  dense: {
    zones: {
      hud: { top: 0.0, bottom: 0.14, row: true, justify: "between", align: "center" },
      title: { top: 0.14, bottom: 0.21, align: "center", justify: "center" },
      stage: { top: 0.21, bottom: 0.30, align: "center", justify: "center" },
      actions: { top: 0.30, bottom: 0.96, align: "center", justify: "center", gap: 9 },
    } as Record<string, Zone>,
  },
};

export function resolveLayout(type: string): Layout {
  const L = deepMerge(BASE, ARCHETYPES[type] ?? {}) as Layout;
  L.type = type;
  return L;
}

const flex = (v?: string) =>
  v === "start" ? "flex-start" : v === "end" ? "flex-end" : v === "between" ? "space-between" : "center";

/** CSS зон, scoped під `.screen[data-type="<type>"]` (вертикальні safe-поля клампляться). */
export function zoneCss(L: Layout): string {
  const { W, H } = DESIGN;
  const left = Math.round(L.safe.left * W), right = Math.round(L.safe.right * W);
  let css = "";
  for (const [name, z] of Object.entries(L.zones)) {
    const yTop = Math.max(z.top, L.safe.top), yBot = Math.min(z.bottom, 1 - L.safe.bottom);
    const top = Math.round(yTop * H), height = Math.round((yBot - yTop) * H);
    css += `.screen[data-type="${L.type}"] .zone-${name}{position:absolute;left:${left}px;right:${right}px;top:${top}px;height:${height}px;` +
      `display:flex;flex-direction:${z.row ? "row" : "column"};align-items:${flex(z.align)};` +
      `justify-content:${flex(z.justify ?? (z.row ? "between" : "center"))};gap:${z.gap ?? 10}px}`;
  }
  return css;
}

export function zone(name: string, inner: string, cls = ""): string {
  return `<div class="zone zone-${name} ${cls}" data-zone="${name}">${inner}</div>`;
}

/** Debug-оверлей зон (видно при body.show-zones / ?zones=1). */
export function zonesOverlay(L: Layout): string {
  return Object.keys(L.zones).map((n) => `<div class="zone zone-${n} zdbg" data-zone="${n}"><span>${n}</span></div>`).join("");
}

export const OVERLAY_CSS =
  `.zone.zdbg{display:none!important}` +
  // зовнішній грід: межі КОНТЕЙНЕРА (зони) — блакитний
  `body.show-zones .zone.zdbg{display:flex!important;align-items:flex-start!important;justify-content:flex-start!important;` +
  `outline:2px dashed rgba(0,229,255,.6);background:rgba(0,229,255,.07);pointer-events:none;z-index:50}` +
  `.zone.zdbg span{font:10px/1 monospace;color:#0ff;background:#000a;padding:2px 4px;border-radius:3px;margin:3px}` +
  // внутрішній грід: як елементи сидять УСЕРЕДИНІ контейнера (вирівнювання/gap/стопка) — бурштиновий
  `body.show-zones .zone:not(.zdbg){outline:1px solid rgba(0,229,255,.22)}` +
  // УСІ шари компонента (рамка → іконка → текст → fill ...) — тонкий бурштиновий
  `body.show-zones .zone:not(.zdbg) *{outline:1px solid rgba(255,176,32,.5);outline-offset:-1px}` +
  // прямий компонент у зоні — жирніша рамка + підкладка, щоб відрізнити від вкладених шарів
  `body.show-zones .zone:not(.zdbg) > *{outline:2px dashed rgba(255,120,0,.95);outline-offset:-2px;background:rgba(255,176,32,.09)}`;
