/**
 * Playable Design Zones — формалізована «сітка безпеки» для layout-ів.
 *
 * Це АДАПТАЦІЯ industry-стандартів:
 *   • Apple HIG safe areas (status bar 44px, home indicator 34px)
 *   • Mintegral playable spec (90% safe inner, CTA bottom 20%, no-text near home gesture)
 *   • Steven Hoober thumb-zones research (easy reach = bottom third)
 *   • Material Design 4dp/8dp grid
 *
 * Усе в фіксованих px відносно DESIGN canvas 400×860.
 * Координати — top-left origin (як CSS/Canvas).
 */

// Дублюється з lint.ts щоб уникнути циркулярного імпорту (zones ← lint ← zones).
// Source of truth — конкретно ці константи — synchronized по обох файлах.
const DESIGN_W = 400;
const DESIGN_H = 860;

export type ZoneId =
  | "safe-top"        // ❌ no interactive — статус-бар / нотч на реальних девайсах
  | "topbar"          // ✅ icons/badges only — settings, counters, back
  | "hero"            // ✅ main visual area (sprite, character)
  | "content"         // ✅ text, panels, grid, features
  | "cta"             // ✅ primary CTA STICKY — install button лежить ТУТ
  | "safe-bottom";    // ❌ no interactive — home gesture area

export type ZoneRect = { x: number; y: number; w: number; h: number };
export type ZoneDef = {
  id: ZoneId;
  /** прямокутник у px design-canvas */
  rect: ZoneRect;
  /** список класів які можна тут розміщувати; порожній = «нема обмежень»; null = «нічого не можна» */
  allow?: string[];
  /** список класів які ЗАБОРОНЕНІ у цій зоні */
  forbid?: string[];
  /** опис для лога */
  hint: string;
};

/**
 * Базовий набір зон. Координати ретельно підібрані під canvas 400×860:
 *   • safe-top 0..40   (≈ iOS status bar = 44px на 393×852, ми трохи менші)
 *   • safe-bottom 828..860 (≈ iOS home indicator = 34px)
 *   • cta zone 720..828 (≈ 12% canvas снизу, узгоджується з sticky CTA pattern)
 *
 * Зони можуть ПЕРЕКРИВАТИСЯ: hero (100..480) і content (320..720) перетинаються —
 * це навмисно, бо герой над текстом-описом — типовий патерн.
 */
export const ZONES: ZoneDef[] = [
  {
    id: "safe-top",
    rect: { x: 0, y: 0, w: 400, h: 40 },
    forbid: ["c-btn", "c-pill", "icon"],
    hint: "iOS status bar / notch — ніяких клікабельних елементів. Контент не критичний.",
  },
  {
    id: "topbar",
    rect: { x: 16, y: 16, w: 368, h: 80 },
    allow: ["icon", "c-pill"],
    forbid: ["c-btn", "c-panel"],
    hint: "Іконки (settings/back), pill-лічильники (gold/lives), брендинг. БЕЗ великих кнопок.",
  },
  {
    id: "hero",
    rect: { x: 24, y: 100, w: 352, h: 380 },
    forbid: ["c-btn"],
    hint: "Головний візуал — герой, продукт, ілюстрація. Не для кнопок (CTA жде в cta zone).",
  },
  {
    id: "content",
    rect: { x: 16, y: 320, w: 368, h: 400 },
    hint: "Текст, панелі, фічі-сітка, лічильники. Гнучка зона — може перекриватися з hero.",
  },
  {
    id: "cta",
    rect: { x: 24, y: 720, w: 352, h: 108 },
    allow: ["c-btn"],
    hint: "Primary CTA (Install Free). Розташований у sticky-bottom щоб гарантовано бути видимим.",
  },
  {
    id: "safe-bottom",
    rect: { x: 0, y: 828, w: 400, h: 32 },
    forbid: ["c-btn", "c-pill", "icon"],
    hint: "iOS home gesture area — нічого клікабельного. Тільки візуальний fill.",
  },
];

export function getZone(id: ZoneId): ZoneDef {
  const z = ZONES.find((x) => x.id === id);
  if (!z) throw new Error(`unknown zone ${id}`);
  return z;
}

export type BoundingRect = { left: number; top: number; right: number; bottom: number };

/** Чи rect повністю всередині зони (з толерантністю). */
export function inZone(rect: BoundingRect, zone: ZoneDef, tol = 2): boolean {
  const z = zone.rect;
  return (
    rect.left >= z.x - tol &&
    rect.top >= z.y - tol &&
    rect.right <= z.x + z.w + tol &&
    rect.bottom <= z.y + z.h + tol
  );
}

/** Чи rect ПЕРЕКРИВАЄ зону (хоч би 1px). */
export function overlaps(rect: BoundingRect, zone: ZoneDef): boolean {
  const z = zone.rect;
  return !(rect.right <= z.x || rect.left >= z.x + z.w || rect.bottom <= z.y || rect.top >= z.y + z.h);
}

/** Площа rect (для визначення «mostly in» — типу 70%+ всередині). */
export function area(rect: BoundingRect): number {
  return Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top);
}

/** Площа перекриття rect із зоною (для співвідношення overlap/area). */
export function overlapArea(rect: BoundingRect, zone: ZoneDef): number {
  const z = zone.rect;
  const ox = Math.max(0, Math.min(rect.right, z.x + z.w) - Math.max(rect.left, z.x));
  const oy = Math.max(0, Math.min(rect.bottom, z.y + z.h) - Math.max(rect.top, z.y));
  return ox * oy;
}

/** Чи елемент «переважно у зоні» (≥ 70% площі перекривається). */
export function mostlyInZone(rect: BoundingRect, zone: ZoneDef, threshold = 0.7): boolean {
  const a = area(rect);
  if (a === 0) return false;
  return overlapArea(rect, zone) / a >= threshold;
}

/** Зона для класу — куди він повинен лежати за allow-списком (повертає першу що allow'ить клас). */
export function zoneForAllowedClass(className: string): ZoneDef | null {
  for (const z of ZONES) {
    if (z.allow?.some((c) => className.includes(c))) return z;
  }
  return null;
}

/** Список зон що ЗАБОРОНЯЮТЬ елемент із цим класом. */
export function forbiddenZonesForClass(className: string): ZoneDef[] {
  return ZONES.filter((z) => z.forbid?.some((c) => className.includes(c)));
}

/** SVG overlay для debug — малює всі зони з прозорою заливкою. */
export function zonesOverlaySvg(): string {
  const colors: Record<ZoneId, string> = {
    "safe-top": "#f85149",
    topbar: "#79c0ff",
    hero: "#d2a8ff",
    content: "#3fb950",
    cta: "#ffd400",
    "safe-bottom": "#f85149",
  };
  const rects = ZONES.map((z) => {
    const fill = colors[z.id];
    const opacity = z.id === "safe-top" || z.id === "safe-bottom" ? 0.25 : 0.10;
    return `<rect x="${z.rect.x}" y="${z.rect.y}" width="${z.rect.w}" height="${z.rect.h}" fill="${fill}" fill-opacity="${opacity}" stroke="${fill}" stroke-width="2" stroke-dasharray="4 4"/><text x="${z.rect.x + 6}" y="${z.rect.y + 18}" font-family="monospace" font-size="11" fill="${fill}" font-weight="bold">${z.id}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${DESIGN_W}" height="${DESIGN_H}" viewBox="0 0 ${DESIGN_W} ${DESIGN_H}" style="position:absolute;inset:0;pointer-events:none;z-index:9999">${rects}</svg>`;
}
