# Must-have mechanics — v1 (PRE-3)

Вхідний список для **Mechanics catalog (епік D)**. v1 = **10+ механік**, архітектурно
без обмеження (Q11). Статус коду: ✅ готовий zone-шаблон · 🧪 lab-гра (потребує промоції за T-01).

> «Механіка» = формат playable + його екрани + психологія, чому він конвертить.

## A. Готові (zone-shipped, 11 шаблонів)

| # | Механіка | Що робить | Архетип(и) | Екрани | Чому конвертить |
|---|----------|-----------|-----------|--------|-----------------|
| 1 | **endcard** ✅ | BG + hero + домінантний Install | `endcard` | endcard | найпростіший, baseline |
| 2 | **tap-reveal** ✅ | тапни героя 5× → reward | `immersive` | tap, reward | engagement→install, **CTR 5-10%** |
| 3 | **pick-hero** ✅ | вибір з 3 героїв (◀▶), персональна CTA | `pick-hero` | pick | ownership-ефект |
| 4 | **progress-reveal** ✅ | XP-бар наповнюється → level-up | `immersive` | xp, levelup | loss-aversion (вже отримав прогрес) |
| 5 | **two-choice** ✅ | 2 рівноваги-опції → той самий CTA | `split` | choose, outcome | agency, знижує bounce |
| 6 | **match-cluster** ✅ | фейк-match-3 (тап плиток) → reveal | `grid`+`immersive` | board, reveal | «я вже граю це» (casual) |
| 7 | **feature-grid** ✅ | 2×2 фіч-картки + CTA | `grid` | features | для багатих механік, швидкий огляд |
| 8 | **feature-list** ✅ | 3 рядки фіч (довший опис) + CTA | `grid` | features | strategy/RPG, де фіча потребує пояснення |
| 9 | **tutorial** ✅ | 3-крокове онбординг із dots | `immersive` | t1, t2, t3 | веде за руку до Install |
| 10 | **menu5** ✅ | 5-екранне nav-меню гри | `menu`+`pick-hero` | menu/game/battle/shop/options | «справжня гра» feel |

## B. Інтерактивні ігри (lab → промоція за T-01)

| # | Механіка | Що робить | Стан |
|---|----------|-----------|------|
| 11 | **tap-the-coin** 🧪 | тапни монету N разів → ціль → CTA | lab (`templates/tap-the-coin`, до стандарту) |
| 12 | **connect / plug-in-socket** 🧪 | drag-to-connect, 3 рівні, juice | lab |
| 13 | **mad-mage-tower** 🧪 | crane tower-stacking | lab |
| 14 | **fruit-bonanza** 🧪 | tumble-слот, pays anywhere, free spins | lab (задеплоєний) |

## Для епіку D (catalog)
- **Реєстр:** A-список (1-10) — це вже `layouts/` (zone-driven, готові). B-список — кандидати на промоцію.
- **scaffold + AI-fill:** механіка = структура (зони/екрани) + AI наповнює контент/копірайт.
- **Комбінація 2 механік** (Q13): напр. `tap-reveal` + `feature-grid` = тап→reward з фіч-сіткою.
- **dev vs user режим** (Q14): dev бачить усі 14 + код; user — куратований топ.

> Це **чернетка-дефолт** із наявного. Фінальний must-have-набір — твоє рішення (можеш викинути/додати).
