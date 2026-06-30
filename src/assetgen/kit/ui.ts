// Playable UI kit — an HTML/CSS overlay rendered ON TOP of the Pixi canvas.
//
// Why DOM, not Pixi-drawn: real box-shadow, gradients, backdrop-blur, flexbox
// and type control that canvas primitives can't match — this is how polished
// playable menus are built. Styles are injected at runtime, so the playable
// stays a single self-contained HTML file (Meta-safe).
//
// Design language ("Instrument cluster"): menus read like a car dashboard, not
// a generic modal. The score is a SAFETY GAUGE (tick-marked dial that sweeps in
// like an ignition self-test); dividers are ROAD LANE MARKINGS (dashes); labels
// use signage-style caps + tracking. Grounded in the driving/insurance world so
// it can't be mistaken for a templated dark+green popup.
//
// Tokens are CSS custom properties on `.pw-overlay` — override per brand.

export interface EndcardOpts {
  brand: string;       // e.g. "SafeDrive Insurance"
  avoided: number;     // score numerator
  total: number;       // score denominator
  headline: string;    // the thesis line
  subline: string;     // supporting proof line
  ctaText: string;     // primary action label
  trustText: string;   // microcopy under the CTA
  onCta: () => void;   // fired on CTA / overlay tap
}

let injected = false;
export function injectUiKit(): void {
  if (injected) return;
  injected = true;
  const style = document.createElement("style");
  style.id = "pw-ui-kit";
  style.textContent = CSS;
  document.head.appendChild(style);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

const NS = "http://www.w3.org/2000/svg";
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

// Tick-marked dial: `avoided` green segments + the rest red, with bezel + ticks.
function gaugeSvg(avoided: number, total: number): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 200 200");
  svg.setAttribute("class", "pw-gauge-svg");
  const cx = 100, cy = 100, r = 76;
  const add = (tag: string, attrs: Record<string, string>, cls?: string) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (cls) n.setAttribute("class", cls);
    svg.appendChild(n);
    return n;
  };
  add("circle", { cx: "100", cy: "100", r: "90" }, "pw-gauge-bezel");
  add("circle", { cx: "100", cy: "100", r: String(r) }, "pw-gauge-track");
  const gap = 7, seg = 360 / total;
  for (let i = 0; i < total; i++) {
    const p = add("path", { d: arcPath(cx, cy, r, i * seg + gap / 2, (i + 1) * seg - gap / 2), pathLength: "100" },
      "pw-gauge-seg " + (i < avoided ? "is-go" : "is-stop"));
    (p as SVGElement).style.setProperty("--i", String(i));
    const [a0x, a0y] = polar(cx, cy, r + 11, i * seg);
    const [a1x, a1y] = polar(cx, cy, r + 6, i * seg);
    add("line", { x1: a0x.toFixed(1), y1: a0y.toFixed(1), x2: a1x.toFixed(1), y2: a1y.toFixed(1) }, "pw-gauge-tick");
  }
  return svg;
}

const SHIELD =
  `<svg viewBox="0 0 24 24" class="pw-shield" aria-hidden="true">` +
  `<path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Z"/>` +
  `<path class="pw-shield-check" d="M8.5 12.2l2.3 2.3 4.7-4.7"/></svg>`;

export function buildEndcard(opts: EndcardOpts): { root: HTMLElement; dispose: () => void } {
  injectUiKit();
  const overlay = el("div", "pw-overlay");
  const card = el("div", "pw-card");

  // innerHTML only for our own static SVG; all dynamic text via textContent (no XSS surface)
  const brand = el("div", "pw-brand", SHIELD);
  const brandName = el("span"); brandName.textContent = opts.brand;
  brand.appendChild(brandName);

  const gauge = el("div", "pw-gauge");
  gauge.appendChild(gaugeSvg(opts.avoided, opts.total));
  const center = el("div", "pw-gauge-center");
  const num = el("div", "pw-score"); num.textContent = "0";
  const scoreLabel = el("div", "pw-score-label"); scoreLabel.textContent = `of ${opts.total} avoided`;
  center.append(num, scoreLabel);
  gauge.appendChild(center);

  const divider = el("div", "pw-divider");
  const head = el("div", "pw-head"); head.textContent = opts.headline;
  const sub = el("div", "pw-sub"); sub.textContent = opts.subline;

  const cta = el("button", "pw-cta"); cta.type = "button";
  const ctaLabel = el("span"); ctaLabel.textContent = opts.ctaText;
  cta.append(ctaLabel, el("i", "pw-chev", "›")); // chevron is static
  const trust = el("div", "pw-trust"); trust.textContent = opts.trustText;

  card.append(brand, gauge, divider, head, sub, cta, trust);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  cta.addEventListener("click", (e) => { e.stopPropagation(); opts.onCta(); });
  overlay.addEventListener("click", () => opts.onCta()); // whole endcard is tappable

  // entrance: dashboard "self-test" — gauge sweeps in, score counts up
  requestAnimationFrame(() => {
    overlay.classList.add("in");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { num.textContent = String(opts.avoided); return; }
    const t0 = performance.now(), dur = 700, delay = 280;
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - t0 - delay) / dur));
      num.textContent = String(Math.round((1 - Math.pow(1 - t, 3)) * opts.avoided));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  return { root: overlay, dispose: () => overlay.remove() };
}

const CSS = `
.pw-overlay{
  position:fixed; inset:0; z-index:50;
  display:flex; align-items:center; justify-content:center; padding:24px;
  font-family:"SF Pro Display",system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  color:#EAF1F6; -webkit-tap-highlight-color:transparent; cursor:pointer;
  background:
    radial-gradient(120% 75% at 50% 118%, rgba(31,168,92,.16), transparent 58%),
    radial-gradient(90% 60% at 50% -12%, rgba(120,150,180,.10), transparent 60%),
    linear-gradient(#0E1419,#080B0F);
  opacity:0; transition:opacity .4s ease;
}
.pw-overlay.in{opacity:1}

.pw-card{
  --go:#2FD27A; --stop:#FF5A52; --lane:#F3F0E2; --muted:#8DA0B2;
  position:relative; width:min(92vw,360px); box-sizing:border-box;
  padding:22px 24px 18px;
  display:flex; flex-direction:column; align-items:center; text-align:center;
  background:linear-gradient(180deg,#1B2530,#161E27);
  border:1px solid rgba(255,255,255,.07); border-radius:24px;
  box-shadow:0 30px 70px -20px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.05);
  transform:translateY(22px) scale(.97); opacity:0;
  transition:transform .55s cubic-bezier(.2,.8,.2,1), opacity .45s ease;
}
.pw-overlay.in .pw-card{transform:none; opacity:1}

.pw-brand{display:flex; align-items:center; gap:7px; margin-bottom:4px;
  font-size:11px; font-weight:700; letter-spacing:.13em; text-transform:uppercase; color:var(--muted)}
.pw-shield{width:16px; height:16px; fill:var(--go)}
.pw-shield-check{fill:none; stroke:#0E1419; stroke-width:2.4; stroke-linecap:round; stroke-linejoin:round}

.pw-gauge{position:relative; width:176px; height:176px; margin:8px 0 2px}
.pw-gauge-svg{width:100%; height:100%; display:block}
.pw-gauge-bezel{fill:none; stroke:rgba(255,255,255,.06); stroke-width:2}
.pw-gauge-track{fill:none; stroke:rgba(255,255,255,.05); stroke-width:14}
.pw-gauge-seg{fill:none; stroke-width:14; stroke-linecap:round;
  stroke-dasharray:100; stroke-dashoffset:100;
  transition:stroke-dashoffset .55s cubic-bezier(.2,.8,.2,1);
  transition-delay:calc(.35s + var(--i) * .12s)}
.pw-gauge-seg.is-go{stroke:var(--go)}
.pw-gauge-seg.is-stop{stroke:var(--stop)}
.pw-overlay.in .pw-gauge-seg{stroke-dashoffset:0}
.pw-gauge-tick{stroke:rgba(243,240,226,.22); stroke-width:2; stroke-linecap:round}

.pw-gauge-center{position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px}
.pw-score{font-size:58px; font-weight:800; line-height:.9; letter-spacing:-.02em;
  font-variant-numeric:tabular-nums; text-shadow:0 2px 12px rgba(0,0,0,.45)}
.pw-score-label{font-size:10px; font-weight:700; letter-spacing:.16em; text-transform:uppercase; color:var(--muted)}

.pw-divider{width:62%; height:3px; margin:15px 0 13px;
  background:repeating-linear-gradient(90deg, rgba(243,240,226,.42) 0 14px, transparent 14px 26px)}

.pw-head{font-size:21px; font-weight:800; letter-spacing:-.01em; line-height:1.22; max-width:18ch}
.pw-sub{margin-top:8px; font-size:14px; font-weight:500; line-height:1.42; color:var(--muted); max-width:27ch}

.pw-cta{
  margin-top:18px; width:100%; box-sizing:border-box;
  display:flex; align-items:center; justify-content:center; gap:8px;
  height:56px; border:0; border-radius:15px; cursor:pointer; color:#fff;
  font-family:inherit; font-size:18px; font-weight:800; letter-spacing:.01em;
  background:linear-gradient(180deg,#34C56B,#1FA052);
  box-shadow:0 10px 24px -8px rgba(31,160,82,.7), inset 0 1px 0 rgba(255,255,255,.35);
  transition:transform .12s ease, filter .12s ease; animation:pw-breathe 2.4s ease-in-out infinite;
}
.pw-cta:active{transform:scale(.98); filter:brightness(.96)}
.pw-chev{font-style:normal; font-size:22px; line-height:0; transform:translateY(-1px); opacity:.9}
@keyframes pw-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.025)}}

.pw-trust{margin-top:11px; font-size:11.5px; font-weight:600; letter-spacing:.04em; color:#7C8FA1}

@media (prefers-reduced-motion:reduce){
  .pw-overlay,.pw-card,.pw-gauge-seg,.pw-cta{transition:none!important; animation:none!important}
  .pw-overlay .pw-gauge-seg{stroke-dashoffset:0}
}
`;
