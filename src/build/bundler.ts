import esbuild from "esbuild";
import type { PlayableConfig } from "../types.js";

// Bundle a template entry (with PixiJS + GSAP) into a single minified IIFE.
// The build-time config is injected by replacing the __PLAYABLE_CONFIG__ token
// with a JSON object literal, so the template reads it as a typed constant.
export async function bundleTemplate(
  entryPath: string,
  config: PlayableConfig,
): Promise<string> {
  const result = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    minify: true,
    format: "iife",
    platform: "browser",
    target: ["es2017"],
    write: false,
    legalComments: "none",
    define: {
      __PLAYABLE_CONFIG__: JSON.stringify(config),
    },
  });
  return result.outputFiles[0].text;
}
