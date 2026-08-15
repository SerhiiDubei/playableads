import sharp from "sharp";
import { writeFileSync } from "node:fs";
const SRC = "/tmp/bebop-full/strip.png", OUT = "/Users/serhiidubei/remotion-test/src/tower11/bebop-strip.ts";
const B = [0,0.151,0.2754,0.3893,0.5124,0.6387,0.7559,0.873,1]; // vision boundaries
const meta = await sharp(SRC).metadata(); const W = meta.width!, H = meta.height!;
const { data } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const frames: {uri:string,w:number,h:number,cx:number,footY:number}[] = [];
for (let i=0;i<B.length-1;i++){
  const x0 = Math.round(B[i]*W), x1 = Math.round(B[i+1]*W);
  // horizontal content range within the cell (keep full height for ground alignment)
  let lo=x1, hi=x0, maxY=0, sumX=0, n=0;
  for (let y=0;y<H;y++) for (let x=x0;x<x1;x++){ if (data[(y*W+x)*4+3]>24){ if(x<lo)lo=x; if(x>hi)hi=x; if(y>maxY)maxY=y; sumX+=x; n++; } }
  if (n<50){ continue; }
  const pad=4; const left=Math.max(0,lo-pad), width=Math.min(W,hi+pad)-left;
  const cell = await sharp(SRC).extract({ left, top:0, width, height:H }).png().toBuffer();
  frames.push({ uri:"data:image/png;base64,"+cell.toString("base64"), w:width, h:H, cx:(sumX/n - left)/width, footY:maxY/H });
}
const ts = `// AUTO-GENERATED slice of the AI walk strip (vision boundaries). ${frames.length} frames.\n// cx = content centroid x (0..1), footY = lowest opaque pixel y (0..1) for ground alignment.\nexport type Frame = { uri: string; w: number; h: number; cx: number; footY: number };\nexport const STRIP: Frame[] = [\n${frames.map(f=>`  { uri: "${f.uri}", w: ${f.w}, h: ${f.h}, cx: ${f.cx.toFixed(4)}, footY: ${f.footY.toFixed(4)} },`).join("\n")}\n];\n`;
writeFileSync(OUT, ts);
console.log("WROTE", frames.length, "frames; sizes:", frames.map(f=>f.w+"x"+f.h).join(" "));
