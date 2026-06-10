# Fix the Floor — build plan (labs draft)

> Playable ad для flooring-компанії (USA, Home Improvement). POV-ремонт прогнилої
> підлоги у затишній американській вітальні в 3 кліки. Механіка = oddly-satisfying
> renovation. Емодуга: затишок → тривога → агентність → задоволення → CTA.
> Система **B** (інтерактивна гра зі станами), labs-first.

## Життєвий цикл (пайплайн проекту: прототип → драфт → фінал)
Слідуємо labs-first + greybox-перший (як `mad-mage-tower`: процедурний візуал за
замовчуванням, спрайти підмінюються коли зʼявляються в `assets/`).

| Етап | Що доводимо | Графіка | $ | Де |
|------|-------------|---------|---|-----|
| **1. Прототип (greybox)** | повний FSM + геймплейний філ | процедурна (Pixi Graphics) | $0 | `labs/` |
| **2. Драфт** | арт + juice + ворота якості | AI gpt-image-1.5 (swap-in поверх greybox) | ~$0.2–1+ | `labs/` |
| **3. Фінал** | промоція за `TEMPLATE-STANDARD.md` + прямий запит | — | — | `templates/` |

## Статус
`wip` — **Етап 0** (скафолд + manifest(params) + цей план) готовий.
Далі **Етап 1 — greybox-прототип** (код ще не написано). AI-арт — лише Етап 2.

---

## 1. Архітектура у фреймворку

| Шар | Де | Що |
|-----|-----|-----|
| Точка входу | `labs/fix-the-floor/game.ts` | PixiJS + GSAP, FSM, читає `__PLAYABLE_CONFIG__` |
| Manifest | `labs/fix-the-floor/manifest.json` | params (таймінги, кути, plankCount…), assetBudget |
| Ассети | `labs/fix-the-floor/assets/*.webp` | 2.5D шарові спрайти (інлайняться в data-URI) |
| Asset brief | `styles/fix-the-floor.brief.json` | декларація спрайтів для `gen-only.ts` |
| Бриф білда | `briefs/fix-the-floor-en.json` | copy (title/cta) + store + params override |

Білд інлайнить assets у `cfg.assets[key] -> dataURI`, інжектить `__PLAYABLE_CONFIG__`,
обгортає в single-file HTML, валідує (≤2MB, CTA, no external loads).
CTA → `window.FbPlayableAd.onCTAClick()` (MRAID-редірект).

> ⚠️ Технічна примітка: `playable build <brief>` резолвить механіку **тільки з `templates/`**
> ([loader.ts](../../src/loader.ts) `TEMPLATES_DIR`). Поки гра в `labs/`, для білда —
> або тимчасовий standalone-білдер (як `build-connect.ts`), або промоція в `templates/`
> за `TEMPLATE-STANDARD.md`. Уточнити спосіб запуску перед фазою білда (задача F4).

---

## 2. FSM (серце гри)

```
IDLE_HOOK ──couch tilts (hookDelayMs)──▶ user drag/tap
   ▼
MOVE_COUCH ──couch slides aside──▶ highlight carpet
   ▼
RIP_CARPET ──peel anim──▶ rotten subfloor revealed + toolbar appears
   ▼
TOOL_CROWBAR  (tap tool → tap planks → old planks lift & vanish)         ✓ 33%
   ▼
TOOL_PLANK    (tap tool → tap zones → new planks click-in, snap SFX)     ✓ 66%
   ▼
TOOL_FINISH   (tap tool → swipe roller → glossy warm finish sweep)       ✓ 100%
   ▼
REVEAL        (couch returns, light warms, sunbeam; revealHoldMs)
   ▼
END_CARD      (logo + primary CTA + Replay) ──tap──▶ onCTAClick()
```

**Інваріанти (з ТЗ):**
- **No-fail / forgiving:** невалідний tap → нічого не ламається, правильна зона знову пульсує.
- **Idle:** після `idleHintMs` бездіяльності — повтор підказки + сильніша пульсація;
  після `autoDemoAfterIdles` циклів — авто-демо поточного кроку.
- **Anti-block input:** анімації ≤ `stepAnimMs` (~0.5s), інпут не блокується надовго.
- **Skip / clickable brand:** лого в кутку клікабельне будь-коли → end card / onCTAClick.
- **Replay:** рестарт FSM у IDLE_HOOK (не вихід).

---

## 3. Беати → реалізація

| Beat | STATE | Інпут | Візуал/анімація | Ассети |
|------|-------|-------|-----------------|--------|
| 0 Hook | IDLE_HOOK | — (couch auto-tilts) | parallax ±2-3px, нахил couch 7°, пил, pulse | room-bg, couch, carpet |
| 1 Move couch | MOVE_COUCH | drag / tap (fallback) | couch slides aside (inertia, ease-out) | couch |
| 2 Rip carpet | RIP_CARPET | tap/swipe | peel/roll-up anim → rotten floor | carpet, floor-rotten |
| 3.1 Crowbar | TOOL_CROWBAR | tap tool → tap planks | old planks lift+fade → subfloor | tool-crowbar, floor-subfloor |
| 3.2 Plank | TOOL_PLANK | tap tool → tap zones | new planks snap-in one by one | tool-plank, floor-new (tile) |
| 3.3 Finish | TOOL_FINISH | tap tool → swipe roller | glossy sweep, derevo "оживає", glint | tool-finish, gloss-overlay |
| 4 Reveal | REVEAL | — (auto) | couch returns, warm light, sunbeam, ta-da | (reuse) |
| 5 End card | END_CARD | tap CTA / brand | end card поверх сцени (не чорний екран) | logo, cta-frame (kit) |

**Juice:** GSAP ease-out/back, snap-ефекти, partikли пилу, light glints, mini progress
bar 33→66→100%, мікро-«ding» + sparkle на кожному ✓. Транзишени 0.3–0.6s.

**Copy (en, USA):**
- hook: "Something's not right…" → "Move the couch"
- "Pull up the carpet" → "Time to fix it 🔧"
- reveal: "Beautiful. Real floors, real easy."
- CTA: "Shop Real Flooring →" (варіанти: "Get a Free Quote" / "Find Your Floor")

---

## 4. Ассети (AI-генерація — ЕТАП 2 / Драфт, не раніше)

> ⚠️ Черговість: спрайти генеруємо **тільки після** робочого greybox-прототипу (Етап 1).
> game.ts малює сцену процедурно й підмінює спрайт, коли ключ присутній у `assets/`
> (патерн `mad-mage-tower`: `tex(key) ?? draw procedurally`). Так Етап 1 коштує $0.

Декларуються в `styles/fix-the-floor.brief.json` (формат як `styles/connect.brief.json`):
`provider openai · gpt-image-1.5 · transparent · 1024 · medium`. Генерація:
```
npx tsx src/assetgen/gen-only.ts styles/fix-the-floor.brief.json
# → out/fix-the-floor/*.png  (~$0.2–1+ залежно від quality/к-сті)
```
Потім post-process **trim → resize → webp** (правило CLAUDE.md §6) у `labs/fix-the-floor/assets/`.

Art-direction (з ТЗ): warm neutrals (beige/cream/soft-brown), акцент — насичений wood-tone
нової підлоги. **Проблема = desaturated/cold/темне; рішення = warm/saturated/світле.**
Стиль: House Flipper / cozy, soft shadows, warm key light, 2.5D (НЕ фотореалізм), front-flat top-side 3/4.

Список спрайтів (чернетка):
- `room-bg` — cozy US living room POV (вікно з теплим світлом, рослина, торшер, рамки)
- `couch` — диван (окремий шар, з тінню-контактом)
- `carpet` — ковролін/килим (для peel)
- `floor-rotten` — прогнилі потемнілі дошки, тріщини, пляма вологи, кривий цвях (cold/desaturated)
- `floor-subfloor` — голий чорновий настил (після crowbar)
- `floor-new` — нова дошка (tileable, warm wood-tone)
- `gloss-overlay` — глянцевий фініш/reflection sweep
- `tool-crowbar`, `tool-plank`, `tool-finish` — іконки toolbar (≥64px тач-таргет, чіткі силуети)
- `logo` — заглушка лого flooring-бренду (замінити на реальний)

**Бюджет ваги:** фінал ≤ 2MB single-file (base64 +33%); `assetBudgetBytes` guard у manifest.
Якщо вилазимо — менше спрайтів (room-bg один раз через `:root` var / `.scene{}`, не per-element).

---

## 5. Ворота якості (Definition of Done)

| Ворота | Команда | Критерій |
|--------|---------|----------|
| Типи | `npm run typecheck` | 0 помилок |
| Зони/overflow (end card) | `npm run check:layouts -- <html> fix-the-floor` | PASS |
| Viewport | `npm run visual` | ALL PASS (8 viewport, no overflow) |
| Вага | білдер друкує | ≤ 2 MB |
| Ручний | `docs/MANUAL-QA.md` | tilt/drag/peel/tools/CTA працюють очима |
| Документація | `docs/audit-2026-06-02/BUILD-LOG.md` | запис після кожної фази (HARD) |

Promotion `labs/` → `templates/` — лише за `TEMPLATE-STANDARD.md` + прямим запитом.

---

## 6. Беклог за етапами (див. backlog.md, секція Fix the Floor)

**Етап 0 — скафолд + план**
- **F0** скафолд + manifest(params) + PLAN.md — ✅ done

**Етап 1 — Прототип (greybox, $0, в labs)**
- **F1** standalone labs-білдер (як `build-connect.ts`) → `test/fix-the-floor/index.html`
- **F2** game.ts: FSM-каркас + процедурна сцена/parallax + IDLE_HOOK→MOVE_COUCH→RIP_CARPET
- **F3** game.ts: 3-tool combo (crowbar/plank/finish) + progress + no-fail/idle/auto-demo
- **F4** REVEAL + END_CARD + CTA(onCTAClick) + clickable brand + Replay
- 🛑 **CHECKPOINT 1** — механіка/філ доведені процедурно (human-review) → лише тоді Етап 2

**Етап 2 — Драфт (AI-арт + поліш, в labs)**
- **F5** `styles/fix-the-floor.brief.json` + `gen-only` + trim/resize/webp → `assets/` (спрайти swap-in)
- **F6** juice-поліш (пил, glints, peel, snap, sunbeam) + ворота: typecheck/visual/check:layouts/MANUAL-QA → ALL PASS + BUILD-LOG
- 🛑 **CHECKPOINT 2** — арт+ворота зелені (human-review)

**Етап 3 — Фінал (промоція)**
- **F7** за `TEMPLATE-STANDARD.md` + прямим запитом: `labs/fix-the-floor` → `templates/`, build через брифа
