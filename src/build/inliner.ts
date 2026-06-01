import { promises as fs } from "node:fs";
import path from "node:path";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Read raw asset files from a dir and return a name -> base64 data URI map.
// Empty when a template draws everything in code (no external assets).
export async function loadAssets(
  assetsDir: string,
): Promise<{ assets: Record<string, string>; rawBytes: number }> {
  const assets: Record<string, string> = {};
  let rawBytes = 0;
  let entries: string[] = [];
  try {
    entries = await fs.readdir(assetsDir);
  } catch {
    return { assets, rawBytes };
  }
  for (const entry of entries) {
    const full = path.join(assetsDir, entry);
    const stat = await fs.stat(full);
    if (!stat.isFile()) continue;
    const buf = await fs.readFile(full);
    rawBytes += buf.length;
    assets[entry] = `data:${mimeFor(entry)};base64,${buf.toString("base64")}`;
  }
  return { assets, rawBytes };
}

function mimeFor(file: string): string {
  const ext = path.extname(file).toLowerCase();
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
  };
  return map[ext] ?? "application/octet-stream";
}

// Assemble the final single-file playable HTML. Everything is inline: no
// external network requests. A local FbPlayableAd stub is included so the file
// previews standalone; Meta injects the real implementation at runtime.
export function buildHtml(bundledJs: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>${escapeHtml(title)}</title>
<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#000;touch-action:none}canvas{display:block}</style>
</head>
<body>
<script>window.FbPlayableAd=window.FbPlayableAd||{onCTAClick:function(){try{console.log("[FbPlayableAd] onCTAClick (stub)")}catch(e){}}};</script>
<script>${bundledJs}</script>
</body>
</html>`;
}
