// Reference-games knowledge base — the DETERMINISTIC layer under Agent 2.
// Each entry is a full DECONSTRUCTION of a real game into everything the
// pipeline needs to rebuild a playable of that type: not just an intake idea,
// but the production blueprint (gameplay, animations, screens, assets, meta).
//
// Why: so suggestions/briefs are pulled from a curated, validated source —
// never "magic from a hat". The agent retrieves from here; the LLM only parses
// games NOT yet in the base (then we review + add → the base grows, controlled).
//
// Each section maps to a pipeline stage:
//   core      → mechanic brief (Agent 2 intake)
//   gameplay  → game.ts generation
//   animations→ GSAP/VFX work
//   screens   → plan stage (screen count + flow)
//   assets    → assetgen stage (what to generate)
//   meta      → cost-preview + template mapping

import { z } from "zod";

const CoreAction = z.enum(["tap", "swipe", "drag", "aim", "hold", "tilt"]);

// An "aha" moment — the sellable beat. A game has SEVERAL, ranked by punch.
const AhaMoment = z.object({
  desc: z.string().min(1),
  priority: z.number().int().min(1), // 1 = the hero moment the ad leads with
  trigger: z.string().optional(), // what causes it (e.g. "5-fruit combo")
});

const Animation = z.object({
  name: z.string().min(1), // e.g. "fruit-slice", "combo-burst", "fail-shake"
  trigger: z.string().min(1), // when it fires
  desc: z.string().optional(),
  tech: z.enum(["gsap", "spritesheet", "shader", "particles"]).optional(),
});

// Combo as a TIME-WINDOWED chain (learned from the SB3 source: combo is not
// "same swipe" but a chain within a timeout, with an escalating multiplier).
const ComboRule = z.object({
  windowMs: z.number(), // time window to keep the chain alive
  multiplier: z.string(), // how the multiplier escalates (e.g. "x2 at 3, x3 at 5")
  voiceCallouts: z.boolean().default(false), // escalating "Combo 1..8" callouts
});

// A special / bonus item that is its own mechanic (SB3: frenzy/freeze/double
// bananas, pomegranate). In arcade these ARE the aha-moments.
const SpecialItem = z.object({
  name: z.string().min(1),
  effect: z.string().min(1), // what it does (e.g. "freeze time 5s")
  splitsIntoHalves: z.boolean().default(true),
  art: z.string().optional(),
});

// Audio event → sound, with variation count (SB3: slice-1/2/3 randomized).
const AudioEvent = z.object({
  event: z.string().min(1), // e.g. "slice", "combo", "bomb", "throw"
  sound: z.string().min(1), // descriptive sound name
  variations: z.number().int().min(1).default(1), // randomized variants
});

const ScreenType = z.enum(["intro", "tutorial", "gameplay", "reward", "endcard"]);
const Screen = z.object({
  id: z.string().min(1),
  type: ScreenType,
  purpose: z.string().min(1),
});

const AssetList = z.object({
  sprites: z.array(z.string()).default([]),
  backgrounds: z.array(z.string()).default([]),
  ui: z.array(z.string()).default([]),
  vfx: z.array(z.string()).default([]),
  sfx: z.array(z.string()).default([]),
  fonts: z.array(z.string()).default([]),
});

export const ReferenceGameSchema = z.object({
  // ── 1. identity ──
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/), // kebab
  game: z.string().min(1),
  link: z.string().optional(),
  studio: z.string().optional(),
  tags: z.object({
    genre: z.string(),
    mood: z.array(z.string()).default([]),
    coreAction: CoreAction,
    complexity: z.enum(["low", "medium", "high"]),
  }),

  // ── 2. core design (intake GDD / quality rubric) ──
  coreAction: CoreAction,
  objects: z.array(z.string()).min(1),
  goal: z.string().min(1),
  tension: z.string().min(1),
  ahaMoments: z.array(AhaMoment).min(1), // MULTIPLE, ranked
  fantasy: z.string().min(1), // the emotion/promise the ad sells
  winBias: z.string().min(1), // how rigged toward a win
  firstActionHint: z.string().min(1), // how the player learns the 1st action

  // ── 3. gameplay detail (→ game.ts) ──
  rules: z.array(z.string()).default([]),
  controls: z.string().optional(),
  progression: z.string().optional(), // how it escalates across the loop
  states: z.object({ win: z.string(), lose: z.string() }),
  feedback: z.array(z.string()).default([]), // juice moments
  comboRule: ComboRule.optional(), // time-windowed combo + multiplier (SB3 lesson)
  specialItems: z.array(SpecialItem).default([]), // bonus mechanics (SB3 lesson)
  audioEvents: z.array(AudioEvent).default([]), // event→sound map w/ variations (SB3 lesson)
  modes: z.array(z.string()).default([]), // e.g. Classic/Zen/Arcade (playable picks one)

  // ── 4. animations ──
  animations: z.array(Animation).default([]),

  // ── 5. screens / flow (→ plan stage) ──
  screens: z.array(Screen).min(1),

  // ── 6. assets needed (→ assetgen stage) ──
  assets: AssetList,

  // ── 7. production meta (→ cost + template mapping) ──
  loop: z.object({ durationSec: z.number(), beats: z.number().optional() }),
  estComplexity: z.enum(["low", "medium", "high"]),
  assetBudgetHint: z.number().optional(),
  mapsToTemplate: z.string().optional(), // existing template id if close
  notes: z.string().optional(),
});

export type ReferenceGame = z.infer<typeof ReferenceGameSchema>;
export type AhaMomentT = z.infer<typeof AhaMoment>;
