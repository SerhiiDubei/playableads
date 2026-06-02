# Playable Reference Patterns

Перевірені на сотнях мільйонів impressions formats. Кожен паттерн має
**структуру** (де що лежить), **WHY** (чому це працює), **WHEN** (для яких
ігор), і **рекомендовану conversion ціль**.

Усі схеми — для DESIGN canvas 400×860 (≈ 9:19.4 портрет). Координати в px.

---

## 1. Endcard / Install Reveal

**Структура:**

```
┌────────────────────────┐  y=0
│   banner: "Play Now"   │
├────────────────────────┤  y=80
│                        │
│       [ HERO ]         │
│       160-200px        │
│                        │
├────────────────────────┤
│  tagline (1 line)      │
│  "Become the legend"   │
├────────────────────────┤
│        [ ... ]         │
│        (padding)       │
├────────────────────────┤  y=780
│  ┌──────────────────┐  │
│  │  INSTALL FREE    │  │  sticky CTA
│  └──────────────────┘  │
└────────────────────────┘  y=860
```

**WHY:** найпростіша конверсія — гравець бачить ВСЕ за 2s, кліки CTA одразу.
Single-screen знижує decision fatigue.

**WHEN:** hyper-casual, idle, simple action games. Voodoo Studios, Lion Studios
використовують 80% часу. Якщо твоя гра візуально сильна — endcard виграє.

**Гарне ім'я кнопки:** "Play Free", "Install Free", "Get the Game". Уникай
"Learn More" — у 30% нижча CTR.

**Цільова CTR:** 3-5%.

---

## 2. Tutorial / Step Reveal (3 кроки)

**Структура:**

```
┌────────────────────────┐  y=0
│   ● ● ○   progress dots│  y=18
├────────────────────────┤
│  banner: "Step 2 of 3" │
│   title: "Collect Loot"│
├────────────────────────┤
│                        │
│       [ HERO ]         │
│       240-280px        │
│                        │
├────────────────────────┤
│  sub: "Every quest..." │
├────────────────────────┤
│  ┌──────────────────┐  │  sticky
│  │      NEXT        │  │  (step 3: INSTALL)
│  └──────────────────┘  │
└────────────────────────┘  y=860
```

**WHY:** показуємо **ЩО робить гра** перед install. Знижує "що це таке?"-bounce.
Особливо ефективно для нових/незвичайних механік.

**WHEN:** RPG, strategy, complex casual. Якщо твоя гра вимагає 30s+ для
розуміння, tutorial рятує.

**ПРАВИЛА:**
- ≤ 3 кроки (більше = drop-off)
- Кожен крок — ОДНА ідея ("tap", "collect", "win")
- Останній крок CTA = "Install Free", не "Next"

**Цільова CTR:** 4-7% (вище endcard бо вже вкладено зусилля у крокі).

---

## 3. Feature Grid (2×2)

**Структура:**

```
┌────────────────────────┐
│   banner: "Realm of..." │
├────────────────────────┤
│       [ HERO 170 ]     │
├────────────────────────┤
│ title: "World of..."   │
├────────────────────────┤
│ ┌──────────┬─────────┐ │
│ │ ⚙        │ +       │ │
│ │ Customize│ Collect │ │
│ │ desc...  │ desc... │ │
│ ├──────────┼─────────┤ │
│ │ ✓        │ ♪       │ │
│ │ Conquer  │ Immerse │ │
│ │ desc...  │ desc... │ │
│ └──────────┴─────────┘ │
├────────────────────────┤
│  ┌──────────────────┐  │  STICKY
│  │  INSTALL FREE    │  │
│  └──────────────────┘  │
└────────────────────────┘
```

**WHY:** показуємо ГЛИБИНУ гри. 4 фічі за 5 секунд — ідеально для RPG, strategy,
city-builders. Кожна картка — micro-promise.

**WHEN:** progression-heavy games. King, Playrix, Supercell використовують для
strategy/RPG hybrid. **НЕ** для hyper-casual (overload).

**ПРАВИЛА:**
- Hero макс 180px (інакше CTA вилазить — це наш R5)
- Кожна desc — ≤ 4 слова
- Кожна label — 1 слово, дієслово
- Sticky CTA обов'язково

**Цільова CTR:** 3-4%.

---

## 4. Tap-to-Reveal (mini-game)

**Структура:**

```
┌────────────────────────┐
│  topbar: counter "0/10"│  y=24
├────────────────────────┤
│                        │
│      [TAP TARGET]      │
│     coin/gem/box       │
│     (tap N times)      │
│                        │
├────────────────────────┤
│   prompt: "TAP!"       │  pulses
└────────────────────────┘

   (after N taps)
┌────────────────────────┐
│   "You won 100 gems!"  │
│      [HERO + glow]     │
│  ┌──────────────────┐  │
│  │ COLLECT & PLAY   │  │
│  └──────────────────┘  │
└────────────────────────┘
```

**WHY:** активний engagement → коли гравець вже "грає", install — це
продовження дії, а не нова. CTR в 2-3 рази вище endcard.

**WHEN:** idle clicker, casual puzzle, runner. Тут реально варто writeting код
(PixiJS counter + tap detection) — це не layout, це механіка.

**ПРАВИЛА:**
- N таптів ≤ 10 (більше = boredom)
- Кожен тап = візуальна реакція (particle + sound)
- Reveal через 1-2 секунди після останнього тапу — НЕ миттєво

**Цільова CTR:** 6-10% (найвища серед playable форматів).

---

## 5. Match-3 Cluster

**Структура:**

```
┌────────────────────────┐
│      banner: "MATCH!"  │
├────────────────────────┤
│                        │
│  ┌─┬─┬─┬─┬─┬─┐         │
│  │A│B│A│B│C│D│         │
│  ├─┼─┼─┼─┼─┼─┤         │
│  │B│A│B│A│D│C│  6×4    │
│  ├─┼─┼─┼─┼─┼─┤  tile   │
│  │C│D│C│D│A│B│  grid   │
│  ├─┼─┼─┼─┼─┼─┤         │
│  │D│C│D│C│B│A│         │
│  └─┴─┴─┴─┴─┴─┘         │
│                        │
│  prompt: "MATCH 3!"    │  pulsing
├────────────────────────┤
│   (after match)        │
│  ┌──────────────────┐  │
│  │  PLAY FULL GAME  │  │
│  └──────────────────┘  │
└────────────────────────┘
```

**WHY:** "I already played" effect. Гравець знає механіку — install природний
крок. Match-3 = 40% мобільного casual ринку (King, Playrix).

**WHEN:** Match Factory, Royal Match, Candy Crush competitors. Виключно для
matching genres.

**ПРАВИЛА:**
- Make first match TRIVIAL (свого роду tutorial)
- Подключай sound — match-3 без звуку 0%
- Reveal CTA одразу після першого валідного match

**Цільова CTR:** 5-8%.

---

## 6. Two-Choice Branching ("Pick a side")

**Структура:**

```
┌────────────────────────┐
│ banner: "Choose Path"  │
├────────────────────────┤
│      [HERO 200px]      │
├────────────────────────┤
│  title: "Will you..."  │
├────────────────────────┤
│  ┌─────────┬─────────┐ │
│  │ ATTACK  │ DEFEND  │ │
│  │  ⚔      │  🛡     │ │
│  └─────────┴─────────┘ │
├────────────────────────┤
│  → reveal CTA either   │
│    way: "PLAY GAME"    │
└────────────────────────┘
```

**WHY:** ілюзія вибору → engagement. Незалежно від вибору ведемо в той самий
CTA. Дає user feeling of agency.

**WHEN:** RPG, narrative games, choices-matter genres.

**ПРАВИЛА:**
- 2 опції, не більше (3 = paralysis)
- Кожна опція має VISUAL hook (icon, color contrast)
- Обидві ведуть в той же CTA (можна різний tagline)

**Цільова CTR:** 4-6%.

---

## 7. Counter / Progress Reveal

**Структура:**

```
┌────────────────────────┐
│   topbar: "+1250 XP"   │
├────────────────────────┤
│      [HERO]            │
│                        │
│  ┌──────────────────┐  │
│  │ ████████░░░░░░░  │  │  XP bar 60%
│  └──────────────────┘  │
│  LEVEL 7 → 8           │
├────────────────────────┤
│  panel:                │
│  "New gear unlocked!"  │
│  + reveal new item     │
├────────────────────────┤
│  ┌──────────────────┐  │
│  │  CLAIM REWARD    │  │
│  └──────────────────┘  │
└────────────────────────┘
```

**WHY:** loss-aversion psychology. "Ти втратиш цей progress якщо не
install'неш". Дуже сильний motivator.

**WHEN:** RPG, idle progression, гачимо players які люблять numbers go up.

**ПРАВИЛА:**
- Counter повинен АНІМУВАТИСЯ (1250 → 1250+ counting)
- XP bar fills ANIMATED
- Reveal item — як loot box відкривається

**Цільова CTR:** 5-7%.

---

## 8. Character Customization (Pick Hero)

**Структура:**

```
┌────────────────────────┐
│  banner: "Choose Hero" │
├────────────────────────┤
│   ◀  [HERO LARGE]  ▶   │  swipe between
│       240-280px        │  3 characters
├────────────────────────┤
│   "Sir Roland · Lv 7"  │
│   [stats bar]          │
├────────────────────────┤
│  ┌──┬──┬──┐            │
│  │  │  │  │  3 hero    │
│  └──┴──┴──┘  thumbs    │
├────────────────────────┤
│  ┌──────────────────┐  │
│  │  PLAY AS ROLAND  │  │
│  └──────────────────┘  │
└────────────────────────┘
```

**WHY:** ownership effect — "I picked this hero". Знижує bounce на perso­nal
investment.

**WHEN:** RPG with multiple character classes, MOBA, fighting games.

**ПРАВИЛА:**
- 3 героїв оптимум (1 = no choice; 5+ = decision fatigue)
- CTA-текст ПЕРСОНАЛІЗОВАНИЙ ("Play as Roland", не "Install")
- Switch між героями ≤ 200ms animation

**Цільова CTR:** 4-6%.

---

## How to pick a pattern for your game

| Game genre | Best pattern | Other good |
|---|---|---|
| Hyper-casual (Voodoo) | **#1 Endcard** | #4 Tap-to-reveal |
| Match-3 puzzle | **#5 Match cluster** | #1 Endcard |
| RPG / progression | **#7 Progress reveal** | #8 Pick hero, #3 Feature grid |
| Idle / clicker | **#4 Tap-to-reveal** | #7 Progress reveal |
| Strategy / city builder | **#3 Feature grid** | #1 Endcard |
| Narrative / interactive | **#6 Two-choice** | #2 Tutorial |
| First playable for a game | **#2 Tutorial** | #1 Endcard for A/B |

**Загальне правило:** Якщо не знаєш — почни з **#1 Endcard**. Він робочий
для 80% ігор і ризики мінімальні. Потім A/B тестуй проти #2 Tutorial або #3
Feature grid для своєї specific аудиторії.

---

## Реалізовано в нашому проєкті

Зараз у `src/assetgen/layouts/` маємо:

| Pattern | Файл | Lint status |
|---|---|---|
| #1 Endcard | `endcard.ts` | PASS |
| #2 Tutorial | `tutorial.ts` | PASS |
| #3 Feature grid | `feature-grid.ts` | PASS |
| 5-screen menu (legacy) | `menu5.ts` | PASS |

**Не реалізовано** (TODO): #4 Tap-to-reveal, #5 Match-3, #6 Two-choice,
#7 Progress reveal, #8 Pick hero. Це і є наступні layouts для додавання —
кожен ~50-100 рядків + один новий шаблон у `meta` Layout.
