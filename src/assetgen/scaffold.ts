// Scaffold a new mechanic (draft game) — shared by CLI (`playable new`) and the
// Studio (`/api/scaffold`). Per labs-first: new mechanics land in labs/<id>/ and
// are promoted to templates/ later via TEMPLATE-STANDARD (T-01).
//
// Creates: <baseDir>/<id>/{manifest.json, game.ts}. manifest has no `catalog`
// field → it's a draft (hidden from the curated user catalog until promoted).

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export const LABS_DIR = "labs";

export interface ScaffoldInput {
  id: string; // kebab-case
  name?: string;
  description?: string;
  baseDir?: string; // default "labs"
}

export interface ScaffoldResult {
  id: string;
  dir: string;
}

export function isValidMechanicId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(id);
}

function gameStub(id: string): string {
  return `import { Application } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

async function main(): Promise<void> {
  const app = new Application();
  await app.init({ resizeTo: window, background: 0x000000 });
  document.body.appendChild(app.canvas);
  // TODO: build the "${id}" mechanic. Call window.FbPlayableAd.onCTAClick() on the CTA.
  void cfg;
  void gsap;
}

void main();
`;
}

export function scaffoldMechanic(input: ScaffoldInput): ScaffoldResult {
  const { id } = input;
  if (!isValidMechanicId(id)) {
    throw new Error(`invalid id "${id}" — use kebab-case (e.g. swipe-to-slice).`);
  }
  const base = input.baseDir ?? LABS_DIR;
  const dir = path.join(base, id);
  if (existsSync(dir)) throw new Error(`"${id}" already exists at ${dir}.`);

  mkdirSync(dir, { recursive: true });
  const manifest = {
    id,
    name: input.name ?? id,
    description: input.description ?? "TODO: describe the mechanic.",
    entry: "game.ts",
    assetBudgetBytes: 1468006,
    params: {},
    // no `catalog` field → draft; promote to "v1" via TEMPLATE-STANDARD when ready.
  };
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(path.join(dir, "game.ts"), gameStub(id));
  return { id, dir };
}
