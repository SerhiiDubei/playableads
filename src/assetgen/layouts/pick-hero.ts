import type { Layout } from "./types.js";

/**
 * Pick-hero — 3 героя на вибір через swipe/arrows. Ownership-эффект.
 *
 * Один екран: великий hero у центрі (показує обраного), стрілки ◀ ▶ перемикають,
 * статус-бар знизу з ім'ям/рівнем, CTA "Play as <name>" персоналізована.
 *
 * Один герой-asset перевикористовується 3 рази з різними filter(hue-rotate) —
 * це створює ілюзію 3 героїв без додаткової генерації. Цей трюк працює для
 * стилів з насиченими кольорами (cyber-heist), не дуже для painterly.
 */
export const pickHero: Layout = {
  id: "pick-hero",
  name: "Pick your hero (3 variants)",
  description: "Swipe між 3 героями (з різним hue), персоналізована CTA. Дає ownership-effect → вища CTR.",
  meta: {
    screenIds: ["pick"],
    hasCta: true,
    primaryCtaTexts: ["Play as", "Play Free"],
    maxHeroPx: 380,
  },

  pageCss: (font) => `
    *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    body{font-family:${font}}
    .screen{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
      padding:30px 24px 100px;opacity:0;visibility:hidden;
      transition:opacity .35s ease}
    .screen.active{opacity:1;visibility:visible}
    .hero-wrap{position:relative;height:380px;margin-top:30px;display:flex;align-items:center;justify-content:center}
    .hero-pick{height:380px;filter:drop-shadow(0 8px 12px #0009);transition:filter .3s ease,transform .25s ease}
    .arrow{position:absolute;top:50%;transform:translateY(-50%);width:48px;height:48px;background:rgba(0,0,0,0.5);
      border:2px solid #c9962f;border-radius:50%;display:flex;align-items:center;justify-content:center;
      color:#ffe9b0;font-size:24px;font-family:${font};cursor:pointer;user-select:none}
    .arrow.left{left:0}
    .arrow.right{right:0}
    .name{color:#ffe9b0;font-family:${font};font-weight:700;font-size:24px;text-align:center;
      margin-top:16px;text-shadow:0 2px 0 #3a2208,0 0 18px #c9962f55}
    .name-sub{color:#d8c49a;font-size:13px;text-align:center;margin-top:4px}
    .dots{display:flex;gap:8px;margin-top:14px}
    .dot{width:10px;height:10px;border-radius:50%;background:#3a2e1a;transition:background .3s ease}
    .dot.active{background:#ffe9b0;box-shadow:0 0 10px #ffe9b088}
    .cta-stack{position:absolute;left:24px;right:24px;bottom:20px;display:flex;flex-direction:column;gap:10px}
    #stage .c-banner{max-width:280px;margin-bottom:4px}
  `,

  screens: (k, a) => {
    const hero = a["knight"].dataUri;
    return `
    <section class="screen active" id="pick">
      ${k.banner("Choose Your Hero")}
      <div class="hero-wrap">
        <div class="arrow left" onclick="cycle(-1)">◀</div>
        <img id="heroImg" class="hero-pick" src="${hero}">
        <div class="arrow right" onclick="cycle(1)">▶</div>
      </div>
      <div class="name" id="heroName">Roland</div>
      <div class="name-sub" id="heroSub">Knight · Level 7</div>
      <div class="dots">
        <span class="dot active" id="d0"></span>
        <span class="dot" id="d1"></span>
        <span class="dot" id="d2"></span>
      </div>
      <div class="cta-stack">
        ${k.button('Play as <span id="ctaName">Roland</span>', "cta()", { block: true })}
      </div>
    </section>

    <script>
      var heroes = [
        { name: 'Roland', sub: 'Knight · Level 7', hue: 0 },
        { name: 'Kira', sub: 'Mage · Level 9', hue: 140 },
        { name: 'Vex', sub: 'Rogue · Level 5', hue: -90 }
      ];
      var idx = 0;
      function cycle(d) {
        idx = (idx + d + heroes.length) % heroes.length;
        var h = heroes[idx];
        var img = document.getElementById('heroImg');
        if (img) img.style.filter = 'hue-rotate(' + h.hue + 'deg) drop-shadow(0 8px 12px #0009)';
        var n = document.getElementById('heroName'); if (n) n.textContent = h.name;
        var s = document.getElementById('heroSub'); if (s) s.textContent = h.sub;
        var c = document.getElementById('ctaName'); if (c) c.textContent = h.name;
        for (var i = 0; i < 3; i++) {
          var d2 = document.getElementById('d' + i);
          if (d2) d2.className = (i === idx ? 'dot active' : 'dot');
        }
      }
    </script>`;
  },
};
