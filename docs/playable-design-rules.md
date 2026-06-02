# Playable Design Rules (PDS)

Жорсткі правила яких має дотримуватися кожен layout. Перевіряються автоматично:
`npm run check:layouts -- all` рендерить кожен playable у Playwright на DESIGN
canvas 400×860 і повертає PASS/FAIL з конкретними offender-елементами.

---

## Hard rules (порушення = FAIL у lint)

### R1. `no-overflow` — нічого не вилазить за canvas

Жоден елемент активного екрану не може мати `bounding rect` поза межами `#stage`
(толерантність 2px на rounding).

**Чому:** Meta playable рендериться в фіксованому фреймі реклами. Content
overflow → відрізає CTA, ламає враження продукту, гравець закриває.

**Як знаходити:** lint показує `overflow=Xpx` поряд з кожним offender. Заходиш
в код, дивишся на CSS того класу.

**Як виправляти:**
- Sticky CTA через `position:absolute;bottom:24px;left:24px;right:24px`
- Менший hero (`max-height` замість `height`)
- Тонший padding на screen (`padding-bottom` рахуй під sticky CTA)
- Менша панель / менший шрифт у tutorial steps

### R2. `screen-has-button` — на КОЖНОМУ екрані має бути візібл `.c-btn`

Активний екран повинен мати принаймні одну видиму kit-кнопку. Без кнопки
гравець не знає що робити далі.

**Чому:** dead-screen смерть playable. Особливо на multi-screen flow
(`menu5`, `tutorial`) кожен крок повинен мати "next" дію.

**Як виправляти:** додай хоча б один `k.button(label, onClick, opts)` у screen
markup.

### R3. `one-primary-cta` — максимум ОДИН install-style CTA на екрані

На активному екрані не може бути більше однієї кнопки що містить
`/install|play now|start free|claim/i`.

**Чому:** дві кнопки «Install Now» одночасно плутають користувача — паралізує
вибір. Принцип «one screen, one decision».

**Як виправляти:** залиш один primary CTA, інші переведи в secondary
(`Continue`, `Next`, `Try`).

### R4. `touch-targets-min` — min 44×44px hit area

Усі kit-елементи `.c-btn`, `.icon`, `.c-pill` повинні мати фактичні
розміри ≥ 44×44 px (стандарт Apple HIG / Material).

**Чому:** менші touch targets → промахи → frustration → drop. На мобільних
44px = безпечний мінімум.

**Як виправляти:** не задавай явну ширину/висоту іконкам менше 44px. У kit
вони за замовчуванням 96px, головне не зменшити поганим CSS overrides.

### R5. `hero-fits` — hero не перевищує `meta.maxHeroPx`

Якщо layout оголосив `meta.maxHeroPx`, то жодна `.hero` / `.knight` /
`img[class*=hero]` не може бути вищою.

**Чому:** layout-author знає скільки місця реально лишилось під hero. Великий
hero "з'їдає" простір під CTA → overflow → R1 fail. Тримай контракт.

**Як виправляти:** зменш `height:` для hero img або встав `max-height`.

### R6. `cta-text-present` (layout-level) — є install-CTA з очікуваним текстом

Серед усіх кнопок усіх screen-ів layout має бути принаймні одна з
`primaryCtaTexts`. Перевіряється один раз на playable.

**Чому:** Meta playable повинен мати install CTA. Без нього playable —
ілюстрація, не реклама.

**Як виправляти:** додай `k.button("Install Free", "cta()", {block:true})` у
фінальний screen.

---

## Soft rules (поки warn-only — додамо як FAIL коли матимемо інфру)

### W1. Vertical rhythm: gap = 4 / 8 / 12 / 16 / 24

Не використовуй довільні gap-и (`gap:13px`, `gap:7px`). Стандартний типу-скейл
робить layouts передбачуваними і легкими на око.

### W2. Type scale: H1 ≥ 26px, H2 ≥ 20px, body ≥ 13px

Менший шрифт на мобільному — нечитабельний. CTA-кнопка має mini-text ≥ 16px.

### W3. Hero має contrast guard на busy bg

Якщо бекграунд складний (graffiti, neon), hero (особливо з ясним outline)
повинен мати або `drop-shadow`, або сидіти на panel з dark backdrop. Інакше
зливається.

### W4. Текстові блоки на busy bg повинні мати scrim/panel

Title/sub-копія на яскравому bg без scrim → нечитабельно. Виправ через
`k.panel(...)` або власний `background:rgba(0,0,0,0.6)` під текстом.

### W5. Tutorial — максимум 3 кроки

Більше 3 → drop-off. Гравець хоче гратися, не вчитися. Якщо твоя гра
складніша, винеси решту в endcard-tooltip.

### W6. Одна семантична зона на екран

Не змішуй "shop + battle + customization" на одному екрані. Один екран = один
наратив.

---

## How to add a new rule

1. **Додай rule expression** у `src/assetgen/layouts/lint.ts` — JS-функція що
   виконується в браузері, повертає `{ offenders: [...] }`.
2. **Зареєструй у `SCREEN_RULES`** (per-screen) або `LAYOUT_RULES`
   (per-playable).
3. **Якщо потрібен інпут з layout** — додай поле в `LayoutMeta` (типи у
   `types.ts`), кожен layout оголошує своє значення.
4. **Запусти `npm run check:layouts -- all`** — побачиш порушників.

---

## Як ці правила знайшли REAL бажалися BUG

| Bug | Спіймала rule | Як виправили |
|---|---|---|
| `feature-grid` CTA вилазив 137px вниз | R1 + R2 | Sticky CTA через `position:absolute;bottom:20px` |
| `feature-grid` hero 230 > 200 max | R5 | Hero зменшено до 170px |
| `tutorial` `Next` 17px вниз на t2 | R1 | Зменшено вміст панелі + sticky CTA |
| `tutorial` `.step-progress` 13px вправо | R1 | Замінено `left:0;right:0` на `left:50%;transform:translateX(-50%)` |
| `menu5` Buy/Save кнопки замість «Exit/Fight» (false positive) | n/a | Виправлено саме правило — текст-матч тепер layout-level а не screen-level |

Кожне правило тут — це **тестовий контракт layout × stage**. Додавати нові
правила = розширювати безпечну зону для майбутніх layouts.
