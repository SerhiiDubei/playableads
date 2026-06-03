# Fruit Bonanza — playable template

Tumble-slot механіка в стилі Sweet Bonanza (Pragmatic Play). Сітка 6×5, *pays anywhere*, мультиплікатор-бомби, free-spins бонус-режим з накопичувальним множником.

> **Статус:** новий темплейт, поки не пройшов промоцію T-01 (див. [templates/README.md](../README.md)). Працює як draft в `templates/` бо потребує повного pipeline (manifest + brief + style + assets). Якщо проєктна політика змінить положення — перенеси в `labs/`.

## Файли
- [`manifest.json`](manifest.json) — `assetBudgetBytes: 1468006`, params: `cols`, `rows`, `minMatch`, `bombChance`, `scatterChance`, `freeSpinsTrigger`, `freeSpinsAwarded`, `demoSpins`
- [`game.ts`](game.ts) — PixiJS, procedural fallback + sprite swap (працює ДО forge на чистих Graphics)
- [`../../briefs/fruit-bonanza.json`](../../briefs/fruit-bonanza.json) — runtime brief (copy, lang, store)
- [`../../styles/fruit-bonanza.json`](../../styles/fruit-bonanza.json) — runtime style tokens
- [`../../styles/fruit-bonanza.brief.json`](../../styles/fruit-bonanza.brief.json) — AI asset brief (`derivedFrom`, palette, 11 `assets[]`)

## Як запустити

### Спочатку — procedural режим ($0)
Якщо хочеш побачити гру до того як витрачати на ассети — game.ts малює всі фрукти/бомбу/скатер через Pixi `Graphics` як fallback. Просто збілди playable з тим брифом, але без `forge`-фази:

```sh
# Phase 2 only (HTML build), пропускає AI генерацію якщо out/<style>/ порожня
npx tsx src/cli.ts menu fruit-bonanza
```
(точну команду перевіряй у [package.json](../../package.json) — поки що `npm run menu` приймає brief-id як аргумент)

### Повний пайплайн ($)
Згенерувати ассети + збілдити готовий HTML:

```sh
# Потребує OPENAI_API_KEY у .env
npm run forge -- fruit-bonanza
```

**Очікувана вартість:** ~$0.40–$1.10 за один прогін.
- 11 ассетів (8 фруктів-символів × 1024² + bomb 1024² + scatter 1024² + bg 1024×1536)
- `gpt-image-1.5`, `quality: medium`
- Rate limit 5 img/min → весь прогін ≈3-4 хв з backoff

**Що згенерується в [`assets/`](assets/):**
- `fruit-grape.webp`, `fruit-watermelon.webp`, `fruit-blueberry.webp`, `fruit-apple.webp`, `fruit-banana.webp`, `fruit-candy-green.webp`, `fruit-heart-red.webp`
- `fruit-scatter-lollipop.webp` (SCATTER символ, 4+ на полі = 10 free spins)
- `bomb.webp` (multiplier ×2…×100)
- `bg-candy.webp` (фон, 1024×1536, non-transparent)
- `logo-fruits.webp` (декоративне лого без тексту — гра малює "FRUIT BONANZA" текстом поверх)

Скрипт автоматично:
1. Композує промпт = `derivedFrom` + `palette` + `subject` + isolation-clause ([compose.ts](../../src/assetgen/compose.ts))
2. Стискає через `sharp`: trim → resize → webp → base64
3. Перевіряє бюджет ≤ `assetBudgetBytes`
4. Пише `.json`-sidecars для reproducibility

## Що перевірити перед мержем

```sh
npm run typecheck                        # has been passing locally
npm run check:layouts -- fruit-bonanza   # zone/overflow/CTA lint
npm run visual                           # Playwright screenshots, 7 viewports, all PASS
```

## Механіка (точна)

- **Сітка:** `cols × rows` (за замовч. 6×5)
- **Виплата:** будь-які `≥ minMatch` (8) однакових символів = виграш `pay × n × tier`
  - tier: `n<10` → ×1, `10–11` → ×3, `≥12` → ×10
- **Bomb (скрін-множник):** ~`bombChance` (4.5%) кожна клітинка. Cума всіх бомб у спіні множить підсумок цього спіну (приклад: 3 бомби ×5, ×10, ×2 → ×17)
- **Scatter (Lollipop):** ~`scatterChance` (6%) кожна клітинка. `≥ freeSpinsTrigger` (4) на полі = `freeSpinsAwarded` (10) free spins
- **Free Spins:** під час free spins нові бомби НЕ доспавнюються — але виявлені бомби додаються до акумульованого множника раунду (`fsAccMult`), який множить кожен виграш FS-спіну. Це фірмова Bonanza-фішка: чим довше FS — тим товстіший множник
- **Endcard CTA** показується після `demoSpins` (8) або при `score >= 5000`

## Контроли
- `SPIN` кнопка / `Space` — крутити
- `M` / іконка ноти — mute/unmute Web Audio звуків (drop, pop, chime, bomb, fanfare — все синтезовано, 0 байт ассетів)

## Тюнінг

Усі ключові параметри в [`manifest.json`](manifest.json) → `params`. Brief може їх переписувати ([`briefs/fruit-bonanza.json`](../../briefs/fruit-bonanza.json) → `params`).

Найвагоміші важелі:
- `bombChance` — частота бомб (↑ більше super bonus epicness, ↓ ближче до Sweet Bonanza реальної volatility ~3%)
- `scatterChance` — частота трігеру free spins (4 з 30 клітинок очікувано при 6% за спін до tumbles)
- символьні `weight` в [game.ts:SYMBOLS](game.ts) — рідкість окремого фрукту (зараз grape rarest = 3, ring/heart common = 12)
- `BOMB_MULTS` + `BOMB_WEIGHTS` — розподіл множників (×100 = 1/100 шанс на бомбі — теж "юдо")

## Незакрите
- Промоція до повноцінного `templates/` стандарту T-01 (коли стандарт існує).
- Free-spins re-trigger (3+ скаттери всередині FS додають +5 spins) — поки не реалізовано
- "Ante Bet" Bonanza-style опція (×25 ставка → ×2 шанс на free spins) — поза скоупом цього playable-ad

Створено: 2026-06-02
