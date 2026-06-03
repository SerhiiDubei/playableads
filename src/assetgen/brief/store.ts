// UserBrief store (epic B). Versioned, immutable versions + a cheap `current`
// pointer. Rollback only moves the pointer → never re-triggers generation.
//
//   briefs/user/<id>/v1.json, v2.json, ...   (immutable)
//   briefs/user/<id>/current                 (text: active version number)

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { UserBriefSchema, type UserBrief } from "./types.js";

export const USER_BRIEFS_DIR = "briefs/user";

// Root is mutable so tests can point it at a temp dir (hermetic).
let root = USER_BRIEFS_DIR;
export function setBriefsRoot(dir: string): void {
  root = dir;
}

export function slugify(s: string): string {
  const base = s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join("-")
    .replace(/-+/g, "-");
  return base || "brief";
}

function dirOf(id: string): string {
  return path.join(root, id);
}
function versionFile(id: string, v: number): string {
  return path.join(dirOf(id), `v${v}.json`);
}
function currentFile(id: string): string {
  return path.join(dirOf(id), "current");
}

function write(b: UserBrief): UserBrief {
  UserBriefSchema.parse(b); // gate: never persist invalid
  mkdirSync(dirOf(b.id), { recursive: true });
  writeFileSync(versionFile(b.id, b.version), JSON.stringify(b, null, 2) + "\n");
  writeFileSync(currentFile(b.id), String(b.version));
  return b;
}

export interface NewBriefInput {
  prompt: string;
  refs: string[];
  style?: string;
  audience?: string;
  niche?: string;
  tone?: string;
  id?: string; // override slug
}

export function createBrief(input: NewBriefInput, now: string): UserBrief {
  const id = input.id ?? slugify(input.prompt);
  if (existsSync(dirOf(id))) throw new Error(`brief "${id}" already exists — use a new version instead.`);
  const { id: _omit, ...fields } = input;
  return write({ id, version: 1, createdAt: now, ...fields });
}

export function listVersions(id: string): number[] {
  if (!existsSync(dirOf(id))) return [];
  return readdirSync(dirOf(id))
    .map((f) => f.match(/^v(\d+)\.json$/)?.[1])
    .filter((x): x is string => Boolean(x))
    .map(Number)
    .sort((a, b) => a - b);
}

export function currentVersion(id: string): number {
  const f = currentFile(id);
  if (!existsSync(f)) throw new Error(`brief "${id}" not found.`);
  return Number(readFileSync(f, "utf8").trim());
}

export function readBrief(id: string, version?: number): UserBrief {
  const v = version ?? currentVersion(id);
  const f = versionFile(id, v);
  if (!existsSync(f)) throw new Error(`brief "${id}" v${v} not found.`);
  return UserBriefSchema.parse(JSON.parse(readFileSync(f, "utf8")));
}

// New version branched from current (or given parent). Immutable append.
export function newVersion(id: string, patch: Partial<NewBriefInput>, now: string): UserBrief {
  const parent = readBrief(id);
  const next = Math.max(...listVersions(id)) + 1;
  return write({ ...parent, ...patch, id, version: next, createdAt: now, parentVersion: parent.version });
}

// Non-triggering rollback: just repoint `current` to an existing version.
export function rollback(id: string, version: number): UserBrief {
  if (!listVersions(id).includes(version)) throw new Error(`brief "${id}" has no v${version}.`);
  writeFileSync(currentFile(id), String(version));
  return readBrief(id, version);
}

export function listBriefs(): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((d) => existsSync(currentFile(d))).sort();
}
