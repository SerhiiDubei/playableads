// Plan editing (epic C). Pure transforms over a Plan — the CLI reads the
// envelope, applies one, writes it back, all BEFORE asset-gen (planner gate).
// Editing the plan never triggers generation; it just reshapes intent.

import type { Plan } from "./types.js";

export function addScreen(plan: Plan, id: string): Plan {
  if (plan.screens.some((s) => s.id === id)) return plan;
  return { ...plan, screens: [...plan.screens, { id }] };
}

export function rmScreen(plan: Plan, id: string): Plan {
  return { ...plan, screens: plan.screens.filter((s) => s.id !== id) };
}

export function addAsset(plan: Plan, key: string): Plan {
  if (plan.assetKeys.includes(key)) return plan;
  return { ...plan, assetKeys: [...plan.assetKeys, key] };
}

export function rmAsset(plan: Plan, key: string): Plan {
  return { ...plan, assetKeys: plan.assetKeys.filter((k) => k !== key) };
}
