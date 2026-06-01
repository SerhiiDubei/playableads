# playable-forge

CLI toolchain that builds **Meta playable ads** from `templates × styles × briefs`, with an
AI **asset-generation pipeline** (OpenAI `gpt-image-1.5`) and a reusable, weight-optimized **UI kit**.

> Single-file output, ≤ 2 MB (Meta limit). TypeScript / ESM · PixiJS + GSAP · sharp · Playwright.

## What's inside

- **Asset generation** (`src/assetgen/`)
  - Versioned **style briefs** (`styles/*.brief.json`, schema `src/assetgen/brief.schema.json`) →
    `composePrompt` (IP-anchor + isolation-clause) → parallel pool with retry/skip-existing → sidecar JSON for reproducibility.
  - `prompt-lab` for A/B prompt-strategy experiments; `ref-test` for character consistency via `images.edit`.
- **UI kit** (`src/assetgen/kit/kit.ts`) — single source of truth: 9-slice `button / panel / bar / pill / avatar / banner`,
  embedded font, `stripBackground` fallback.
- **Responsive stage** (`src/assetgen/kit/stage.ts`) — fixed design-canvas (400×860) scaled to any viewport (no fluid reflow).
- **Single-file builder + Meta validator** — `playable menu <style>` inlines everything, wires `FbPlayableAd.onCTAClick()`,
  and validates size / CTA / no-redirects / no-external-loads.
- **Visual tests** (`npm run visual`) — Playwright screenshots across 8 viewports + overflow assertions.

Two reference styles ship end-to-end: **Heroes III** (painterly) and **Pixel Quest** (16-bit).

## Commands

```bash
npm run playable -- list             # list mechanics + styles
npm run playable -- menu heroes3     # build kit playable -> out/menu-heroes3.html (validated)
npm run playable -- menu pixelart    # 16-bit variant
npm run menu                         # 10-screen test playable (heroes3)
npm run experiments                  # 5 art-direction layouts on one zone system
npm run recipes                      # screens composed purely from group@zone recipes
npm run game                         # tap-to-attack interactive playable
npm run connect                      # drag-to-connect game (3 levels, scene bg, juice)
npm run catalog                      # regenerate docs/KIT.md (component + group bible)
npm run components                   # component-kit showcase
npm run visual                       # visual regression across viewports (auto-discovers screens)
npm run typecheck
```

## Layered architecture

Screens (and whole games) are assembled from validated data layers — see [`docs/KIT.md`](docs/KIT.md):

- **Catalog** (`kit/catalog.ts`) — *what* each component is + how to generate it.
- **Groups** (`kit/groups.ts`) — semantic families with rules (`composeScreen` + `validateRecipe`).
- **Zones** (`kit/layout.ts`) — *where* on screen (archetypes + debug overlay).
- **Flow** (`kit/flow.ts`) — *function* + *how screens connect* (`validateFlow`).
- **Scene** — background mood per beat (`world`/`focus`/`celebration`), one bg + CSS.

## Notes

- Engineering insights & rules live in [`CLAUDE.md`](CLAUDE.md); the full experiment journal is in
  [`test/EXPERIMENT-LOG.md`](test/EXPERIMENT-LOG.md). Session logs in [`docs/`](docs/) (e.g. [2026-06-01](docs/SESSION-2026-06-01.md)).
- Generated assets (`out/`) and secrets (`.env`) are git-ignored. Copy `.env.example` → `.env` and add your `OPENAI_API_KEY`.
