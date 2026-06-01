// Stage scaler: фіксований design-canvas, що масштабується під будь-який екран.
// Прибирає "плаваючу" верстку — UI рендериться в сталих координатах, scale робить решту.

export const DESIGN = { W: 400, H: 860 }; // портретний референс (≈9:19.4), під який тюниться kit

/** CSS: #viewport (fixed, фон-сцена cover заповнює gutters) + #stage (фіксований, центрований). */
export function stageCss(bgUri?: string): string {
  return `
  html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#160f06}
  #viewport{position:fixed;inset:0;overflow:hidden${bgUri ? `;background:url(${bgUri}) center/cover no-repeat` : ""}}
  #stage{position:absolute;left:50%;top:50%;width:${DESIGN.W}px;height:${DESIGN.H}px;
    transform:translate(-50%,-50%);transform-origin:center center;will-change:transform}
  `;
}

/** Runtime: масштабує stage під viewport (contain), перераховує на resize/orientation. */
export function stageJs(): string {
  return `(function(){var W=${DESIGN.W},H=${DESIGN.H},s=document.getElementById('stage');
  function fit(){var sc=Math.min(innerWidth/W,innerHeight/H);
    s.style.transform='translate(-50%,-50%) scale('+sc+')';}
  addEventListener('resize',fit);addEventListener('orientationchange',fit);
  if(window.visualViewport)visualViewport.addEventListener('resize',fit);fit();})();`;
}
