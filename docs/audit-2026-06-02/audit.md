# Audit: Маніфест користувача vs реальність коду

**Дата:** 2026-06-02
**Сканована тека:** `forge-integrate/` (основна точка інтеграції, найсвіжіша)
**Метод:** Onto-Drift Audit (намір → маніфестація → дрейф → план)

---

## 0. Виконавче резюме

Поточна тулза — це **зрілий білдер playable-меню** з AI-генерацією ассетів, зоновою розкладкою і Meta-валідацією. Те, що описав користувач у маніфесті — **agentic-пайплайн з бріфу до готової playable з планувальником, оркестратором, рефлексією і версіонуванням промтів** — побудовано **частково (~40%)**, причому побудовані частини — найскладніші технічно.

**Що вже добре:** Phase 1 (asset gen) — production-grade. Zone-based layout — еталонна реалізація саме того, що описав користувач у "зонуванні". Meta validator — закриває всі вимоги мережі. Visual regression — 8 viewports з зонними перевірками.

**Чого не вистачає:** усе, що ДО асет-генерації — Brief stage, Screen planning, Component planning, Multi-agent orchestration. Решта (`reflection step`, `prompt versioning`) — окремо.

**Найболючіше:** README **бреше про архітектуру**. Він описує тулзу 2014 року в проєкті 2026-го. Це створює гравітацію в неправильний бік для кожного нового внеску (людини або AI).

---

## 1. Звірка маніфесту з реальністю

### 1.1 Кроки пайплайну, як описав користувач

```
0. Бриф (ніша, кінцевий результат, опціонально дві механіки)
1. Вибір механіки + стилю + бріфу → формування завдання
2. Screen plan + Flow plan + Byte/Hook
3. Розбивка на компоненти, ассети, анімації
4. Генерація ассетів (агентом, з контрактом стилю)
5. Композиція ассетів у playable
6. Зонування (de facto застосування зон)
7. Білд (single-file HTML)
8. Чек (зони, флоу, валідація Meta)
9. Тести (Playwright visual)
```

### 1.2 Маппінг на код

| # | Крок маніфесту | Що є в коді | Стан | Файли |
|---|---|---|---|---|
| 0 | Бриф (ніша → завдання) | **Немає** | ❌ MISSING | — |
| 1 | Вибір механіки+стилю+бріфу | Часткове: ручний `forge <style> --layout <id>` | ⚠️ CONFLICT (наявне ≠ задумане) | `src/cli.ts:cmdForge` |
| 2 | Screen / Flow plan | **Немає як крок**. Layout-файл вшиває все статично. | ❌ MISSING | (мав би бути новий модуль) |
| 3 | Розбивка на компоненти | **Зафіксовано як 13 ключів у kit-і** (button frame, panel, bar...) | ⚠️ STALE (динамічного розкладу немає) | `docs/playable-menu-skill.md:42-46` |
| 4 | Генерація ассетів | Готово: OpenAI gpt-image-1.5, retry, skip-existing, cost tracking | ✅ READY | `src/assetgen/run.ts`, `src/assetgen/compose.ts` |
| 5 | Композиція в playable | Готово через kit + layouts | ✅ READY | `src/assetgen/build-test-playable.ts`, `src/assetgen/kit/kit.ts` |
| 6 | Зонування | Готово: BASE ⊕ ARCHETYPE, debug overlay, primary CTA → actions zone | ✅ READY | `src/assetgen/kit/layout.ts` |
| 7 | Білд single-file HTML | Готово, інлайн ассети, base64 | ✅ READY | `src/build/inliner.ts`, `src/build/bundler.ts` |
| 8a | Чек зон (post-build) | Готово: Playwright lint, 6 hard rules + 6 soft rules | ✅ READY | `src/assetgen/layouts/lint.ts`, `docs/playable-design-rules.md` |
| 8b | Чек Meta vimog | Готово: size, CTA, no-redirect, no-external | ✅ READY | `src/build/validator.ts` |
| 9 | Visual regression | Готово: 8 viewports + zone assertions | ✅ READY | `src/assetgen/visual-test.ts` |
| — | Multi-agent orchestrator | **Немає**. CLI оркеструє dva кроки (Phase1+Phase2), агентів немає. | ❌ MISSING | — |
| — | Версіонування промтів | **Немає** systematically. Версіонуються тільки **бріфи** (`version: "1.0.0"`). | ⚠️ PARTIAL | `styles/*.brief.json` |
| — | Рефлексія / самооцінка | **Немає**. Є log report з метриками, але не модельна рефлексія. | ❌ MISSING | — |
| — | UI для вибору | **Немає**. Лише CLI. | ❌ MISSING | — |

### 1.3 Виявлені сутності в коді vs у маніфесті

| Сутність в маніфесті | Іменник у коді | Стан |
|---|---|---|
| **Brief** (ніша + механіка + стиль) | `Brief` (legacy, `briefs/*.json`) + `StyleBrief` (нова, `styles/*.brief.json`) | ⚠️ DUAL ONTOLOGY — два різні поняття "Brief" живуть поруч |
| **Mechanic** (Tower Defense, Match-3) | `mechanic` = template дир (`tap-the-coin`, `plug-in-socket`, але це **stubs**) | ⚠️ NAMING DRIFT — слово "механіка" в коді ≠ слово "механіка" в маніфесті |
| **Style** (стилістичне забарвлення) | `style.brief.json` (9 стилів) | ✅ ALIGNED |
| **Layout** (типи playable-екранів) | `layouts/*.ts` (10 layouts: menu5, endcard, tutorial, ...) | ✅ ALIGNED, але це насправді *архетипи екранів*, а не "плейбли" |
| **Zone** | `Zone` у `kit/layout.ts` | ✅ ALIGNED — еталонна реалізація |
| **ScreenPlan** | — | ❌ MISSING |
| **FlowPlan** | — | ❌ MISSING |
| **Hook/Byte** | — | ❌ MISSING |
| **Asset breakdown** | Фіксовані 13 ключів | ⚠️ HARDCODED, не план |
| **Agent (планувальник, генератор, композитор, критик)** | — | ❌ MISSING — все в CLI-функціях |
| **PromptVersion** | Тільки brief.version | ⚠️ PARTIAL |
| **ValidationReport** | `ValidationResult` + Playwright звіт | ✅ ALIGNED |
| **Playable** (як кінцевий артефакт) | `out/*.html` файл | ✅ ALIGNED |

---

## 2. Суперечливості

| # | Суперечливість | Де видно | Чому це біль |
|---|---|---|---|
| C1 | README заявляє 2D-модель (`templates × styles`), CLI підтримує 3D (`mechanics × styles × layouts`) | `README.md:3` vs `src/cli.ts:67-83` | Новий розробник/AI читає README, не дізнається про `--layout` |
| C2 | README у `forge-integrate/` та `repo/` ідентичні, хоча `forge-integrate/CLAUDE.md` ширший | diff README vs diff CLAUDE.md | README відстає від реальності коду |
| C3 | README хвалить "Two reference styles ship end-to-end: Heroes III + Pixel Quest", але в `styles/` 9 брифів | `README.md:26` vs `styles/*.brief.json` | Декларує "продуктову поверхню" вужче ніж вона є |
| C4 | `npm run menu` подається як головний test-командою, але skill-doc позиціонує `npm run forge` як production | `package.json:14` vs `docs/playable-menu-skill.md:13` | Два різні рекомендовані entrypoint-и |
| C5 | "Mechanic" у коді = template-дир для гри (`tap-the-coin`, `plug-in-socket`), але `npm run forge` рендерить **меню**, не гру. Тобто `forge cyber-heist` не використовує жодну "механіку". | `docs/playable-menu-skill.md:80`: "playable з форджа це **меню з 5 екранами**. Реальна механіка — окремий шар" | Слово "mechanic" перевантажене двома значеннями |
| C6 | Два формати "Brief" у проєкті: `briefs/*.json` (legacy: copy+params+mechanic+style) і `styles/*.brief.json` (current: AI-gen style spec) | `briefs/example.json` vs `styles/heroes3.brief.json` | Один і той самий термін описує дві різні речі |
| C7 | ROADMAP знає про "форсі × зони міграцію" (Z-00..Z-09), але User-маніфест говорить про вищий рівень (планувальник, оркестратор). | `docs/ROADMAP.md` vs user's pipeline | Поточний бэклог — про вилизування існуючого, не про досягнення задуманого |
| C8 | Хардкоднутий список 13 ассет-ключів очікується kit-ом; будь-який екран мусить продукувати саме ці 13. | `docs/playable-menu-skill.md:42-46` | Динамічне планування ассетів (як в маніфесті) **архітектурно неможливе зараз** |
| C9 | gh-pages-deploy має багато cyber-heist-* варіантів — але код у репо не показує що це за варіанти (layouts? styles?). Виглядає як попередня матриця, яка не повторюється. | `gh-pages-deploy/menu-cyber-heist-*.html` | Можливі мертві артефакти або не задокументований процес |
| C10 | Дві теки `forge-wip/` і `forge-integrate/` — обидві worktrees, ROADMAP каже їх прибрати після merge | `docs/ROADMAP.md:I-06` | Непочищена робоча інфраструктура |

---

## 3. Категоризація дрейфу (Drift Map)

### 3.1 Aligned (тримати, не чіпати)

- Zone-based layout (`kit/layout.ts`)
- Asset generation pipeline (`run.ts`, `compose.ts`)
- Meta validator (`build/validator.ts`)
- Visual regression (`visual-test.ts`)
- Style brief schema (`brief.schema.json`)
- Kit single-source-of-truth pattern
- Playwright-based PDS lint

### 3.2 Misplaced / Leaked (опустити рівнем нижче)

- **`npm run menu`** у package.json — деталь конкретного пресета на рівні top-level CLI
- **`menu heroes3`, `menu pixelart`** у README — конкретні комбінації замість форми
- **Term "mechanic"** у CLI list — означає різні речі в різних місцях

### 3.3 Missing (додати скелети)

- `Brief` (user-level: ніша + кінцевий результат + механіка-кандидат)
- `ScreenPlan` / `FlowPlan` / `Hook`
- `ComponentBreakdown` (динамічний, не 13 хардкоднутих)
- `Agent` як концепт (planner, asset-gen, composer, critic, orchestrator)
- `PromptVersion` (для прозорого версіонування промтів кожного агента)
- `ReflectionStep` (модельна самооцінка результату)
- User-facing UI

### 3.4 Vestigial (підозра на сміття)

- Legacy `briefs/*.json` формат + `playable build` команда (накладається з `forge`)
- `templates/tap-the-coin/`, `templates/plug-in-socket/` — оголошені stubs, не використовуються в forge
- `styles/default.json` (легасі формат, дублюється з `styles/*.brief.json`)
- `forge-wip/` — після merge має зникнути (ROADMAP I-06)
- `gh-pages-deploy/menu-cyber-heist-*` файли без явного процесу їх відтворення

### 3.5 Stale (правда втрачена)

- `README.md` (обидві версії, ідентичні) — описує систему до додавання `forge`, `catalog`, `layouts`, `check:layouts`, PDS
- Хардкоднуті 13 ассет-ключів — це з епохи "одного стандартного меню", не сумісне з динамічним плануванням

### 3.6 Conflicts (онтологічне зіткнення)

- **"Brief" × 2** — legacy vs style brief
- **"Mechanic" × 2** — template-дир vs playable-тип
- **Entrypoint × 2** — `npm run menu` (test) vs `npm run forge` (production)
- **2D vs 3D** — README vs реальність CLI

---

## 4. Gravity Score (cost-of-not-fixing / cost-to-fix)

| Дрейф | Cost to fix | Cost of NOT fixing | Score | Пріоритет |
|---|---|---|---|---|
| README не відповідає коду | 1 (хвилини) | 3 (новий внесок іде в неправильний бік) | 3.0 | **P0** |
| Відсутній Brief stage (ніша → завдання) | 3 (дні) | 3 (без цього маніфест нереалізовний) | 1.0 | **P0** |
| Відсутній Screen/Flow planner | 3 | 3 | 1.0 | **P0** |
| "Mechanic" перевантажений | 1 (rename) | 2 (плутає) | 2.0 | **P1** |
| Два "Brief"-формати | 2 (видалити legacy) | 2 | 1.0 | **P1** |
| Хардкод 13 ключів → динамічний breakdown | 3 | 3 | 1.0 | **P1** |
| Відсутній multi-agent orchestrator | 3 | 3 | 1.0 | **P1** |
| Prompt versioning | 2 | 2 | 1.0 | **P2** |
| Reflection step | 2 | 2 | 1.0 | **P2** |
| UI для вибору | 3 | 1 (CLI поки достатньо) | 0.3 | **P3** |
| Worktree cleanup | 1 | 1 | 1.0 | **P3** |

---

## 5. Висновок

**Поточний код = міцний фундамент для тої тулзи, яку описав користувач, але вона ще не побудована.**

Готовий шар: **усе нижче "ассет-генерації"**. Бракує: **усе вище "ассет-генерації"** — те, що бере ідею з голови користувача і доводить її до бріфу + плану екранів.

Звідси випливає природне розмежування плану дій:

- **Фаза 0** — припинити дрейф (виправити README, перейменувати, видалити сміття). Дешево, негайно.
- **Фаза 1** — додати **Brief stage** (ніша + хук + механіка-кандидат → структурований Brief).
- **Фаза 2** — додати **Screen/Flow planner** (Brief → ScreenPlan + FlowPlan).
- **Фаза 3** — динамічний **Component breakdown** (Plan → список потрібних ассетів, замість 13 хардкоднутих).
- **Фаза 4** — обгорнути в **multi-agent orchestrator** з версіонуванням промтів.
- **Фаза 5** — додати **рефлексію** і **варіативність** (правила в range, як говорив користувач).
- **Фаза 6** — UI для вибору (необов'язково, можна тримати CLI довго).

Деталі цих фаз — у `plan.md`. Візуальна карта стану — у `pipeline.html`.
