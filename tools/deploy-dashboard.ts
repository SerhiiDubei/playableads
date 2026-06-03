// Deploy the generated dashboard to the gh-pages worktree. Idempotent: only
// commits + pushes when dashboard.html actually changed. Run after `npm run
// dashboard` (the `dashboard:deploy` npm script chains both).
//
// execFile only (no shell). Never throws fatally — deploy must not break a commit.

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";

const SRC = "docs/dashboard.html";
const GH = "../gh-pages-deploy";
const DST = `${GH}/dashboard.html`;

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" });
}

function main(): void {
  if (!existsSync(GH)) {
    console.error(`deploy-dashboard: gh-pages worktree not found at ${GH} — skipping.`);
    return;
  }
  copyFileSync(SRC, DST);

  // changed? `git -C GH diff --quiet dashboard.html` exits 0 when NO change.
  let changed = false;
  try {
    git(["-C", GH, "diff", "--quiet", "--", "dashboard.html"]);
  } catch {
    changed = true; // non-zero exit = there is a diff
  }
  if (!changed) {
    console.log("deploy-dashboard: no change, skipped.");
    return;
  }

  git(["-C", GH, "add", "dashboard.html"]);
  git(["-C", GH, "commit", "-q", "--no-verify", "-m", "dashboard: auto-update progress"]);
  git(["-C", GH, "push", "-q"]);
  console.log("deploy-dashboard: pushed to gh-pages.");
}

try {
  main();
} catch (e) {
  console.error("deploy-dashboard: non-fatal error —", (e as Error)?.message ?? e);
}
