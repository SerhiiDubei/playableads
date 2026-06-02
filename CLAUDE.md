# playable-forge — project rules

CLI toolchain that builds Meta playable ads from `templates × styles × briefs` (TS/ESM, PixiJS + GSAP).
AI asset-generation lives in `src/assetgen/`. Full experiment journal: `test/EXPERIMENT-LOG.md`.

## Skills (зафіксовані workflows)

- **Build a Playable Menu** → `npm run forge -- <style-id> [--layout <id>]`. Один command робить Phase 1 (AI gen) + Phase 2 (HTML build) + HTML log report. Повний опис: [`docs/playable-menu-skill.md`](docs/playable-menu-skill.md). Базовий cost ~$0.24-$1.13 за playable залежно від quality в брифі.
- **Catalog усіх ассетів** → `npm run catalog`. Сканує `out/`, показує які стилі, скільки ассетів, скільки витрачено. Файл: [`src/assetgen/catalog.ts`](src/assetgen/catalog.ts).

## Playable Design System (PDS)

ДО МЕРЖА будь-якого нового layout: **`npm run check:layouts -- all`**. Перевіряє overflow, CTA visible, touch targets, hero size, install-text present. FAIL = bug, не релізиш.

- Правила з WHY/HOW-FIX: [`docs/playable-design-rules.md`](docs/playable-design-rules.md)
- Reference патерни (endcard, tutorial, feature-grid, tap-reveal, match-3, ...): [`docs/playable-references.md`](docs/playable-references.md)
- Lint engine: [`src/assetgen/layouts/lint.ts`](src/assetgen/layouts/lint.ts) — Playwright-based

**Коли пишеш новий layout** (`src/assetgen/layouts/<name>.ts`):
1. Оголоси `meta: { screenIds, hasCta, primaryCtaTexts, maxHeroPx? }` — це інпут для lint
2. Зареєструй у `src/assetgen/layouts/index.ts`
3. Запусти `npm run forge -- <style> --layout <name>` → побачиш на існуючих ассетах за $0
4. Запусти `npm run check:layouts -- all` → має бути 7/7 PASS перед коммітом

**Sticky CTA pattern** (виправляє R1 overflow): `position:absolute;left:24px;right:24px;bottom:20px`. На screen padding-bottom лиш 100px під цей CTA. Це універсальний паттерн — не вилазить ніколи.

## Kit / component development rules (HARD — порушення вже ламало білд)

These come from real regressions. Follow them directly when touching UI assets/components.

1. **Single source of truth = `src/assetgen/kit/kit.ts`.**
   Component CSS, render functions, and asset optimization live ONLY there. Every builder
   (`build-test-playable.ts`, `build-components.ts`, future `builder.ts`) MUST consume the kit
   via `loadKit()` + `makeKit()`. **Never duplicate component CSS or re-implement assets in a builder.**
   *Why:* the showcase kept its own copy, diverged from the kit, and a fixed button-centering bug
   reappeared on it (the 5057 regression). Two sources of truth WILL drift.

2. **Frame/template assets must be symmetric** (vertically + horizontally) — text centering depends on it.
   Verify symmetry with a `sharp` panel-analysis (bright-region center vs geometric center), **not by eye**.
   An asymmetric `btn-frame` (panel offset -12% up) made centered text look crooked.

3. **Measure alpha/geometry instrumentally with `sharp`, never trust the image viewer.**
   The viewer composites transparency on a non-neutral background → a clean cutout can look like it
   has a baked grey/red backdrop. Decisions about "background" must be based on measured alpha %.

4. **Inline a large asset EXACTLY ONCE** (CSS class / `:root` var), never per element.
   A background `url(dataURI)` repeated across 5 screens blew the file to 1 MB; one `.scene{}` rule → 477 KB.

5. **Generate the minimum number of templates; compose the UI.**
   One frame → any size via 9-slice (`border-image`); text via font overlay (localizable, lighter),
   not baked into the image. Don't generate each element separately.

6. **Weight pipeline:** `trim → resize → webp` for every asset. Budget = **2 MB single-file**;
   base64 adds ~33% — keep it in mind.

7. **Responsive = fixed design-canvas + scale, NOT fluid CSS.**
   UI lives in a fixed `DESIGN` (400×860) `#stage`; `src/assetgen/kit/stage.ts` scales it (contain)
   to any viewport; the bg scene covers gutters on `#viewport`. Fluid `vw/vh/flex` layouts reflow
   per device ("float") — forbidden for playable UI. Kit components use **fixed px** (no `vw`/`clamp`);
   responsiveness is the stage's job, not the component's.

8. **Visual tests are MANDATORY after any UI/kit/layout change.**
   Run `npm run visual` (Playwright, `src/assetgen/visual-test.ts`): it screenshots N viewports
   (portrait phones, tablet, landscape, square) into `test/visual/` and **asserts no element overflows
   the viewport**. Must be `ALL PASS` before UI is considered done. Don't eyeball one size and call it.

## Layout / zoning rules

- **Placement is zone-driven, never ad-hoc.** Every screen declares a `screenType`; `src/assetgen/kit/layout.ts`
  resolves `BASE ⊕ ARCHETYPE[type]` into named zones (`hud / title / stage / actions / footer`). Components are
  placed into zones (`zone("actions", ...)`), not at arbitrary coordinates.
- **Base rules are universal** (every screen): safe margins (~6% sides), thumb-zone for the primary CTA
  (`actions`, bottom-center — Hoober's green zone), tap targets ≥44px, HUD only in top corners.
- **Archetypes specialize** per screen type (menu / pick-hero / endcard / …). Add a new archetype rather than
  hand-tweaking a screen. Identify the screen's type explicitly (a field), don't guess from content.
- **Zone bands must fit their contents.** A too-short band makes elements overflow it — caught by the zone
  assertion in `npm run visual` (every interactive element must stay within its zone; primary CTA must be in `actions`).
- Debug overlay: append `#zones` (or `?zones=1`) to the URL to see zone outlines.

## UI quality rules

- **Visual hierarchy is mandatory, not cosmetic.** Never leave peer elements all equal-weight.
  Each screen has exactly ONE `primary` action (bigger + accent + glow), `default` secondary actions,
  and `tertiary` (dimmed/smaller) for de-emphasized ones. Use `kit.button(..., {level})`. Same for text
  (title > label > sub). The eye must land on the main action first.

## Asset-gen rules

- Model: **gpt-image-1.5** (transparent PNG native). Avoid gpt-image-2 (no alpha, 3–4× slower).
- Prompts: compose from a versioned style brief (`styles/*.brief.json`, schema `src/assetgen/brief.schema.json`)
  via `composePrompt`. Winning recipe = **IP-anchor (name the reference game) + isolation-clause**.
- OpenAI gpt-image rate limit = **5 images/min** → keep retry+backoff + skip-existing in the pool.
- Character consistency across poses → `images.edit` with a master image as reference (excellent identity match;
  add `stripBackground()` for bust/portrait framings where isolation slips).
- Every asset writes a sidecar `.json` (prompt + brief version) for reproducibility.
