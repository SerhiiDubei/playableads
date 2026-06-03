// Install repo git hooks into the shared hooks dir (covers all worktrees).
//   npm run hooks:install
// Idempotent — overwrites the managed hook each run.

import { copyFileSync, chmodSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const hooksDir = execFileSync("git", ["rev-parse", "--git-path", "hooks"], { encoding: "utf8" }).trim();
mkdirSync(hooksDir, { recursive: true });

const dst = path.join(hooksDir, "post-commit");
copyFileSync("tools/git-hooks/post-commit", dst);
try {
  chmodSync(dst, 0o755);
} catch {
  /* Windows: chmod is a no-op; git-bash runs the sh hook regardless */
}
console.log(`installed post-commit -> ${dst}`);
console.log("on each commit (not on gh-pages): regenerate dashboard + deploy to gh-pages.");
