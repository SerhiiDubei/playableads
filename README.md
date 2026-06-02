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
  embedded font, `stripBackground` fallback. Buttons carry a **visual hierarchy** (`level: primary | default | tertiary`)
  so each screen has one clear primary action.
- **Responsive stage** (`src/assetgen/kit/stage.ts`) — fixed design-canvas (400×860) scaled to any viewport (no fluid reflow).
- **Zone-based layout** (`src/assetgen/kit/layout.ts`) — `resolveLayout(screenType)` deep-merges a universal `BASE`
  (safe areas, thumb-zone CTA, ≥44px tap targets, HUD corners) with per-screen archetypes (`menu / pick-hero / endcard`).
  Elements are placed by zone (`zone("actions", …)`), not ad-hoc coordinates; a debug overlay is available via `?zones=1`.
- **Single-file builder + Meta validator** — `playable menu <style>` inlines everything, wires `FbPlayableAd.onCTAClick()`,
  and validates size / CTA / no-redirects / no-external-loads.
- **Visual tests** (`npm run visual`) — Playwright screenshots across 8 viewports; asserts **no overflow**, that every
  element stays inside its zone, and that the **primary CTA lands in the thumb-reachable `actions` zone**.

Two reference styles ship end-to-end: **Heroes III** (painterly) and **Pixel Quest** (16-bit).

## Commands

```bash
npm run playable -- list             # list mechanics + styles
npm run playable -- menu heroes3     # build kit playable -> out/menu-heroes3.html (validated)
npm run playable -- menu pixelart    # 16-bit variant
npm run menu                         # build the test playable (heroes3)
npm run components                   # component-kit showcase
npm run visual                       # visual regression across viewports
npm run typecheck
```

## Recent work

- **Zone-based layout system** — universal `BASE` ⊕ screen archetypes, zone-driven placement, debug overlay,
  and zone assertions baked into the visual tests.
- **Button visual hierarchy** — `primary` (larger + gold glow + pulse) / `default` / `tertiary` (dimmed); one primary per screen.
- **Endcard screen** — big hero + dominant Install CTA wired to `onCTAClick`.
- **Banner title containment** — title auto-positions on the ribbon's writable band (centroid measured with `sharp`,
  not tuned by eye); added a `pixelated` kit mode.

> Both reference styles pass all 8 viewport + zone checks (`npm run visual` → `ALL PASS`).

## Notes

- Engineering insights & rules live in [`CLAUDE.md`](CLAUDE.md); the full experiment journal is in
  [`test/EXPERIMENT-LOG.md`](test/EXPERIMENT-LOG.md).
- Generated assets (`out/`) and secrets (`.env`) are git-ignored. Copy `.env.example` → `.env` and add your `OPENAI_API_KEY`.
