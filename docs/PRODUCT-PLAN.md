# Product Plan v1 — tiers · sequence · acceptance criteria

Пайплайн (Фази 0-5) готовий — це хребет. Цей план — продуктові епіки поверх нього.
**Напрям: Path A (CLI/agent-first)** — V1 = інструмент із сильними defaults; UI пізніше
(брифи: «фабрика — вектор, не старт»). Статус: `todo · wip · done · blocked`.

## Уже доставлено пайплайном (не плутати з «нема»)
- **C-core** ✅ planner-стадія + plan у envelope (лишилась UI/edit-обгортка).
- **F-core** ✅ cost-preview gate + cost.json (лишились retry/edit/failures).
- **G-core** ✅ 10 архетипів + 11 шаблонів + lint (лишились experimental/animation).
- **H** ✅ validate-стадія (готово повністю).

---

## TIER 0 — Прерквізити (розблоковують усе) · робимо першими

| ID | Задача | Acceptance Criteria | Залеж. | Статус |
|----|--------|---------------------|--------|--------|
| **PRE-1** | Brief-дедуп (legacy `Brief`→`BuildBrief`, pipeline `Brief` канон) | один канонічний `Brief`; tsc+45/45; byte-identical ✅ | — | **done** |
| **PRE-2** | T-01 — заповнити стандарт шаблону | `TEMPLATE-STANDARD.md`: визначення, поля manifest, структурні вимоги, **вигляд по архетипах**, ворота промоції; критерій «гра → шаблон» однозначний | — | todo |
| **PRE-3** | Список must-have механік v1 (Q12) | задокументовано ≥10 механік з 1-рядковими описами + який архетип/екрани; лежить у docs | — | todo |

## TIER 1 — P0 ядро продукту

| ID | Епік | Acceptance Criteria | Залеж. | Статус |
|----|------|---------------------|--------|--------|
| **D** | Mechanics catalog | структура «механіка = scaffold + AI-fill hooks»; CLI лістить механіки; комбінація 2 механік визначена (методи/функції); dev/user режим; ≥10 механік зареєстровано; bucket із сесій | PRE-2, PRE-3 | blocked |
| **B** | Brief stage (CLI-агент) | `brief`-команда бере prompt+refs (обов'язкові); валідований user-brief; версіонування + нетригерний відкат; summarize→топ-3 + суперкнопка; працює headless | PRE-1 | blocked |
| **C** | Planning layer (поверх planner) | план редаговано ДО asset-gen (вже на диску); flow `plan review/edit`; майлстоуни + перебивання будь-коли; невпевненість→питати | (C-core ✅) | blocked |

## TIER 2 — P1 підсилення

| ID | Епік | Acceptance Criteria | Залеж. | Статус |
|----|------|---------------------|--------|--------|
| **I** | Context-filler agent | дозаповнює відсутнє (ЦА/ніша/tone) з промту; позначає як inferred; не перетирає явне | B | blocked |
| **F+** | Asset-gen hardening (решта) | retry×3 з модифікованим промтом; фейли → `out/runs/<id>/failures/`; edit-toolkit (CLI правки ассета) | (F-core ✅) | blocked |
| **E** | Style system | 3-5 пресетів + власний; референс-картинки обов'язкові; style-каталог; image2style | — | blocked |
| **G+** | Compose & zones (решта) | прапор `experimental` на layout; animation-варіативність (GSAP+AI-SVG, тест ваги) | (G-core ✅) | blocked |
| **J** | Cross-cutting infra | інтерактивний грейбокс-viewport; версіонування+відкат прогонів; A/B-ітерація промтів | C | blocked |

## TIER 3 — закрите / відкладене
- **H** Validation ✅ done.
- **Z** Deferred: multi-agent, UI-пріоритет, open-source.

---

## Послідовність виконання (по порядку)
```
PRE-1 (Brief-дедуп) → PRE-2 (T-01) → PRE-3 (механіки)
   → D (catalog) → B (brief-агент) → C (planning)
   → I → F+ → E → G+ → J
   → Z (колись)
```
**Принцип:** Tier 0 знімає блокери дешево; D — серце (вхід для всього); B живить D і C; решта — підсилення. Не починаємо Tier N+1, поки Tier N не закрито (як у pipeline-чекпойнтах).

## Definition of Done (для кожного епіку)
`tsc` чистий · тести на нову логіку · byte-identical там де чіпаємо білд (golden) · запис у BUILD-LOG · статус у беклозі/дашборді.
