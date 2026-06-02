# Pipeline v1 — Developer Build Plan

Повний план імплементації pipeline-движка (фази 0-5), звірений по коду ([implementation-plan.md](implementation-plan.md)).
Працюємо **через беклог** ([backlog.md](backlog.md)); після кожної фази — запис у [BUILD-LOG.md](BUILD-LOG.md).

---

## 0. Глобальні контракти й конвенції (читати першими)

### Envelope (передається між стадіями)
Єдиний JSON-конверт. Кожна стадія приймає Envelope і повертає Envelope (доповнений).
```
Envelope {
  runId: string
  createdAt: string            // ISO, ставиться раннером
  brief:  { style: string, prompt?: string, refs?: string[], ... }
  assets: { key: string, path: string, bytes: number, prompt: string, briefVersion: string }[]
  font:   { family: string, path: string }
  plan?:  { screens: ScreenPlan[], assetKeys: string[] }   // зʼявляється у фазі 5
  build?: { htmlPath: string, bytes: number }
  validation?: { ok: boolean, checks: {...} }
}
```

### run.json (стейт-машина прогону)
```
RunState {
  runId: string
  style: string
  status: "running" | "needs-approval" | "done" | "failed"
  stages: { name: string, status: "todo"|"running"|"done"|"failed"|"skipped",
            startedAt?, endedAt?, error?, note? }[]
}
```

### Stage-інтерфейс
```
Stage<In, Out> = {
  name: string
  run(input: In, ctx: RunContext): Promise<Out>
  gate?: boolean            // якщо true — після стадії стоп зі status:"needs-approval"
}
```

### Розкладка на диску
`out/runs/{runId}/` — `run.json`, `envelope.json`, `assets/`, `index.html`, `failures/`.
(Зараз: `out/{style}/` per-style — мігруємо на per-run.)

### Тестування
- **`npm run test`** — `node:test` через `tsx` (вбудований, без нових тест-фреймворків). Файли `*.test.ts` поруч з кодом.
- **`npm run typecheck`** — `tsc --noEmit`, має бути чистим **щокроку**.
- **`npm run visual`** — Playwright 8 viewports + zone-assertions, для рефактор-фаз.
- **Golden-file** (фази 0-2, де поведінка НЕ міняється): знімок `index.html` (розмір + visual) ДО рефактора → після має збігатись (±2% розміру, visual ALL PASS).

---

## Definition of Done (для КОЖНОЇ фази)
1. ✅ `npm run typecheck` чистий.
2. ✅ `npm run test` зелений (нові тести фази проходять).
3. ✅ Для рефактор-фаз (0-2): поведінка незмінна — golden + `npm run visual` ALL PASS.
4. ✅ Запис у `BUILD-LOG.md` (що зроблено, що перевірено, що лишилось).
5. ✅ Статуси в `backlog.md` оновлені (todo→done).
6. 🛑 Пройдено **human-checkpoint** фази (нижче), якщо він є.

---

## Phase 0 — Контракти й каркас
**Мета:** ввести контракти, **нічого не міняючи в поведінці**.
**Беклог:** P0-1…P0-4.

- **P0-1** — додати `zod` у залежності.
- **P0-2** — `src/assetgen/pipeline/types.ts`: zod-схеми + TS-типи `Envelope`, `RunState`, `Stage`, `RunContext`.
- **P0-3** — `src/assetgen/pipeline/runDir.ts`: розкладка `out/runs/{runId}/`, генерація `runId`, read/write `run.json` + `envelope.json`.
- **P0-4** — `types.test.ts`: валідний Envelope парситься, кривий — кидає.

**Acceptance criteria**
- AC0.1 — `Envelope`/`RunState` мають zod-схему; `schema.parse(valid)` ок, `schema.parse(invalid)` кидає.
- AC0.2 — жодна наявна команда не змінила вивід (`npm run menu` дає той самий файл).
- AC0.3 — `tsc` чистий, `npm run test` зелений.

**Тести:** `pipeline/types.test.ts` (valid/invalid parse) · `typecheck`.

> 🛑 **CHECKPOINT A — ти перевіряєш:** форму `Envelope` + `run.json` (це фундамент усього). Питання до тебе: «це правильний контракт, нічого не бракує?» Поки не підтвердиш — фазу 1 не починаємо.

---

## Phase 1 — Orchestrator + перша стадія (Validator)
**Мета:** раннер, що веде стадії й пише `run.json`; перша стадія — найбезпечніший Validator (`html→verdict`).
**Беклог:** P1-1…P1-3.

- **P1-1** — `pipeline/runner.ts`: `runStages(runId, stages, ctx)` — послідовно, після кожної пише `run.json`; при повторі skip-ає `done`.
- **P1-2** — переходи статусів + resume.
- **P1-3** — обгорнути наявний валідатор як `Stage` (pure, без побічних ефектів).

**Acceptance criteria**
- AC1.1 — Validator-як-стадія дає **той самий verdict**, що й прямий `validate`.
- AC1.2 — `run.json` пишеться зі статусами стадій; повторний запуск skip-ає завершені.
- AC1.3 — наявні команди працюють як раніше.

**Тести:** інтеграційний — прогнати стадію, звірити `run.json.stages[].status==="done"` + verdict == прямий виклик · resume-тест (друга прогонка skip).

> 🛑 **CHECKPOINT B — ти перевіряєш:** реальний `run.json` після прогону + що resume працює (постав на паузу, продовж).

---

## Phase 2 — Полагодити зламаний envelope (assetgen → builder) ⭐ головна
**Мета:** генератор віддає повний Envelope; білдер **читає Envelope**, а не хардкод.
**Беклог:** P2-1…P2-3.

- **P2-1** — обгорнути `runAssetGen` → emit `envelope.json` (`assets[]`, `font`, `style`).
- **P2-2** — рефактор `buildKitPlayable`: приймає Envelope; прибрати хардкод `ICONS/NINE/"banner"/"bg-castle"/"knight"/KNIGHT_SRC/FONT` (`build-test-playable.ts:17-21,57-61`).
- **P2-3** — `cmdMenu` ходить через раннер (assetgen-стадія → build-стадія).

**Acceptance criteria**
- AC2.1 — у `build-test-playable.ts` **нема** констант `ICONS/KNIGHT_SRC/FONT` і хардкод-імен (grep чистий).
- AC2.2 — вихідний playable **візуально ідентичний**: `npm run visual` ALL PASS; розмір `index.html` ±2% до golden.
- AC2.3 — `manifest.json`/envelope з Phase 1 **реально читається** білдером (а не ігнориться).

**Тести:** golden (розмір+visual heroes3 до/після) · grep-тест на відсутність хардкоду · integration full-run.

> 🛑 **CHECKPOINT C — ти перевіряєш:** before/after playable поряд — **мають бути однакові**. Підписуєш, що рефактор нічого не зламав.

---

## Phase 3 — CLI (керованість)
**Мета:** команди прогону.
**Беклог:** P3-1…P3-3. `forge run <style>` · `forge resume <runId>` · `forge inspect <runId>`.

**Acceptance criteria**
- AC3.1 — `forge run heroes3` → `runId` + `envelope.json` + playable.
- AC3.2 — `forge resume <runId>` продовжує з місця паузи.
- AC3.3 — `forge inspect <runId>` друкує статуси стадій.

**Тести:** integration run→inspect · resume після штучного переривання.

> 🛑 **CHECKPOINT D — ти перевіряєш:** запускаєш 3 команди сам.

---

## Phase 4 — Gates (human-in-the-loop)
**Мета:** стоп на майлстоунах + `cost-preview` перед генерацією. Реалізує Q10/Q30/Q32.
**Беклог:** P4-1…P4-3. `gate:true` на стадії → `status:"needs-approval"`; `forge approve <runId>`; перший gate — cost-preview.

**Acceptance criteria**
- AC4.1 — прогін **зупиняється перед asset-gen** з прогнозом вартості; `run.json.status==="needs-approval"`.
- AC4.2 — `forge approve` продовжує; відмова — лишає на паузі.
- AC4.3 — є «overpush» (продовжити попри ворнінг) — Q30.

**Тести:** integration: стоп на gate → approve → завершення; відмова → лишається needs-approval.

> 🛑 **CHECKPOINT E — ти перевіряєш:** реальний cost-preview gate (підтверджуєш суму перед генерацією).

---

## Phase 5 — Planner (новий модуль)
**Мета:** відсутня стадія: намір → план екранів + список ассетів. Реалізує Q28/Q29.
**Беклог:** P5-1…P5-3.

**Acceptance criteria**
- AC5.1 — Planner-стадія видає `plan.screens[]` + `plan.assetKeys[]` у валідному форматі.
- AC5.2 — план **редагований ДО asset-gen** (Q29).
- AC5.3 — downstream (assetgen/build) споживає `plan`, а не статичний список.

**Тести:** planner дає валідний plan-schema · integration наскрізь до білда.

> 🛑 **CHECKPOINT F — ти перевіряєш:** згенерований план екранів **перед** генерацією ассетів.

---

## Зведення human-checkpoints (де приходиш ТИ)
| # | Коли | Що підтверджуєш |
|---|---|---|
| A | після Phase 0 | форма Envelope + run.json (контракт) |
| B | після Phase 1 | реальний run.json + resume працює |
| C | після Phase 2 | before/after playable ідентичні (no regress) |
| D | після Phase 3 | 3 CLI-команди працюють |
| E | після Phase 4 | cost-preview gate (підтвердження суми) |
| F | після Phase 5 | план екранів перед asset-gen |

## Ризики
- **R1** — рефактор Phase 2 може непомітно змінити вивід → мітигація: golden + visual ALL PASS, обовʼязковий CHECKPOINT C.
- **R2** — нова тест-інфра (`node:test`) → тримати тести малими й швидкими.
- **R3** — `zod` як нова залежність → ок, стандарт, легка.

## Процес
Спершу ця спека → рев'ю → твоя вичитка → **тільки потім** код. Кожна фаза закривається за Definition of Done + чекпойнт.
