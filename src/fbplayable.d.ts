// The runtime API Meta injects into a playable. A local stub is shipped in the
// HTML so the file also previews standalone.
declare global {
  interface Window {
    FbPlayableAd: { onCTAClick(): void };
  }
}

export {};
