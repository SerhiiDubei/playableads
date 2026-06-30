// ONE gate for a track-B game lab. Runs the hard checks in order and fails loud.
// The "design-critic" (is it beautiful, not just error-free) stays a human/Claude
// step — automated checks can't judge taste — so it's printed as a required step.
//
//   node tools/verify-lab.mjs <id>
//
// See docs/PIPELINE.md (station 6) and docs/GAME-UI.md.
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";

const id = process.argv[2];
if (!id) { console.error("usage: node tools/verify-lab.mjs <id>"); process.exit(1); }
if (!existsSync(`labs/${id}`)) { console.error(`error: labs/${id} not found`); process.exit(1); }

const win = process.platform === "win32";
function step(name, cmd, args) {
  process.stdout.write(`\n▶ ${name}\n`);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: win });
  return r.status === 0;
}

// typecheck the whole project but only FAIL on errors in THIS lab or the game-UI
// kit — unrelated errors in other labs must not block this one.
function typecheckScoped() {
  process.stdout.write("\n▶ typecheck (scoped to this lab + game-UI kit)\n");
  const r = spawnSync("npm", ["run", "typecheck"], { encoding: "utf8", shell: win });
  const lines = ((r.stdout || "") + (r.stderr || "")).replace(/\\/g, "/").split("\n");
  const errs = lines.filter((l) => /error TS\d+/.test(l));
  const mine = errs.filter((l) => l.startsWith(`labs/${id}/`) || l.includes("src/assetgen/kit/ui.ts"));
  if (mine.length) { console.log("  ❌ errors in this lab / game-UI kit:"); mine.forEach((l) => console.log("    " + l.trim())); }
  const other = errs.length - mine.length;
  if (other) console.log(`  (note: ${other} typecheck error(s) in OTHER labs — not blocking ${id})`);
  return mine.length === 0;
}

const results = [];
results.push(["typecheck", typecheckScoped()]);
results.push(["build-lab", step("build-lab", "npx", ["tsx", "src/assetgen/build-lab.ts", id])]);
results.push(["qa-lab", step("qa-lab (0 errors on 2 viewports)", "node", ["tools/qa-lab.mjs", id])]);

const out = `test/${id}/index.html`;
let kb = 0, budgetOk = false;
if (existsSync(out)) { kb = statSync(out).size / 1024; budgetOk = kb <= 2048; }
results.push(["budget ≤2MB", budgetOk]);

console.log("\n──────── VERIFY: " + id + " ────────");
for (const [n, ok] of results) console.log(`${ok ? "✅" : "❌"} ${n}`);
console.log(`   size: ${kb.toFixed(1)} KB / 2048 KB`);
console.log(`\n🎨 ЛИШИЛАСЯ ОЦІНКА КРАСИ (вручну/критик): переглянь test/${id}/qa/*.png проти планки`);
console.log(`   GAME-UI — не лише «нема помилок», а «виглядає добре». Це частина гейта 6.`);

const allOk = results.every(([, ok]) => ok);
console.log(allOk
  ? "\n✅ АВТО-ГЕЙТИ ЗЕЛЕНІ. Лишилась оцінка краси — тоді станція 6 ✅."
  : "\n❌ Є ЧЕРВОНІ ГЕЙТИ — виправ перед «готово».");
process.exit(allOk ? 0 : 1);
