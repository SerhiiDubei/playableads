# playable-forge — project rules

CLI toolchain that builds Meta playable ads from `templates × styles × briefs` (TS/ESM, PixiJS + GSAP).
AI asset-generation lives in `src/assetgen/`. Full experiment journal: `test/EXPERIMENT-LOG.md`.

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

## Asset-gen rules

- Model: **gpt-image-1.5** (transparent PNG native). Avoid gpt-image-2 (no alpha, 3–4× slower).
- Prompts: compose from a versioned style brief (`styles/*.brief.json`, schema `src/assetgen/brief.schema.json`)
  via `composePrompt`. Winning recipe = **IP-anchor (name the reference game) + isolation-clause**.
- OpenAI gpt-image rate limit = **5 images/min** → keep retry+backoff + skip-existing in the pool.
- Character consistency across poses → `images.edit` with a master image as reference (excellent identity match;
  add `stripBackground()` for bust/portrait framings where isolation slips).
- Every asset writes a sidecar `.json` (prompt + brief version) for reproducibility.
