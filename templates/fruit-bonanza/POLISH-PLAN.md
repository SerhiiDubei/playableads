# Fruit Bonanza — Polish Pass Plan

**Контекст:** механіка реалізована, gameplay loop працює, але "feel" недотягує до Pragmatic-tier. План розписує 3 спринти полишу з пріоритетами, точними змінами і вартістю.

**Принцип сортування:** highest-leverage moments first. Endcard = last impression перед CTA-кліком (топ-1 conversion driver). Bomb-reveal = climax кожного спіну. Cascade choreography = "feel" базової петлі.

---

## Sprint A — Endcard + Typography (3-4 год коду + $0.20)

### A1. Web font як ідентичність ($0)
**Проблема:** `Arial Black, system-ui` — нульова характерність, виглядає як банальний HTML5 prototype.

**Рішення:** Embed 2 display-шрифти base64-inline (legal: Google Fonts SIL Open Font License):
- **Bungee** (display) — для title, BIG WIN, banners, score values. Геометричний chunky cartoon, ідеально для слотів.
- **Lilita One** (subdisplay) — для HUD labels, secondary UI. Rounded friendly.

**Реалізація:** download.woff2 → base64 → `@font-face` injected у `buildHtml` ([inliner.ts:60](../../src/build/inliner.ts)). +40 KB до bundle (1077 → 1117 KB, ще в межах 2 MB).

**Acceptance:** усі заголовки SCORE/BIG WIN/SUPER BONUS використовують Bungee; cards і labels — Lilita One.

### A2. AI-генерована endcard-рамка ($0.06)
**Проблема:** `roundRect` + gold stroke = banner-ad-tier flat UI.

**Рішення:** Згенерувати ОДИН ассет — декоративну золоту cartouche з банером без тексту (текст накладаємо в коді):
```json
{
  "key": "endcard-frame",
  "subject": "an ornate luxurious vertical golden cartouche frame with a curved banner ribbon at the top arched over a dark purple decorative panel, glossy 3D candy-slot style, sparkles in the corners, pink and gold gradient, soft inner glow, EMPTY in the middle (no text, no figures, no fruits inside the panel — leave the center area completely empty and dark for text overlay), front-facing, isolated"
}
```

**Чому "EMPTY центр":** AI часто дописує текст або фрукти у вільне місце — це руйнує задачу. Прямий instruction + negative prompt "no text" дає 95% reliable рамку.

**Fallback:** якщо ассет відсутній — поточний `roundRect` (вже працює).

### A3. AI-генерована "BIG WIN" корона ($0.06)
**Проблема:** "BIG WIN!" — просто текст з drop-shadow.

**Рішення:** Декоративний корона/розета сверху рамки:
```json
{
  "key": "endcard-crown",
  "subject": "an ornate decorative golden crown ribbon banner shaped like a stylized arched ribbon, glossy 3D candy-slot trophy style, gold and pink gradient, sparkles, NO TEXT, just the decorative banner shape, front-facing, isolated"
}
```

Текст "BIG WIN!" (на Bungee) кладемо ПОВЕРХ цього ассета в коді — гарантує читабельність + кастомну стилізацію.

### A4. Coin-shower particles ($0.05)
**Проблема:** нема celebratory particles при endcard reveal.

**Рішення:** Один спрайт-шит з 4 варіантами монети:
```json
{
  "key": "coin",
  "subject": "a single shiny round gold coin with a candy fruit symbol embossed on it (grape silhouette), glossy 3D candy style, isolated"
}
```

В коді: емітер 60 монет з top→bottom, рандомний spin + sway, gravity acceleration, fade out near bottom. Запускається при `showCTA()`.

### A5. Endcard cinematic sequence (код, ~1 год)
**Поточно:** `cta.alpha 0→1` + `panel.scale 0.7→1` за 0.55 с. Bunch.

**Має бути послідовність:**
1. **Pre-roll (300 ms):** board frame жовто-блимає 3 рази, glow ring expanding from center
2. **Zoom (400 ms):** камера ZOOM-IN на board центр (stage.scale → 1.4), bg desaturate до 50%
3. **Black wipe (200 ms):** темний vignette закриває board, лишається тільки glow з центра
4. **Frame slam (450 ms):** endcard-frame падає зверху з `back.out(2.2)`, screen-shake 6px
5. **Crown reveal (300 ms):** crown ассет з'являється з обертанням 360° + fade
6. **Text typewriter (400 ms):** "BIG WIN!" текст друкується literа-by-literа на Bungee, кожна з individual scale-pop
7. **Score odometer (1000 ms):** "Score: 0" → "Score: 5350" рахується з ka-ching звуком кожні 100 поінтів
8. **CTA invitation (600 ms):** кнопка з'являється з glow ring, починає breathing-pulse + occasional sparkle particles на ній
9. **Coin shower (continuous):** 60 монет падають весь час поки endcard відкритий

**Acceptance:** session test = "хочу натиснути CTA" — гравець має відчути що виграш був важливим, не "ну й все".

---

## Sprint B — Bomb reveal sequence "Super Bonus" (3-4 год коду, $0)

### B1. Sequential bomb ignition
**Поточно:** [game.ts:1099-1115](game.ts) — всі бомби виlocuum ОДНОЧАСНО, гравець бачить кашу:
```typescript
for (let r,col) { if (bomb) { shockwave(); floatText(); ... } }
```

**Має бути:** 150-200 ms стаггер між кожною бомбою, з ескалацією:
```
bomb #1: shake=8, particles=12, audio.bomb(pitch=1.0), tally="×5"
bomb #2: shake=10, particles=16, audio.bomb(pitch=1.15), tally="×5+×3 = ×8"
bomb #3: shake=12, particles=20, audio.bomb(pitch=1.3), tally="×8+×10 = ×18"
final:  shake=20, full-screen-flash, audio.fanfare(), tally slam "×18!"
```

**Tally в центрі:** великий Bungee-shadowed текст по центру дошки, **persists** під час всієї секвенції (не зникає між бомбами). Кожен tick — scale pulse 1→1.3→1 за 200 ms, color flash white→gold.

### B2. Full-screen vignette при super bonus
Темна рамка по краях стиснулась → фокус на центрі де tally. Lazy ефект: один `Graphics` з alpha-blend mode на overlayLayer.

### B3. Slow-motion на final multiplier
Останні 300 ms перед reveal final number — `app.ticker.speed = 0.4`. Гравець фізично відчуває "moment freezes". Restore speed=1 після slam.

### B4. Pay-out count animation
Після final multiplier — поточний `flashScore` замало. Має бути:
- Великий floating "+12,750!" з top of board центр
- Count animation 0 → 12,750 за 1200 ms з cubic ease-out
- Кожні 1000 points: tiny ka-ching sound (audio.coin() — додати)
- Last digit "lands" з extra bounce

### B5. Confetti при ×50+
Якщо bombSum >= 50: емітер 100 candy-confetti (різнокольорові маленькі прямокутники) на 1.5 с — підкреслює "це РІДКИЙ момент".

---

## Sprint C — Cascade choreography + UI feedback (3 год коду, $0)

### C1. Chain combo escalation
**Поточно:** показує "COMBO ×N" pill, нічого більше не міняється.

**Має бути crescendo:**
| Chain | Pop scale | Pop sound pitch | Board effect | Audio layer |
|---|---|---|---|---|
| ×1 | 1.4 | 1.0 | — | pop only |
| ×2 | 1.5 | 1.15 | — | pop+chime |
| ×3 | 1.6 | 1.30 | gold glow ring around board pulse | pop+chime+vox "nice" |
| ×4 | 1.7 | 1.45 | + camera micro-zoom (1.02x) | + vox "great" |
| ×5+ | 1.8 | 1.6 | + slow-motion 0.7x for 0.3 s | + vox "epic" |

(vox = синтезовані WebAudio note bursts, не реальний голос)

### C2. Score pop animation
Коли `pillScore.val.text` змінюється — scale 1.4 з elastic.out, gold flash на 200 ms, drop-shadow подвоюється тимчасово.

### C3. Anticipation system
**Near-miss reveal:** коли на board вже 7 однакових символів і йде reel-spin — інші cells dim 20%, ці 7 пульсують gold ring → драматичне очікування 8-го.

Реалізація: `countSymbols()` BEFORE последньої колонки спускається; якщо max >= 7 → застосувати glow.

### C4. Bomb hover-glow
**Поточно:** бомби статичні до super-bonus reveal.

**Має бути:** бомби з power ring пульсують золотим весь час що вони на дошці — гравець ВІДЧУВАЄ що там накопичена потенційна енергія.

### C5. Tile background reaction
Cells під виграшними символами — їх tile background на 200 ms перед popом FLASH до gold-radial-glow. Це "rallying" сигнал.

### C6. Spin button feel
**Поточно:** simple click. **Має бути:**
- onMouseDown: scale 0.94 за 60 ms
- onMouseUp: scale 1.06 elastic-out за 200 ms
- Pre-spin: button shake 2px за 100 ms, потім click activates
- During spin: button alpha 0.4 + cursor:not-allowed (вже є) + animate texture-pulse

---

## Outside-sprint considerations

### Bundle size budget
- Поточно: 1077 KB / 2048 KB
- +fonts (40 KB) + endcard-frame (30 KB webp) + crown (20 KB) + coin (12 KB) = +102 KB
- After: ~1180 KB — still 868 KB headroom

### Cost summary
| Sprint | $ assets | Code hours |
|---|---|---|
| A: Endcard + Typography | $0.17 | 3-4 h |
| B: Bomb reveal | $0 | 3-4 h |
| C: Cascade + UI feel | $0 | 3 h |
| **Total** | **$0.17** | **9-11 h** |

### Risks & mitigations
- **AI endcard-frame коли centerі не порожній** — fallback на procedural `roundRect`, retry prompt з extra "no text" emphasis
- **Шрифт base64 не подгрузиться** — `font-display: swap` + system-ui fallback identical-weight
- **Slow-motion порушує існуючу `gsap` timing** — обмежити slow-mo на 0.3 с і скасовувати при interrupt

### What I'd CUT for time
Якщо є вибір — пожертвую C3 (anticipation) і C5 (tile reaction). Це nice-to-have шар. A + B + C1/C2/C6 — це core polish.

---

## Order of execution (моя рекомендація)

1. **A1 (fonts)** — 30 хв, миттєвий visual upgrade на всю гру
2. **A5 (endcard cinematic)** з поточними assets — 1 год, дає миттєвий "WOW" на кінцівці
3. **B1+B4 (sequential bombs + payout count)** — 2 год, виправляє найбільший gameplay-визивний бажання feel-issue
4. **A2+A3+A4 ($0.17 ассети)** — півгодини на промпт + run.ts + optimize, заміна procedural на AI
5. **C1+C2 (combo escalation + score pop)** — 1 год
6. **B2+B3+B5** — 1 год (vignette, slow-mo, confetti)
7. **C3-C6 решта** — 2 год точкові штрихи

**Що скажеш — даю зелене світло на цей план чи скоригуємо пріоритети?**
