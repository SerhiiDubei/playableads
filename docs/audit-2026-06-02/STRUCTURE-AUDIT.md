# Structure audit — файли на місцях? + зберігання ігор + стандарт шаблонів

Аудит структури станом на 2026-06-02 (гілка `dev`). Мета: знайти, що не на місці,
навести порядок зі зберіганням ігор, і виявити брак стандарту «як шаблони виглядають».
Результат синкнуто в `ROADMAP.md` (епіки **S** і **T**).

---

## 🔴 A. Колізія термінів «template» (головна плутанина)

Три різні речі звуться/сприймаються як «template»:

| Місце | Що це насправді | Формат |
|---|---|---|
| `templates/` (верхній рівень) | **ІГРИ** (мад-мейдж, plug-in-socket, tap-the-coin) | тека + `manifest.json` + `game.ts` + `assets/` |
| `src/assetgen/layouts/` | **екранні шаблони** (11 zone-driven) | `.ts` з `Layout` |
| (історичне) тип `Layout` у layouts/ | рецепт екрана | — |

Плюс `styles/` (*.brief.json — стильові брифи) vs `briefs/` (повні build-брифи: example/mad-mage/plug-test) — теж збиває.

**Висновок:** `templates/` = ігри (manifest-driven), `layouts/` = екранні шаблони. Це РІЗНІ
рівні. Треба **зафіксувати словник** (частково вже в `SYSTEMS.md`) і, можливо, перейменувати
`layouts/` → `screens/` щоб «template» лишилось тільки за іграми. → епік **S**.

## 🔴 B. Ігри зберігаються ДВОМА способами (корінь «безладу з іграми»)

| Спосіб | Де | Приклади |
|---|---|---|
| **Канонічний** (manifest-driven, forge) | `templates/<гра>/` | `tap-the-coin`, `plug-in-socket`, `mad-mage-tower` |
| **Standalone-скрипти** (layered-експеримент) | `src/assetgen/build-*.ts` | `build-game.ts`(tap), `build-connect.ts`(connect), `build-recipes.ts` |

**Це дублікати одного й того ж:** `build-game`(tap) ≈ `templates/tap-the-coin`; `build-connect` ≈ `templates/plug-in-socket`. Одне — прототип, інше — «офіційна» гра, але незрозуміло яке яке.

**Рішення треба:** який формат канонічний (→ `templates/<гра>/` з manifest), а standalone
`build-*.ts` — або прототипи на видалення, або позначити `labs/`. → епік **S** (потребує твого рішення).

## 🟡 C. `out/` — пласке звалище

Усе вперемішку: зібрані playable (`menu-*.html`), логи (`log-*.html`), `catalog.html`,
`mad-mage-tower.html`, теки ассетів по стилях (`cyber-heist/`, …). Новий pipeline (Phase 0)
вводить `out/runs/{runId}/` — структуровано. Треба узгодити: `out/playables/`, `out/assets/<style>/`,
`out/runs/`, `out/logs/`. → епік **S**.

## 🟡 D. `test/` — 12 тек, половина — скріншоти

`test/`: `menu-playable, game, connect, experiments, recipes, components` (build-фікстури) +
`visual, visual-connect, visual-exp, visual-game, visual-pixel, visual-rec` (скрін-бейзлайни).
6 окремих `visual-*` тек → консолідувати під `test/visual/<suite>/`. → епік **S**.

## 🟡 E. One-off скрипти в `src/assetgen/` (клатер)

`optimize-madmage.ts, gen-only.ts, menu-buttons.ts, sprite-icons.ts, ref-test.ts,
test-openai.ts, prompt-lab.ts, md-to-html.ts` — накопичені утиліти/експерименти.
Тріаж: підключені в `package.json`? якщо ні → `src/assetgen/labs/` або видалити. → епік **S**.

## 🔴 F. Немає стандарту «як шаблони мають виглядати»

Що Є:
- `playable-design-rules.md` — **правила** (overflow, 1 CTA, tap≥44, hero-fits) = lint-спек ✅
- `layout-authoring-guide.md` — **кроки** авторингу, АЛЕ **застарів** (написаний до zone-driven:
  не згадує `meta.zoneTypes`/`meta.assets`, спільний CSS, патерни text-title/compact-cards/enforceZones)
- `meta-playable-requirements.md` — вимоги платформи ✅

Чого НЕМА:
- **Стандарт вигляду по архетипах** — що ПОВИНЕН містити кожен тип екрана (endcard = hero+1 CTA+tagline;
  feature-grid = ≤4 картки 2×2; pick-hero = hero+перемикач+персональна CTA; …) — візуальний контракт.
- Оновлений authoring-guide під нову zone-архітектуру + наші усталені патерни з Z-міграції.
→ епік **T**.

---

## Що НЕ є проблемою (на місці)
- `src/assetgen/kit/` — чистий: компоненти/зони/групи/флоу/CSS згруповані. ✅
- `src/assetgen/layouts/` — 11 шаблонів + index + lint + types, охайно. ✅
- `src/assetgen/pipeline/` — Phase 0 ізольовано. ✅
- `src/build/`, `src/loader.ts`, `src/cli.ts` — структура білдера норм. ✅
- `docs/` — багато, але згруповано; цей аудит — в `audit-2026-06-02/`. ✅

## Підсумок пріоритетів
- **F (стандарт шаблонів)** і **B (зберігання ігор)** — найважливіше, бо це про «як працювати далі».
- **A (словник)** — дешево, знімає плутанину.
- **C/D/E** — гігієна, не блокери.
