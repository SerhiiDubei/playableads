# Refgames generation track — backlog (live)

Окремий трек, що виріс із сесії 2026-06-04: **реальна гра → деконструкція в схему →
генерація `game.ts` → AI-асети → авто-верифікація → деплой за лінком.**
Розблокував на практиці частини епіків E/F/G (`PRODUCT-PLAN.md`).

Деталі стейджів: [`audit-2026-06-02/BUILD-LOG.md`](audit-2026-06-02/BUILD-LOG.md) ·
ключові доки: `MOTION-SYSTEM.md`, `FN-3WAY-COMPARISON.md`, `FN-GAP-ANALYSIS.md`, `AGENT2-NEW-MECHANIC.md`.

**Статус:** `todo` · `wip` · `done` · `blocked`

## Зроблено ✅
| ID | Задача | Перевірено | Статус |
|----|--------|-----------|--------|
| R-01 | refgames **схема** (zod, 7 секцій + comboRule/specialItems/audioEvents) | tsc · validate on load | **done** |
| R-02 | refgames **база** (Fruit Ninja seed, збагачена з SB3) | `npm run refgames` | **done** |
| R-03 | **Генерація `game.ts` зі схеми** (Claude SDK, контракт tap-the-coin) | v1-v8 збираються+грають | **done** |
| R-04 | Версіонування виводу (`out/<id>-gen-vN.html`, game-vN.ts) | v1-v8 збережені | **done** |
| R-05 | **motion.ts** — фізична арка (час+screen-rel, dt) + `DifficultyController` | 6/6 тестів | **done** |
| R-06 | **AI-асети** (фрукти/половинки/бомба/фон/splat) + weight-пайплайн (trim→resize→webp, `_src` не інлайн) | webp 273KB, build OK | **done** |
| R-07 | **Розріз показує м'якоть** (halfN flesh-спрайти, cut уздовж свайпу) | v8, 0 runtime-err | **done** |
| R-08 | Studio **v2** (чат, Claude Agent SDK на підписці) + Агент 2 (нова механіка) | `/v2`, /api/agent 200 | **done** |
| R-09 | **Авто-верифікація** (Playwright + синтетичні pointer-події → читає консоль) | стрес-тест ловить null.x | **done** |
| R-10 | **Деплой** на gh-pages (живий лінк) | serhiidubei.github.io/playableads/fruit-ninja.html → 200 | **done** |

## Відкрито 🔜
| ID | Задача | Acceptance | Пріор. | Статус |
|----|--------|-----------|--------|--------|
| R-11 | **motion-lint** — гейт якості руху (час-на-екрані ≥1.2с, траєкторія вертикальна, dt-незалежність, ескалація щільності не швидкості) | FAIL якщо «надто швидко»; інтегр. як `check:motion` | P1 | todo |
| R-12 | Точніше орієнтування half-cut (зараз flesh-face плаский; вирівняти нахил половинок по куту + перспектива) | візуально половинки лягають по лінії свайпу | P2 | todo |
| R-13 | **LLM-деконструктор** — нова гра → автозаповнення refgame-схеми → ревʼю → у базу | додає валідний запис із 1 опису/відео | P1 | todo |
| R-14 | Розширити базу (Stack, Merge, Runner, Aim, Pull-pin…) | ≥5 ігор валідуються | P2 | todo |
| R-15 | **Вшити генерацію в Studio UI** (кнопка «Створити» → реально генерує+прев'ю) | з `/v2` народжується гра без CLI | P1 | todo |
| R-16 | QR у Studio (лінк на gh-pages → скан → тест на телефоні) | QR з'являється після деплою | P2 | todo |
| R-17 | Решта спец-предметів полірування + баланс (freeze/double/pomegranate тюнінг) | відчуваються по-різному, не ламають winBias | P3 | todo |

## Правила
Як у пайплайн-беклозі: береш → `wip`; закрив за AC+тести → `done`; запис у BUILD-LOG (HARD).
Кожен баг/урок осідає в **схемі або контракті генерації** (`gen-test.ts`), не в одному файлі.
