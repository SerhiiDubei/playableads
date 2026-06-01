// БІБЛА КОМПОНЕНТІВ — опис кожного «цеглинки» kit'у.
// Двоадресна: (1) людина/агент читає, ЯК з компонентом працювати; (2) генератор ассетів
// читає `gen`, ЯК його малювати. Рендер-функції живуть у kit.ts — тут лише МЕТА-опис.
export type Level = "primary" | "default" | "tertiary";

// Шар по Z: рамка лежить ПІД контентом (фон), текст/іконка — над. Це і є «рухати взад/перед».
export type Layer = "background" | "content" | "overlay";

// Як побудований: 9-slice розтягується в будь-який розмір; fixed — фіксована картинка; text-overlay — текст поверх арту.
export type RenderKind = "nine-slice" | "fixed" | "text-overlay" | "composite";

export interface ComponentSpec {
  id: string;                 // = ім'я render-функції в makeKit() (крім media-хелперів)
  family: "action" | "container" | "display" | "indicator" | "media";
  summary: string;            // що це і коли брати
  kind: RenderKind;
  resizable: boolean;         // true → 9-slice, тягнеться під будь-який розмір; false → фіксований
  layer: Layer;               // де по Z (рамка=background під контентом)
  slots: string[];            // що кладеться всередину
  levels?: Level[];           // підтримувані рівні ієрархії
  assets: string[];           // ключі ассетів, яких потребує (з NINE/FIXED_DEFAULT)
  gen?: { size: number; prompt: string; constraints: string[] }; // рецепт генерації асету
  notes?: string;
}

// спільні правила генерації (з CLAUDE.md): gpt-image-1.5, прозорий PNG, симетрія, ізоляція
const BASE_GEN = [
  "gpt-image-1.5, transparent PNG (native alpha)",
  "isolated single object, nothing else in frame",
  "symmetric vertically + horizontally (центрування тексту залежить від цього)",
];

export const CATALOG: Record<string, ComponentSpec> = {
  btn: {
    id: "button", family: "action", kind: "nine-slice", resizable: true, layer: "background",
    summary: "Інтерактивна кнопка-дія. Рамка тягнеться 9-slice під будь-яку ширину, лейбл — поверх.",
    slots: ["label"], levels: ["primary", "default", "tertiary"], assets: ["btn-frame"],
    gen: { size: 360, prompt: "ornate fantasy UI button frame, horizontal, empty center for text", constraints: [...BASE_GEN, "9-slice safe margins: незмінні кути, тягнеться середина", "порожній центр (текст накладається кодом)"] },
    notes: "Рівні: primary (більший+glow), default, tertiary (приглушений). Текст НЕ запікати в арт.",
  },
  panel: {
    id: "panel", family: "container", kind: "nine-slice", resizable: true, layer: "background",
    summary: "Контейнер-підкладка під вкладений контент (статистика, картки, списки).",
    slots: ["children"], assets: ["panel-frame"],
    gen: { size: 320, prompt: "fantasy UI panel/parchment frame, empty interior", constraints: [...BASE_GEN, "9-slice, товсті незмінні кути", "нейтральний порожній центр"] },
    notes: "Background-шар: усе вкладене лягає поверх. Сам нічого не клікає.",
  },
  bar: {
    id: "bar", family: "indicator", kind: "nine-slice", resizable: true, layer: "background",
    summary: "Прогрес/смуга (HP, XP, gauge). Трек 9-slice + fill-шар поверх.",
    slots: ["fill", "value"], assets: ["bar-track"],
    gen: { size: 360, prompt: "fantasy UI progress bar track, empty groove", constraints: [...BASE_GEN, "9-slice горизонтальний трек", "порожня канавка під fill"] },
  },
  pill: {
    id: "pill", family: "display", kind: "nine-slice", resizable: true, layer: "background",
    summary: "Компактний бейдж «іконка + значення» (валюта, лічильник). Зазвичай read-only.",
    slots: ["icon", "value"], assets: ["panel-frame"],
    notes: "Перевикористовує panel-frame у мінімальному розмірі. Read-only за замовчуванням.",
  },
  banner: {
    id: "banner", family: "media", kind: "text-overlay", resizable: false, layer: "content",
    summary: "Заголовок-стрічка: арт-банер + текст поверх писемної смуги (локалізовний).",
    slots: ["label"], assets: ["banner"],
    gen: { size: 340, prompt: "fantasy title ribbon/banner, blank writable band in center", constraints: [...BASE_GEN, "порожня писемна смуга по центру (titleY рахується з арту)", "горизонтальний, симетричний"] },
    notes: "Текст накладається кодом на titleY — не запікати назву гри в картинку.",
  },
  icon: {
    id: "iconBtn", family: "action", kind: "fixed", resizable: false, layer: "content",
    summary: "Квадратна іконка-дія (back, settings, sound, plus, check, close).",
    slots: ["icon"], assets: ["ic-back", "ic-settings", "ic-sound", "ic-plus", "ic-check", "ic-close"],
    gen: { size: 96, prompt: "single fantasy UI icon glyph in round frame", constraints: [...BASE_GEN, "впізнаваний силует, читається на 48px"] },
  },
  avatar: {
    id: "avatar", family: "media", kind: "composite", resizable: false, layer: "composite" as any,
    summary: "Портрет у рамці: кругле фото героя + декоративна рамка поверх.",
    slots: ["portrait"], assets: ["avatar-frame"],
    notes: "Композит: портрет (нижній шар) + avatar-frame (верхній шар).",
  },
  title: {
    id: "text", family: "display", kind: "text-overlay", resizable: true, layer: "content",
    summary: "Текстовий заголовок екрана (без асету, лише стиль). Легкий, локалізовний.",
    slots: ["label"], assets: [],
    notes: "Не потребує генерації — звичайний стилізований текст. Для коротких title-зон.",
  },
  hero: {
    id: "hero", family: "media", kind: "fixed", resizable: false, layer: "background",
    summary: "Велике зображення героя/персонажа на сцені (background-шар сцени).",
    slots: ["image"], assets: ["hero"],
    gen: { size: 520, prompt: "full-body fantasy hero, heroic pose", constraints: [...BASE_GEN, "IP-anchor: назвати референс-гру", "contain, центрований, тінь додається кодом"] },
    notes: "Не kit-функція, а media-хелпер у білдері (div з background-image).",
  },
  stepper: {
    id: "stepper", family: "indicator", kind: "text-overlay", resizable: true, layer: "content",
    summary: "Індикатор прогресу рівнів/кроків (• • •). Показує, де гравець у послідовності.",
    slots: ["dots", "current"], assets: [],
    notes: "Без асету — CSS-крапки. Оновлюється кодом при зміні рівня. Зазвичай у hud/title.",
  },
  toast: {
    id: "toast", family: "display", kind: "text-overlay", resizable: true, layer: "overlay",
    summary: "Транзитна плашка-фідбек («Level Complete», «Wrong!»). Сама з'являється і зникає.",
    slots: ["label"], assets: [],
    notes: "overlay-шар поверх усього, НЕ прив'язана до зони (екранно-глобальна). Не блокує тапи.",
  },
};
