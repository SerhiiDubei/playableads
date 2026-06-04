import { Application, Container, Graphics, Sprite, Texture, Assets, Text } from "pixi.js";
import { gsap } from "gsap";
import { makeArc, makeApproach, randomLaunchAngle, DifficultyController } from "../../src/assetgen/kit/motion.js";
import type { PlayableConfig } from "../../src/types.js";
declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;
function num(hex: string){ return parseInt(hex.replace("#",""),16); }

function sfx(k: string){ try{ const a=new Audio(cfg.assets[k]); a.volume=0.5; a.play().catch(()=>{});}catch(e){} }

async function main(){
  const app = new Application();
  await app.init({ resizeTo: window, background: num(cfg.style.colors.background), antialias: true });
  document.body.appendChild(app.canvas);

  // ── preload all art assets ──
  const tex: Record<string, Texture> = {};
  const keys = ["bg.webp","demon1.webp","demon2.webp","demon3.webp","demon4.webp","demon5.webp","demon6.webp","splat1.webp","splat2.webp","splat3.webp","splat4.webp","warrior.webp"];
  for (const k of keys) tex[k] = await Assets.load({ src: cfg.assets[k], format: k.endsWith(".webp")?"webp":"png" });

  const C = cfg.style.colors;
  const FONT = cfg.style.font.family;
  const FW = String(cfg.style.font.weight) as any;
  const BLOOD = 0x8a1020;

  // ── layers ──
  const bgLayer = new Container();      bgLayer.interactiveChildren=false;
  const splatLayer = new Container();   splatLayer.interactiveChildren=false;
  const fogLayer = new Container();     fogLayer.interactiveChildren=false;
  const gameLayer = new Container();    gameLayer.interactiveChildren=false;
  const fxLayer = new Container();      fxLayer.interactiveChildren=false;
  const uiLayer = new Container();      uiLayer.interactiveChildren=false;
  const ctaLayer = new Container();
  const shakeRoot = new Container();
  shakeRoot.addChild(bgLayer, splatLayer, gameLayer, fxLayer);
  app.stage.addChild(shakeRoot, fogLayer, uiLayer, ctaLayer);

  // background sprite (cover)
  const bg = new Sprite(tex["bg.webp"]); bg.anchor.set(0.5); bgLayer.addChild(bg);
  // dark night vignette overlay (limited visibility)
  const night = new Graphics(); fogLayer.addChild(night);

  // warrior center
  const warrior = new Sprite(tex["warrior.webp"]); warrior.anchor.set(0.5); gameLayer.addChild(warrior);

  // blade trail graphics
  const trail = new Graphics(); fxLayer.addChild(trail);

  // ── UI ──
  const titleTxt = new Text({ text: cfg.copy.title, style:{ fontFamily:FONT, fontWeight:FW, fontSize:34, fill:num(C.text), stroke:{color:0x000000,width:4}, align:"center" }});
  titleTxt.anchor.set(0.5);
  const scoreTxt = new Text({ text:"0", style:{ fontFamily:FONT, fontWeight:FW, fontSize:40, fill:num(C.accent), stroke:{color:0x000000,width:4} }});
  scoreTxt.anchor.set(0,0);
  const livesTxt = new Text({ text:"", style:{ fontFamily:FONT, fontWeight:FW, fontSize:30, fill:num(C.primary), stroke:{color:0x000000,width:4} }});
  livesTxt.anchor.set(1,0);
  const timeTxt = new Text({ text:"", style:{ fontFamily:FONT, fontWeight:FW, fontSize:26, fill:num(C.text), stroke:{color:0x000000,width:3} }});
  timeTxt.anchor.set(0.5,0);
  const comboTxt = new Text({ text:"", style:{ fontFamily:FONT, fontWeight:FW, fontSize:52, fill:0xffd24a, stroke:{color:BLOOD,width:6}, align:"center" }});
  comboTxt.anchor.set(0.5); comboTxt.alpha=0;
  const hintTxt = new Text({ text:"Swipe to slay!", style:{ fontFamily:FONT, fontWeight:FW, fontSize:30, fill:num(C.text), stroke:{color:0x000000,width:4} }});
  hintTxt.anchor.set(0.5);
  uiLayer.addChild(scoreTxt, livesTxt, timeTxt, titleTxt, comboTxt, hintTxt);

  // hint hand
  const hand = new Graphics();
  hand.circle(0,0,18).fill({color:0xffffff,alpha:0.9}).circle(0,0,30).stroke({color:0xffffff,width:3,alpha:0.5});
  uiLayer.addChild(hand); hand.visible=false;

  // CTA (sticky bottom, always interactive)
  const ctaBg = new Graphics();
  const ctaTxt = new Text({ text:cfg.copy.cta, style:{ fontFamily:FONT, fontWeight:FW, fontSize:30, fill:0xffffff, align:"center" }});
  ctaTxt.anchor.set(0.5);
  ctaLayer.addChild(ctaBg, ctaTxt);
  ctaLayer.eventMode="static"; ctaLayer.cursor="pointer";
  ctaLayer.on("pointertap", ()=>{ try{ (window as any).FbPlayableAd.onCTAClick(); }catch(e){} });

  // ── state ──
  let W = app.screen.width, H = app.screen.height;
  type Demon = { spr: Sprite; m: ReturnType<typeof makeApproach>; r: number; alive: boolean; kind: string; tx: number; ty: number; };
  type Special = { spr: Sprite; m: ReturnType<typeof makeArc>; r: number; alive: boolean; kind: string; };
  const demons: Demon[] = [];
  const specials: Special[] = [];
  const diff = new DifficultyController({ waitMin:0.45, waitMax:1.3, parallelMin:1, parallelMax:4 });

  let score = 0, lives = 5;
  const MAXLIFE = 5;
  let elapsed = 0; const GAME_SEC = 27, GRACE = 1.5;
  let spawnTimer = 0;
  let running = true, ended = false;
  let timeScale = 1, riftLeft = 0, frenzyLeft = 0;
  let comboCount = 0, comboLeft = 0;
  let hintActive = true, hintTimer = 0;

  // combo within 1s window
  let lastKillT = -999, chain = 0;

  function renderLives(){ let s=""; for(let i=0;i<MAXLIFE;i++) s += i<lives?"♥":"·"; livesTxt.text=s; }
  renderLives();

  // ── layout ──
  function layout(){
    W = app.screen.width; H = app.screen.height;
    // bg cover
    const s = Math.max(W/bg.texture.width, H/bg.texture.height);
    bg.scale.set(s); bg.position.set(W/2, H/2);
    // night overlay
    night.clear();
    night.rect(0,0,W,H).fill({color:0x000010, alpha:0.45});
    warrior.position.set(W/2, H*0.62);
    const ws = Math.min(W,H)*0.0016; warrior.scale.set(ws);
    scoreTxt.position.set(18,16);
    livesTxt.position.set(W-18,16);
    timeTxt.position.set(W/2, 18);
    titleTxt.position.set(W/2, 64);
    comboTxt.position.set(W/2, H*0.35);
    hintTxt.position.set(W/2, H*0.46);
    const cw=Math.min(W*0.86,460), ch=64;
    ctaBg.clear();
    ctaBg.roundRect(W/2-cw/2, H-ch-22, cw, ch, 16).fill(num(C.primary)).stroke({color:0xffffff,width:3,alpha:0.85});
    ctaTxt.position.set(W/2, H-ch/2-22);
  }
  layout(); window.addEventListener("resize", layout);

  // ── spawning ──
  const demonKeys = ["demon1.webp","demon2.webp","demon3.webp","demon4.webp","demon5.webp","demon6.webp"];
  function spawnDemon(boss=false){
    const k = demonKeys[Math.floor(Math.random()*demonKeys.length)];
    const spr = new Sprite(tex[k]); spr.anchor.set(0.5);
    // from edges/top toward warrior
    const edge = Math.floor(Math.random()*3);
    let fx:number, fy:number;
    if (edge===0){ fx=-60; fy=H*(0.2+Math.random()*0.5); }
    else if (edge===1){ fx=W+60; fy=H*(0.2+Math.random()*0.5); }
    else { fx=W*(0.15+Math.random()*0.7); fy=-60; }
    const tx = warrior.x + (Math.random()*2-1)*W*0.12;
    const ty = warrior.y - H*0.06;
    const base = Math.min(W,H)*0.0014*(boss?1.9:1)*(0.8+Math.random()*0.4);
    spr.scale.set(base*0.6); gsap.to(spr.scale,{x:base,y:base,duration:0.4});
    spr.position.set(fx,fy);
    gameLayer.addChild(spr);
    const m = makeApproach({ fromX:fx, fromY:fy, toX:tx, toY:ty, screenH:H, speedShPerSec: boss?0.12:(0.14+Math.random()*0.04), arriveRadius:30 });
    demons.push({ spr, m, r:Math.max(spr.width,spr.height)*0.5+40, alive:true, kind:boss?"boss":"demon", tx, ty });
    sfx("spawn.wav");
  }

  function spawnSpecial(){
    const roll = Math.random();
    let kind = roll<0.4?"time rift": roll<0.75?"soul orb":"blood moon";
    const k = kind==="soul orb"?"splat3.webp":"demon"+(1+Math.floor(Math.random()*6))+".webp";
    const spr = new Sprite(tex[k]); spr.anchor.set(0.5);
    const sc = Math.min(W,H)*0.0017; spr.scale.set(sc);
    spr.tint = kind==="soul orb"?0x66ddff : kind==="time rift"?0xaa88ff : 0xff3344;
    const fx = W*(0.2+Math.random()*0.6);
    spr.position.set(fx,H+60); fxLayer.addChild(spr);
    // glow
    const glow = new Graphics(); glow.circle(0,0,spr.width*0.7).fill({color:spr.tint,alpha:0.35});
    spr.addChildAt(glow,0);
    gsap.to(glow,{alpha:0.1,duration:0.5,yoyo:true,repeat:-1});
    const m = makeArc({ fromX:fx, fromY:H+60, screenH:H, timeAloftSec:2.6, apexFraction:0.62, angleDeg:randomLaunchAngle(Math.random()), spinRadPerSec:1.4 });
    specials.push({ spr, m, r:Math.max(spr.width,spr.height)*0.5+40, alive:true, kind });
  }

  // ── splat on background ──
  function addSplat(x:number,y:number,tint:number){
    const sk = "splat"+(1+Math.floor(Math.random()*4))+".webp";
    const sp = new Sprite(tex[sk]); sp.anchor.set(0.5);
    sp.position.set(x,y); sp.tint=tint; sp.alpha=0.45;
    sp.rotation = Math.random()*Math.PI*2;
    const sc = Math.min(W,H)*0.0013*(0.7+Math.random()*0.7);
    sp.scale.set(sc); splatLayer.addChild(sp);
  }

  // ── blood particles ──
  function bloodBurst(x:number,y:number,tint:number){
    for(let i=0;i<8;i++){
      const p = new Graphics(); p.circle(0,0,3+Math.random()*4).fill({color:tint,alpha:0.9});
      p.position.set(x,y); fxLayer.addChild(p);
      const a = Math.random()*Math.PI*2, d=30+Math.random()*70;
      gsap.to(p,{ x:x+Math.cos(a)*d, y:y+Math.sin(a)*d, alpha:0, duration:0.5+Math.random()*0.3,
        onComplete:()=>{ p.destroy(); }});
    }
  }

  function popScore(n:number){
    score += n; scoreTxt.text = String(score);
    gsap.fromTo(scoreTxt.scale,{x:1.4,y:1.4},{x:1,y:1,duration:0.3,ease:"back.out(3)"});
  }

  function showCombo(mult:number){
    comboTxt.text = "Combo x"+mult+"!";
    gsap.killTweensOf(comboTxt); comboTxt.alpha=1;
    gsap.fromTo(comboTxt.scale,{x:0.5,y:0.5},{x:1,y:1,duration:0.3,ease:"back.out(3)"});
    gsap.to(comboTxt,{alpha:0,duration:0.5,delay:0.6});
    sfx("combo.wav");
  }

  function killDemon(d:Demon){
    if(!d.alive) return;
    d.alive=false;
    const tint = BLOOD;
    addSplat(d.spr.x,d.spr.y,tint);
    bloodBurst(d.spr.x,d.spr.y,tint);
    // split into halves effect
    gsap.to(d.spr,{ alpha:0, duration:0.25, onComplete:()=>{ if(d.spr.parent) d.spr.parent.removeChild(d.spr); d.spr.destroy(); }});
    gsap.to(d.spr.scale,{ x:d.spr.scale.x*1.3, duration:0.25 });
    diff.recordHit();
    if(d.kind==="boss"){
      timeScale=0.25; gsap.delayedCall(0.7,()=>{ if(frenzyLeft<=0 && riftLeft<=0) timeScale=1; });
    }
  }

  function loseLife(){
    if (elapsed < GRACE) return;
    lives = Math.max(0, lives-1); renderLives();
    diff.recordMiss();
    sfx("hurt.wav");
    // red flash + shake
    const flash = new Graphics(); flash.rect(0,0,W,H).fill({color:0xff0000,alpha:0.35}); fogLayer.addChild(flash);
    gsap.to(flash,{alpha:0,duration:0.4,onComplete:()=>flash.destroy()});
    gsap.fromTo(shakeRoot,{x:-14},{x:0,duration:0.45,ease:"elastic.out(2,0.25)"});
    score = Math.max(0, score-3); scoreTxt.text=String(score);
  }

  // ── swipe handling (only stage listens) ──
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;
  let swiping=false; let px=0, py=0;
  const trailPts: {x:number,y:number}[] = [];

  function hitTest(ax:number,ay:number,bx:number,by:number){
    // demons
    for(const d of demons){ if(!d.alive) continue;
      if(segDist(ax,ay,bx,by,d.spr.x,d.spr.y) <= d.r){ killDemon(d); onSlay(d.spr.x,d.spr.y); }
    }
    for(const s of specials){ if(!s.alive) continue;
      if(segDist(ax,ay,bx,by,s.spr.x,s.spr.y) <= s.r){ collectSpecial(s); }
    }
  }

  let slayThisSwipe = 0;
  function onSlay(x:number,y:number){
    slayThisSwipe++;
    const now = elapsed*1000;
    if(now - lastKillT <= 1000){ chain++; } else { chain=1; }
    lastKillT = now;
    let mult = chain>=5?4 : chain>=3?2 : 1;
    const fr = frenzyLeft>0?2:1;
    popScore(10*mult*fr);
    if(mult>1) showCombo(mult);
    sfx("slash.wav");
  }

  function collectSpecial(s:Special){
    if(!s.alive) return; s.alive=false;
    bloodBurst(s.spr.x,s.spr.y,s.spr.tint);
    if(s.kind==="soul orb"){ lives=Math.min(MAXLIFE,lives+1); renderLives(); popScore(20); }
    else if(s.kind==="time rift"){ riftLeft=3; timeScale=0.45; }
    else if(s.kind==="blood moon"){ frenzyLeft=5; }
    sfx("combo.wav");
    if(s.spr.parent) s.spr.parent.removeChild(s.spr); s.spr.destroy();
  }

  function startSwipe(e:any){ swiping=true; px=e.global.x; py=e.global.y; trailPts.length=0; trailPts.push({x:px,y:py});
    if(hintActive){ hintActive=false; hand.visible=false; gsap.to(hintTxt,{alpha:0,duration:0.4}); } }
  function moveSwipe(e:any){ if(!swiping) return; const x=e.global.x,y=e.global.y;
    hitTest(px,py,x,y); px=x; py=y; trailPts.push({x,y}); if(trailPts.length>12) trailPts.shift(); }
  function endSwipe(){ swiping=false; slayThisSwipe=0; trailPts.length=0; }
  app.stage.on("pointerdown", startSwipe);
  app.stage.on("pointermove", moveSwipe);
  app.stage.on("pointerup", endSwipe);
  app.stage.on("pointerupoutside", endSwipe);

  function segDist(ax:number,ay:number,bx:number,by:number,px:number,py:number){
    const dx=bx-ax, dy=by-ay; const l2=dx*dx+dy*dy;
    if(l2===0) return Math.hypot(px-ax,py-ay);
    let t=((px-ax)*dx+(py-ay)*dy)/l2; t=Math.max(0,Math.min(1,t));
    return Math.hypot(px-(ax+t*dx), py-(ay+t*dy));
  }

  // ── first action hint ──
  function pointHintAtNearest(){
    let best:Demon|null=null, bd=1e9;
    for(const d of demons){ if(!d.alive) continue; const dd=Math.hypot(d.spr.x-warrior.x,d.spr.y-warrior.y); if(dd<bd){bd=dd;best=d;} }
    if(best){
      hand.visible=true;
      const tx=best.spr.x, ty=best.spr.y;
      gsap.killTweensOf(hand);
      hand.position.set(tx, ty+80);
      gsap.to(hand,{ x:warrior.x, y:warrior.y, duration:0.8, ease:"power1.inOut", yoyo:true, repeat:-1 });
    }
  }

  // ── end ──
  function endGame(){
    if(ended) return; ended=true; running=false;
    // clear field
    for(const d of demons){ if(d.spr.parent) d.spr.parent.removeChild(d.spr); d.spr.destroy(); }
    for(const s of specials){ if(s.spr.parent) s.spr.parent.removeChild(s.spr); s.spr.destroy(); }
    demons.length=0; specials.length=0;
    gsap.to(fogLayer,{alpha:1,duration:0.3});
    const ov = new Graphics(); ov.rect(0,0,W,H).fill({color:0x000010,alpha:0.7}); uiLayer.addChild(ov);
    const big = new Text({ text:"Slain: "+score, style:{ fontFamily:FONT, fontWeight:FW, fontSize:54, fill:num(C.accent), stroke:{color:BLOOD,width:6}, align:"center"}});
    big.anchor.set(0.5); big.position.set(W/2,H*0.36); uiLayer.addChild(big);
    gsap.fromTo(big.scale,{x:0.4,y:0.4},{x:1,y:1,duration:0.5,ease:"back.out(2)"});
    const sub = new Text({ text:"You survived the night!", style:{ fontFamily:FONT, fontWeight:FW, fontSize:28, fill:num(C.text), stroke:{color:0x000000,width:4}, align:"center"}});
    sub.anchor.set(0.5); sub.position.set(W/2,H*0.46); uiLayer.addChild(sub);
    gsap.to(ctaBg.scale,{x:1.06,y:1.06,duration:0.6,yoyo:true,repeat:-1,transformOrigin:"center"});
  }

  // ── main loop ──
  spawnDemon();
  gsap.delayedCall(0.6, pointHintAtNearest);

  app.ticker.add(()=>{
    if(!running) return;
    const dtReal = app.ticker.deltaMS/1000;
    const dt = dtReal * timeScale;
    elapsed += dtReal;
    timeTxt.text = Math.max(0, Math.ceil(GAME_SEC-elapsed))+"s";

    // timers
    if(riftLeft>0){ riftLeft-=dtReal; if(riftLeft<=0 && frenzyLeft<=0){ timeScale=1; } }
    if(frenzyLeft>0){ frenzyLeft-=dtReal; if(frenzyLeft<=0 && riftLeft<=0){ timeScale=1; } }

    // spawning
    spawnTimer -= dtReal;
    if(spawnTimer<=0 && elapsed<GAME_SEC){
      let count = diff.parallelCount();
      if(frenzyLeft>0) count += 2;
      for(let i=0;i<count;i++) spawnDemon();
      if(Math.random()<0.18) spawnSpecial();
      spawnTimer = (frenzyLeft>0?0.35:diff.spawnWaitSec());
    }

    // update demons
    for(let i=demons.length-1;i>=0;i--){
      const d=demons[i];
      if(!d.alive){ demons.splice(i,1); continue; }
      d.m.update(dt); d.spr.x=d.m.x; d.spr.y=d.m.y;
      // face warrior slightly
      d.spr.rotation = Math.sin(elapsed*4+i)*0.08;
      if(d.m.arrived){
        loseLife();
        if(d.spr.parent) d.spr.parent.removeChild(d.spr); d.spr.destroy();
        demons.splice(i,1);
      }
    }
    // update specials (arc)
    for(let i=specials.length-1;i>=0;i--){
      const s=specials[i];
      if(!s.alive){ specials.splice(i,1); continue; }
      s.m.update(dt); s.spr.x=s.m.x; s.spr.y=s.m.y; s.spr.rotation=s.m.rotation;
      if(s.m.done){ if(s.spr.parent) s.spr.parent.removeChild(s.spr); s.spr.destroy(); specials.splice(i,1); }
    }

    // blade trail render
    trail.clear();
    if(swiping && trailPts.length>1){
      for(let i=1;i<trailPts.length;i++){
        const a=trailPts[i-1], b=trailPts[i];
        const w = 2 + (i/trailPts.length)*10;
        trail.moveTo(a.x,a.y).lineTo(b.x,b.y).stroke({color:0xff5566,width:w,alpha:i/trailPts.length});
      }
      const last=trailPts[trailPts.length-1];
      trail.circle(last.x,last.y,6).fill({color:0xffeecc,alpha:0.9});
    }

    // re-point hint occasionally if still active
    if(hintActive){ hintTimer-=dtReal; if(hintTimer<=0){ pointHintAtNearest(); hintTimer=2; } }

    // end only on timer
    if(elapsed>=GAME_SEC) endGame();
  });
}
void main();
