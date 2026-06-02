// Спільний screen-рівневий CSS. Інжектиться білдером ОДИН раз перед pageCss
// шаблону, тож шаблон може перевизначити будь-що (пізніший CSS виграє).
// Прибирає copy-paste reset/.screen/.zone/.gold/compact-card із кожного шаблону.
//
// Шаблон лишає у своєму pageCss ЛИШЕ специфічне (свої .hero, розміри, анімації).
export function screenBaseCss(font: string): string {
  return `
    *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    body{font-family:${font}}
    .screen{position:absolute;inset:0;opacity:0;visibility:hidden;transform:translateY(16px);
      transition:opacity .32s ease,transform .32s ease}
    .screen.active{opacity:1;visibility:visible;transform:none}
    .title{color:#ffe9b0;font-weight:700;font-size:22px;text-align:center;
      text-shadow:0 2px 0 #3a2208,0 0 18px #c9962f55}
    .sub{color:#d8c49a;font-size:13px;text-align:center}
    .gold{color:#f7ead0;text-shadow:0 1px 0 #6b4a1e,0 2px 3px rgba(0,0,0,.55)}
    .zone .c-btn.block{width:100%}
    .zone .c-panel{width:100%}
    .cards-compact .c-panel{border-width:16px;padding:4px 6px}
  `;
}
