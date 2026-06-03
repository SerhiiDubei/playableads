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
| — | 1 | 🛑 CHECKPOINT B | run.json + resume ок | P1-* | **review (чекає тебе)** |
| P2-1 | 2 | `runAssetGen` → emit `envelope.json` | AC2.3 | P1-* | blocked |
| P2-2 | 2 | `buildKitPlayable` читає Envelope; прибрати хардкод | AC2.1 | P2-1 | blocked |
| P2-3 | 2 | `cmdMenu` через раннер (assetgen→build стадії) | AC2.2 | P2-2 | blocked |
| — | 2 | 🛑 CHECKPOINT C | before/after ідентичні | P2-* | review |
| P3-1 | 3 | `forge run <style>` | AC3.1 | P2-* | blocked |
| P3-2 | 3 | `forge resume <runId>` | AC3.2 | P3-1 | blocked |
| P3-3 | 3 | `forge inspect <runId>` | AC3.3 | P3-1 | blocked |
| — | 3 | 🛑 CHECKPOINT D | 3 команди працюють | P3-* | review |
| P4-1 | 4 | `gate:true` → status needs-approval | AC4.1 | P3-* | blocked |
| P4-2 | 4 | `forge approve <runId>` (+ overpush) | AC4.2, AC4.3 | P4-1 | blocked |
| P4-3 | 4 | cost-preview gate перед asset-gen | AC4.1 | P4-1 | blocked |
| — | 4 | 🛑 CHECKPOINT E | cost-preview підтверджено | P4-* | review |
| P5-1 | 5 | Planner-стадія: намір → plan.screens + assetKeys | AC5.1 | P4-* | blocked |
| P5-2 | 5 | план редагований ДО asset-gen | AC5.2 | P5-1 | blocked |
| P5-3 | 5 | downstream споживає `plan` | AC5.3 | P5-1 | blocked |
| — | 5 | 🛑 CHECKPOINT F | план перед asset-gen | P5-* | review |

## Правила ведення
- Беремо задачу → `wip`; закрили за AC + тести → `done`; чекпойнт → `review` поки користувач не підтвердить.
- Після кожної ФАЗИ — обовʼязковий запис у `BUILD-LOG.md` (це HARD-правило, див. `CLAUDE.md`).
- Не починаємо наступну фазу, поки не пройдено human-checkpoint попередньої.
