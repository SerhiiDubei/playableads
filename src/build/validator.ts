// Validate a packaged playable HTML against Meta's hard requirements.
// This is deterministic and must never be delegated to an LLM: a creative that
// fails here gets rejected by Meta.

export interface ValidationResult {
  ok: boolean;
  bytes: number;
  maxBytes: number;
  errors: string[];
  warnings: string[];
}

// Meta single-file limit is 2 MB.
export const MAX_BYTES = 2 * 1024 * 1024;

// Sinks that perform a navigation/redirect — forbidden by Meta.
const REDIRECT_SINKS = [
  /\blocation\s*\.\s*href\s*=/,
  /\blocation\s*\.\s*replace\s*\(/,
  /\blocation\s*\.\s*assign\s*\(/,
  /\bwindow\s*\.\s*location\s*=/,
  /\bdocument\s*\.\s*location\s*=/,
  /\btop\s*\.\s*location/,
];

// Keywords that, when preceding a literal http(s) URL, indicate an actual
// external resource load (vs. a harmless doc-link string inside a library).
const LOAD_CONTEXT = /(src|href|url|fetch|load|import|XMLHttpRequest)/i;

export function validate(html: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const bytes = Buffer.byteLength(html, "utf8");

  if (bytes > MAX_BYTES) {
    errors.push(
      `File is ${fmtKb(bytes)} KB, exceeds Meta single-file limit of ${fmtKb(MAX_BYTES)} KB.`,
    );
  } else if (bytes > MAX_BYTES * 0.9) {
    warnings.push(
      `File is ${fmtKb(bytes)} KB — within 10% of the ${fmtKb(MAX_BYTES)} KB limit.`,
    );
  }

  if (!/FbPlayableAd\s*\.\s*onCTAClick/.test(html)) {
    errors.push("Missing required CTA hook FbPlayableAd.onCTAClick().");
  }

  for (const re of REDIRECT_SINKS) {
    if (re.test(html)) {
      errors.push(`Contains a JavaScript redirect sink (${re.source}).`);
    }
  }

  // Classify literal external URLs: a load-context match is an error, a bare
  // string occurrence is a warning (often a doc link baked into a library).
  const urlRe = /https?:\/\/[^\s"'`)]+/g;
  const seenWarn = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(html)) !== null) {
    const ctx = html.slice(Math.max(0, m.index - 24), m.index);
    if (LOAD_CONTEXT.test(ctx)) {
      errors.push(`External resource load detected: ${truncate(m[0])}`);
    } else {
      const key = truncate(m[0]);
      if (!seenWarn.has(key)) {
        seenWarn.add(key);
        warnings.push(`External URL string present (verify it is not loaded): ${key}`);
      }
    }
  }

  return { ok: errors.length === 0, bytes, maxBytes: MAX_BYTES, errors, warnings };
}

function fmtKb(bytes: number): string {
  return (bytes / 1024).toFixed(1);
}

function truncate(s: string): string {
  return s.length > 60 ? s.slice(0, 57) + "..." : s;
}
