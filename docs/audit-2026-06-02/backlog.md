# Backlog — Pipeline v1

Живий беклог. **Оновлюй `Статус` коли береш/закриваєш.** План: [build-plan.md](build-plan.md) · лог: [BUILD-LOG.md](BUILD-LOG.md).

**Статус:** `todo` · `wip` · `done` · `blocked` · `review` (чекає human-checkpoint)

| ID | Фаза | Задача | Acceptance | Залежить | Статус |
|----|------|--------|-----------|----------|--------|
| P0-1 | 0 | додати `zod` у deps | zod у package.json | — | **done** |
| P0-2 | 0 | `pipeline/types.ts` — схеми Envelope/RunState/Stage/RunContext | AC0.1 | P0-1 | **done** |
| P0-3 | 0 | `pipeline/runDir.ts` — `out/runs/{runId}/`, run.json I/O | tsc | P0-2 | **done** |
| P0-4 | 0 | `types.test.ts` — valid/invalid parse | AC0.1, AC0.3 | P0-2 | **done** |
| — | 0 | 🛑 CHECKPOINT A | контракт підтверджено (2026-06-03) | P0-* | **done** |
| P1-1 | 1 | `pipeline/runner.ts` — runStages + run.json після кожної | AC1.2 | P0-* | **done** |
| P1-2 | 1 | переходи статусів + resume (skip done) | AC1.2 | P1-1 | **done** |
| P1-3 | 1 | Validator як `Stage` | AC1.1 | P1-1 | **done** |
| — | 1 | 🛑 CHECKPOINT B | run.json + resume ок (demo: pipeline:demo) | P1-* | **done** (2026-06-03) |
| P2-1 | 2 | assetgen-стадія → emit `envelope.assets[]` (read-only) | AC2.3 | P1-* | **done** (13 реальних ассетів cyber-heist) |
| P2-2 | 2 | `buildKitPlayable` читає asset-план; хардкод винесено | AC2.1 | P2-1 | **done** (byte-identical vs golden) |
| P2-3 | 2 | menu-білд через раннер (assetgen→build→validate) | AC2.2 | P2-2 | **done** (`pipeline:menu`) |
| — | 2 | 🛑 CHECKPOINT C | before/after ідентичні | P2-* | **done** (golden: 11/11 byte-identical) |
| P3-1 | 3 | `pipeline run <style>` | AC3.1 | P2-* | **done** |
| P3-2 | 3 | `pipeline resume <runId>` | AC3.2 | P3-1 | **done** |
| P3-3 | 3 | `pipeline inspect <runId>` | AC3.3 | P3-1 | **done** |
| — | 3 | 🛑 CHECKPOINT D | 3 команди працюють | P3-* | **done** (run/inspect/resume погнані) |
| P4-1 | 4 | `gate:true` → status needs-approval | AC4.1 | P3-* | **done** |
| P4-2 | 4 | `pipeline approve <runId>` (явний human-override) | AC4.2, AC4.3 | P4-1 | **done** |
| P4-3 | 4 | cost-preview gate (cost.json + пауза) | AC4.1 | P4-1 | **done** |
| — | 4 | 🛑 CHECKPOINT E | cost-preview підтверджено | P4-* | **done** (gate→approve→done погнано) |
| P5-1 | 5 | Planner-стадія: намір → plan.screens + assetKeys | AC5.1 | P4-* | **done** |
| P5-2 | 5 | план редагований ДО asset-gen (gate + envelope.json) | AC5.2 | P5-1 | **done** |
| P5-3 | 5 | assetgen споживає `plan.assetKeys` | AC5.3 | P5-1 | **done** |
| — | 5 | 🛑 CHECKPOINT F | план перед asset-gen | P5-* | **done** (planner→approve→done, byte-identical)|

## Fix the Floor (labs/fix-the-floor) — flooring playable

План: [labs/fix-the-floor/PLAN.md](../../labs/fix-the-floor/PLAN.md). Система B (інтерактивна гра, FSM).
Пайплайн: **прототип(greybox,$0) → драфт(AI-арт) → фінал(промоція)**, labs-first, greybox-перший (як mad-mage-tower).

| ID | Етап | Задача | Acceptance | Залежить | Статус |
|----|------|--------|-----------|----------|--------|
| F0 | 0 | скафолд + manifest(params) + PLAN.md | теки/файли є, params занесені | — | **done** |
| F1 | 1 prototype | standalone labs-білдер → `test/fix-the-floor/index.html` | білдиться, $0 | F0 | **todo** |
| F2 | 1 prototype | FSM-каркас + процедурна сцена/parallax + IDLE_HOOK→MOVE_COUCH→RIP_CARPET | 3 стани грабельні, no-fail | F1 | **todo** |
| F3 | 1 prototype | 3-tool combo (crowbar/plank/finish) + progress + idle/auto-demo | 100% renovation, forgiving | F2 | **todo** |
| F4 | 1 prototype | REVEAL + END_CARD + CTA(onCTAClick) + clickable brand + Replay | CTA редіректить, replay рестартить | F3 | **todo** |
| — | 1 | 🛑 CHECKPOINT 1 | механіка/філ доведені процедурно (human) | F1-F4 | **todo** |
| F5 | 2 draft | `styles/fix-the-floor.brief.json` + `gen-only` + webp → `assets/` (swap-in) | спрайти підмінюють greybox, ≤ assetBudget | CP1 | **todo** |
| F6 | 2 draft | juice-поліш + ворота (typecheck/visual/check:layouts/MANUAL-QA) + BUILD-LOG | ALL PASS, ≤2MB | F5 | **todo** |
| — | 2 | 🛑 CHECKPOINT 2 | арт+ворота зелені (human) | F5-F6 | **todo** |
| F7 | 3 final | промоція `labs/`→`templates/` за TEMPLATE-STANDARD + прямий запит; build через брифа | у templates/, білд з брифа | CP2 | **todo** |

## Dream Floor (labs/dream-floor) — 3/4 flooring playable

План: [labs/dream-floor/PLAN.md](../../labs/dream-floor/PLAN.md). Система B (FSM-гра). Новий entry з нуля
(старий top-down `fix-the-floor` не чіпаємо). Композиція кадру — **3/4** за `references/Home improvement/`,
портрет 9:16. Пайплайн: **greybox($0) → AI-арт → промоція**.

| ID | Етап | Задача | Acceptance | Залежить | Статус |
|----|------|--------|-----------|----------|--------|
| D0 | 0 | скафолд + manifest(params) + style + build-скрипт + npm/launch + PLAN | теки/файли є, build OK | — | **done** |
| D1 | 1 prototype | `game.ts`: 3/4 кімната + FSM (intro→couch→carpet→crowbar→plank→finish→reveal→end) + toolbar + hint/idle/auto-demo + reveal + endcard + CTA | усі біти грабельні, no-fail, build `validation: OK`, QA-кадри faithful | D0 | **done** |
| — | 1 | 🛑 CHECKPOINT 1 | композиція + філ доведені процедурно (human) | D1 | **done** |
| D2 | 2 draft | `styles/dream-floor.brief.json` (3/4 арт) + `gen-only` + webp → `assets/` (swap-in) | спрайти підмінюють greybox, ≤ assetBudget | CP1 | **done** |
| D3 | 2 draft | juice-поліш (перспектива/ковролін/шахові дошки/cut-out вазон+лампа) + BUILD-LOG | ALL PASS, ≤2MB | D2 | **wip** (візуал готовий; лишилось: live-плейтру анімацій + `npm run visual`) |
| — | 2 | 🛑 CHECKPOINT 2 | арт+ворота зелені (human) | D2-D3 | **review** (чекає підтвердження) |
| D4 | 3 final | промоція `labs/`→`templates/` за TEMPLATE-STANDARD; build через брифа | у templates/, білд з брифа | CP2 | **todo** |

## The Repair Bill (estimate-reveal) — auto-insurance playable

Демо-бренд **Coverly**. Задача #3 «пояснити важливість послуги», механіка Estimate-and-Reveal
(слайдер-гадання, 2 раунди, близькість+бар точності), CTA «Get your quote». Арт: стилізована 3D, US$.
Пайплайн (як dream-floor): **каркас на існуючих асетах ($0) → AI-арт (premium) → гейти**.
Layout-підхід (не FSM-labs): новий `src/assetgen/layouts/estimate-reveal.ts` + slider kit-компонент.

| ID | Етап | Задача | Acceptance | Залежить | Статус |
|----|------|--------|-----------|----------|--------|
| RB0 | 0 | бриф + розкрій (задача→наратив→механіка→асети+$) | бриф зафіксовано | — | **done** (checkpoint #1, 2026-06-25) |
| RB1 | 1 prototype | layout `estimate-reveal` + slider-компонент + інтерактив (drag, 2 раунди, reveal+accuracy, running total) + endcard CTA | білдиться, $0 | RB0 | **done** (2026-06-25) |
| RB2 | 1 prototype | прогін `forge -- cyber-heist --layout estimate-reveal` ($0) + check:layouts (estimate-reveal PASS) + visual ALL PASS | каркас живий, ворота зелені | RB1 | **done** (2026-06-25, 564.6KB) |
| — | 1 | 🛑 CHECKPOINT каркас | структура/зони/слайдер/reveal-анімація доведені на чужих асетах (human) | RB1-RB2 | **review** |
| RB3 | 2 draft | 2 стиль-брифи `coverly-soft` (3d-glossy) + `coverly-flat` (flat-vector), 14 спрайтів кожен, premium gen + webp | 2 версії білдяться, ≤2MB | CP-каркас | **done** (2026-06-25, ~$0.74) |
| RB4 | 2 draft | гейти на обох версіях (typecheck/visual) + BUILD-LOG | ALL PASS | RB3 | **done** (soft 612KB / flat 439KB, visual ALL PASS) |
| — | 2 | 🛑 вибір напряму (Soft+fix bg / Flat) | human обирає рендер | RB3-RB4 | **review** |
| RB5 | 2 draft | фікс Soft: перегенеровано bg (чистий градієнт) + шрифт кнопок rounded-sans (override зашитого Cinzel) | bg чистий, шрифт Coverly | вибір | **done** (2026-06-25, $0.08) |
| — | 2 | 🛑 CHECKPOINT 2 | арт прийнято (Soft 3D), рухаємось у поліш | RB5 | **done** |
| RB6 | 3 polish | juice: пер-елементні каскади входу + тактильний слайдер (scale/halo/bubble) + shock-reveal (count-up 1200ms/pop/shake/glow), motion-ресерч | анімації живі, гейти зелені, $0 | CP2 | **done** (2026-06-25) |
| — | 3 | 🛑 CHECKPOINT 3 | juice доведено в русі (human) | RB6 | **done** |
| RB7 | 3 ship | фіналізація: zip у `_deliverables/repair-bill-coverly.zip` | артефакт готовий | CP3 | **done** (2026-06-25) |
| — | — | 🏁 MVP SHIPPED | The Repair Bill (Coverly Soft 3D) | RB0–RB7 | **done** |
| RB8 | 3 polish | фідбек-ітерація: фікс блимання авто (both-fill) + крупний close-up пошкодження з підсвіткою (перегенер. car_rear/front close-up) | стабільно/крупно/підсвічено | ship | **done** (2026-06-25, $0.11) |
| RB9 | 3 polish | фідбек-2: слайдер з діленнями (ticks)+помітніший grow; конкретна Tesla Model 3 (підписана); reveal=чек СТО з деталізацією (деталь/робота/ADAS-калібрування/простій)→TOTAL з нагнітанням | логіка взаємозв'язана | RB8 | **done** (2026-06-25, $0.16) |
| RB10 | ship | деплой на Vercel (repair-bill-site/index.html) → публічний URL | live, 200 OK | RB9 | **done** — https://repair-bill-site.vercel.app |

## Правила ведення
- Беремо задачу → `wip`; закрили за AC + тести → `done`; чекпойнт → `review` поки користувач не підтвердить.
- Після кожної ФАЗИ — обовʼязковий запис у `BUILD-LOG.md` (це HARD-правило, див. `CLAUDE.md`).
- Не починаємо наступну фазу, поки не пройдено human-checkpoint попередньої.
