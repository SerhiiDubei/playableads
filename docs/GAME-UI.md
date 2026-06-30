# Game-UI — офіційний UI-набір для ІГОР (гілка B)

> Єдине джерело UI для game-лабів (Pixi-ігор). Меню / ендкарди / HUD у грі беруться
> ЗВІДСИ, а не малюються «з голови». Це канон, не фріланс (див. `ANTIPATTERNS.md` A1).
> Файл: [`src/assetgen/kit/ui.ts`](../src/assetgen/kit/ui.ts).
>
> (Гілка A — меню-демо — має СВІЙ набір `kit.ts`, описаний у `KIT.md`. Не плутати.)

## Чому DOM/CSS, а не Pixi-малювання

UI гри — це **HTML/CSS-шар поверх Pixi-канви**, не примітиви `Graphics`. CSS дає
справжні тіні, градієнти, blur, flex і керування шрифтом за один `<style>`. Канва —
для гри, DOM — для UI. Стилі інжектяться в рантаймі → плейбл лишається одним файлом
(Meta-safe).

## Як використати (з `labs/<id>/game.ts`)

```ts
import { buildEndcard } from "../../src/assetgen/kit/ui.js";

buildEndcard({
  brand: "SafeDrive Insurance",
  avoided, total: TOTAL,            // рахунок для датчика
  headline: "Good drivers still need insurance.",
  subline: `You dodged ${avoided} of ${TOTAL} — the last one wasn't your call.`,
  ctaText: cfg.copy.cta,
  trustText: "2-min quote · no obligation",
  onCta: () => window.FbPlayableAd.onCTAClick(),
});
```

## Що всередині (компоненти)

- **overlay** — повноекранний шар із градієнтним бекдропом (ховає гру за собою).
- **card** — картка результату (тінь, рамка, токени-кольори).
- **score gauge** — приладовий датчик (тики + сегменти won/lost, sweep-анімація як
  self-test приладів, count-up числа). Сигнатура стилю «приладова панель».
- **brand badge** — щит + назва (eyebrow, signage-caps).
- **divider** — пунктир «дорожня розмітка».
- **CTA** — градієнтна кнопка з шевроном і подихом.
- **trust** — мікрорядок під CTA.

Дизайн-токени — CSS-перемінні в `.pw-card` (`--go`, `--stop`, `--lane`, `--muted`).
Під інший бренд — перевизначаєш токени, структуру лишаєш.

## Правила набору (HARD)

1. **Розширюй набір, не дублюй у лабі.** Потрібен новий екран (start screen, HUD-чіпи) —
   додаєш нову функцію-білдер у `ui.ts`, що перевикористовує ті самі токени. НЕ пишеш
   власний UI в `game.ts`.
2. **Динамічний текст — лише `textContent`** (без `innerHTML`-інтерполяції → нема XSS).
   `innerHTML` лише для власного статичного SVG.
3. **Весь overlay клікабельний → `onCTAClick`** (Meta best-practice), плюс кнопка.
4. **`prefers-reduced-motion`** — анімації вимикаються, показується фінальний стан.
5. **Single-file** — стилі через `injectUiKit()`, без зовнішніх файлів/шрифтів (хіба інлайн).

## Дорожня карта набору (борг)

- [ ] HUD (таймер, лічильник, пипки) — зараз у `avoid-the-accident` намальований Pixi;
      перевести на game-UI як компонент (станція 7 плану консолідації).
- [ ] Start / intro screen.
- [ ] `life-umbrella-drag-catch` ендкард → на цей набір (зараз власний Pixi).

## Хто вже використовує

- `labs/avoid-the-accident` — ендкард через `buildEndcard` (HUD ще Pixi — у міграції).
