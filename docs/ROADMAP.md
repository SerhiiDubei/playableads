# Roadmap / Backlog — forge × zones integration

Структурований план решти роботи зі зведення desktop forge (`layouts/`) із зоновим
двигуном (`kit/layout.ts`). Веди як живу таблицю: онови **Статус** коли береш/закриваєш.

**Легенда**
- **Пріоритет:** `P0` блокер · `P1` важливо · `P2` бажано · `P3` колись
- **Тег:** `#zones` розкладка · `#infra` тести/тулінг · `#cleanup` борг · `#docs` · `#release`
- **Цінність:** High / Med / Low (вплив на якість/швидкість)
- **Оцінка:** ідеальні години роботи (без рев'ю/перерв)
- **Статус:** `todo` · `wip` · `done` · `blocked`

---

## Епік: Крок 3 — мігрувати решту шаблонів на зони

Доведений патерн (на `endcard`): шаблон оголошує `meta.zoneTypes` → білдер інжектить
`zoneCss(resolveLayout(type))` → кладеш у `zone(...)` + `data-type` → lint підтверджує.
Кожен шаблон: (1) спроєктувати/перевикористати зоновий архетип у `kit/layout.ts`,
(2) переписати `screens()`, (3) `pageCss` лишити тільки візуал, (4) build + `check:layouts` + `visual`, (5) глянути скрін.

| ID | Назва | Пріор. | Тег | Цінність | Оцінка | Архетип | Залежності | Статус |
|----|-------|--------|-----|----------|--------|---------|------------|--------|
| Z-00 | `endcard` → зони (еталон) | P1 | #zones | High | 1.5h | `endcard` (є) | — | **done** |
| Z-01 | `pick-hero` → зони | P1 | #zones | High | 0.5h | `pick-hero` (є) | — | todo |
| Z-02 | `menu5` → зони (5 екранів nav) | P1 | #zones | High | 2h | `menu` (є) | портувати з main-демо (git history) | todo |
| Z-03 | `feature-grid` → зони | P2 | #zones | Med | 1h | новий `feature-grid` | — | todo |
| Z-04 | `feature-list` → зони | P2 | #zones | Med | 1h | новий `feature-list` (або reuse Z-03) | Z-03 | todo |
| Z-05 | `tap-reveal` → зони (2 екр.) | P2 | #zones | Med | 1.5h | новий `reveal` | — | todo |
| Z-06 | `progress-reveal` → зони (2 екр.) | P2 | #zones | Med | 1.5h | reuse `reveal` | Z-05 | todo |
| Z-07 | `two-choice` → зони (2 екр.) | P2 | #zones | Med | 1.5h | новий `two-choice` | — | todo |
| Z-08 | `match-cluster` → зони (board+reveal) | P2 | #zones | Med | 2h | новий `board` | Z-05 | todo |
| Z-09 | `tutorial` → зони (3 екр.) | P3 | #zones | Low | 2h | новий `tutorial` | — | todo |

**Сума епіку:** ≈ 13h (з них 1.5h done). Дешеві першими: Z-01 (архетип уже є), Z-02 (є код у main-демо).

---

## Епік: інфраструктура й закриття

| ID | Назва | Пріор. | Тег | Цінність | Оцінка | Залежності | Статус |
|----|-------|--------|-----|----------|--------|------------|--------|
| I-01 | `visual-test.ts` перевіряє зони для **будь-якого** `data-type` (не хардкод menu/game/...) | P1 | #infra | High | 1h | — | todo |
| I-02 | `check:layouts -- all` зелений на всіх мігрованих шаблонах | P1 | #infra | High | 0.5h | епік Z-* | blocked (Z-*) |
| I-03 | Звірити авто-merge `kit.ts` + `CLAUDE.md` на здоровий глузд (не лише tsc) | P1 | #cleanup | High | 0.5h | — | todo |
| I-04 | Прибрати `enforceZones`/`maxHeroPx` дублі після міграції (lint бере з зон) | P2 | #cleanup | Med | 0.5h | епік Z-* | todo |
| I-05 | (опц.) перейменувати теку `layouts/` → `templates/`? — обережно, багато import-шляхів | P3 | #cleanup | Low | 1h | — | todo |
| I-06 | Прибрати тимчасові worktrees (`forge-wip`, `forge-integrate`) + гілку `desktop-forge-wip` після merge | P2 | #release | Med | 0.25h | R-01 | todo |
| R-01 | Змержити PR #2 (`integrate-forge` → `main`) | P1 | #release | High | 0.5h | I-01, I-02, I-03 | blocked |

---

## Зроблено (контекст)

- **Крок 0** — desktop-робота збережена в гілці `desktop-forge-wip` (push). ✅
- **Крок 1** — колізія імен: зоновий `Layout` → `ZoneSpec`; recipe `Layout` лишився. ✅
- **Крок 2** — одне джерело зон: `LINT_ZONES` ← `BASE`; `layouts/zones.ts` видалено. ✅
- **Крок 3 (endcard)** — zone-driven + плюмбінг білдера (`meta.zoneTypes`), backward-compat. ✅
- **Крок 4** — pipeline-інжект зон на місці. ✅
- **Крок 5** — endcard: lint PASS + visual no-overflow ×8; `tsc` чистий щокроку. ✅

**Гілки:** `integrate-forge` (робоча, PR #2) · `desktop-forge-wip` (сейф) · `main` (зоновий двигун).

## Як продовжити (рекомендований порядок)
1. **I-03** (0.5h) — переконатись, що merged `kit.ts`/`CLAUDE.md` коректні. Дешево, знімає ризик.
2. **Z-01 → Z-02** (2.5h) — найдешевші конверсії (архетипи вже є), дають швидкий прогрес.
3. **I-01** (1h) — generic zone-check у visual, щоб тести ловили мігровані шаблони автоматично.
4. **Z-03…Z-09** — за пріоритетом, по одному зі скріном на рев'ю.
5. **I-02 → R-01** — фінальний green + merge у main.
