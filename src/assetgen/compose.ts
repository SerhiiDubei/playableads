type AnyObj = Record<string, any>;

const isObj = (x: any): x is AnyObj => x != null && typeof x === "object" && !Array.isArray(x);

// deep-merge with null = delete key (для overrides типу "typography": null)
export function deepMerge(base: AnyObj, over: AnyObj): AnyObj {
  const out: AnyObj = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(over ?? {})) {
    const v = over[k];
    if (v === null) { delete out[k]; continue; }
    out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out;
}

// enum -> природна мова (якість промпта)
const ART: Record<string, string> = {
  "hand-painted": "dark hand-painted digital painting, gritty realistic dark-fantasy concept art",
  "cartoon-3d-glossy": "glossy 3D cartoon render",
  "flat-vector": "clean flat vector",
  "pixel-art": "detailed pixel art",
  "realistic": "photorealistic render",
  "flat-illustration": "flat illustration",
  "low-poly": "stylized low-poly",
  "claymation": "claymation style",
};
const MAT: Record<string, string> = {
  glossy: "glossy finish", matte: "matte finish", metallic: "weathered metal surface",
  plastic: "plastic finish", glass: "glassy finish",
};
const LIGHT: Record<string, string> = {
  dramatic: "dramatic chiaroscuro torch-lit lighting", "soft-top": "soft top-down lighting",
  flat: "flat even lighting", rim: "rim lighting",
};
const OUTLINE: Record<string, string> = {
  "thick-cartoon": "thick clean cartoon outline", thin: "thin subtle outline",
  none: "no outline, painterly edges",
};
const PERSP: Record<string, string> = {
  "front-flat": "front view", "slight-3d": "slight 3D angle",
  isometric: "isometric view", "top-down": "top-down view",
};
const SHAPE: Record<string, string> = {
  "rounded-friendly": "rounded friendly shapes", "sharp-aggressive": "sharp ornate gothic shapes",
  geometric: "clean geometric shapes",
};

export type ResolvedAsset = {
  key: string;
  kind: string;
  prompt: string;
  size: "1024x1024" | "1024x1536" | "1536x1024";
  quality: "low" | "medium" | "high";
  model: string;
  transparent: boolean;
};

export function resolveAsset(brief: AnyObj, asset: AnyObj): ResolvedAsset {
  const base = {
    artDirection: brief.artDirection,
    palette: brief.palette,
    rendering: brief.rendering,
    typography: brief.typography,
    defaults: brief.defaults,
    negative: brief.negative,
  };
  const r = deepMerge(base, asset.overrides ?? {});

  const p = r.palette ?? {};
  const rd = r.rendering ?? {};
  const ad = r.artDirection ?? {};
  const parts: string[] = [];

  parts.push(asset.subject);
  // IP-anchor (виграв у prompt-lab): назвати референс-гру
  parts.push(brief.derivedFrom ? `in the visual style of ${brief.name} (${brief.derivedFrom})` : `in the style of ${brief.name}`);
  parts.push(`Art style: ${ART[ad.artStyle] ?? ad.artStyle}`);
  if (ad.mood?.length) parts.push(`mood: ${ad.mood.join(", ")}`);
  if (ad.theme) parts.push(`theme: ${ad.theme}`);
  parts.push(
    [
      MAT[rd.material] ?? rd.material,
      LIGHT[rd.lighting] ?? rd.lighting,
      PERSP[rd.perspective] ?? rd.perspective,
      SHAPE[rd.shapeLanguage] ?? rd.shapeLanguage,
      OUTLINE[rd.outline?.style] ?? rd.outline?.style,
    ].filter(Boolean).join(", ")
  );
  parts.push(
    `color palette: primary ${p.primary}, accent ${p.accent}, background ${p.background}, text ${p.text}`
  );
  if (asset.kind === "button" && r.typography) {
    const t = r.typography;
    parts.push(`engraved text in ${t.case} ${t.weight} gothic serif, text color ${t.textColor}`);
  }
  const d = r.defaults ?? {};
  // isolation-clause (виграв у prompt-lab): чистий виріз для прозорих ассетів
  if (d.transparent !== false) {
    parts.push("perfectly isolated on a fully transparent background, no scenery, no ground, no cast shadow, no backdrop, clean crisp alpha edges tightly around the subject");
  }
  if (r.negative?.length) parts.push(`Avoid: ${r.negative.join(", ")}`);

  return {
    key: asset.key,
    kind: asset.kind,
    prompt: parts.join(". "),
    size: d.size,
    quality: d.quality,
    model: d.model,
    transparent: d.transparent !== false,
  };
}
