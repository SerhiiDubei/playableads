import { promises as fs } from "node:fs";
import path from "node:path";
import type { Brief, StyleTokens, TemplateManifest } from "./types.js";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const TEMPLATES_DIR = path.join(ROOT, "templates");
export const STYLES_DIR = path.join(ROOT, "styles");
export const BRIEFS_DIR = path.join(ROOT, "briefs");
export const OUT_DIR = path.join(ROOT, "out");

async function readJson<T>(file: string): Promise<T> {
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as T;
}

export async function loadBrief(file: string): Promise<Brief> {
  const brief = await readJson<Brief>(file);
  for (const key of ["name", "mechanic", "style", "copy", "lang"] as const) {
    if (!brief[key]) throw new Error(`Brief is missing required field "${key}".`);
  }
  if (!brief.copy.title || !brief.copy.cta) {
    throw new Error('Brief "copy" must include both "title" and "cta".');
  }
  brief.params ??= {};
  brief.store ??= {};
  return brief;
}

export async function loadStyle(id: string): Promise<StyleTokens> {
  const file = path.join(STYLES_DIR, `${id}.json`);
  try {
    return await readJson<StyleTokens>(file);
  } catch {
    throw new Error(`Style "${id}" not found at ${file}.`);
  }
}

export async function loadManifest(mechanic: string): Promise<TemplateManifest> {
  const file = path.join(TEMPLATES_DIR, mechanic, "manifest.json");
  try {
    return await readJson<TemplateManifest>(file);
  } catch {
    throw new Error(`Template "${mechanic}" not found (expected ${file}).`);
  }
}

export async function listTemplates(): Promise<TemplateManifest[]> {
  const out: TemplateManifest[] = [];
  let dirs: string[] = [];
  try {
    dirs = await fs.readdir(TEMPLATES_DIR);
  } catch {
    return out;
  }
  for (const d of dirs) {
    try {
      out.push(await loadManifest(d));
    } catch {
      // Skip non-template directories.
    }
  }
  return out;
}

export async function listStyles(): Promise<StyleTokens[]> {
  const out: StyleTokens[] = [];
  let files: string[] = [];
  try {
    files = await fs.readdir(STYLES_DIR);
  } catch {
    return out;
  }
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      out.push(await loadStyle(path.basename(f, ".json")));
    } catch {
      // Skip malformed style files.
    }
  }
  return out;
}
