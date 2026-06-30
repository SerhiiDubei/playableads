# Avoid the Accident — lab

Insurance-vertical playable. 20-second top-down drive: dodge a cyclist, a stalled
car, a dog and a double block — then the 5th crash hits no matter what, because
it's the *other* driver's fault. Lands on **"Good drivers still need insurance."**

- **Status:** v2 — Traffic Run!-style generated art (6 sprites) + smooth steering, mechanic + flow verified.
- **Camera:** top-down, 3 lanes, road scrolls down to sell forward motion.
- **Controls:** swipe / tap a side → change lane · hold (press & stay) → brake.
- **Endcard:** "You avoided X out of 5 accidents." + subtitle + CTA `Get a free quote`
  (whole endcard is tappable → `FbPlayableAd.onCTAClick`).

## The 5 threats (`TIMELINE` in `game.ts`)
| # | t (s) | Threat | Beaten by |
|---|------|--------|-----------|
| 1 | 2.2  | cyclist, centre lane | change lane |
| 2 | 5.4  | stalled car, right lane | change lane |
| 3 | 8.6  | dog crossing | **brake** (slows the world so it passes) |
| 4 | 12.0 | two cars block, only centre free | precision lane |
| 5 | 15.4 | oncoming car | **unavoidable — not your fault** |

Honest count: threats 1–4 are counted on a real dodge; #5 always crashes →
skilled play yields exactly **4/5**, matching the brief.

## Build & QA
```
npx tsx src/assetgen/build-lab.ts avoid-the-accident   # -> test/avoid-the-accident/index.html
node tools/qa-lab.mjs avoid-the-accident               # headless render + error check
```
`?dbg=1` exposes `window.__game()` (live `{lane, avoided, resolved, t, ended}`) for tests.

## Known notes
- ~759 KB single-file, 37% of the 2 MB Meta budget (6 sprites, ~121 KB raw).
- Headless SwiftShader can drop the first composite of static layers on a *cold*
  GL context (first one in a process); a warm context renders 100%. A first-frame
  `onResize()` kick mitigates it. Not a real-device (real-GPU) concern.

## Assets (v2)
Traffic Run!-style sprites generated via `styles/avoid-the-accident.brief.json`
(`npx tsx tools/gen-accident-assets.ts`): player-car, stalled-car, oncoming-car,
cyclist, dog, tree. Raw PNGs kept in `assets/_src/`; procedural shapes remain as
a fallback if a sprite is missing.

## Next steps
- SFX: engine loop, tyre screech on near-miss, brake, crash; light music bed.
- Tune threat cadence / brake feel; optional richer roadside variety.
