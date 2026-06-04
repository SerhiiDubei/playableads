# Fruit Ninja: 3-рівневе порівняння (прототип ↔ HTML ↔ SB3)

Джерела еталону:
- 🟦 **Наш прототип** — `labs/fruit-ninja-gen` (згенеровано зі схеми, code-only, без звуку).
- 🟨 **HTML (реальний веб)** — офіційний веб-Fruit-Ninja (візуальний еталон, gap-аналіз).
- 🟩 **SB3** — повний Scratch-сорс з itch.io (34 спрайти, 31 звук, 1512 блоків) — еталон ЛОГІКИ й АУДІО.

## Таблиця

| Вісь | 🟦 Прототип | 🟨 HTML | 🟩 SB3 |
|---|---|---|---|
| Фрукти | 2 кружечки | об'ємні спрайти | 4 типи × (ціле+L+R+splat) |
| Розріз | pop/зникає | split+сік+фізика | ціле→2 половинки + Splat-костюм |
| Лезо | тонка лінія | світний слід | 8 скінів леза |
| Комбо | tint ≥3 за змах | банер+бонус | часове вікно + multiplier + голос 1-8 |
| Спец-предмети | — | бомби | бомба + frenzy/freeze/double + pomegranate(slow-mo) |
| Звук | 0 | шарами | 31 (slice×3 рандом, splat×2, голос 1-8, throw/fuse/explode, crit, lose-life, теми) |
| Очки/UI | текст+бар | score+життя | bitmap Score Stamper, життя, Game Over/Retry/Quit |
| Режими | 1 | classic | Classic/Zen/Arcade |
| Fail/життя | таймер/ціль | 3 життя | lives lost + lose-life + updatelives |
| Juice | scale-pop | плями, slow-mo | crit/freeze/frenzy/double/splat/zoomout/flash |
| Логіка | ~19KB 1 файл | — | 1512 блоків · 21 подія · 13 стейт-змінних |

## Що SB3 дав, чого не було видно раніше (схема має це ввібрати)

1. **Комбо = часовий ланцюг** (`combo timeout`, `combo time`, `combo level`) + **`score multiplier`** — не «за один змах».
2. **Спец-предмети як окремі механіки:** frenzy / freeze / double банани + pomegranate (multi-hit + slow-mo). В arcade — це головні aha.
3. **Аудіо-події з варіаціями:** slice-1/2/3 (рандом), splat 1/2, голос комбо 1-8 (ескалація), throw/fuse/explode, crit, lose-life, time-up, теми (menu/retry).
4. **Стани:** crit, freeze, frenzy, double.
5. **Режими:** Classic (життя) / Zen (без бомб, релакс) / Arcade (бонуси, 60с).

## Розширення схеми refgames (TODO)
- `comboRule { windowMs, multiplier, voiceCallouts: bool }`
- `specialItems[] { name, effect, art, splitsIntoHalves }`
- `audioEvents[] { event, sound, variations }` — мапа подія↔звук
- `modes[]?` (опційно; для playable беремо один)
- `states[]?` (crit/freeze/frenzy)

## Підсумок ролей еталонів
- **HTML** → візуал (як виглядає, juice).
- **SB3** → «мозок» (точна логіка комбо/спец/аудіо).
- **Наш прототип** → каркас логіки правильний; розрив = продакшн (ассети+звук+точність анімації) + кілька механік, які SB3 щойно розкрив.
