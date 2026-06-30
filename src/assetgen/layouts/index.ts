import type { Layout } from "./types.js";
import { menu5 } from "./menu5.js";
import { endcard } from "./endcard.js";
import { tutorial } from "./tutorial.js";
import { featureGrid } from "./feature-grid.js";
import { tapReveal } from "./tap-reveal.js";
import { pickHero } from "./pick-hero.js";
import { progressReveal } from "./progress-reveal.js";
import { twoChoice } from "./two-choice.js";
import { matchCluster } from "./match-cluster.js";
import { featureList } from "./feature-list.js";
import { showcase } from "./showcase.js";
import { estimateReveal } from "./estimate-reveal.js";

export const LAYOUTS: Record<string, Layout> = {
  [menu5.id]: menu5,
  [endcard.id]: endcard,
  [showcase.id]: showcase,
  [tutorial.id]: tutorial,
  [featureGrid.id]: featureGrid,
  [tapReveal.id]: tapReveal,
  [pickHero.id]: pickHero,
  [progressReveal.id]: progressReveal,
  [twoChoice.id]: twoChoice,
  [matchCluster.id]: matchCluster,
  [featureList.id]: featureList,
  [estimateReveal.id]: estimateReveal,
};

export const DEFAULT_LAYOUT = "menu5";

export function getLayout(id: string | undefined): Layout {
  const key = id ?? DEFAULT_LAYOUT;
  const l = LAYOUTS[key];
  if (!l) {
    throw new Error(`unknown layout "${key}". Available: ${Object.keys(LAYOUTS).join(", ")}`);
  }
  return l;
}

export function listLayouts(): Layout[] {
  return Object.values(LAYOUTS);
}

export type { Layout } from "./types.js";
