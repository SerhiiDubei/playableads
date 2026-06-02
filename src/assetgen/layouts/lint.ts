/**
 * Playable Design System — layout linter.
 *
 * Рендерить кожен (layout × style) playable через Playwright на ВСІХ оголошених
 * screenIds і перевіряє правила Playable Design System. Кожен fail містить
 * концепцію + конкретний елемент (клас, текст, координати) щоб одразу знати
 * куди дивитися.
 *
 * Правила (RULES below). Жодне з них не повинно бути порушено.
 *
 * Usage:
 *   npm run check:layouts -- <playable.html> <layoutId>
 *   або через high-level: npm run check:layouts -- all  (всі вже згенеровані playable)
 */

import { chromium, type Page } from "playwright";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { LAYOUTS } from "./index.js";
import type { LayoutMeta } from "./types.js";

export const DESIGN_W = 400;
export const DESIGN_H = 860;
export const MIN_TOUCH = 44;

// Зони серіалізуються в browser, тому імпортуються тільки для генерації expressions
import { ZONES } from "./zones.js";

export type RuleResult = {
  rule: string;
  screen: string;
  pass: boolean;
  detail?: string;
  /** елементи що порушують правило */
  offenders?: Array<{ cls: string; text: string; box: [number, number, number, number]; overflowBottom?: number; overflowRight?: number; w?: number; h?: number }>;
};

export type LintReport = {
  playable: string;
  layoutId: string;
  styleId?: string;
  passed: RuleResult[];
  failed: RuleResult[];
  ok: boolean;
};

// ─── Rule implementations (run in browser) ───────────────────────────────────

/**
 * No-overflow перевіряє проти #stage (design canvas), не viewport.
 * Stage може мати offset/scale через stage.ts. Толерантність 2px для CSS rounding.
 */
const RULE_NO_OVERFLOW = `(() => {
  const stage = document.getElementById('stage');
  if (!stage) return { offenders: [{ cls: '(missing)', text: '#stage not found', box: [0,0,0,0] }] };
  const s = stage.getBoundingClientRect();
  const tol = 2;
  const all = [...stage.querySelectorAll('.screen.active *')];
  const offenders = all.filter(e => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && (r.bottom > s.bottom + tol || r.right > s.right + tol || r.top < s.top - tol || r.left < s.left - tol);
  }).map(e => {
    const r = e.getBoundingClientRect();
    const cls = typeof e.className === 'string' ? e.className : '';
    return { cls, text: (e.textContent || '').slice(0, 40).trim(),
      box: [(r.left - s.left)|0, (r.top - s.top)|0, (r.right - s.left)|0, (r.bottom - s.top)|0],
      overflowBottom: Math.max(0, (r.bottom - s.bottom) | 0),
      overflowRight: Math.max(0, (r.right - s.right) | 0) };
  });
  return { offenders };
})()`;

const RULE_TOUCH_TARGETS = `(() => {
  const MIN = ${MIN_TOUCH};
  const els = [...document.querySelectorAll('.screen.active .c-btn, .screen.active .icon, .screen.active .c-pill')];
  const offenders = els.map(e => {
    const r = e.getBoundingClientRect();
    return { e, r, undersized: r.width < MIN || r.height < MIN };
  }).filter(x => x.undersized).map(({ e, r }) => {
    const cls = typeof e.className === 'string' ? e.className : '';
    return { cls, text: (e.textContent || '').slice(0, 40).trim(),
      box: [r.left|0, r.top|0, r.right|0, r.bottom|0], w: r.width|0, h: r.height|0 };
  });
  return { offenders };
})()`;

/**
 * `screen-has-button` — на активному екрані має бути хоча б одна .c-btn
 * у межах stage. Текст не звіряємо тут (це робить окрема rule `cta-text-present`).
 */
const RULE_SCREEN_HAS_BUTTON = `(() => {
  const stage = document.getElementById('stage');
  if (!stage) return { offenders: [{ cls: '(missing)', text: '#stage not found', box: [0,0,0,0] }] };
  const s = stage.getBoundingClientRect();
  const tol = 2;
  const btns = [...stage.querySelectorAll('.screen.active .c-btn')];
  if (btns.length === 0) {
    return { offenders: [{ cls: '(no .c-btn)', text: 'active screen has no .c-btn at all', box: [0,0,0,0] }] };
  }
  const visible = btns.filter(b => {
    const r = b.getBoundingClientRect();
    return r.bottom <= s.bottom + tol && r.right <= s.right + tol && r.top >= s.top - tol && r.left >= s.left - tol;
  });
  if (visible.length === 0) {
    return { offenders: btns.map(b => {
      const r = b.getBoundingClientRect();
      return { cls: typeof b.className === 'string' ? b.className : '',
        text: (b.textContent || '').slice(0, 40).trim(),
        box: [(r.left - s.left)|0, (r.top - s.top)|0, (r.right - s.left)|0, (r.bottom - s.top)|0] };
    }) };
  }
  return { offenders: [] };
})()`;

/**
 * `cta-text-present` — серед УСІХ кнопок (всіх екранів layout) знаходиться
 * принаймні одна з очікуваним CTA-текстом. Перевіряється ОДИН раз на playable,
 * не на кожний екран (тому використовується спеціальна логіка в lintScreen).
 */
function ruleCtaTextPresent(primaryCtaTexts: string[] | undefined): string {
  const txts = JSON.stringify(primaryCtaTexts ?? []);
  return `(() => {
    const wanted = ${txts};
    if (!wanted.length) return { offenders: [] };
    const btns = [...document.querySelectorAll('.c-btn')];
    const found = btns.some(b => {
      const t = (b.textContent || '').trim();
      return wanted.some(w => t.includes(w));
    });
    if (found) return { offenders: [] };
    return { offenders: [{ cls: '(missing)',
      text: 'no .c-btn matches any of: ' + wanted.join(' | '),
      box: [0,0,0,0] }] };
  })()`;
}

/**
 * `one-primary-cta` — не більше одного «install»-style CTA на активному екрані.
 * Два «Install Now» рядом плутають користувача.
 */
const RULE_ONE_PRIMARY_CTA = `(() => {
  const stage = document.getElementById('stage');
  if (!stage) return { offenders: [] };
  const btns = [...stage.querySelectorAll('.screen.active .c-btn')];
  const ctaLike = btns.filter(b => /(install|play now|start free|claim)/i.test((b.textContent || '')));
  if (ctaLike.length <= 1) return { offenders: [] };
  const s = stage.getBoundingClientRect();
  return { offenders: ctaLike.map(e => {
    const r = e.getBoundingClientRect();
    return { cls: typeof e.className === 'string' ? e.className : '',
      text: (e.textContent || '').slice(0, 40).trim(),
      box: [(r.left - s.left)|0, (r.top - s.top)|0, (r.right - s.left)|0, (r.bottom - s.top)|0] };
  }) };
})()`;

function ruleHeroFits(maxHero: number | undefined): string {
  if (!maxHero) return `(() => ({ offenders: [] }))()`;
  return `(() => {
    const MAX = ${maxHero};
    const heroes = [...document.querySelectorAll('.screen.active .hero, .screen.active .knight, .screen.active img[class*="hero"]')];
    const offenders = heroes.filter(e => e.getBoundingClientRect().height > MAX + 1).map(e => {
      const r = e.getBoundingClientRect();
      return { cls: typeof e.className === 'string' ? e.className : '',
        text: 'hero ' + (r.height | 0) + 'px > max ' + MAX,
        box: [r.left|0, r.top|0, r.right|0, r.bottom|0],
        h: r.height | 0 };
    });
    return { offenders };
  })()`;
}

// ─── Linter ─────────────────────────────────────────────────────────────────

type RuleHandler = { rule: string; expr: (meta: LayoutMeta) => string };

// ─── Zone-aware rules ──────────────────────────────────────────────────────

const ZONES_JSON = JSON.stringify(ZONES.map((z) => ({ id: z.id, rect: z.rect, allow: z.allow, forbid: z.forbid })));

/**
 * `primary-cta-in-cta-zone` — primary CTA повинна лежати в CTA зоні (bottom 720..828).
 * Перевіряється тільки коли layout оголосив primaryCtaTexts.
 */
function rulePrimaryCtaInCtaZone(primaryCtaTexts: string[] | undefined): string {
  const txts = JSON.stringify(primaryCtaTexts ?? []);
  return `(() => {
    const wanted = ${txts};
    if (!wanted.length) return { offenders: [] };
    const stage = document.getElementById('stage');
    if (!stage) return { offenders: [] };
    const s = stage.getBoundingClientRect();
    const zones = ${ZONES_JSON};
    const ctaZone = zones.find(z => z.id === 'cta');
    if (!ctaZone) return { offenders: [] };
    const btns = [...stage.querySelectorAll('.screen.active .c-btn')]
      .filter(b => wanted.some(w => (b.textContent || '').includes(w)));
    if (btns.length === 0) return { offenders: [] }; // cta-text-present зловить
    const offenders = btns.filter(b => {
      const r = b.getBoundingClientRect();
      const cx = (r.left + r.right) / 2 - s.left;
      const cy = (r.top + r.bottom) / 2 - s.top;
      return !(cx >= ctaZone.rect.x && cx <= ctaZone.rect.x + ctaZone.rect.w
            && cy >= ctaZone.rect.y && cy <= ctaZone.rect.y + ctaZone.rect.h);
    }).map(b => {
      const r = b.getBoundingClientRect();
      return { cls: typeof b.className === 'string' ? b.className : '',
        text: (b.textContent || '').slice(0, 40).trim(),
        box: [(r.left - s.left)|0, (r.top - s.top)|0, (r.right - s.left)|0, (r.bottom - s.top)|0] };
    });
    return { offenders };
  })()`;
}

/**
 * `no-interactive-in-safe-areas` — кнопки/іконки не повинні бути в
 * safe-top (status bar) або safe-bottom (home gesture).
 */
const RULE_NO_INTERACTIVE_IN_SAFE = `(() => {
  const stage = document.getElementById('stage');
  if (!stage) return { offenders: [] };
  const s = stage.getBoundingClientRect();
  const zones = ${ZONES_JSON};
  const safeZones = zones.filter(z => z.id === 'safe-top' || z.id === 'safe-bottom');
  const els = [...stage.querySelectorAll('.screen.active .c-btn, .screen.active .icon, .screen.active .c-pill')];
  const offenders = [];
  for (const e of els) {
    const r = e.getBoundingClientRect();
    const cx = (r.left + r.right) / 2 - s.left;
    const cy = (r.top + r.bottom) / 2 - s.top;
    for (const z of safeZones) {
      if (cx >= z.rect.x && cx <= z.rect.x + z.rect.w && cy >= z.rect.y && cy <= z.rect.y + z.rect.h) {
        offenders.push({ cls: typeof e.className === 'string' ? e.className : '',
          text: 'in ' + z.id + ': ' + (e.textContent || '').slice(0, 30).trim(),
          box: [(r.left - s.left)|0, (r.top - s.top)|0, (r.right - s.left)|0, (r.bottom - s.top)|0] });
        break;
      }
    }
  }
  return { offenders };
})()`;

/**
 * `zone-forbidden-respected` — для класів які явно forbid'нуті в зоні
 * (напр. .c-btn forbid у hero zone) перевіряємо що їх там нема.
 */
const RULE_ZONE_FORBID = `(() => {
  const stage = document.getElementById('stage');
  if (!stage) return { offenders: [] };
  const s = stage.getBoundingClientRect();
  const zones = ${ZONES_JSON};
  const offenders = [];
  const all = [...stage.querySelectorAll('.screen.active *')];
  for (const e of all) {
    const cls = typeof e.className === 'string' ? e.className : '';
    if (!cls) continue;
    const r = e.getBoundingClientRect();
    const cx = (r.left + r.right) / 2 - s.left;
    const cy = (r.top + r.bottom) / 2 - s.top;
    for (const z of zones) {
      if (!z.forbid || z.forbid.length === 0) continue;
      if (cx >= z.rect.x && cx <= z.rect.x + z.rect.w && cy >= z.rect.y && cy <= z.rect.y + z.rect.h) {
        if (z.forbid.some(f => cls.split(' ').some(c => c === f))) {
          offenders.push({ cls, text: 'forbid in ' + z.id + ': ' + (e.textContent || '').slice(0, 30).trim(),
            box: [(r.left - s.left)|0, (r.top - s.top)|0, (r.right - s.left)|0, (r.bottom - s.top)|0] });
        }
      }
    }
  }
  return { offenders };
})()`;

type RuleHandlerExt = RuleHandler & { zoneRule?: boolean };

/** Per-screen rules — викликаються для КОЖНОГО активного екрану. */
const SCREEN_RULES: RuleHandlerExt[] = [
  { rule: "no-overflow", expr: () => RULE_NO_OVERFLOW },
  { rule: "touch-targets-min", expr: () => RULE_TOUCH_TARGETS },
  { rule: "screen-has-button", expr: () => RULE_SCREEN_HAS_BUTTON },
  { rule: "one-primary-cta", expr: () => RULE_ONE_PRIMARY_CTA },
  { rule: "hero-fits", expr: (m) => ruleHeroFits(m.maxHeroPx) },
  // Zone-rules: тільки коли layout.meta.enforceZones !== false
  { rule: "primary-cta-in-cta-zone", expr: (m) => rulePrimaryCtaInCtaZone(m.primaryCtaTexts), zoneRule: true },
  { rule: "no-interactive-in-safe-areas", expr: () => RULE_NO_INTERACTIVE_IN_SAFE, zoneRule: true },
  { rule: "zone-forbidden-respected", expr: () => RULE_ZONE_FORBID, zoneRule: true },
];

/** Layout-level rules — викликаються РАЗ для всього playable. */
const LAYOUT_RULES: RuleHandler[] = [
  { rule: "cta-text-present", expr: (m) => ruleCtaTextPresent(m.primaryCtaTexts) },
];

async function lintScreen(page: Page, screenId: string, meta: LayoutMeta, playableLabel: string): Promise<RuleResult[]> {
  await page.evaluate((id: string) => {
    const cur = document.querySelector(".screen.active");
    const next = document.getElementById(id);
    if (cur && cur !== next) cur.classList.remove("active");
    if (next) next.classList.add("active");
  }, screenId);
  await page.waitForTimeout(120);

  const enforceZones = meta.enforceZones !== false; // default true
  const results: RuleResult[] = [];
  for (const r of SCREEN_RULES) {
    if (r.zoneRule && !enforceZones) continue; // skip zone-rules for legacy layouts
    const expr = r.expr(meta);
    const raw = (await page.evaluate(expr)) as { offenders: RuleResult["offenders"] };
    const offenders = raw?.offenders ?? [];
    results.push({
      rule: r.rule,
      screen: screenId,
      pass: offenders.length === 0,
      detail: offenders.length > 0 ? `${offenders.length} offender(s) on ${playableLabel}#${screenId}` : undefined,
      offenders: offenders.length > 0 ? offenders : undefined,
    });
  }
  return results;
}

async function lintLayoutLevel(page: Page, meta: LayoutMeta, playableLabel: string): Promise<RuleResult[]> {
  const results: RuleResult[] = [];
  for (const r of LAYOUT_RULES) {
    const expr = r.expr(meta);
    const raw = (await page.evaluate(expr)) as { offenders: RuleResult["offenders"] };
    const offenders = raw?.offenders ?? [];
    results.push({
      rule: r.rule,
      screen: "(layout)",
      pass: offenders.length === 0,
      detail: offenders.length > 0 ? `${offenders.length} offender(s) on ${playableLabel}` : undefined,
      offenders: offenders.length > 0 ? offenders : undefined,
    });
  }
  return results;
}

export async function lintPlayable(playablePath: string, layoutId: string, styleId?: string): Promise<LintReport> {
  const layout = LAYOUTS[layoutId];
  if (!layout) throw new Error(`unknown layout "${layoutId}"`);
  const meta = layout.meta;
  const url = pathToFileURL(path.resolve(playablePath)).href;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: DESIGN_W, height: DESIGN_H }, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(250);

  const all: RuleResult[] = [];
  const screens = meta.lintScreens ?? meta.screenIds;
  for (const sid of screens) {
    const screenResults = await lintScreen(page, sid, meta, path.basename(playablePath));
    all.push(...screenResults);
  }
  all.push(...(await lintLayoutLevel(page, meta, path.basename(playablePath))));
  await browser.close();

  const failed = all.filter((r) => !r.pass);
  const passed = all.filter((r) => r.pass);
  return { playable: playablePath, layoutId, styleId, passed, failed, ok: failed.length === 0 };
}

export async function lintMany(playables: Array<{ path: string; layoutId: string; styleId?: string }>): Promise<LintReport[]> {
  const browser = await chromium.launch();
  try {
    const reports: LintReport[] = [];
    for (const p of playables) {
      const layout = LAYOUTS[p.layoutId];
      if (!layout) {
        reports.push({ playable: p.path, layoutId: p.layoutId, styleId: p.styleId, passed: [], failed: [{ rule: "layout-unknown", screen: "-", pass: false, detail: `unknown layout id ${p.layoutId}` }], ok: false });
        continue;
      }
      const url = pathToFileURL(path.resolve(p.path)).href;
      const page = await browser.newPage({ viewport: { width: DESIGN_W, height: DESIGN_H }, deviceScaleFactor: 1 });
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForTimeout(200);
      const all: RuleResult[] = [];
      for (const sid of layout.meta.lintScreens ?? layout.meta.screenIds) {
        all.push(...(await lintScreen(page, sid, layout.meta, path.basename(p.path))));
      }
      all.push(...(await lintLayoutLevel(page, layout.meta, path.basename(p.path))));
      await page.close();
      const failed = all.filter((r) => !r.pass);
      reports.push({ playable: p.path, layoutId: p.layoutId, styleId: p.styleId, passed: all.filter((r) => r.pass), failed, ok: failed.length === 0 });
    }
    return reports;
  } finally {
    await browser.close();
  }
}

// ─── Output formatting ─────────────────────────────────────────────────────

const C = { red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", grey: "\x1b[90m", bold: "\x1b[1m", reset: "\x1b[0m" };

function fmt(r: LintReport): string {
  const lines: string[] = [];
  lines.push(`${r.ok ? C.green + "PASS" : C.red + "FAIL"}${C.reset}  ${path.basename(r.playable)}  ${C.grey}[${r.layoutId}]${C.reset}`);
  for (const f of r.failed) {
    lines.push(`  ${C.red}✗ ${f.rule}${C.reset}  ${C.grey}@${f.screen}${C.reset}  ${f.detail ?? ""}`);
    for (const o of (f.offenders ?? []).slice(0, 5)) {
      const extra = o.overflowBottom ? ` overflow=${o.overflowBottom}px` : (o.w && o.h ? ` size=${o.w}×${o.h}` : "");
      lines.push(`      ${C.yellow}${o.cls}${C.reset}  ${C.grey}"${o.text}"${C.reset}  box=[${o.box.join(",")}]${extra}`);
    }
  }
  return lines.join("\n");
}

// ─── Auto-discover already-generated playables ─────────────────────────────

function discoverPlayables(): Array<{ path: string; layoutId: string; styleId: string }> {
  const out = "out";
  if (!existsSync(out)) return [];
  const layoutIds = Object.keys(LAYOUTS);
  // Будуємо regex динамічно з усіх зареєстрованих layouts (sorted longest-first
  // щоб довші id типу feature-grid не з'їдалися коротшими feature-list).
  const suffix = layoutIds.slice().sort((a, b) => b.length - a.length).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const re = new RegExp(`^menu-(.+?)(?:-(${suffix}))?\\.html$`);
  const files = readdirSync(out).filter((f) => f.startsWith("menu-") && f.endsWith(".html"));
  const result: Array<{ path: string; layoutId: string; styleId: string }> = [];
  for (const f of files) {
    const m = f.match(re);
    if (!m) continue;
    const styleId = m[1];
    const layoutId = m[2] ?? "menu5";
    if (!layoutIds.includes(layoutId)) continue;
    result.push({ path: path.join(out, f), layoutId, styleId });
  }
  return result;
}

// ─── CLI ───────────────────────────────────────────────────────────────────

async function cliMain() {
  const arg = process.argv[2];
  let playables: Array<{ path: string; layoutId: string; styleId?: string }>;

  if (!arg || arg === "all") {
    playables = discoverPlayables();
    if (playables.length === 0) {
      console.error(`no playables found in out/. Run forge first.`);
      process.exit(1);
    }
  } else {
    const layoutArg = process.argv[3];
    if (!layoutArg) {
      console.error(`usage: tsx src/assetgen/layouts/lint.ts <playable.html> <layoutId>`);
      console.error(`   or: tsx src/assetgen/layouts/lint.ts all`);
      process.exit(1);
    }
    playables = [{ path: arg, layoutId: layoutArg }];
  }

  console.log(`${C.bold}PDS lint${C.reset}  ${playables.length} playable(s)  canvas=${DESIGN_W}×${DESIGN_H}\n`);
  const reports = await lintMany(playables);
  for (const r of reports) console.log(fmt(r) + "\n");

  const total = reports.length;
  const failed = reports.filter((r) => !r.ok).length;
  console.log(`${C.bold}summary:${C.reset} ${total - failed}/${total} PASS, ${failed} FAIL`);
  if (failed > 0) process.exit(1);
}

const invokedAsScript = process.argv[1]?.endsWith("lint.ts") || process.argv[1]?.endsWith("lint.js");
if (invokedAsScript) {
  cliMain().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
}
