# Template Standard (T-01)

**Чинний.** Визначає слово «**шаблон**»: що гра МУСИТЬ мати, щоб бути промоутованою
з `labs/` у `templates/`. Це ворота промоції (`templates/README.md`) і вхідний контракт
для Mechanics catalog (епік D).

---

## 1. Визначення

**Lab-чернетка** (`labs/<гра>/`) — будь-який експеримент: може бути зламана, без тестів,
у будь-якому форматі. Живе тут за замовчуванням.

**Шаблон** (`templates/<гра>/`) — гра, що пройшла ВСІ ворота нижче (§2-§5). Її можна
запускати через `forge`/pipeline на будь-якому стилі й бути впевненим у результаті.
**Критерій однозначний: шаблон = маніфест валідний (§2) + структура (§3) + патерни (§4) + усі gate зелені (§5).** Не пройшов хоч одне — лишається в labs.

## 2. Обов'язкові поля `manifest.json`

```jsonc
{
  "id": "tap-the-coin",          // машинна, == ім'я теки; [a-z0-9-]
  "name": "Tap the Coin",        // людська
  "description": "...",          // 1 речення: що за механіка
  "entry": "game.ts",            // точка входу (рендерить екрани)
  "assetBudgetBytes": 1468006,   // ліміт сирих ассетів (перед base64); guard проти 2MB
  "params": { "tapsToWin": 8 }   // тюнінг-параметри з дефолтами
}
```
Обов'язкові: `id · name · description · entry · assetBudgetBytes · params`. `id` мусить
дорівнювати імені теки. `assetBudgetBytes` ≤ такий, щоб фінал ≤ 2 MB (base64 +33%).

## 3. Структурні вимоги

- **Zone-driven:** екрани розкладені через зони (`meta.zoneTypes`), не ad-hoc координати.
- **Ассети декларовані:** `meta.assets` (а не хардкод у білдері).
- **Один primary CTA** на «фінальному» екрані, що кличе `FbPlayableAd.onCTAClick()`.
- **Обов'язковий endcard/CTA-екран** з install-дією.
- **pageCss — лише візуал** (спільне — у `kit/screen-css.ts`); позиціонування — зони.
- **Ліміт екранів:** 1-15 (Q26/Q27). **Вага:** фінальний HTML ≤ 2 MB (single-file).

## 4. Стандарт ВИГЛЯДУ по архетипах

Що ПОВИНЕН містити кожен тип екрана (з досвіду 11 шаблонів):

| Архетип | Обов'язкові елементи | Правила / ліміти |
|---|---|---|
| `endcard` | hero + 1 primary CTA + tagline | hero ≤ `maxHeroPx`; **текстовий** title (banner вищий за band) |
| `menu` | banner у title + nav-кнопки в actions | `enforceZones:false` (кнопки центр) |
| `pick-hero` | hero + перемикач (◀▶/dots) + персональна CTA | текстовий title; hero ≤ stage |
| `grid` (feature) | заголовок + ≤4 картки 2×2 + CTA | картки = **compact frame** (`border-width:16px`) |
| `split` (two-choice) | 2 рівноваги-опції + CTA | опції-картки compact |
| `immersive` (tap/progress/tutorial) | великий hero/контент + CTA | counter/dots → title; hero → stage |
| `focal` | дрібний центр-акцент + великий CTA-блок | для коротких reward-екранів |

**Універсально:** thumb-зона для primary CTA (`actions`), tap-таргети ≥44px, safe-поля,
HUD лише в кутах. Перевіряється `check:layouts`.

## 5. Якісні ворота (усі мають бути зелені)

| Ворота | Команда | Критерій |
|---|---|---|
| Типи | `npm run typecheck` | 0 помилок |
| Зони/overflow | `npm run check:layouts -- <html> <id>` | PASS (no-overflow, CTA-in-actions, ≥44px, hero-fits) |
| Viewport | `npm run visual` | ALL PASS на 8 viewport-ах |
| Вага | (білдер друкує) | ≤ 2 MB |
| Ручний | `MANUAL-QA.md` | анімація/тап/CTA працюють очима |

## 6. Усталені патерни (кодифіковано з Z-міграції)

- Тонкий title-band → **текстовий заголовок**, не banner-стрічка.
- Дрібні картки → **compact frame** (`border-width:16px`; дефолт 40px завеликий).
- Nav-меню (кнопки в центрі) → `enforceZones:false`.
- Спільний CSS → `kit/screen-css.ts`, не дублювати в шаблоні.
- Великий герой → `immersive`/`battle`; CTA-важкий екран → `endcard`/`focal`.

## 7. Процес промоції `labs/` → `templates/`

1. Гра в `labs/<гра>/` доведена (працює, тести зелені).
2. Привести до §2 (manifest) + §3 (структура) + §4 (вигляд) + §6 (патерни).
3. Прогнати §5 (усі ворота зелені).
4. **Прямий запит** на промоцію.
5. `git mv labs/<гра> templates/<гра>` → зареєструвати → запис у BUILD-LOG.

> Поточні `templates/tap-the-coin`, `plug-in-socket`, `mad-mage-tower`, `fruit-bonanza*`
> створені ДО стандарту → формально це labs. Привести до §2-§6 або перенести в `labs/` (S-02).

---
**Пов'язане:** `playable-design-rules.md` (lint-правила) · `layout-authoring-guide.md` (кроки) ·
`SYSTEMS.md` (дві системи + labs-first) · `PRODUCT-PLAN.md` (епік D будується на цьому).
