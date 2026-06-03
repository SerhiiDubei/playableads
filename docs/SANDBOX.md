# 🎮 Quest Sandbox — погратись із playable-forge

Усі команди, що кожна робить, що ти побачиш. PowerShell, з кореня репо.
**Правило npm:** аргументи — після `--` (інакше їх ковтає npm).

Легенда: 🆓 безкоштовно (з готових ассетів) · 💸 витрачає $ (OpenAI gen) · 👀 щось показує · 🧪 тест.

---

## 🎬 Pipeline (нова іграшка — оркестратор)

| Команда | Що робить | Що побачиш |
|---|---|---|
| `npm run pipeline -- run cyber-heist endcard` | 🆓 повний прогін assetgen→build→validate | `status: done`, playable у `out\runs\<id>\endcard.html` |
| `npm run pipeline -- inspect <runId>` | 👀 показує стейт прогону | стадії з таймстемпами + envelope (assets/build/validation) |
| `npm run pipeline -- resume <runId>` | продовжує прогін | пропускає `done`-стадії |
| `npm run pipeline -- run cyber-heist endcard --gate` | 🆓👀💰 прогін із **cost-preview gate** | стає на `needs-approval` + показує $ |
| `npm run pipeline -- approve <runId>` | підтвердити суму → продовжити | gate знято, білд доходить до done |
| `npm run pipeline:demo` | 🆓👀 демо з **gate-паузою** | стає на `needs-approval`; resume командою з підказки |
| `npm run pipeline:demo <runId>` | продовжує demo | `trace.log` доводить: стадія бігла раз |

---

## 🏗️ Зібрати playable (прямий білд)

| Команда | Що робить |
|---|---|
| `npm run menu -- cyber-heist endcard` | 🆓 зібрати 1 шаблон → `test\menu-playable\index.html` |
| `npm run components` | 🆓 showcase усіх kit-компонентів |
| `npm run game` / `npm run connect` | 🆓 дві layered-ігри (tap / drag) → `test\game` / `test\connect` |
| `npm run forge -- cyber-heist` | 💸 **повна генерація ассетів** (OpenAI) + білд — коштує гроші! |

**Стилі:** `cyber-heist` · `cyber-heist-cheap` · `cyber-heist-sprite` · `urban-runner`
**Layout-и (11):** `menu5` `endcard` `showcase` `tutorial` `feature-grid` `feature-list` `tap-reveal` `pick-hero` `progress-reveal` `two-choice` `match-cluster`

---

## 🔍 Інспектувати / дебажити

| Команда / трюк | Що робить |
|---|---|
| додай `?zones=1` до URL playable | 👀 бірюзовий **оверлей зон** прямо в грі |
| `npm run check:layouts -- test\menu-playable\index.html endcard` | 👀 lint: overflow / CTA / тач-таргети / зони |
| `npm run visual` | 🧪👀 Playwright: скріни на 8 viewport-ах + асерти зон → `test\visual\` |
| `tsx src\assetgen\measure-zones.ts test\menu-playable\index.html` | 👀 точні rect-и зон + що вилазить (px) |

---

## 📊 Прогрес

| Команда | Що робить |
|---|---|
| `npm run dashboard` | 🆓 перегенерувати дашборд із беклогів → `docs\dashboard.html` |
| `npm run dashboard:deploy` | задеплоїти дашборд на gh-pages (телефон) |
| (авто) | пуш у `dev` → GitHub Action сам оновлює дашборд |

Живий: **https://serhiidubei.github.io/playableads/dashboard.html**

---

## ✅ Якість

| Команда | Що робить |
|---|---|
| `npm run test` | 🧪 усі юніт-тести (зараз 41) |
| `npm run typecheck` | 🧪 TypeScript без помилок |

---

## 🗺️ Місії (квести для розминки)

1. **Перший прогін.** `npm run pipeline -- run cyber-heist endcard` → відкрий `out\runs\<id>\endcard.html` у браузері.
2. **Зазирни в машину.** `npm run pipeline -- inspect <id>` → побач 3 стадії done. Відкрий `out\runs\<id>\run.json`.
3. **Пауза/продовження.** `npm run pipeline:demo` → побач `needs-approval` → `npm run pipeline:demo <id>` → done. Глянь `trace.log`.
4. **Колекція.** Прожени `run` на 3 різних layout-ах — кожен у своїй теці `out\runs\`.
5. **Зони видно.** Зібери будь-що, відкрий HTML з `?zones=1` — побач сітку.
6. **Один стиль ≠ зламані зони.** `menu -- cyber-heist endcard` vs `menu -- urban-runner endcard` — зони тримаються при різній графіці.
7. **Дашборд рухається.** Глянь дашборд до/після того, як я закрию Phase 4 — бари поїдуть.

> ⚠️ Єдина команда, що **витрачає гроші** — `forge` (генерує ассети через OpenAI). Усе інше працює з готових ассетів безкоштовно.
