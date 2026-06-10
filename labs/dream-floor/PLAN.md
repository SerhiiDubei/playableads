# Dream Floor — director's plan & build plan

Home-Improvement playable for a USA flooring company. Sells the *feeling of control + instant
transformation* (oddly-satisfying renovation), not "flooring". Reference vibe: House Flipper /
Design Home, warm & cozy. Frame composed **3/4** per `references/Home improvement/`.

Format: single-scene interactive HTML5 playable, **portrait 9:16**, ~18–30s to CTA.
Emotional arc: cozy → alarm (something broke) → agency (I can fix it) → satisfaction → action.

## Composition (from references)

- 3/4 angled view of a warm modern living room. Back wall + window with soft daylight up top;
  floor plane in fake perspective (trapezoid) filling the lower two-thirds.
- Couch center on a rug; light dressing (plant, floor lamp, wall frames).
- Bottom toolbar with rounded tool chips; ✓ per completed step; thin progress bar.
- Branded end card ("Design Your Dream Floor") over the live scene — never a black screen.

## FSM / beats

`IDLE_HOOK → MOVE_COUCH → RIP_CARPET → TOOL_CROWBAR → TOOL_PLANK → TOOL_FINISH → REVEAL → END_CARD`

| State | Beat | Player action | On-screen result |
|-------|------|---------------|------------------|
| IDLE_HOOK | cold open / hook | (watch) | couch tilts `couchTiltDeg°` at `hookDelayMs`, dust + pulse + hand cue; hint "Something's not right…" |
| MOVE_COUCH | move the couch | tap/drag couch | couch slides aside (inertia); rug highlights; "Pull up the rug" |
| RIP_CARPET | rip the rug | tap rug | rug peels away; rotten subfloor revealed; toolbar opens; "Time to fix it 🔧" |
| TOOL_CROWBAR | demolition | tap crowbar → tap floor | rotten boards pry up & vanish → bare subfloor |
| TOOL_PLANK | lay planks | tap plank → tap floor | `plankCount` new planks click in one-by-one (snap) |
| TOOL_FINISH | finish | tap finish → swipe floor | glossy finish sweeps across; wood "comes alive" |
| REVEAL | reward | (auto) | couch returns onto pristine floor; warmth + sunbeam + glint; "Beautiful. Real floors, real easy." |
| END_CARD | CTA | tap CTA / card | logo + title + "Shop Real Flooring →"; small Replay; redirect via `FbPlayableAd.onCTAClick()` |

## Rules (forgiving, network-safe)

- **No fail states.** Wrong taps do nothing; the correct zone re-pulses.
- **Idle:** re-hint at `idleHintMs`; after `autoDemoAfterIdles` idles, auto-demo the current step.
- **Always clickable:** brand logo in a corner jumps straight to the end card at any time.
- **Snappy:** each step animation ≤ `stepAnimMs`; input is never blocked for long.

## Tunables (manifest `params`)

`couchTiltDeg, hookDelayMs, idleHintMs, autoDemoAfterIdles, stepAnimMs, plankCount, tapTolerancePx, revealHoldMs`

## Build plan (stages)

- **D0 scaffold** — folders, manifest, style, build script, npm/launch wiring, this plan. ✅
- **D1 greybox prototype** — `game.ts`: 3/4 procedural room + FSM + 3-click combo + hint/idle/auto-demo
  + reveal + end card + CTA. Build → `test/dream-floor/index.html`, verify via `?dbg` extract. $0.
- 🛑 **CHECKPOINT 1** (human) — composition + feel proven procedurally.
- **D2 draft** — `styles/dream-floor.brief.json` (3/4 art) → `gen-only` → webp swap-in; gates green. 🛑 CP2.
- **D3 final** — promote `labs/` → `templates/` per TEMPLATE-STANDARD; build from a brief.

## Boot hardening (baked in)

- `preloadTextures()` uses `img.onload`/`onerror`, **never `img.decode()`** (decode() deadlocks in a
  hidden/throttled tab → blank canvas; this bit the earlier `fix-the-floor` build).
- `main().catch(...)` surfaces boot errors instead of swallowing them.
- `?dbg` exposes `window.__ftf = { state, step, reset, end, cta, shot }` for deterministic QA &
  frame capture via `app.renderer.extract` (works while the canvas animates).
