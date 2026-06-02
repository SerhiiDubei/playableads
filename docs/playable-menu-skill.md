# Skill · Build a Playable Menu

**Що це:** одна команда яка робить готовий до Meta playable ad з нуля для будь-якого style.

**Вхід:** style brief (JSON у `styles/<id>.brief.json`).
**Вихід:** single-file HTML у `out/menu-<id>.html` (≤ 2 MB, valid за Meta requirements) + HTML-log з повним таймінгом і вартістю.

---

## Як запустити (forge)

```bash
npm run forge -- <style-id>             # повний цикл
npm run forge -- <style-id> --force     # пере-генерувати ассети навіть якщо вони є
npm run forge -- <style-id> --no-open   # не відкривати у браузері
```

`forge` робить дві фази підряд:

| Фаза | Що відбувається | Час | Гроші |
|---|---|---|---|
| **1. Asset gen** | Викликає OpenAI gpt-image-1.5 на кожен ассет з брифа (concurrency=3, retry на 429) | 60-150s | $0.24-$1.13 |
| **2. HTML build** | `sharp` оптимізує PNG → webp dataURI, kit рендерить CSS+компоненти, склейка HTML, Meta validation | <1s | $0 |

Після Phase 2 пише **HTML-log репорт** з повним розкладом: яка стадія, скільки тривала, скільки заплачено, Gantt timeline, прев'ю ассетів.

---

## Як зробити новий стиль

1. **Скопіювати** існуючий бриф як шаблон:
   ```
   cp styles/cyber-heist.brief.json styles/my-style.brief.json
   ```
2. **Відредагувати** обов'язкові поля:
   - `id` — машинне ім'я (kebab-case)
   - `name` — людська назва
   - `derivedFrom` — **IP-anchor**, назва гри-референсу (це винайдена в prompt-lab техніка яка стабілізує стиль)
   - `artDirection.artStyle` — з enum: `flat-vector | cartoon-3d-glossy | hand-painted | pixel-art | realistic | flat-illustration | low-poly | claymation`
   - `palette` — primary/accent/text у HEX
   - `rendering` — outline/material/lighting/perspective/shapeLanguage
3. **Залишити фіксовані 13 ключів** в `assets[]` (їх очікує kit):
   - **9-slice**: `btn-frame`, `panel-frame`, `bar-track`
   - **Fixed**: `avatar-frame`, `banner`
   - **Icons (6)**: `ic-settings`, `ic-close`, `ic-back`, `ic-sound`, `ic-plus`, `ic-check`
   - **Cover**: `bg`, `hero`
4. **Перевірити схему**: `src/assetgen/brief.schema.json` — будь-яке поле має валідне enum-значення.
5. **Запустити**: `npm run forge -- my-style`

---

## Економія / quality knob

`defaults.quality` керує токенами і ціною. Орієнтири:

| quality | 1024×1024 | 1024×1536 | Коли | Втрати |
|---|---|---|---|---|
| `low` | $0.011 | $0.016 | масовий випуск, A/B варіації стилю | дрібні тонкі деталі |
| `medium` | $0.042 | $0.063 | дефолт для production | помітні тільки на bg/hero великим планом |
| `high` | $0.167 | $0.250 | hero-shot для marketing | overkill якщо resize до 96-680px |

**Базова стратегія:** `defaults.quality: "low"`, потім `overrides` на `bg` і `hero` піднімає до `medium`. Іконки 96px візуально не виграють від `medium` бо вони все одно ріжуться `sharp.resize`. Бачили в порівнянні: Variant B (icons=low, bg/hero=medium) дав $0.24-0.35 vs $1.13 baseline без помітної втрати якості.

---

## Reference запуски

| Style | Quality preset | Cost | Wall (Phase 1) | Output size |
|---|---|---|---|---|
| `urban-runner` | all medium/high (baseline) | $1.13 | 150s | 363 KB |
| `cyber-heist` | icons+frames=low, bg/hero=medium (Variant B) | $0.35 | 107s | 335 KB |
| `cyber-heist-cheap` | all=low | $0.24 | 125s | 322 KB |

**Висновок:** Variant B — це sweet spot ціна/якість для production. `cyber-heist-cheap` ОК для прототипування але bg/hero візуально просідають.

---

## Що цей skill НЕ робить

- **Не пише gameplay-код** — playable з форджа це **меню з 5 екранами**. Реальна механіка (`tap-the-coin`, `plug-in-socket`) — окремий шар: `templates/<mechanic>/game.ts`.
- **Не редагує kit-компоненти** — кнопки, панелі, бари визначені в `src/assetgen/kit/kit.ts`. Якщо треба новий компонент або інша візуальна логіка — це окрема задача.
- **Не змінює провайдера** — зараз hardcoded на OpenAI gpt-image-1.5. Адаптер для fal.ai / Recraft / Gemini — окремий проєкт (~30-50 рядків).

---

## Дебаг частих проблем

| Симптом | Причина | Фікс |
|---|---|---|
| `429 rate limit` поспіль на кожному ассеті | OpenAI ліміт 5 img/min, концурентність 3 | вбудовано retry+backoff, просто почекати |
| `Phase 1 had N failures` | OpenAI повернув порожнє body / network error | повторити `npm run forge -- <style>` — skip-existing пропустить готові, добʼємо тільки fail |
| Іконка виглядає погано | brief subject недостатньо описовий АБО `quality: low` для занадто детального символу | підняти quality в `overrides` для цього ассета |
| Меню "пливе" візуально | `low` quality на frames + 9-slice розтяг → плямисті градієнти | `quality: medium` на `btn-frame`/`panel-frame`/`bar-track` |
| Файл > 2 MB | bg/hero у `high` + transparent: false | webp-кодування зазвичай справляється, але можна додати `--quality 75` в `kit.ts` toWebp |

---

## Файли які складають цей skill

| Файл | Роль |
|---|---|
| `src/cli.ts` — `cmdForge` | оркестрація Phase 1 + Phase 2 |
| `src/assetgen/run.ts` — `runAssetGen()` | Phase 1: OpenAI batch generation |
| `src/assetgen/build-test-playable.ts` — `buildKitPlayable()` | Phase 2: kit-based HTML composition |
| `src/assetgen/kit/kit.ts` | single source of truth для всіх UI компонентів |
| `src/assetgen/kit/stage.ts` | responsive scaling (фіксований 400×860 canvas) |
| `src/assetgen/compose.ts` | brief → ResolvedAsset (включно з IP-anchor + isolation-clause) |
| `src/build/validator.ts` | Meta requirements check |
| `src/assetgen/stage-log.ts` + `log-report.ts` | live console log + HTML repository report |
| `styles/<id>.brief.json` | вхідні бріфи (по одному на стиль) |

---

## Наступний рівень

Цей skill зафіксував **створення меню**. Окремо:

1. **Компонентний рівень** — змінювати/додавати UI компоненти в `kit.ts` (наприклад: `k.toast()`, `k.dialog()`, `k.scroll-list()`). Це впливає на всі playable одразу через single source of truth.
2. **Mechanic рівень** — реальна гра у `templates/<mechanic>/game.ts`. Зараз тут tap-the-coin і plug-in-socket як заглушки. Тут пишеться interactive код з PixiJS/GSAP, обробка input, виклик `FbPlayableAd.onCTAClick()`.
3. **Pipeline рівень** — змінювати провайдера (fal.ai/Recraft), додавати variation testing, A/B варіанти одного стилю, regional пакування.
