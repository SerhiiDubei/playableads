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
