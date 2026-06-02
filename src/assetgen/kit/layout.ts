// Zone layout: zoning: BASE (універсальні правила) ⊕ ARCHETYPE (під тип екрану).
// Екран оголошує screenType -> resolveLayout дає зони -> компоненти лягають у зони, не ad-hoc.
import { DESIGN } from "./stage.js";
import { deepMerge } from "../compose.js";

export type Zone = {
  top: number; bottom: number;          // частки висоти DESIGN
  align?: "start" | "center" | "end";   // cross-axis
  justify?: "start" | "center" | "end" | "between";
  gap?: number; row?: boolean;
};
export type ZoneSpec = {
  type: string;
  safe: { top: number; bottom: number; left: number; right: number };
  zones: Record<string, Zone>;
  rules: { minTapPx: number; primaryZone: string };
};

// Інваріанти — діють на КОЖНОМУ екрані (thumb-зона, safe-поля, HUD у кутах).
const BASE: ZoneSpec = {
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
const ARCHETYPES: Record<string, Partial<ZoneSpec>> = {
  menu: {
    zones: {
      hud: { top: 0.0, bottom: 0.16, row: true, justify: "between", align: "center" },
      title: { top: 0.16, bottom: 0.40, align: "center", justify: "center" },
      stage: { top: 0.40, bottom: 0.50, align: "center", justify: "center" },
      actions: { top: 0.50, bottom: 0.94, align: "center", justify: "center", gap: 11 },
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
};

export function resolveLayout(type: string): ZoneSpec {
  const L = deepMerge(BASE, ARCHETYPES[type] ?? {}) as ZoneSpec;
  L.type = type;
  return L;
}

const flex = (v?: string) =>
  v === "start" ? "flex-start" : v === "end" ? "flex-end" : v === "between" ? "space-between" : "center";

/** CSS зон, scoped під `.screen[data-type="<type>"]` (вертикальні safe-поля клампляться). */
export function zoneCss(L: ZoneSpec): string {
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
export function zonesOverlay(L: ZoneSpec): string {
  return Object.keys(L.zones).map((n) => `<div class="zone zone-${n} zdbg" data-zone="${n}"><span>${n}</span></div>`).join("");
}

// ── Single source of truth for lint geometry ─────────────────────────────────
// lint.ts checks playables against the SAME zones the builder places into, so the
// checker and the placement engine can never drift. The px rects are DERIVED from
// BASE (above); allow/forbid is lint POLICY (what may live in a zone), kept here
// next to the geometry it constrains.
export type LintZone = {
  id: string;
  rect: { x: number; y: number; w: number; h: number };
  allow?: string[];
  forbid?: string[];
  hint: string;
};

function pxRect(topFrac: number, botFrac: number, fullWidth = false) {
  const { W, H } = DESIGN;
  const L = fullWidth ? 0 : Math.round(BASE.safe.left * W);
  const R = fullWidth ? 0 : Math.round(BASE.safe.right * W);
  return { x: L, y: Math.round(topFrac * H), w: W - L - R, h: Math.round(botFrac * H) - Math.round(topFrac * H) };
}

export const LINT_ZONES: LintZone[] = [
  { id: "safe-top", rect: pxRect(0, BASE.safe.top, true), forbid: ["c-btn", "c-pill", "icon"],
    hint: "iOS status bar / notch — no interactive elements." },
  { id: "topbar", rect: pxRect(BASE.safe.top, BASE.zones.hud.bottom), allow: ["icon", "c-pill"], forbid: ["c-btn", "c-panel"],
    hint: "Icons (settings/back), pill counters. No big buttons." },
  { id: "hero", rect: pxRect(BASE.zones.stage.top, BASE.zones.stage.bottom), forbid: ["c-btn"],
    hint: "Main visual — hero/product. CTA waits in the cta zone." },
  { id: "content", rect: pxRect(BASE.zones.title.top, BASE.zones.stage.bottom),
    hint: "Text, panels, feature grids. Flexible; may overlap hero." },
  { id: "cta", rect: pxRect(BASE.zones.actions.top, BASE.zones.actions.bottom), allow: ["c-btn"],
    hint: "Primary CTA — thumb-reachable actions band (same zone the builder places into)." },
  { id: "safe-bottom", rect: pxRect(1 - BASE.safe.bottom, 1, true), forbid: ["c-btn", "c-pill", "icon"],
    hint: "iOS home-gesture area — no interactive elements." },
];

export const OVERLAY_CSS =
  `.zone.zdbg{display:none!important}` +
  `body.show-zones .zone.zdbg{display:flex!important;align-items:flex-start!important;justify-content:flex-start!important;` +
  `outline:2px dashed rgba(0,229,255,.6);background:rgba(0,229,255,.07);pointer-events:none;z-index:50}` +
  `.zone.zdbg span{font:10px/1 monospace;color:#0ff;background:#000a;padding:2px 4px;border-radius:3px;margin:3px}`;
