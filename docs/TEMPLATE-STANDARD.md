# Template Standard (T-01) — СКЕЛЕТ

> 🚧 **Заготовка.** Це структура питань, які стандарт мусить закрити. Відповіді —
> заповнюємо ПОТІМ (T-01). Зараз тут лише полиці з підписами. Не вважати чинним.

Стандарт = **визначення слова «шаблон»**: що гра МУСИТЬ мати, щоб бути промоутованою
з `labs/` у `templates/`. Ворота промоції (див. `templates/README.md`).

---

## 1. Що таке шаблон (визначення) — TODO
- _Чим шаблон відрізняється від lab-чернетки?_
- _Мінімальний набір, щоб зватись шаблоном?_

## 2. Обов'язкові поля manifest — TODO
- _id / name / description / entry / assetBudgetBytes / params — які обов'язкові, які формати?_
- _версіонування? тег стилю? сумісні архетипи?_

## 3. Структурні вимоги — TODO
- _екрани через зони (`meta.zoneTypes`)? обов'язково?_
- _ассети декларовані (`meta.assets`)? обов'язково?_
- _обов'язковий endcard з install-CTA?_
- _ліміт екранів? ліміт ваги (2 MB)?_

## 4. Стандарт ВИГЛЯДУ по архетипах — TODO
> Що ПОВИНЕН містити кожен тип екрана + ліміти. Чернетка з досвіду 11 шаблонів:

| Архетип | Обов'язкові елементи | Ліміти / правила | Статус |
|---|---|---|---|
| `endcard` | hero + 1 primary CTA + tagline | hero ≤ maxHeroPx; текстовий title (banner завеликий) | TODO |
| `feature-grid` | заголовок + ≤4 картки 2×2 + CTA | compact-картки (border 16) | TODO |
| `feature-list` | заголовок + 3 рядки + CTA | — | TODO |
| `pick-hero` | hero + перемикач + персональна CTA | — | TODO |
| `tap-reveal` | tap-екран + reward-екран + CTA | — | TODO |
| `progress-reveal` | xp-бар + level-up + CTA | — | TODO |
| `two-choice` | 2 опції + outcome + CTA | — | TODO |
| `match-cluster` | board + reveal + CTA | — | TODO |
| `tutorial` | 3 кроки + progress dots + CTA | — | TODO |
| `menu5` / nav | топбар + банер + кнопки | `enforceZones:false` | TODO |

## 5. Якісні ворота (має пройти) — TODO
- _`check:layouts` PASS? `visual` ALL PASS? tsc? вага ≤ 2 MB?_
- _ручний QA по `MANUAL-QA.md`?_

## 6. Усталені патерни (з Z-міграції — кодифікувати) — чернетка
- Тонкий title-band → **текстовий заголовок**, не banner-стрічка.
- Дрібні картки → **compact frame** (`border-width:16px`; дефолтні 40px завеликі).
- Nav-меню (кнопки в центрі) → `enforceZones:false`.
- Спільний CSS — у `kit/screen-css.ts`, не в шаблоні.
- Великий герой → архетип `immersive`/`battle`; CTA-важкий екран → `endcard`/`focal`.

## 7. Процес промоції labs → template — TODO
- _кроки: що зробити, щоб промоутити? хто перевіряє ворота?_

---
**Пов'язане:** `playable-design-rules.md` (lint-правила) · `layout-authoring-guide.md` (кроки, ЗАСТАРІВ) ·
`SYSTEMS.md` (дві системи + labs-first) · `ROADMAP.md` (епік T).
