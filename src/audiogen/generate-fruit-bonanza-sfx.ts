// Generate AI-authored SFX for the Fruit Bonanza V2 MUSIC playable via
// ElevenLabs Sound Effects API.
//
//   POST https://api.elevenlabs.io/v1/sound-generation
//   Body: { text, duration_seconds, prompt_influence }
//   Response: binary MP3 (audio/mpeg)
//
// Run:
//   tsx src/audiogen/generate-fruit-bonanza-sfx.ts
//
// Reads ELEVENLABS_API_KEY from .env (dotenv). Writes 7 MP3 files into
// templates/fruit-bonanza-v2-music/assets/ — these will be base64-inlined by
// the existing builder pipeline at build time.

import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";

interface SfxSpec {
  key: string;          // filename without extension
  prompt: string;       // text prompt for ElevenLabs
  durationSec: number;  // 0.5 .. 22
  promptInfluence: number; // 0..1, how strictly to follow the prompt
}

const SFX: SfxSpec[] = [
  {
    key: "sfx-pop",
    prompt:
      "Short cartoon bubble pop, bright juicy fruit burst, candy game effect, " +
      "high-pitched playful, single quick impact",
    durationSec: 0.5,
    promptInfluence: 0.5,
  },
  {
    key: "sfx-drop",
    prompt:
      "Soft thud of a candy tile landing on glass, casino slot reel stop, " +
      "descending pitch, mellow wooden plop",
    durationSec: 0.5,
    promptInfluence: 0.5,
  },
  {
    key: "sfx-chime",
    prompt:
      "Magical fairy ascending chime, four bell-like notes climbing in pitch, " +
      "sweet bonus reward sound, candy crush style",
    durationSec: 0.8,
    promptInfluence: 0.5,
  },
  {
    key: "sfx-bomb",
    prompt:
      "Cartoon explosion with bass thump and sparkle tail, multiplier crash, " +
      "juicy boom with high-frequency confetti, NOT scary, candy game",
    durationSec: 0.7,
    promptInfluence: 0.6,
  },
  {
    key: "sfx-fanfare",
    prompt:
      "Triumphant casino big win fanfare, brass horns and bells rising " +
      "arpeggio with sparkle, mega win celebration, joyful",
    durationSec: 1.5,
    promptInfluence: 0.6,
  },
  {
    key: "sfx-spin",
    prompt:
      "Slot machine reel spinning whoosh, mechanical clatter with rising " +
      "pitch, candy casino reels accelerating",
    durationSec: 0.6,
    promptInfluence: 0.5,
  },
  {
    key: "bgm-ambient-loop",
    prompt:
      "Sweet Bonanza style casino loop, upbeat candy music box melody with " +
      "marimba and pizzicato strings, sugary cheerful 120 BPM, infinite loop " +
      "friendly, no drop, no vocals",
    durationSec: 20,
    promptInfluence: 0.7,
  },
];

const API_URL = "https://api.elevenlabs.io/v1/sound-generation";

async function generateOne(spec: SfxSpec, outDir: string): Promise<{ bytes: number; ms: number }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY missing in .env");

  const start = Date.now();
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: spec.prompt,
      duration_seconds: spec.durationSec,
      prompt_influence: spec.promptInfluence,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "<no body>");
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${errBody.slice(0, 200)}`);
  }
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  const file = path.join(outDir, `${spec.key}.mp3`);
  await fs.writeFile(file, buf);
  return { bytes: buf.byteLength, ms: Date.now() - start };
}

async function main(): Promise<void> {
  const outDir = path.resolve(
    process.cwd(),
    "templates/fruit-bonanza-v2-music/assets",
  );
  await fs.mkdir(outDir, { recursive: true });

  console.log(`\n🎵 Generating ${SFX.length} SFX → ${path.relative(process.cwd(), outDir)}/\n`);

  let totalBytes = 0;
  let totalMs = 0;
  let errors = 0;

  for (const spec of SFX) {
    process.stdout.write(`  ${spec.key.padEnd(20)} (${spec.durationSec}s) …`);
    try {
      const { bytes, ms } = await generateOne(spec, outDir);
      totalBytes += bytes;
      totalMs += ms;
      process.stdout.write(` ✅ ${(bytes / 1024).toFixed(1)} KB · ${(ms / 1000).toFixed(1)}s\n`);
    } catch (err) {
      errors++;
      process.stdout.write(` ❌ ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }

  console.log(
    `\nDone. ${SFX.length - errors}/${SFX.length} generated · ` +
      `${(totalBytes / 1024).toFixed(1)} KB total · ` +
      `${(totalMs / 1000).toFixed(1)}s wall.`,
  );
  if (errors) process.exit(1);
}

main().catch((err) => {
  console.error(`\nfatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
