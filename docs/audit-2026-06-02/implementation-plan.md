# Implementation Plan v1 — звірено по реальному коду (2026-06-02)

Не по переказу, а по фактичному коду. Тут зафіксовано що уточнилось, фінальний план фаз і рішення, які закрив сам код.

## Що уточнено, прочитавши реальний код

**1. Модулів насправді не 6, а ~3 викличні одиниці.** Логічних ролей 6, але в коді вони злиті:
- `runAssetGen()` (`run.ts:99`) — це **Composer + AssetGen разом** (`resolveAsset()` викликається всередині, `run.ts:108`). Окремого Composer-модуля немає.
- `buildKitPlayable()` (`build-test-playable.ts:44`) — **Kit + Layout + HTML-композиція разом**.
- `cmdMenu()` — запис файлу + validate + log.

**2. Найважливіше: envelope між Phase 1 і Phase 2 фактично зламаний уже зараз.**
- Phase 1 вже пише `manifest.json` (`run.ts:130`) і сайдкари `{key}.json` (`run.ts:66`) — примітивний envelope **існує**.
- Але Phase 2 його **не читає**. `buildKitPlayable` лізе на диск по хардкоднутих іменах: `ICONS`, `NINE`, `"banner"`, `"bg-castle"`, `"knight"` (`build-test-playable.ts:17, 57-61`), хардкоднутий fallback `KNIGHT_SRC = "out/prompt-lab/heroes3-knight/..."` (рядок 18) і хардкоднутий `FONT = Cinzel` (рядки 20-21).
- Контракт між модулями зараз = «файли існують на диску з такими іменами», причому імена **зашиті в білдер**, а не приходять з брифа. Manifest, який Phase 1 чесно генерує, просто ігнорується.
- **Висновок:** уніфікований JSON-envelope лікує не абстракцію, а **реальний баг у коді**.

**3. Немає `runId` / центрального стану.** Перезапуск = skip-existing по `out/{styleId}/`. Одна тека на стиль, не на запуск. Паузи / replay / кілька прогонів неможливі.

## Фінальний план

| Фаза | Що робимо | Прив'язка до коду |
|---|---|---|
| **0. Контракти** | Zod-схеми: `Envelope`, `Stage<In,Out>`, `RunContext`; layout `out/runs/{runId}/`. Поведінка не міняється. | новий `src/assetgen/pipeline/` |
| **1. Orchestrator + 1 стадія** | Runner + `run.json` стейт-машина. Обгорнути **Validator** (найчистіший, pure `html→verdict`) як перший `Stage` — довести envelope на безпечному прикладі. | навколо `cmdMenu` / `validate` |
| **2. Розв'язати реальну злодійку** | Обгорнути `runAssetGen` → emit повний envelope. Переробити `buildKitPlayable` щоб **читав envelope** замість хардкоду `ICONS`/`KNIGHT_SRC`/`FONT`. | `run.ts:130` → `build-test-playable.ts:17-61` |
| **3. CLI** | `forge run <style>`, `forge resume <runId>`, `forge inspect <runId>`. | новий код у `cli.ts` поряд з `cmdForge` (`cli.ts:199`) |
| **4. Gates (human-in-loop)** | Стоп на milestone зі `status:"needs-approval"`; `forge approve <runId>`. Перший gate — **cost-preview перед AssetGen**. | реалізує Q10 / Q32 з Brief Quest |
| **5. Planner (новий модуль)** | Відсутня стадія: намір → план екранів + список ассетів (0% коду сьогодні). | закриває «not built» з `audit.md` |

**Логіка послідовності:** фази 0-2 = кістяк + лагодження наявного болю. 3-4 = керованість і паузи. 5 = майбутні AI-агенти.

## Рішення, яке закрив сам код

**`run.json` стейт-машина — так, НЕ stateless.** Обґрунтування тепер не «мені зручно», а конкретно: Phase 1 **вже** пише `manifest.json`; `run.json` — його природна еволюція (per-run замість per-style + граф стадій). Stateless змусив би руками тягати `runId` і реконструювати «що зроблено» — а ми хочемо **паузи й replay**.

## Процес далі
Якщо план ок → оформити його в спеку (`docs/superpowers/specs/...`), прогнати через рев'ю, дати вичитати — **перш ніж** писати імплементаційний код.

## Звʼязок з рештою
- Закриває «MISSING»-кроки з [`audit.md`](audit.md) (Planner, orchestrator, envelope).
- Реалізує рішення [`brief-decisions.md`](brief-decisions.md): Q10 (перебивання), Q29 (plan до asset-gen), Q30 (overpush), Q32 (cost-preview), Q35 (зберігати спроби).
- Уточнює крок-карту з [`architecture.md`](architecture.md): де саме envelope і стейт сідають у наявний код.
