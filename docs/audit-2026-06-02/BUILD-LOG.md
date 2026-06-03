# Build Log — Pipeline v1

Хронологічний журнал. **HARD-правило (CLAUDE.md): після КОЖНОГО стейджу/фази — запис сюди.**
Формат запису: дата · що зроблено · що перевірено (тести/команди) · що відкрито · чекпойнт.

---

## 2026-06-02 — Планування (до коду)
**Зроблено:**
- Розшифровано voice-сесію відповідей на brief-quest (50 питань) → [brief-decisions.md](brief-decisions.md) (✅37/🟨6/🔴7) + [decisions.html](decisions.html).
- [architecture.md](architecture.md) — pipeline з вшитими рішеннями + статус коду.
- [ROADMAP.md](../ROADMAP.md) — v1 product backlog (епіки B…Z).
- Звірено по реальному коду → [implementation-plan.md](implementation-plan.md): знайдено зламаний envelope Phase1↔2 (manifest ігнориться, хардкод ICONS/KNIGHT_SRC/FONT), ~3 викличні одиниці замість 6, немає runId/стейту.
- Цей девелоперський план → [build-plan.md](build-plan.md) (фази 0-5, AC, тести, 6 human-checkpoints) + [backlog.md](backlog.md).
- HTML-версії доків (md-to-html.ts).

**Перевірено:** усі HTML рендеряться (Playwright, 0 помилок); brief-decisions лічильник 37/6/7 звірено з даними.

**Відкрито:** Q12 (механіки), Q36 (правила зон), Q42/Q43 (visual-regression/critic — пояснити), Q47-49.

**Чекпойнт:** очікую підтвердження фаз/обсягу build-plan → далі спека (`docs/superpowers/specs/`) → рев'ю → код.

---

<!-- Наступні записи додавай зверху-вниз, по одному на фазу:
## YYYY-MM-DD — Phase N: <назва>
**Зроблено:** …
**Перевірено:** typecheck / test / visual / golden — результати
**AC:** які AC закрито
**Відкрито/борг:** …
**Чекпойнт:** статус (passed/awaiting)
-->

---

## 2026-06-02 — Phase 0: Контракти й каркас

**Зроблено:**
- **P0-1** — `npm install zod` → `zod@^4.4.3` у dependencies. Додано `npm run test` script (`node --import tsx --test "src/**/*.test.ts"`).
- **P0-2** — `src/assetgen/pipeline/types.ts`:
  - zod-схеми: `BriefSchema` (passthrough на майбутні поля), `AssetEntrySchema`, `FontSchema`, `PlanScreenSchema` / `PlanSchema` (optional, Phase 5), `BuildSchema`, `ValidationSchema`, `EnvelopeSchema`, `StageStatusSchema`, `StageRunRecordSchema`, `RunStatusSchema`, `RunStateSchema`.
  - inferred TS types як single source of truth.
  - `RunContext` + `Stage<In, Out>` як TS-only interfaces (не серіалізовуються).
- **P0-3** — `src/assetgen/pipeline/runDir.ts`:
  - `makeRunId(now?)` — сортований compact ISO + 8 hex chars (e.g. `20260602T131422-a3f1c8d2`).
  - `runDirOf(baseDir, runId)` — pure path join.
  - `ensureRunDir(runDir)` — mkdir -p для `assets/` + `failures/` (Q35).
  - `readRunState` / `writeRunState` / `readEnvelope` / `writeEnvelope` — атомарний запис (tmp → rename) + zod-валідація на write.
  - `read*` повертає `null` коли файла нема (runner розрізнить «свіжий run» vs «corrupt»).
- **P0-4** — `types.test.ts` (15 тестів) + `runDir.test.ts` (14 тестів) у hermetic tmpdir.

**Перевірено:**
- `npm run typecheck` — чистий.
- `npm run test` — **29 tests / 7 suites / 0 fail / 461ms**.
- Що покрите: schema parse OK/throw на valid/invalid, runId формат і унікальність, ensureRunDir idempotent, round-trip Envelope/RunState, null on missing, throw on invalid payload, atomicity (no .tmp residue).

**AC закрито:**
- AC0.1 ✅ — `*.parse(valid)` ok, `parse(invalid)` кидає.
- AC0.2 ✅ — наявні команди не зачеплено (нічого з існуючого не редагувалось, лише додано теку `pipeline/` + один рядок у scripts).
- AC0.3 ✅ — `tsc --noEmit` чистий, `npm run test` зелений.

**Відкрито/борг:**
- `Envelope.plan` навмисне залишений `optional` — справжня форма прибуде у Phase 5. `PlanScreenSchema` має `passthrough`, тож додавання полів не потребуватиме schema-міграції.
- `RunContext` поки тільки `{runId, runDir}`. У Phase 1 додамо logger / abort signal.

**Чекпойнт A:** awaiting — користувач підтверджує форму `Envelope` + `RunState` + `Stage`, тоді стартуємо Phase 1.

---

## Phase 1 — Orchestrator + Validator stage (2026-06-03)

**Зроблено:**
- `pipeline/runner.ts` — `runStages(ctx, stages, seed|null, opts)`: виконує стадії по черзі, пише `run.json` + `envelope.json` після КОЖНОЇ. Fresh-start (seed) або RESUME (читає run.json, пропускає `done`). Gate-стадія ставить run у `needs-approval` і зупиняє; throw → стадія `failed` + run `failed`, решта не виконуються. Інжектований `clock` для детермінізму.
- `pipeline/stages/validate.ts` — `validateStage` обгортає `src/build/validator.ts` як `Stage<Envelope,Envelope>`; читає `envelope.build.htmlPath`, пише `envelope.validation` (enrich-only, не кидає на ok=false).
- `pipeline/runner.test.ts` — 8 кейсів.

**Перевірено:** `tsc` чистий · `npm run test` — **36/36 pass** (fresh-order, resume-skip-done, gate-pause, failure-stops-rest, no-seed-throws, validate ok/fail/missing-build).

**AC закрито:** AC1.1 (Validator як Stage), AC1.2 (run.json після кожної + переходи статусів + resume).

**Відкрито/борг:**
- CHECKPOINT B потребує РЕАЛЬНОГО прогону (run.json з живих стадій) — повноцінний e2e буде після Phase 2 (wire assetgen→build). Зараз resume + run.json доведені юніт-тестами (реальні файли в tmp).
- `validateStage` enrich-only: політику «fail run on !ok» винесемо в CLI/gate (Phase 3-4).

**Чекпойнт B:** review — користувач перевіряє форму `run.json` + що resume працює, тоді Phase 2.

---

## CHECKPOINT B — пройдено (2026-06-03)

**Доведено:** `npm run pipeline:demo` (3 стадії: assetgen[gate]→build→validate) — свіжий прогін став на gate (`needs-approval`), resume добіг до `done` НЕ перезапустивши assetgen (`trace.log` = одна згадка). Реальні `run.json` + `envelope.json` у `out/runs/<id>/`. Користувач підтвердив → старт Phase 2.
**Принагідно:** `docs/dashboard.html` — проєктний хаб (7 вкладок), задеплоєно на gh-pages.

## Phase 2 — START (2026-06-03) ⭐ головна
Мета: реальний `assetgen → build` через Envelope (прибрати хардкод у білдері). P2-1 → wip.

## Phase 2 / P2-1 — assetgen stage emit envelope (2026-06-03)
**Зроблено:** `pipeline/stages/assetgen.ts` — read-only стадія: сканує `out/<style>/*.png` (+ sidecar для prompt/briefVersion) → `envelope.assets[]`. НЕ генерує (нуль витрат). `assetgen.test.ts` — 3 кейси.
**Перевірено:** tsc · **39/39 tests** · demo на реальному cyber-heist → 13 ассетів у envelope.json.
**AC:** AC2.3 ✅. **Далі:** P2-2 (білдер читає envelope.assets замість хардкоду) — РИЗИК CHECKPOINT C (before/after ідентичні).

## Phase 2 / P2-2 — builder reads asset-plan (2026-06-03)
**Зроблено:** винесено `defaultAssetPlan(src, layout)` (keys+extra) з тіла `buildKitPlayable`; білдер читає план через `opts.plan` (дефолт = ідентичний). Хардкод bg/hero/sizes більше не в потоці білда — резолвер, який зможе постачати pipeline-стадія (P2-3).
**Перевірено:** tsc · **41/41 tests** (+contract-lock на defaultAssetPlan) · **golden BEFORE==AFTER байт-у-байт** на всіх 11 шаблонах (CHECKPOINT C no-regression витримано об'єктивно).
**AC:** AC2.1 ✅. **Далі:** P2-3 — `cmdMenu`/menu через раннер (assetgen-стадія постачає план → build-стадія), тоді CHECKPOINT C (твоя фінальна звірка before/after).

## Phase 2 / P2-3 — menu build through the orchestrator (2026-06-03) ✅ Phase 2 done
**Зроблено:** `pipeline/stages/build.ts` (build-стадія обгортає buildKitPlayable) + `pipeline/menu-run.ts` (`buildMenuViaPipeline`: assetgen→build→validate через runStages → out/runs/<id>/ з run.json+envelope+playable). Скрипт `npm run pipeline:menu <style> <layout>`.
**Перевірено:** tsc · 41/41 tests · **golden: pipeline-білд == прямий білд байт-у-байт на всіх 11 шаблонах** → CHECKPOINT C (no-regression) витримано об'єктивно.
**AC:** AC2.2 ✅. Phase 2 (⭐ головна) закрита: assetgen→build тепер ідуть через Envelope+оркестратор, вивід незмінний.
**Далі:** Phase 3 — CLI (`forge run/resume/inspect`).

## Phase 3 — CLI (run/resume/inspect) (2026-06-03) ✅ Phase 3 done
**Зроблено:** `pipeline/cli.ts` — 3 команди над оркестратором: `run <style> [layout]`, `resume <runId>`, `inspect <runId>`. `menu-run.ts`: layout їде в `brief` (passthrough) → resume відбудовує стадії; додано `resumeMenuRun`. Скрипт `npm run pipeline`.
**Перевірено:** tsc · 41/41 tests · вручну: `run cyber-heist endcard`→done+validation ok; `inspect`→стадії з таймстемпами + envelope(13 assets); `resume`→no-op done. → CHECKPOINT D витримано.
**AC:** AC3.1/3.2/3.3 ✅. **Далі:** Phase 4 — gates (cost-preview, human-in-the-loop).

## Phase 4 — cost-preview gate + approve (2026-06-03) ✅ Phase 4 done
**Зроблено:** `pipeline/stages/cost-preview.ts` — gate-стадія: `estimateCost(style)` рахує cached-ассети × $/img, пише `cost.json`, ставить run на `needs-approval`. `menu-run.ts`: опційний gate (`--gate`), resume відновлює gated-стадії з run.json. CLI: `run … --gate` + `approve <runId>` (явний human-override = «overpush»). Envelope-схему не чіпав — cost живе окремим артефактом (CHECKPOINT A frozen).
**Перевірено:** tsc · 43/43 tests (+estimateCost) · вручну: `run --gate`→needs-approval ($0 now / $1.04 regen / 13 cached)→`approve`→done, validation ok; inspect показує всі 4 стадії + cost. → CHECKPOINT E витримано.
**AC:** AC4.1/4.2/4.3 ✅. **Далі:** Phase 5 — planner (намір → plan.screens + assetKeys), останній модуль.

## Phase 5 — Planner (2026-06-03) ✅ Phase 5 done · 🏁 PIPELINE COMPLETE
**Зроблено:** `pipeline/stages/planner.ts` — gate-стадія: screens з template.meta.screenIds + assetKeys зі сканування `out/<style>/` → `envelope.plan`; пауза (`needs-approval`) → план редаговано в `envelope.json` до asset-gen. `assetgen` фільтрує по `plan.assetKeys` (P5-3). CLI: `run … --plan`; inspect показує план.
**Перевірено:** tsc · 45/45 tests (+planner) · вручну: `run --plan showcase`→needs-approval з планом (10 screens, 13 assetKeys)→approve→done; **byte-identical vs golden** (planner-flow не змінив вивід). → CHECKPOINT F витримано.
**AC:** AC5.1/5.2/5.3 ✅.

## 🏁 PIPELINE v1 — END-TO-END (Phases 0-5, checkpoints A-F усі пройдено)
Brief → (planner gate) → (cost gate) → assetgen → build → validate, з run.json/envelope, resume, gates, CLI (run/resume/inspect/approve). 45/45 tests, byte-identical збережено через увесь рефактор. Наступне — продуктові епіки B-J (Brief UI, Style system, ...) поверх готового хребта.

## PRE-1 — Brief ontology dedup (2026-06-03)
**Зроблено:** legacy `Brief` (src/types.ts: build-брифа mechanic+style+copy) → `BuildBrief`; pipeline zod `Brief` лишився канонічним. Оновлено builder.ts/loader.ts/types.ts. Колізія імен прибрана (як Layout→ZoneSpec).
**Перевірено:** tsc · 45/45 tests · endcard byte-identical vs golden. **AC PRE-1 ✅.** Розблокувало епік B (будуватиметься на канонічному Brief).

## PRE-2 — Template Standard T-01 (2026-06-03)
**Зроблено:** `docs/TEMPLATE-STANDARD.md` із скелета → чинний: §1 визначення (lab vs template), §2 manifest-поля, §3 структура (zone-driven, declared assets, endcard+CTA, ≤2MB), §4 вигляд по 7 архетипах, §5 якісні ворота, §6 усталені патерни, §7 процес промоції. **AC PRE-2 ✅.** Розблокувало D (catalog) — однозначний критерій «гра→шаблон».

## PRE-3 — Mechanics list v1 (2026-06-03) · TIER 0 complete
**Зроблено:** `docs/MECHANICS-v1.md` — 14 механік: 10 готових zone-шаблонів (endcard/tap-reveal/pick-hero/progress-reveal/two-choice/match-cluster/feature-grid/feature-list/tutorial/menu5) + 4 lab-ігри (tap-coin/connect/mad-mage/bonanza). Кожна: архетип, екрани, психологія конверсії. Чернетка-дефолт (чекає фіналізації користувача). **AC PRE-3 ✅.**
**TIER 0 (прерквізити) закрито:** PRE-1 (Brief-дедуп) · PRE-2 (template standard) · PRE-3 (механіки). Розблоковано Tier 1 (D→B→C).
