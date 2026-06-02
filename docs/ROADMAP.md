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

---

# v1 Product Backlog — з brief-decisions (2026-06-02)

Виведено з voice-сесії відповідей на 50 питань. Деталі рішень: [`audit-2026-06-02/brief-decisions.md`](audit-2026-06-02/brief-decisions.md) · візуалізація: [`audit-2026-06-02/decisions.html`](audit-2026-06-02/decisions.html).

**Легенда статусу коду:** ✅ є · 🟨 частково · 🟥 нема (нове)

## Епіки

| ID | Епік | Пріор. | Код зараз | Ключові пункти (Q) |
|----|------|--------|-----------|--------------------|
| **B** | **Brief stage** (UI) | P0 | 🟥 | fast/deep flow (Q21); поле-інпут на всіх етапах + перетяг референсів (Q24); обов'язкові: промт+референси, «жовті» поля з ворнінгом (Q09,Q22); summarize-agent → топ-3 + суперкнопка (Q06); user-brief версіонування + нетригерний відкат (Q25) |
| **C** | **Planning layer** | P0 | 🟥 | screen/flow planner (Q28); plan editable ДО asset-gen з UI (Q29); майлстоуни + перебивання будь-коли (Q10); невпевненість→питати + червона overpush (Q30); 1-екран…15-екран (Q26,Q27) |
| **D** | **Mechanics catalog** | P0 | 🟨 | гібрид scaffold+AI-fill (Q14); комбінувати 2 механіки = методи/функції (Q13); dev vs user режим (Q14); «конструктор» правок (Q34); каталог = розробник+код, bucket із сесій (Q15); **10 механік у v1**, необмежено архітектурно (Q11); must-have список — окрема сесія (Q12 🟥) |
| **E** | **Style system** | P1 | 🟨 | 3-5 пресетів + власний (Q16); **референс-картинки обов'язкові** (Q17); prototype/greybox-стиль (Q17); image2style нові стилі (Q18); каталог стилів + авторизація/pin (Q18); guard-tips на механіку (Q19); warn-not-block (Q20) |
| **F** | **Asset-gen hardening** | P1 | ✅🟨 | **prediction вартості перед gen** (Q32); retry з модифікованим промтом ×3 (Q33); повний edit-toolkit (Q34); зберігати невдачі для debug (Q35); provider лишаємо gpt-image-1.5 (Q31) |
| **G** | **Compose & zones** | P1 | ✅🟨 | прапор `experimental` (Q37); animation: GSAP + AI-SVG, тест ваги (Q38); variability: 20 варіацій → human-feedback → база знань (Q39); непорушні правила зон — з тестів (Q36 🟥) |
| **H** | **Validation** | P2 | ✅ | лишаємо meta-gate: розмір+CTA+no-redirect (Q41); no fail-with-warning (Q44); single-shot default (Q45); критики (style/semantic) — відкладені (Q20,Q43) |
| **I** | **Context-filler agent** | P1 | 🟥 | дозаповнює відсутнє (ЦА/ніша/tone) — збігати почитати про нішу (Q08) |
| **J** | **Cross-cutting infra** | P1 | 🟨 | **інтерактивний viewport/мокап (грейбокс)** — рухомі об'єкти (Q14,Q29); версіонування+відкат усього (Q25); A/B-ітерація промтів (Q46) |
| **Z** | **Deferred / відкрите** | P3 | 🟥 | multi-agent (Q47); UI-пріоритет (Q48); open-source (Q49); пояснити visual-regression+semantic-critic (Q42,Q43) |

## Найперше (Phase 0 — з аудиту + рішень)
1. **Переписати README** — аудит каже «бреше про архітектуру»; узгодити з реальністю + `playable-design-rules.md`.
2. **Прибрати дубль онтології «Brief»** (legacy `Brief` vs `StyleBrief`) перед тим як будувати User-Brief stage (Епік B).
3. **Зібрати must-have механіки** (Q12) — окрема сесія, тоді руками робити playable під кожну.

## Напруги, які треба зняти
- **«Фабрика» (Q01) vs «спершу інструмент» (Q05/S1)** — V1 — це інструмент із сильними defaults; «фабрика» — вектор, не стартова точка.
- **Якість як головна метрика (Q04)** проти throughput 20-100/тиждень (Q03) — потрібен баланс defaults↔ручні правки.
