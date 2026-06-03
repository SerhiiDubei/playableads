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
