// Shared types for the playable build pipeline.

export interface StyleTokens {
  id: string;
  name: string;
  colors: {
    background: string;
    primary: string;
    accent: string;
    text: string;
  };
  font: {
    family: string;
    weight: number;
  };
}

export interface BuildBrief {
  // Output file base name (no extension).
  name: string;
  // Mechanic template id, e.g. "tap-the-coin". Must match templates/<id>.
  mechanic: string;
  // Style id, e.g. "default". Must match styles/<id>.json.
  style: string;
  // App store destinations (informational; CTA routing is handled by Meta).
  store: {
    ios?: string;
    android?: string;
  };
  // User-facing copy injected into the playable.
  copy: {
    title: string;
    cta: string;
  };
  // ISO language code, e.g. "en", "uk".
  lang: string;
  // Mechanic-specific parameters validated against the template manifest.
  params: Record<string, string | number | boolean>;
}

export interface TemplateManifest {
  id: string;
  name: string;
  description: string;
  // Entry file relative to the template dir.
  entry: string;
  // Raw asset byte budget (before base64). Hard guard against the Meta 2MB limit.
  assetBudgetBytes: number;
  // Declared params with defaults; brief params override these.
  params: Record<string, string | number | boolean>;
  // Mechanics catalog tier (epic D). "v1" = curated, meets TEMPLATE-STANDARD;
  // absent / "candidate" = not yet promoted (visible only in dev mode).
  catalog?: "v1" | "candidate";
}

// The single config object injected into the bundled playable at build time.
export interface PlayableConfig {
  copy: BuildBrief["copy"];
  lang: string;
  style: StyleTokens;
  params: Record<string, string | number | boolean>;
  // name -> data URI (base64). Empty when the template draws everything in code.
  assets: Record<string, string>;
}
