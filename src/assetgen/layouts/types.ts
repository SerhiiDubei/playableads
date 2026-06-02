import type { KitAssets } from "../kit/kit.js";
import type { makeKit } from "../kit/kit.js";

export type Kit = ReturnType<typeof makeKit>;

/**
 * Layout = чистий композитор екранів playable з kit-компонентів.
 * Кожен layout не знає де живуть assets, не знає про OpenAI, не знає про
 * валідацію — він тільки рендерить HTML фрагмент `<section>...</section>`
 * для всіх своїх екранів. Стиль навколо, init-скрипти і Meta-stub додає
 * buildKitPlayable.
 */
export type Layout = {
  /** Машинна id, напр. "menu5", "endcard", "tutorial" */
  id: string;
  /** Людська назва для лога/каталогу */
  name: string;
  /** Опис: який це формат playable, для чого */
  description: string;
  /** Page-scoped CSS (інжектиться в <style> після kit CSS). Фіксовані px у design-canvas 400×860. */
  pageCss: (font: string) => string;
  /** Повертає HTML усіх <section class="screen"> екранів. Перший має бути `active`. */
  screens: (k: Kit, a: KitAssets) => string;

  /**
   * Метадані для системи перевірок (PDS lint). Кожен layout повинен бути
   * саморобчосним: знати які в нього екрани, що CTA повинно бути, як його
   * шукати на сторінці.
   */
  meta: LayoutMeta;
};

export type LayoutMeta = {
  /** Список id всіх екранів цього layout у порядку показу. Перший має `active` за дефолтом. */
  screenIds: string[];
  /** Чи треба обов'язково мати primary CTA (кнопку що викликає `cta()` / endCard). */
  hasCta: boolean;
  /** Очікувані тексти primary CTA (lint валідує що принаймні один знайдено серед .c-btn). */
  primaryCtaTexts?: string[];
  /** Які екрани треба перевіряти на overflow (за замовчуванням — всі). */
  lintScreens?: string[];
  /** Опційно: максимальна допустима висота hero для цього layout (px у design canvas). */
  maxHeroPx?: number;
  /**
   * Чи застосовувати STRICT zone-rules:
   *   • primary-cta-in-cta-zone (CTA з install-текстом повинна сидіти в bottom 720..828)
   *   • zone-forbidden-respected (кнопки забороняються у hero/topbar zone, тощо)
   *
   * Default: true (новий layout = endcard-style, де CTA фіксований).
   * Виставляй false ТІЛЬКИ якщо це navigation menu (як `menu5`) де кнопки
   * по центру — це і є дизайн.
   */
  enforceZones?: boolean;
  /**
   * Zone-driven placement: map screenId -> archetype in kit/layout.ts
   * (`menu` | `pick-hero` | `endcard` | …). When present, the builder injects the
   * zone CSS for those archetypes and the template's screens place content via
   * `zone("actions", …)` instead of ad-hoc CSS. Absent = legacy ad-hoc layout
   * (lets templates migrate to zones one at a time).
   */
  zoneTypes?: Record<string, string>;
};
