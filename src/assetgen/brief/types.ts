// UserBrief — the intake brief (epic B). Distinct from pipeline `Brief`
// (Envelope input), `BuildBrief` (legacy build flow), and style briefs.
//
// Mandatory: prompt + ≥1 ref (Q09/Q22). "Yellow" fields (style/audience/niche/
// tone) are optional — present-but-empty triggers a warning, not a hard fail;
// the context-filler agent (epic I) fills them later.

import { z } from "zod";

export const UserBriefSchema = z
  .object({
    id: z.string().min(1), // slug, == folder name under briefs/user/
    version: z.number().int().positive(),
    createdAt: z.string().min(1), // ISO
    prompt: z.string().min(1), // MANDATORY
    refs: z.array(z.string()).min(1), // MANDATORY (≥1 reference)
    // ── yellow fields (optional; warn if missing) ──
    style: z.string().optional(),
    audience: z.string().optional(),
    niche: z.string().optional(),
    tone: z.string().optional(),
    // lineage: which version this was branched from (undefined for v1)
    parentVersion: z.number().int().positive().optional(),
  })
  .passthrough();

export type UserBrief = z.infer<typeof UserBriefSchema>;

export const YELLOW_FIELDS = ["style", "audience", "niche", "tone"] as const;

// Fields that are present but empty (or missing) → warnings, not errors.
export function yellowWarnings(b: UserBrief): string[] {
  return YELLOW_FIELDS.filter((f) => !b[f]).map((f) => `«${f}» не задано (бажано для кращого результату)`);
}
