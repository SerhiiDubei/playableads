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

## D — Mechanics catalog v1 (2026-06-03) · TIER 1 start
**Зроблено:** `manifest.catalog: "v1"` додано до fruit-bonanza + mad-mage-tower; `TemplateManifest.catalog?` у типах; `src/assetgen/mechanics.ts` — `listMechanics(mode)` поверх `loader.listTemplates`: user=курований v1, dev=всі. CLI `npm run mechanics [-- --dev]`. Розширюваний (manifest → авто). +mechanics.test.ts.
**Перевірено:** tsc · 47/47 tests · `mechanics`→2 v1, `--dev`→6. **AC D (v1) ✅** (combine-2 механік + scaffold-AI-fill → беклог/решта епіків).
**Далі:** B (Brief-агент, CLI) — будується на канонічному `Brief` (PRE-1).

## B — Brief stage (CLI-агент) (2026-06-03)
**Зроблено:** `src/assetgen/brief/` — `UserBrief` (zod: prompt+refs обов'язкові, yellow-поля); `store.ts` (версіонування v1/v2 + нетригерний rollback через `current`-вказівник, інжектований root для тестів); `summarize.ts` (топ-3 механік за збігом промту + v1-бонус → суперкнопка); `cli.ts` (`brief new/list/show/rollback`). `npm run brief`. intake → `briefs/user/<id>/` (gitignored).
**Перевірено:** tsc · 52/52 tests (+5: schema/versioning/rollback/slugify/summarize) · демо: `brief new "tumble slot..."` → 3 yellow-warns + суперкнопка Fruit Bonanza (score 8).
**AC B ✅:** prompt+refs обов'язкові · валідований user-brief · версіонування+нетригерний rollback · summarize→топ-3+суперкнопка · headless. **Далі:** C (planning поверх planner).

## C — Planning layer (2026-06-03) · TIER 1 complete
**Зроблено:** `pipeline/plan-edit.ts` (чисті add/rm screen+asset) + `pipeline plan show|add-screen|rm-screen|add-asset|rm-asset <runId>` у CLI — редагування `envelope.plan` ДО asset-gen (поверх planner-gate з Phase 5). +plan-edit.test.ts.
**Перевірено:** tsc · 55/55 tests · флоу: `run --plan`(пауза)→`plan show`(10 screens/13 keys)→`rm-screen battle`(9)→`rm-asset avatar-frame`(12)→`approve`→assetgen спожив 12 ассетів. «План редагований до asset-gen» (Q29) ✅.
**AC C ✅** (review/edit + downstream споживає). Майлстоуни/uncertainty→ask — агентні поведінки на потім.
**🏁 TIER 1 (P0-ядро) ЗАКРИТО:** D (catalog) + B (brief-агент) + C (planning). Ланцюг Brief→Catalog→Plan→Pipeline з'єднаний на CLI.

## Create-new-mechanic (2026-06-03) 🆕
**Зроблено:** `src/assetgen/scaffold.ts` — `scaffoldMechanic({id,name,desc,baseDir})` → `labs/<id>/{manifest.json (без catalog→draft), game.ts}`; валідація id + guard дублів. CLI `playable new <id>` → **labs/** (було templates/, тепер labs-first). `mechanics.listDrafts()` читає labs/. Studio: `/api/drafts`, `/api/scaffold` + форма «Нова механіка». Спільний scaffolder для CLI+Studio+тестів.
**Перевірено:** tsc · 57/57 tests (+scaffold) · смоук: `playable new`→labs/, Studio create→labs/ + drafts лістить + dup→409.
**Тепер можна:** не лише обирати наявні, а й **створювати нові** механіки (чернетки в labs/), потім промоція за T-01.

## Studio v2 + Agent-2 + refgames base (2026-06-04) 🆕
**Зроблено:** (1) Studio v2 (`src/server/ui-v2.html`, `/v2`) — чат-перший UX, живий бриф механіки, картки-архетипи. (2) Claude Agent SDK вшито (`src/server/agent.ts`, `/api/agent`) — вільний текст→бриф на ПІДПИСЦІ (без API-ключа; `settingSources:[]`+`allowedTools:[]`). (3) Бриф→manifest чернетки (`scaffold.ts` +brief). (4) **refgames knowledge base** (`src/assetgen/refgames/`): rich-схема (7 секцій: identity/core+rubric/gameplay/animations/screens/assets/meta, ранжовані ahaMoments) + zod-валідація на load + Fruit Ninja seed. (5) **Schema-quality test** (`gen-test.ts`, `npm run refgames:gen`): refgame→LLM→game.ts→bundle→validate.
**Перевірено:** tsc · 58/58 tests (+brief-persist) · **наскрізний runtime-тест fruit-ninja**: згенеровано 19KB game.ts ($0.28) → зібралось 594KB/2MB, validation OK → у браузері (Playwright): рендер без помилок, свайпи нарізають фрукти, score→18 тригерить ендкард «AWESOME», CTA «Play Now» → `FbPlayableAd.onCTAClick()` спрацював. Контракт-нюанс пофікшено (заборона `?.` на CTA).
**Висновок:** rich-схема refgames **достатня** для генерації робочого playable з повним циклом (дія→aha→win→CTA). Знання детерміновані, не «з капелюха».
**Відкрито:** база поки 1 гра (треба LLM-деконструктор для росту); генерація ще не вшита в UI Агента 2; візуал code-only (без AI-ассетів).

## refgames v2 — SB3 lessons → schema → regen (2026-06-04) 🆕
**Зроблено:** Проаналізовано повний Scratch-сорс Fruit Ninja (.sb3: 34 спрайти, 31 звук, 1512 блоків) → 3-way порівняння (прототип/HTML/SB3, `FN-3WAY-COMPARISON.md`). Влито уроки в схему refgames: `comboRule` (часове вікно+множник+голос), `specialItems[]` (frenzy/freeze/double/pomegranate), `audioEvents[]` (подія↔звук+варіації), `modes[]`. Оновлено запис fruit-ninja цими даними. Витягнуто 4 .wav з SB3 (slice/combo/bomb/throw, 249KB). Контракт генерації v2: розріз→2 половинки+сік, часове комбо+множник+банер, frenzy-банан, бомби, реальне аудіо через `cfg.assets`.
**Перевірено:** tsc · refgames validate ✓ · перегенеровано → зібралось 926KB/2MB, validation OK · браузер (Playwright): 0 runtime-помилок, score 40 (множник діє, проти 18 у v1), лічильник життів, ендкард «Fruit Master» + CTA · код-інспекція: підтверджено spawnHalf/juiceSplat/COMBO_WINDOW/mult/frenzyT/BOMB/sfx() — усі уроки реалізовані.
**Обмеження:** звук нечутний у harness (вшито, 0 помилок); half-flight/банер не заморожено в кадрі (таймінг), але підтверджено в коді.
**Висновок:** цикл «реальний сорс → схема → генерація» працює: розрив до продакшену звужено за один прохід (логіка+аудіо+половинки). Схема тепер тримає і логіку, і аудіо-мапу.

## kit/motion.ts + v3 regen (2026-06-04) 🆕
**Зроблено:** Декомпільовано Fruit Ninja Retro (Unity, Mono) → реальна модель руху (`MOTION-SYSTEM.md`): фізична арка (час+гравітація, не швидкість), launch майже вертикальний (±10°), ескалація щільності не швидкості, адаптивна складність (rolling-window success). Збудовано `src/assetgen/kit/motion.ts`: `makeArc()` (g=8H/T², v0y=-4H/T → зависання на піку), screen-relative токени, `DifficultyController` (rubber-band). Контракт генерації оновлено: зобов'язує `makeArc`+`DifficultyController`+dt, забороняє `x+=speed`/speed-ramp. Генератор версіонує вивід (`out/<id>-gen-vN.html`).
**Перевірено:** tsc · 6/6 motion-тестів (апекс 72%±5%, політ 2.2с±0.15, dt-незалежність 30/120fps <3%, зависання vy<20, slice-window≥1.2с) · v3 згенеровано → 927KB OK · код v3 юзає makeArc/DifficultyController/deltaMS, 0 анти-патернів · браузер: фрукти злітають знизу арками й зависають (старт-кадр), розріз у apex-band → score 30 → win-ендкард + CTA.
**Висновок:** головну болю «все літає» виправлено фундаментально — рух тепер фізична арка з зависанням, dt-correct, ескалація щільності. v2 (до) і v3 (після) клацабельні поруч.
**Відкрито:** раз бачив передчасний ендкард score-0 (не відтворюється, ймовірно rAF-throttle); візуал ще code-only (кружечки, не спрайти).

## refgames v4 — AI assets + full-game (2026-06-04) 🆕
**Зроблено:** `gen-assets.ts` — генерує fruit sprite-sheet (3×2 → sharp-slice) + bomb + dojo-bg через gpt-image-1.5, ОПТИМІЗУЄ (trim→resize→webp, джерела в assets/_src/ не інлайняться) → 111KB webp (~$0.13). Контракт генерації v4: спрайти замість кружечків (Assets.load webp, half-slice через маску, juice), ПРИБРАНО стоп на score (повноцінна timed-гра ~25с), STICKY CTA весь час, БОМБА=м'який штраф (життя, не game-over), frenzy без бомб.
**Перевірено:** tsc · v4 згенеровано 1114KB/2MB OK · код: 0 score-stop, sticky CTA (рядок 97), "game continues — never finish from bomb" (238) · браузер: рендер додзьо-фон + спрайти фруктів + кавун розрізаний навпіл з соком + score 90 (НЕ зупинилось на 30) + таймер + 3 життя + sticky CTA; CTA спрацював ПІД ЧАС гри (ctaDuringPlay:1); 0 runtime-помилок.
**Висновок:** трансформація code-only→продакшн-вигляд за один прохід. v2(кружечки,стоп) ↔ v4(арт,повноцінна гра) клацабельні.
**Відкрито:** half-slice через маску працює, але можна точніше; bg 7KB трохи м'який; ще нема motion-lint гейта.

## refgames v5→v6 — 3 покращення (2026-06-04) 🆕
**Зроблено (ідеї 1,2,5):** контракт генерації +: (1) розріз УЗДОВЖ свайпу (atan2 кут, обернена маска) + світний слід-лезо; (2) ПОСТІЙНІ плями соку на фоні (накопичуються) + slow-mo+zoom на великих комбо; (5) всі 4 спец-предмети (frenzy/freeze/double/pomegranate, glow-кольори). v5 впав на pointermove (null.x — Pixi обходив знищені інтерактивні діти) → додано правило СТАБІЛЬНІСТЬ (interactiveChildren=false на ігрових шарах, ручний хіт-тест, removeChild перед destroy) → v6.
**Перевірено:** v6 1118KB/2MB OK · код: atan2/trailLayer/stainLayer/slowMo/4×Special присутні; interactiveChildren=false на world/stain/game/trail · браузер: стрес-різання 6 свайпів → 0 console-помилок (баг null.x усунено) · ендкард «TIME'S UP» (завершення по таймеру, не score) + sticky CTA · pomegranate-спец видно (фіолетовий glow).
**Висновок:** 3 фічі вшито + регресію виправлено правилом у контракті (наступні генерації не впадуть). v6 — найкраща версія.
**Відкрито:** слід-лезо не заморожено в кадрі (згасає 0.2с); точність half-cut по кутах можна ще полірувати; motion-lint гейт ще не зроблено.

## refgames v7 + deploy (2026-06-04) 🆕
**Зроблено:** AI splatter-асети (2×2 white solid-fill sheet → slice → splat1..4.webp, ~$0.05) для плям соку на стіні; контракт: плями = Sprite(splatN).tint=колір фрукта (не Graphics-blob). Згенеровано v7. Задеплоєно на gh-pages як fruit-ninja.html (worktree ../gh-pages-deploy).
**Перевірено:** v7 1185KB/2MB OK · браузер: стіна вкрита кольоровими плямами соку (splat-спрайти тоновані), Combo x11 банер, score 685, 0 runtime-помилок · splat alpha виміряно (19% opaque, суцільна заливка — не контур; пастка білий-на-білому) · gh-pages URL https://serhiidubei.github.io/playableads/fruit-ninja.html → 200 (відкривається на телефоні).
**Висновок:** повний playable з якісними асетами публічно доступний за посиланням для мобільного тесту.

## refgames v8 — flesh-reveal slicing (2026-06-04) 🆕
**Зроблено:** AI fruit-halves аркуш (3×2 зрізи з м'якоттю: кавун+насіння, яблуко серцевина, апельсин дольки, полуниця, лимон, слива з кісточкою) → half1..6.webp (~$0.06). Контракт: на розрізі ховаємо цілий фрукт (шкірка) → показуємо halfN (зріз-м'якоть) як 2 половинки через маску по куту свайпу. Видно соковиту середину (ефект «3д нутрощів»). v8 згенеровано, задеплоєно (fruit-ninja.html).
**Перевірено:** v8 1333KB/2MB OK · код рядок 174: new Sprite(tex["half"+fruitN+".webp"]) · браузер: 0 runtime-помилок (маска half стабільна), розрізані половинки з м'якоттю видно, стіна в плямах соку, score працює · gh-pages оновлено v8.
**Висновок:** розріз тепер реалістичний — шкірка зовні, м'якоть на зрізі (як SB3 Left/Right костюми).

## Plan sync (2026-06-04) 🆕
**Зроблено:** Синхронізовано плани з реальністю. Створено `docs/REFGAMES-BACKLOG.md` (трек R: R-01..10 done, R-11..17 todo). PRODUCT-PLAN: додано трек R, E/F+/G+/J → `partial (via R)`, UI → `done v2`. ROADMAP: T-01 todo→done (TEMPLATE-STANDARD чинний), додано refgames-track секцію + примітку S-02 (labs-first де-факто діє).
**Перевірено:** доки звірені між собою (T-01 розбіжність усунено); BUILD-LOG = джерело стейджів.
**Висновок:** документи знову = джерело правди; refgames-трек видимий у роадмепі/беклозі.

## NEW GAME: Akuma No Yoru (Demon Slayer Night) (2026-06-04) 🆕🆕
**Контекст:** новий референс — Unity 2D екшн-платформер з мілі-боєм (декомпільовано Assembly-CSharp, 36K рядків: PlayerController/PlayerCombat/EnemyHealth, вороги amphibian/crow). Дистильовано в **swipe-survival**: демони НАСУВАЮТЬСЯ, рубаєш свайпом, є життя.
**Зроблено:** (1) `kit/motion.ts` +`makeApproach` (загрози до цілі, dt-correct, screen-rel) +2 тести. (2) **УЗАГАЛЬНЕНО генератор** `gen-test.ts` — `buildContract(g,imageKeys,audioKeys)` робить БУДЬ-ЯКУ гру зі схеми (асети динамічні, рух arc/approach за брифом). (3) refgame-запис `akuma-no-yoru`. (4) `gen-akuma-assets.ts` — AI демони(6)/воїн/ніч-фон/кров (~$0.25, webp), реюз sfx fruit-ninja. (5) Генерація v1→v3.
**Перевірено:** tsc · 66/66 тестів · v1 баг (ріг: демони зливали 3 життя за 6с→endcard) → знайдено дебаг-глобалом (running=false, gtl заморожено) → фікс контракту (end лише по таймеру, грейс, щедрий хіт-радіус, повільні демони) → v2 (гра йде всі 27с, kills+score 0→40 при влучанні) → v3 (компактна назва, демони 0.10-0.14sh/s, score 25 у тесті, CTA cta:1). Браузер: демони видимі, кров на стіні, атмосфера, 0 runtime-err (лише gsap transformOrigin warning — безпечно).
**Деплой:** gh-pages → https://serhiidubei.github.io/playableads/akuma-no-yoru.html
**Висновок:** конвеєр зробив ДРУГУ, зовсім іншу гру (екшн замість слешера фруктів) тим самим шляхом — підтвердив, що генератор справді generic. makeApproach + generic-contract — нові переюзовні цеглини.
**Відкрито:** баланс життів (зливаються при пасивній грі, але гра не обривається); gsap transformOrigin warning у контракт-заборону; назва демонів-half (зараз poof, не розруб навпіл).
