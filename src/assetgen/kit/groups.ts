// ГРУПИ = «сім'ї» елементів зі спільними правилами. Зона каже ДЕ; група каже ХТО і ЗА ЯКИМИ ПРАВИЛАМИ.
// Екран = набір розкладок «група@зона». Композитор валідує правила → криво зібрати неможливо.
import type { makeKit } from "./kit.js";
import { zone, zonesOverlay, type ZoneSpec } from "./layout.js";
import type { Level } from "./catalog.js";

export type Intent = "navigate" | "purchase" | "claim" | "select" | "start" | "display" | "play";

export interface GroupSpec {
  id: string;
  summary: string;          // для людини/агента: що це за родина
  component: string;        // catalog id, яким рендеряться члени
  zones: string[];          // 1. КУДИ можна лягати (дозволені зони)
  max: number;              // 2. СКІЛЬКИ елементів максимум
  level: Level;             // 3+4. ІЄРАРХІЯ/вигляд за замовчуванням
  intent: Intent;           // 5. НАМІР (що робить)
  readonly?: boolean;       // не клікається (валюта/лічильники)
}

// ── РЕЄСТР ГРУП ──────────────────────────────────────────────────────────────
export const GROUPS: Record<string, GroupSpec> = {
  nav: { id: "nav", summary: "Навігація: back/close. Завжди в HUD, приглушена, повертає назад.",
    component: "icon", zones: ["hud"], max: 2, level: "tertiary", intent: "navigate" },
  currency: { id: "currency", summary: "Валюта/лічильники (золото, гем). HUD, read-only.",
    component: "pill", zones: ["hud"], max: 3, level: "default", intent: "display", readonly: true },
  heading: { id: "heading", summary: "Текстовий заголовок екрана (легкий, для коротких title-зон).",
    component: "text", zones: ["title"], max: 1, level: "default", intent: "display" },
  logo: { id: "logo", summary: "Банер-лого (важкий арт-ribbon). Лише у високих title-зонах (menu).",
    component: "banner", zones: ["title"], max: 1, level: "default", intent: "display" },
  hero: { id: "hero", summary: "Герой/персонаж на сцені. Зона stage, background-шар.",
    component: "hero", zones: ["stage"], max: 1, level: "default", intent: "display" },
  offers: { id: "offers", summary: "Товари магазину (buy ×N). Зона stage, кожен default з ціною.",
    component: "btn", zones: ["stage"], max: 6, level: "default", intent: "purchase" },
  menu: { id: "menu", summary: "Пункти головного меню. Зона actions, один primary.",
    component: "btn", zones: ["actions"], max: 6, level: "default", intent: "navigate" },
  checkout: { id: "checkout", summary: "Головна дія екрана (Buy/Claim/Install). Зона actions, ОДИН primary у thumb.",
    component: "btn", zones: ["actions"], max: 2, level: "primary", intent: "claim" },

  // ── ЕКСПЕРИМЕНТАЛЬНІ (ігрові) групи ──
  target: { id: "target", summary: "Ігровий тап-об'єкт (ворог/ціль). У stage. Це primary-дія геймплею (не кнопка).",
    component: "hero", zones: ["stage"], max: 1, level: "primary", intent: "play" },
  gauge: { id: "gauge", summary: "Живий індикатор (HP/прогрес гри). Оновлюється кодом. read-only.",
    component: "bar", zones: ["hud", "title", "actions", "stage"], max: 2, level: "default", intent: "display", readonly: true },
  slots: { id: "slots", summary: "Цілі для з'єднання (сокети/гнізда). У stage, display. Куди тягнути pieces.",
    component: "hero", zones: ["stage"], max: 6, level: "default", intent: "display" },
  pieces: { id: "pieces", summary: "Перетягувані фішки (гема/штекери). play-група — головна дія drag-гри.",
    component: "hero", zones: ["stage"], max: 6, level: "default", intent: "play" },
  progress: { id: "progress", summary: "Індикатор рівнів/кроків (• • •). Показує прогрес у послідовності.",
    component: "stepper", zones: ["hud", "title"], max: 1, level: "default", intent: "display", readonly: true },
};

// ── РЕЦЕПТ ЕКРАНА ─────────────────────────────────────────────────────────────
export type GroupItem = { label?: string; value?: string; icon?: string; onclick?: string; level?: Level; html?: string };
export type Placement = { group: string; zone: string; items: GroupItem[] };
export type Recipe = { id: string; type: string; placements: Placement[] };

type Kit = ReturnType<typeof makeKit>;

// один елемент → HTML (escape-hatch: item.html для media/hero)
function renderItem(g: GroupSpec, it: GroupItem, k: Kit): string {
  if (it.html) return it.html;
  const lvl = it.level ?? g.level;
  switch (g.component) {
    case "icon": return k.iconBtn(it.icon ?? "ic-back", it.onclick ?? "");
    case "pill": return k.pill(it.icon ?? "ic-plus", it.value ?? "");
    case "banner": return it.label ? k.banner(it.label) : "";
    case "text": return it.label ? `<div class="title">${it.label}</div>` : "";
    case "bar": return k.bar(it.value != null ? Number(it.value) : 100);
    case "btn": return k.button(it.label ?? "", it.onclick ?? "", { block: true, level: lvl === "default" ? undefined : lvl });
    case "hero": return it.html ?? "";
    case "stepper": {
      const n = it.value != null ? Number(it.value) : 3;
      return `<div class="stepper" data-total="${n}">${Array.from({ length: n }, (_, i) => `<i class="${i === 0 ? "on" : ""}"></i>`).join("")}</div>`;
    }
    default: return "";
  }
}

// ВАЛІДАЦІЯ правил груп — кидає на порушенні (краще впасти на білді, ніж криво в продакшені).
export function validateRecipe(r: Recipe): string[] {
  const errs: string[] = [];
  // фокальна дія = primary-кнопка (у звичайних групах) АБО play-група (геймплей). Має бути рівно 1.
  let focal = 0;
  for (const p of r.placements) {
    const g = GROUPS[p.group];
    if (!g) { errs.push(`${r.id}: невідома група "${p.group}"`); continue; }
    if (!g.zones.includes(p.zone)) errs.push(`${r.id}: група "${g.id}" не може лежати в зоні "${p.zone}" (дозволено: ${g.zones.join("/")})`);
    if (p.items.length > g.max) errs.push(`${r.id}: група "${g.id}" має ${p.items.length} > max ${g.max}`);
    if (g.readonly && p.items.some((it) => it.onclick)) errs.push(`${r.id}: група "${g.id}" read-only, але має onclick`);
    if (g.intent === "play") {
      // вся play-група = одна фокальна дія (тап-ціль / drag-фішки), мусить бути у stage
      focal++;
      if (p.zone !== "stage") errs.push(`${r.id}: play-група "${g.id}" має бути у stage, а вона у "${p.zone}"`);
    } else {
      for (const it of p.items) {
        if ((it.level ?? g.level) === "primary") {
          focal++;
          if (p.zone !== "actions") errs.push(`${r.id}: primary "${it.label ?? g.id}" має бути в actions (thumb-зона), а він у "${p.zone}"`);
        }
      }
    }
  }
  if (focal !== 1) errs.push(`${r.id}: має бути рівно 1 фокальна дія (primary-кнопка або play-група), знайдено ${focal}`);
  return errs;
}

// РЕЦЕПТ → HTML екрана (групи розкладаються по зонах, кожна обгорнута data-group для трасування).
export function composeScreen(r: Recipe, k: Kit, layouts: Record<string, ZoneSpec>, active = false): string {
  const errs = validateRecipe(r);
  if (errs.length) throw new Error("RECIPE INVALID:\n  " + errs.join("\n  "));
  // згрупувати розкладки по зонах (у зоні може бути кілька груп: nav + currency у hud)
  const byZone: Record<string, string[]> = {};
  for (const p of r.placements) {
    const g = GROUPS[p.group];
    const inner = p.items.map((it) => renderItem(g, it, k)).join("");
    (byZone[p.zone] ??= []).push(`<div class="grp grp-${g.id}" data-group="${g.id}" data-intent="${g.intent}">${inner}</div>`);
  }
  const zonesHtml = Object.entries(byZone).map(([z, parts]) => zone(z, parts.join(""))).join("");
  return `<section class="screen${active ? " active" : ""}" id="${r.id}" data-type="${r.type}">${zonesOverlay(layouts[r.type])}${zonesHtml}</section>`;
}
