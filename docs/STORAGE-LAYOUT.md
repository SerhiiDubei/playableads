# Storage layout — де що лежить (єдина мапа)

Канонічна мапа сховищ проєкту. Якщо не знаєш, куди класти файл — дивись сюди.
Статус: ✅ готово · 🟡 узгоджено, ще не наведено лад (задача S) · 🚧 заготовка.

## Код (`src/`)
| Шлях | Що | Статус |
|---|---|---|
| `src/assetgen/kit/` | спільне: компоненти (`kit.ts`), зони (`layout.ts`), CSS (`screen-css.ts`), groups/flow/catalog | ✅ |
| `src/assetgen/layouts/` | **екранні шаблони** (11 zone-driven) + index + lint + types | ✅ |
| `src/assetgen/pipeline/` | Phase 0 раннер (Envelope/RunState) | ✅ |
| `src/assetgen/build-*.ts` | білдери (test-playable, game, connect, recipes, experiments, components) | 🟡 ігрові → `labs/` (S-02) |
| `src/assetgen/labs/` | reference-дані asset-gen (hero json) — НЕ ігри | ✅ |
| `src/assetgen/` (одинокі скрипти) | optimize-*, gen-only, menu-buttons, sprite-icons, ref-test, test-openai, prompt-lab, md-to-html | 🟡 тріаж → `labs/` чи видалити (S-05) |
| `src/build/`, `src/loader.ts`, `src/cli.ts`, `src/builder.ts` | ядро білда + CLI | ✅ |

## Ігри
| Шлях | Що | Статус |
|---|---|---|
| `labs/<гра>/` | **чернетки ігор (за замовчуванням ТУТ)** | ✅ готова домівка (порожня) |
| `templates/<гра>/` | **промоутовані ігри** (за стандартом T + запитом) | 🟡 зараз тут labs-и (S-02 перенесе) |

## Контент / вхід
| Шлях | Що | Статус |
|---|---|---|
| `styles/*.brief.json` | стильові брифи (палітра/референси/тон) | ✅ |
| `briefs/*.json` | повні build-брифи (вхід для `playable build`) | 🟡 уточнити різницю зі styles/ (S-01) |

## Вихід (`out/`, git-ignored)
| Шлях | Що | Статус |
|---|---|---|
| `out/<style>/` | згенеровані ассети по стилю | 🟡 пласко (S-03) |
| `out/*.html` | зібрані playable + логи вперемішку | 🟡 → `out/playables/` + `out/logs/` (S-03) |
| `out/runs/{runId}/` | структуровані прогони (новий pipeline) | ✅ (Phase 0) |
| **Цільова схема (S-03):** | `out/playables/ · out/assets/<style>/ · out/runs/ · out/logs/` | 🚧 план |

## Тести (`test/`)
| Шлях | Що | Статус |
|---|---|---|
| `test/menu-playable/`, `game/`, `connect/`, … | build-фікстури (index.html + assets) | ✅ |
| `test/visual*/` (6 тек) | скрін-бейзлайни | 🟡 → `test/visual/<suite>/` (S-04) |
| `test/EXPERIMENT-LOG.md` | журнал експериментів | ✅ |

## Документація (`docs/`)
| Файл | Що |
|---|---|
| `STORAGE-LAYOUT.md` | **ця мапа** |
| `SYSTEMS.md` | дві системи (layouts vs groups/flow) + labs-first |
| `TEMPLATE-STANDARD.md` | 🚧 скелет стандарту шаблону (T-01) |
| `ROADMAP.md` | беклог (епіки Z/M/I/S/T + v1 product) |
| `MANUAL-QA.md` | ручний чек-лист |
| `playable-design-rules.md` | lint-правила |
| `layout-authoring-guide.md` | кроки авторингу (🟡 застарів, T-02) |
| `meta-playable-requirements.md` | вимоги Meta |
| `audit-2026-06-02/` | аудити + pipeline-беклог + рішення |
