import type { Layout } from "./types.js";
import { resolveLayout, zone, zonesOverlay } from "../kit/layout.js";

/**
 * Estimate-reveal — "The Repair Bill". Guess-and-reveal слайдером.
 *
 * Задача #3 «пояснити важливість послуги» (auto-insurance). Гравець оцінює
 * вартість ремонту слайдером ($500–$8000) → reveal = ДЕТАЛІЗОВАНИЙ ЧЕК СТО.
 * Конкретна модель (2022 Tesla Model 3, підписана) → ціни мають сенс. 2 раунди.
 *
 * RB9: слайдер з діленнями (ticks) + помітніший grow на drag; підпис моделі;
 * reveal-чек із нагнітальною появою рядків (деталь+робота+калібрування+простій) → TOTAL.
 * Геймплейні екрани — крупний close-up пошкодження з підсвіткою.
 */
const L = resolveLayout("immersive");
const LEnd = resolveLayout("endcard");

export const estimateReveal: Layout = {
  id: "estimate-reveal",
  name: "Estimate reveal (guess the bill)",
  description:
    "Слайдер-гадання + reveal = чек СТО з деталізацією. Конкретна модель, крупний close-up пошкодження, 2 раунди, deductible-хук → CTA. Для 'пояснити важливість послуги'.",
  meta: {
    screenIds: ["intro", "r1g", "r1r", "r2g", "r2r", "end"],
    hasCta: true,
    primaryCtaTexts: ["Get your quote"],
    maxHeroPx: 200,
    zoneTypes: {
      intro: "immersive",
      r1g: "immersive",
      r1r: "immersive",
      r2g: "immersive",
      r2r: "immersive",
      end: "endcard",
    },
    assets: [
      { key: "car_rear", src: "car_rear.png", size: 620, fallbackHero: true },
      { key: "car_front", src: "car_front.png", size: 620, fallbackHero: true },
    ],
  },

  pageCss: () => `
    :root{--er-ff:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
      --er-mint:#00E0A4;--er-coral:#FF5470;--er-ink:#0E1A3A}
    .screen{position:absolute;inset:0;opacity:0;visibility:hidden;transition:opacity .25s ease}
    .screen.active{opacity:1;visibility:visible}

    /* каскад входу; база без opacity:0 → both-fill ховає під час stagger і не блимає при виході */
    .er-up,.er-pop{will-change:transform,opacity}
    .screen.active .er-up{animation:erEnter .45s cubic-bezier(.16,1,.3,1) both}
    .screen.active .er-pop{animation:erPopIn .42s cubic-bezier(.34,1.56,.64,1) both}
    .screen.active .er-s1{animation-delay:40ms}
    .screen.active .er-s2{animation-delay:120ms}
    .screen.active .er-s3{animation-delay:200ms}
    .screen.active .er-s4{animation-delay:280ms}
    @keyframes erEnter{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
    @keyframes erPopIn{0%{opacity:0;transform:scale(.84) translateY(12px)}60%{opacity:1;transform:scale(1.05) translateY(0)}100%{transform:scale(1)}}

    .er-title{font:800 24px/1.15 var(--er-ff);color:#fff;text-align:center;max-width:92%;margin:0 auto;
      text-shadow:0 2px 10px rgba(0,0,0,.45)}
    .er-model{font:700 12px var(--er-ff);color:var(--er-mint);text-align:center;letter-spacing:.4px;margin-top:5px;text-transform:uppercase}
    .er-sub{font:500 15px/1.35 var(--er-ff);color:rgba(255,255,255,.8);text-align:center;max-width:86%;margin:8px auto 0}
    .er-hud{font:700 13px var(--er-ff);color:var(--er-mint);letter-spacing:.3px;text-transform:uppercase}
    .er-hint{font:600 12px var(--er-ff);color:rgba(255,255,255,.55);text-align:center;margin:2px auto 0}
    .er-cta-wrap{width:100%}

    .er-car{height:180px;max-width:90%;object-fit:contain;filter:drop-shadow(0 12px 22px rgba(0,0,0,.45))}

    /* крупний close-up пошкодження + пульсуюча підсвітка */
    .er-dmg{object-fit:contain;animation:erPulse 2.6s ease-in-out infinite}
    .er-dmg-lg{height:188px;max-width:96%}
    .er-dmg-xs{height:74px;max-width:50%}
    @keyframes erPulse{
      0%,100%{filter:drop-shadow(0 0 12px rgba(255,84,112,.35)) drop-shadow(0 10px 18px rgba(0,0,0,.45))}
      50%{filter:drop-shadow(0 0 30px rgba(255,84,112,.75)) drop-shadow(0 10px 18px rgba(0,0,0,.45))}
    }

    /* ── Slider з діленнями (ticks) + помітніший grow ── */
    .er-slider{position:relative;width:300px;max-width:86%;height:78px;margin:4px auto 0;touch-action:none;user-select:none}
    .er-rail{position:absolute;left:0;right:0;top:42px;height:8px;border-radius:99px;background:rgba(255,255,255,.22)}
    .er-fill{position:absolute;left:0;top:42px;height:8px;width:0;border-radius:99px;
      background:linear-gradient(90deg,var(--er-mint),#00b487)}
    .er-ticks{position:absolute;left:0;right:0;top:42px;height:8px;pointer-events:none}
    .er-tick{position:absolute;width:2px;height:14px;top:-3px;margin-left:-1px;background:rgba(255,255,255,.35);border-radius:1px}
    .er-tick-lab{position:absolute;top:16px;transform:translateX(-50%);font:600 10px var(--er-ff);color:rgba(255,255,255,.5);white-space:nowrap}
    .er-thumb{position:absolute;top:46px;left:0;width:46px;height:46px;margin-left:-23px;border-radius:50%;
      background:#fff;border:4px solid var(--er-mint);box-shadow:0 5px 16px rgba(0,0,0,.4);
      transform:translateY(-50%);cursor:grab;transition:transform .14s cubic-bezier(.34,1.56,.64,1),box-shadow .14s ease-out;z-index:2}
    .er-slider.dragging .er-thumb{transform:translateY(-50%) scale(1.32);box-shadow:0 10px 26px rgba(0,0,0,.5),0 0 0 10px rgba(0,224,164,.2)}
    .er-bubble{position:absolute;top:-6px;left:0;transform:translateX(-50%) scale(.96);font:800 18px/1 var(--er-ff);
      color:#fff;background:var(--er-ink);padding:7px 13px;border-radius:11px;white-space:nowrap;
      box-shadow:0 4px 12px rgba(0,0,0,.35);transition:transform .13s cubic-bezier(.34,1.56,.64,1);z-index:3}
    .er-slider.dragging .er-bubble{transform:translateX(-50%) translateY(-4px) scale(1.12)}
    .er-bubble::after{content:"";position:absolute;left:50%;bottom:-5px;transform:translateX(-50%) rotate(45deg);
      width:10px;height:10px;background:var(--er-ink)}

    /* ── Reveal = ЧЕК СТО ── */
    .er-receipt-card{width:312px;max-width:92%;margin:0 auto;background:rgba(255,255,255,.06);
      border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:12px 15px 14px}
    .er-rcpt-head{font:700 11px var(--er-ff);color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:.8px;
      text-align:center;padding-bottom:9px;margin-bottom:7px;border-bottom:1px dashed rgba(255,255,255,.18)}
    .er-line{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:3px 0;
      font:600 13px var(--er-ff);color:rgba(255,255,255,.82);animation:erLineIn .34s cubic-bezier(.16,1,.3,1) both}
    .er-line .er-l{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .er-line .er-v{font-weight:800;color:#fff;flex:0 0 auto}
    @keyframes erLineIn{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}
    .er-rule{border-top:1px dashed rgba(255,255,255,.25);margin:8px 0 7px}
    .er-total-line{display:flex;justify-content:space-between;align-items:baseline}
    .er-total-line .lab{font:800 14px var(--er-ff);color:#fff;text-transform:uppercase;letter-spacing:.6px}
    .er-sum{font:900 34px/1 var(--er-ff);color:var(--er-coral);text-shadow:0 0 12px rgba(255,84,112,.45)}
    .er-sum.shake{animation:erShake .42s ease-in-out}
    .er-sum.hit{animation:erPop .42s cubic-bezier(.34,1.56,.64,1),erGlow .8s ease-in-out .1s 2}
    @keyframes erPop{0%{transform:scale(1)}50%{transform:scale(1.16)}100%{transform:scale(1)}}
    @keyframes erShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-5px)}40%{transform:translateX(4px)}60%{transform:translateX(-3px)}80%{transform:translateX(2px)}}
    @keyframes erGlow{0%,100%{text-shadow:0 0 12px rgba(255,84,112,.4)}50%{text-shadow:0 0 28px rgba(255,84,112,.95)}}
    .er-badge{margin:11px auto 0;max-width:90%;text-align:center;font:700 15px/1.3 var(--er-ff);color:#fff;
      opacity:0;transform:translateY(12px);transition:opacity .45s ease,transform .45s cubic-bezier(.22,1,.36,1)}
    .er-badge.show{opacity:1;transform:translateY(0)}
    .er-badge b{color:var(--er-coral)}

    /* ── Endcard ── */
    .er-end-msg{font:800 26px/1.2 var(--er-ff);color:#fff;text-align:center;max-width:92%;margin:0 auto;
      text-shadow:0 2px 10px rgba(0,0,0,.45)}
    .er-end-total{font:900 40px var(--er-ff);color:var(--er-coral);text-align:center;margin-top:10px;
      text-shadow:0 0 24px rgba(255,84,112,.45)}
    .er-end-ded{font:600 15px/1.4 var(--er-ff);color:rgba(255,255,255,.85);text-align:center;max-width:84%;margin:10px auto 0}
    .er-end-ded b{color:var(--er-mint)}
    .er-install{font:600 12px var(--er-ff);color:rgba(255,255,255,.55);text-align:center}

    .c-btn{font-family:var(--er-ff)!important;text-transform:none!important;letter-spacing:.2px!important}

    @media (prefers-reduced-motion:reduce){
      .er-up,.er-pop,.er-dmg,.er-line{animation:none!important}
      .er-sum.hit,.er-sum.shake{animation:none!important}
    }
  `,

  screens: (k, a) => {
    const carClean = a["knight"].dataUri;
    const carRear = a["car_rear"].dataUri;
    const carFront = a["car_front"].dataUri;

    const slider = (id: string) => `
      <div class="er-slider" id="${id}" data-min="500" data-max="8000" data-step="100" data-val="2000">
        <div class="er-bubble">$2,000</div>
        <div class="er-rail"></div>
        <div class="er-fill"></div>
        <div class="er-ticks"></div>
        <div class="er-thumb"></div>
      </div>`;

    const damage = (uri: string, s: string) =>
      `<div class="er-up ${s}"><img class="er-dmg er-dmg-lg" src="${uri}"></div>`;

    const receipt = (round: number) => `
      <div class="er-receipt-card er-up er-s1">
        <div class="er-rcpt-head">Repair estimate · 2022 Tesla Model 3</div>
        <div id="receipt${round}"></div>
        <div class="er-rule"></div>
        <div class="er-total-line"><span class="lab">Total</span><span class="er-sum" id="sum${round}">$0</span></div>
        <div class="er-badge" id="badge${round}"></div>
      </div>`;

    const cta = (text: string, onclick: string) =>
      `<div class="er-cta-wrap er-up er-s4">${k.button(text, onclick, { block: true, level: "primary" })}</div>`;

    return `
    <section class="screen active" id="intro" data-type="immersive">
      ${zonesOverlay(L)}
      ${zone("title", `<div class="er-title er-up er-s1">Oops. A little fender bender.</div><div class="er-model er-up er-s1">2022 Tesla Model 3</div>`)}
      ${zone("stage", `<img class="er-car er-pop er-s2" src="${carClean}"><div class="er-sub er-up er-s3">Think you know what repairs really cost?</div>`)}
      ${zone("actions", cta("How much? →", "go('r1g')"))}
    </section>

    <section class="screen" id="r1g" data-type="immersive">
      ${zonesOverlay(L)}
      ${zone("title", `<div class="er-title er-up er-s1">How much to fix this bumper?</div><div class="er-model er-up er-s1">2022 Tesla Model 3 · rear</div>`)}
      ${zone("stage", `${damage(carRear, "er-s2")}<div class="er-up er-s3">${slider("sl1")}</div><div class="er-hint er-up er-s3">Drag to set your estimate</div>`)}
      ${zone("actions", cta("Lock it in", "lockIn(1)"))}
    </section>

    <section class="screen" id="r1r" data-type="immersive">
      ${zonesOverlay(L)}
      ${zone("stage", `<img class="er-dmg er-dmg-xs er-up er-s1" src="${carRear}">${receipt(1)}`)}
      ${zone("actions", cta("Next damage →", "go('r2g')"))}
    </section>

    <section class="screen" id="r2g" data-type="immersive">
      ${zonesOverlay(L)}
      ${zone("hud", `<div class="er-hud er-up er-s1">Repairs so far: $3,200</div>`)}
      ${zone("title", `<div class="er-title er-up er-s1">And this fender &amp; headlight?</div><div class="er-model er-up er-s1">2022 Tesla Model 3 · front</div>`)}
      ${zone("stage", `${damage(carFront, "er-s2")}<div class="er-up er-s3">${slider("sl2")}</div><div class="er-hint er-up er-s3">Drag to set your estimate</div>`)}
      ${zone("actions", cta("Lock it in", "lockIn(2)"))}
    </section>

    <section class="screen" id="r2r" data-type="immersive">
      ${zonesOverlay(L)}
      ${zone("hud", `<div class="er-hud er-up er-s1">Repairs so far: $3,200</div>`)}
      ${zone("stage", `<img class="er-dmg er-dmg-xs er-up er-s1" src="${carFront}">${receipt(2)}`)}
      ${zone("actions", cta("What this means →", "go('end')"))}
    </section>

    <section class="screen" id="end" data-type="endcard">
      ${zonesOverlay(LEnd)}
      ${zone("title", `<div class="er-end-msg er-up er-s1">Repairs cost more than most people expect.</div>`)}
      ${zone("stage", `
        <img class="er-car er-pop er-s2" src="${carClean}">
        <div class="er-end-total er-up er-s3">$7,800</div>
        <div class="er-end-ded er-up er-s3">You'd pay this out of pocket. With Coverly, just a <b>$500</b> deductible.</div>`)}
      ${zone("actions", cta("Get your quote", "cta()"))}
      ${zone("footer", `<div class="er-install er-up er-s4">Get covered with the Coverly app</div>`)}
    </section>

    <script>
      var ER = { real: { 1: 3200, 2: 4600 }, guess: {} };
      var RECEIPT = {
        1: [["Rear bumper cover","$1,180"],["Tail light — LED","$540"],["Park sensor recalibration","$420"],["Labor — 4.0 h","$720"],["Loaner car — 3 days","$340"]],
        2: [["Headlight — LED matrix","$1,840"],["Front fender + paint","$1,260"],["ADAS recalibration","$700"],["Labor — 5.5 h","$660"],["Diagnostics + alignment","$140"]]
      };
      function erFmt(n){ return "$" + Math.round(n).toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, ","); }

      function initSlider(el){
        var min = +el.dataset.min, max = +el.dataset.max, step = +el.dataset.step;
        var fill = el.querySelector(".er-fill"), thumb = el.querySelector(".er-thumb"),
            bubble = el.querySelector(".er-bubble"), ticks = el.querySelector(".er-ticks");
        var TH = 46, val = +el.dataset.val, dragging = false;
        function xFor(v){ return TH/2 + ((v - min) / (max - min)) * (el.clientWidth - TH); }
        function buildTicks(){
          ticks.innerHTML = "";
          [500, 2000, 4000, 6000, 8000].forEach(function(tv){
            var x = xFor(tv);
            var t = document.createElement("div"); t.className = "er-tick"; t.style.left = x + "px";
            var lb = document.createElement("span"); lb.className = "er-tick-lab"; lb.style.left = x + "px";
            lb.textContent = tv < 1000 ? "$" + tv : "$" + (tv / 1000) + "k";
            ticks.appendChild(t); ticks.appendChild(lb);
          });
        }
        function render(){
          var x = xFor(val);
          fill.style.width = x + "px"; thumb.style.left = x + "px"; bubble.style.left = x + "px";
          bubble.textContent = erFmt(val); el.dataset.val = val;
        }
        function setFromClient(clientX){
          var r = el.getBoundingClientRect();
          var scale = r.width / el.clientWidth || 1;
          var localX = (clientX - r.left) / scale;
          var pct = Math.min(1, Math.max(0, (localX - TH/2) / (el.clientWidth - TH)));
          val = Math.round((min + pct * (max - min)) / step) * step;
          render();
        }
        el.addEventListener("pointerdown", function(e){ dragging = true; el.classList.add("dragging"); try{el.setPointerCapture(e.pointerId);}catch(_){} setFromClient(e.clientX); });
        el.addEventListener("pointermove", function(e){ if(dragging) setFromClient(e.clientX); });
        el.addEventListener("pointerup", function(){ dragging = false; el.classList.remove("dragging"); });
        el.addEventListener("pointercancel", function(){ dragging = false; el.classList.remove("dragging"); });
        buildTicks(); render();
      }

      function lockIn(round){
        var sl = document.getElementById("sl" + round);
        ER.guess[round] = +sl.dataset.val;
        go("r" + round + "r");
        setTimeout(function(){ revealBill(round); }, 360);
      }

      function revealBill(round){
        var real = ER.real[round], guess = ER.guess[round], rows = RECEIPT[round];
        var box = document.getElementById("receipt" + round);
        box.innerHTML = "";
        // нагнітання: рядки чека по черзі
        rows.forEach(function(r, i){
          setTimeout(function(){
            var d = document.createElement("div"); d.className = "er-line";
            d.innerHTML = '<span class="er-l">' + r[0] + '</span><span class="er-v">' + r[1] + '</span>';
            box.appendChild(d);
          }, i * 200);
        });
        var afterRows = rows.length * 200 + 120;
        // TOTAL: shake-удар → count-up → pop+glow
        setTimeout(function(){
          var sumEl = document.getElementById("sum" + round);
          sumEl.classList.remove("hit"); sumEl.classList.add("shake");
          rollTo(sumEl, 0, real, 1000, function(){
            sumEl.classList.remove("shake"); void sumEl.offsetWidth; sumEl.classList.add("hit");
          });
        }, afterRows);
        // бейдж промаху
        setTimeout(function(){
          var diff = real - guess, pct = Math.round(Math.abs(diff) / real * 100), dir = diff >= 0 ? "low" : "high";
          var b = document.getElementById("badge" + round);
          if(b){ b.innerHTML = "You guessed " + erFmt(guess) + " — <b>" + pct + "% " + dir + "</b>"; b.classList.add("show"); }
        }, afterRows + 1250);
      }

      function rollTo(el, from, to, ms, done){
        var t0 = null;
        function step(ts){
          if(!t0) t0 = ts;
          var p = Math.min(1, (ts - t0) / ms), e = 1 - Math.pow(1 - p, 3);
          el.textContent = erFmt(from + (to - from) * e);
          if(p < 1) requestAnimationFrame(step); else if(done) done();
        }
        requestAnimationFrame(step);
      }

      (function(){
        var s1 = document.getElementById("sl1"), s2 = document.getElementById("sl2");
        if(s1) initSlider(s1);
        if(s2) initSlider(s2);
        window.addEventListener("resize", function(){
          [s1, s2].forEach(function(el){ if(el) initSlider(el); });
        });
      })();
    </script>`;
  },
};
