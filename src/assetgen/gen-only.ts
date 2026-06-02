// Asset-gen ONLY (no Phase 2 menu build). Used for custom playables whose
// brief declares its own asset keys (not the kit's btn-frame/panel set).
//   npx tsx src/assetgen/gen-only.ts styles/<id>.brief.json [--force]
import "dotenv/config";
import { runAssetGen } from "./run.js";

async function main(): Promise<void> {
  const briefPath = process.argv[2];
  if (!briefPath) {
    console.error("usage: tsx src/assetgen/gen-only.ts styles/<id>.brief.json [--force]");
    process.exit(1);
  }
  const force = process.argv.includes("--force");
  const res = await runAssetGen({
    briefPath,
    force,
    concurrency: 3,
    onLog: (m) => process.stdout.write(m.endsWith("\n") ? m : m + "\n"),
  });
  console.log(
    `\nDONE: ${res.generated} generated, ${res.skipped} skipped, ${res.errors} errors · $${res.totalCost.toFixed(3)} · ${(res.wallTimeMs / 1000).toFixed(1)}s`,
  );
  console.log(`out: ${res.outDir}`);
  if (res.errors > 0) process.exit(2);
}

void main();
