import { Application, Container, Graphics, Sprite, Texture, Assets, Text } from "pixi.js";
import { gsap } from "gsap";
import { makeArc, makeApproach, makePlatformerBody, randomLaunchAngle, DifficultyController } from "../../src/assetgen/kit/motion.js";
import type { PlayableConfig } from "../../src/types.js";
declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;
function num(hex: string){ return parseInt(hex.replace("#",""),16); }

async function main(){
  const app = new Application();
  await app.init({ resizeTo: window, background: num(cfg.style.colors.background), antialias: true });
  document.body.appendChild(app.canvas);

  const C = cfg.style.colors;
  const FONT = cfg.style.font.family || "sans-serif";
  const FW = String(cfg.style.font.weight || 700) as any;

  // ── Preload ──
  const keys = ["bg.webp","demon1.webp","demon2.webp","demon3.webp","ground.webp","hero_attack.webp","hero_idle.webp","hero_jump.webp","hero_run.webp"];
  const tex: Record<string, Texture> = {};
  for (const k of keys){
    try { tex[k] = await Assets.load({ src: cfg.assets[k], format: k.endsWith(".webp") ? "webp" : "png" }); }
    catch(e){ tex[k] = Texture.WHITE; }
    if (tex[k] && tex[k].source) tex[k].source.scaleMode = "nearest";
  }

  function sfx(k: string){ try{ const a=new Audio(cfg.assets[k]); a.volume=0.5; a.play().catch(()=>{}); }catch(e){} }

  // ── Layers ──
  const bgLayer = new Container();
  const world = new Container();
  const uiLayer = new Container();
  const ctaLayer = new Container();
  app.stage.addChild(bgLayer, world, uiLayer, ctaLayer);
  bgLayer.interactiveChildren = false;
  world.interactiveChildren = false;

  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  let W = app.screen.width, H = app.screen.height;
  let groundY = H * 0.82;
  let WORLD_W = W * 3.5;
  let baseScale = Math.min(W,H) * 0.0020;

  // ── Background (screen-fixed cover) ──
  const bg = new Sprite(tex["bg.webp"]);
  bg.anchor.set(0.5);
  bgLayer.addChild(bg);
  function layoutBg(){
    const tw = bg.texture.width || 1, th = bg.texture.height || 1;
    const s = Math.max(W/tw, H/th);
    bg.scale.set(s);
    bg.position.set(W/2, H/2);
  }

  // ── Ground (tiled across world) ──
  const groundC = new Container();
  world.addChild(groundC);
  function buildGround(){
    groundC.removeChildren();
    const gt = tex["ground.webp"];
    const gw = gt.width || 64, gh = gt.height || 64;
    const targetH = H * 0.20;
    const gs = targetH / gh;
    const tileW = gw * gs;
    const n = Math.ceil(WORLD_W / tileW) + 1;
    for (let i=0;i<n;i++){
      const t = new Sprite(gt);
      t.scale.set(gs);
      t.position.set(i*tileW, groundY);
      groundC.addChild(t);
    }
  }

  // ── Goal / boss marker (right end) ──
  const goal = new Container();
  world.addChild(goal);
  const goalG = new Graphics();
  goal.addChild(goalG);
  const goalDemon = new Sprite(tex["demon3.webp"]);
  goalDemon.anchor.set(0.5,1.0);
  goal.addChild(goalDemon);

  // ── Hero ──
  const hero = new Sprite(tex["hero_idle.webp"]);
  hero.anchor.set(0.5,1.0);
  world.addChild(hero);

  const slash = new Graphics();
  world.addChild(slash);
  slash.alpha = 0;

  const particles = new Container();
  particles.interactiveChildren = false;
  world.addChild(particles);

  // ── Physics body ──
  let body = makePlatformerBody({ x: W*0.3, groundY, screenH: H, runSpeedShPerSec: 0.5, jumpHeightFraction: 0.26, jumpRiseSec: 0.4, minX: 60, maxX: WORLD_W-60 });

  // ── Enemies ──
  interface Enemy { spr: Sprite; mover: any; alive: boolean; }
  const enemies: Enemy[] = [];
  const diff = new DifficultyController({ waitMin: 1.4, waitMax: 2.8, parallelMin: 1, parallelMax: 1 });
  let spawnTimer = 2.5;
  const demonKeys = ["demon1.webp","demon2.webp","demon3.webp"];

  function spawnEnemy(){
    const key = demonKeys[Math.floor(Math.random()*demonKeys.length)];
    const spr = new Sprite(tex[key]);
    spr.anchor.set(0.5,1.0);
    spr.scale.set(baseScale*0.9);
    // spawn ahead of hero, within world
    const ahead = body.x + W*0.7 + Math.random()*W*0.5;
    const fromX = Math.min(ahead, WORLD_W-80);
    const mover = makeApproach({ fromX, fromY: groundY, toX: body.x, toY: groundY, screenH: H, speedShPerSec: 0.08 + Math.random()*0.05 });
    spr.position.set(fromX, groundY);
    spr.scale.x = -Math.abs(spr.scale.x); // face left toward hero
    world.addChildAt(spr, world.getChildIndex(hero));
    enemies.push({ spr, mover, alive: true });
  }

  function spark(wx: number, wy: number){
    for (let i=0;i<10;i++){
      const p = new Graphics();
      p.rect(-3,-3,6,6).fill(num(C.accent));
      p.position.set(wx, wy);
      particles.addChild(p);
      const ang = Math.random()*Math.PI*2;
      const dist = 30 + Math.random()*60;
      gsap.to(p, { x: wx + Math.cos(ang)*dist, y: wy + Math.sin(ang)*dist, alpha: 0, duration: 0.5, ease: "power2.out",
        onComplete: ()=>{ if(p.parent) p.parent.removeChild(p); p.destroy(); } });
    }
  }

  function killEnemy(e: Enemy){
    if(!e.alive) return;
    e.alive = false;
    score++;
    diff.recordHit();
    sfx("kill.wav");
    spark(e.spr.x, e.spr.y - e.spr.height*0.5);
    gsap.to(e.spr, { alpha: 0, x: e.spr.x + (Math.random()*60-30), y: e.spr.y - 80, rotation: (Math.random()-0.5)*2, duration: 0.5, ease: "power2.out",
      onComplete: ()=>{ if(e.spr.parent) e.spr.parent.removeChild(e.spr); e.spr.destroy(); } });
    const idx = enemies.indexOf(e);
    if(idx>=0) enemies.splice(idx,1);
  }

  // ── State ──
  const input = { left:false, right:false };
  let jumpPressed = false;
  let attacking = false;
  let attackTimer = 0;
  let attackCooldown = 0;
  let lives = 5;
  let invuln = 1.5; // grace at start
  let score = 0;
  let elapsed = 0;
  let ended = false;
  let won = false;
  let bobT = 0;

  // ── UI ──
  function makeBtn(label: string, color: number): Container {
    const b = new Container();
    b.eventMode = "static";
    b.cursor = "pointer";
    const g = new Graphics();
    b.addChild(g);
    const t = new Text({ text: label, style: { fontFamily: FONT, fontWeight: "900", fontSize: 30, fill: 0xffffff } });
    t.anchor.set(0.5);
    b.addChild(t);
    (b as any)._g = g; (b as any)._t = t; (b as any)._color = color;
    return b;
  }
  function drawBtn(b: Container, w: number, h: number){
    const g = (b as any)._g as Graphics;
    g.clear();
    g.roundRect(0,0,w,h,14).fill({ color: (b as any)._color, alpha: 0.45 }).stroke({ color: 0xffffff, width: 2, alpha: 0.5 });
    const t = (b as any)._t as Text;
    t.position.set(w/2, h/2);
  }

  const btnLeft = makeBtn("◀", num(C.primary));
  const btnRight = makeBtn("▶", num(C.primary));
  const btnJump = makeBtn("JUMP", num(C.accent));
  const btnAttack = makeBtn("⚔", num(C.accent));
  uiLayer.addChild(btnLeft, btnRight, btnJump, btnAttack);

  btnLeft.on("pointerdown", ()=>{ input.left = true; });
  btnLeft.on("pointerup", ()=>{ input.left = false; });
  btnLeft.on("pointerupoutside", ()=>{ input.left = false; });
  btnRight.on("pointerdown", ()=>{ input.right = true; hideHint(); });
  btnRight.on("pointerup", ()=>{ input.right = false; });
  btnRight.on("pointerupoutside", ()=>{ input.right = false; });
  btnJump.on("pointerdown", ()=>{ jumpPressed = true; hideHint(); });
  btnAttack.on("pointerdown", ()=>{ startAttack(); });

  function startAttack(){
    if(attackCooldown>0 || attacking) return;
    attacking = true;
    attackTimer = 0.3;
    attackCooldown = 0.35;
    sfx("slash.wav");
    // slash arc VFX
    const dir = body.facing;
    slash.clear();
    const reach = hero.width*0.9;
    slash.arc(0,0,reach,-0.9,0.9).stroke({ color: num(C.accent), width: 8, alpha: 0.9 });
    slash.position.set(hero.x + dir*hero.width*0.3, hero.y - hero.height*0.5);
    slash.scale.x = dir;
    slash.alpha = 1;
    gsap.killTweensOf(slash);
    gsap.fromTo(slash, { rotation: dir>0 ? -0.6 : 0.6 }, { rotation: dir>0 ? 0.6 : -0.6, duration: 0.25, ease: "power2.out" });
    gsap.to(slash, { alpha: 0, duration: 0.3, delay: 0.05 });
  }

  // HUD top
  const hud = new Container();
  uiLayer.addChild(hud);
  const titleText = new Text({ text: cfg.copy.title, style: { fontFamily: FONT, fontWeight: "700", fontSize: 18, fill: num(C.text) } });
  const statText = new Text({ text: "", style: { fontFamily: FONT, fontWeight: "700", fontSize: 16, fill: num(C.text) } });
  const hearts = new Graphics();
  hud.addChild(titleText, statText, hearts);

  function drawHearts(){
    hearts.clear();
    for(let i=0;i<5;i++){
      const x = i*26;
      const col = i < lives ? num(C.accent) : 0x555555;
      hearts.circle(x+6, 6, 7).fill(col);
      hearts.circle(x+16, 6, 7).fill(col);
      hearts.moveTo(x-1, 9).lineTo(x+11, 24).lineTo(x+23, 9).fill(col);
    }
  }

  // Hint
  const hint = new Container();
  uiLayer.addChild(hint);
  const handG = new Graphics();
  handG.circle(0,0,16).fill(0xffffff).stroke({ color:0x000000, width:2 });
  hint.addChild(handG);
  const hintText = new Text({ text: "Tap to move & jump!", style: { fontFamily: FONT, fontWeight: "900", fontSize: 22, fill: 0xffffff, stroke: { color:0x000000, width:4 } } });
  hintText.anchor.set(0.5);
  hint.addChild(hintText);
  let hintActive = true;
  function hideHint(){ if(hintActive){ hintActive=false; gsap.to(hint, { alpha:0, duration:0.3, onComplete:()=>{ hint.visible=false; } }); } }

  // Sticky CTA
  const cta = new Container();
  cta.eventMode = "static";
  cta.cursor = "pointer";
  const ctaG = new Graphics();
  const ctaT = new Text({ text: cfg.copy.cta, style: { fontFamily: FONT, fontWeight: "900", fontSize: 24, fill: 0xffffff } });
  ctaT.anchor.set(0.5);
  cta.addChild(ctaG, ctaT);
  ctaLayer.addChild(cta);
  cta.on("pointerdown", ()=>{ window.FbPlayableAd.onCTAClick(); });

  // Endcard
  const endcard = new Container();
  endcard.visible = false;
  ctaLayer.addChild(endcard);
  const endBg = new Graphics();
  const endTitle = new Text({ text:"", style:{ fontFamily:FONT, fontWeight:"900", fontSize:40, fill:0xffffff, align:"center" } });
  endTitle.anchor.set(0.5);
  const endCta = new Container();
  endCta.eventMode = "static"; endCta.cursor = "pointer";
  const endCtaG = new Graphics();
  const endCtaT = new Text({ text: cfg.copy.cta, style:{ fontFamily:FONT, fontWeight:"900", fontSize:34, fill:0xffffff } });
  endCtaT.anchor.set(0.5);
  endCta.addChild(endCtaG, endCtaT);
  endcard.addChild(endBg, endTitle, endCta);
  endCta.on("pointerdown", ()=>{ window.FbPlayableAd.onCTAClick(); });

  // ── Layout ──
  function layout(){
    W = app.screen.width; H = app.screen.height;
    app.stage.hitArea = app.screen;
    groundY = H * 0.82;
    baseScale = Math.min(W,H) * 0.0020;
    layoutBg();

    hero.scale.set(baseScale);

    // goal
    goalG.clear();
    goalG.rect(WORLD_W-90, groundY - H*0.5, 6, H*0.5).fill({ color: num(C.accent), alpha:0.6 });
    goalDemon.scale.set(baseScale*1.8);
    goalDemon.position.set(WORLD_W-50, groundY);

    // buttons
    const bw = Math.max(72, W*0.14), bh = bw;
    const pad = 18;
    const by = H - bh - pad;
    btnLeft.position.set(pad, by); drawBtn(btnLeft, bw, bh);
    btnRight.position.set(pad + bw + 12, by); drawBtn(btnRight, bw, bh);
    btnAttack.position.set(W - bw - pad, by); drawBtn(btnAttack, bw, bh);
    btnJump.position.set(W - bw*2 - pad - 12, by); drawBtn(btnJump, bw, bh);

    // HUD
    titleText.position.set(12, 10);
    hearts.position.set(12, 36);
    drawHearts();
    statText.position.set(W - 140, 12);

    // hint
    hintText.position.set(W/2, H*0.4);
    hint.position.set(0,0);

    // sticky CTA bottom center
    const cw = Math.min(W*0.4, 280), ch = 52;
    ctaG.clear();
    ctaG.roundRect(-cw/2,-ch/2,cw,ch,12).fill({ color: num(C.accent), alpha:0.95 }).stroke({ color:0xffffff, width:2 });
    ctaT.position.set(0,0);
    cta.position.set(W/2, by + bh/2);

    // endcard
    endBg.clear();
    endBg.rect(0,0,W,H).fill({ color:0x000000, alpha:0.82 });
    endTitle.position.set(W/2, H*0.36);
    const ecw = Math.min(W*0.7, 360), ech = 72;
    endCtaG.clear();
    endCtaG.roundRect(-ecw/2,-ech/2,ecw,ech,16).fill({ color:num(C.accent) }).stroke({ color:0xffffff, width:3 });
    endCtaT.position.set(0,0);
    endCta.position.set(W/2, H*0.56);

    // dev hook
    (window as any).__btns = {
      left:  { x: pad, y: by, w: bw, h: bh },
      right: { x: pad+bw+12, y: by, w: bw, h: bh },
      jump:  { x: W-bw*2-pad-12, y: by, w: bw, h: bh },
      attack:{ x: W-bw-pad, y: by, w: bw, h: bh },
      cta:   { x: W/2-cw/2, y: by+bh/2-ch/2, w: cw, h: ch },
    };
  }
  layout();
  window.addEventListener("resize", layout);

  // hint hand animation
  gsap.to(handG, { alpha: 0.4, duration: 0.6, yoyo:true, repeat:-1 });
  function placeHand(){
    const b = (window as any).__btns;
    handG.position.set(b.right.x + b.right.w/2, b.right.y + b.right.h/2);
  }
  placeHand();
  // alternate hand between right and jump
  let handTL = gsap.timeline({ repeat:-1 });

  // ── End game ──
  function endGame(winFlag: boolean){
    if(ended) return;
    ended = true; won = winFlag;
    input.left = input.right = false;
    endcard.visible = true;
    endcard.alpha = 0;
    endTitle.text = winFlag ? "You Survived!" : "Night's End";
    cta.visible = false;
    gsap.to(endcard, { alpha:1, duration:0.4 });
    gsap.fromTo(endCta.scale, { x:0.8,y:0.8 }, { x:1,y:1, duration:0.6, yoyo:true, repeat:-1, ease:"sine.inOut" });
  }

  function doWin(){
    if(ended) return;
    // slow-mo win beat
    gsap.to(app.ticker, { speed: 0.35, duration: 0.3 });
    setTimeout(()=>{ gsap.to(app.ticker, { speed: 1, duration: 0.2 }); endGame(true); }, 700);
  }

  // ── Tick ──
  app.ticker.add(()=>{
    const dt = Math.min(0.05, app.ticker.deltaMS/1000);
    if(ended) return;

    elapsed += dt;
    if(invuln>0) invuln -= dt;
    if(attackCooldown>0) attackCooldown -= dt;
    if(attacking){ attackTimer -= dt; if(attackTimer<=0) attacking=false; }

    // input → body
    body.setMove(input.right ? 1 : (input.left ? -1 : 0));
    if(jumpPressed){ if(body.grounded){ sfx("jump.wav"); } body.jump(); jumpPressed=false; }
    const wasGrounded = body.grounded;
    body.update(dt);

    // landing squash
    if(!wasGrounded && body.grounded){
      gsap.fromTo(hero.scale, { y: baseScale*0.7 }, { y: baseScale, duration: 0.25, ease: "back.out(2)" });
    }

    // hero placement + animation state
    hero.x = body.x;
    let by2 = body.y;
    let rot = 0;
    if(body.grounded && (input.left||input.right)){
      bobT += dt*12;
      by2 += Math.sin(bobT)*4;
      rot = Math.sin(bobT)*0.04;
    } else { bobT = 0; }
    hero.y = by2;
    hero.rotation = rot;
    hero.scale.x = baseScale * body.facing;

    let texKey = "hero_idle.webp";
    if(attacking) texKey = "hero_attack.webp";
    else if(!body.grounded) texKey = "hero_jump.webp";
    else if(input.left||input.right) texKey = "hero_run.webp";
    if(hero.texture !== tex[texKey]) hero.texture = tex[texKey];

    // camera
    const worldScroll = Math.max(0, Math.min(WORLD_W - W, body.x - W*0.4));
    world.x = -worldScroll;
    // light parallax: shift bg cover slightly
    bg.x = W/2 - worldScroll*0.06;

    // spawning
    spawnTimer -= dt;
    if(spawnTimer<=0 && body.x < WORLD_W - W*0.6){
      spawnEnemy();
      spawnTimer = diff.spawnWaitSec();
    }

    // enemies update
    const reachX = hero.width*0.8;
    const reachY = hero.height;
    for(let i=enemies.length-1;i>=0;i--){
      const e = enemies[i];
      if(!e.alive) continue;
      e.mover.update(dt);
      e.spr.x = e.mover.x;
      e.spr.y = groundY;

      // attack hit test (every tick during swing)
      if(attacking){
        const dir = body.facing;
        const front = body.x + dir*reachX*0.5;
        const dx = e.spr.x - front;
        if(Math.abs(dx) < reachX && Math.abs((e.spr.y - e.spr.height*0.5) - (hero.y - hero.height*0.5)) < reachY){
          // ensure it's in front
          if((dir>0 && e.spr.x > body.x - reachX*0.3) || (dir<0 && e.spr.x < body.x + reachX*0.3)){
            killEnemy(e);
            continue;
          }
        }
      }

      // enemy touched hero
      if(invuln<=0){
        const ddx = Math.abs(e.spr.x - body.x);
        if(ddx < hero.width*0.45){
          // hurt
          lives = Math.max(0, lives-1);
          invuln = 1.0;
          drawHearts();
          sfx("hurt.wav");
          diff.recordMiss();
          // red flash
          const flash = new Graphics();
          flash.rect(0,0,W,H).fill({ color:0xff0000, alpha:0.35 });
          uiLayer.addChild(flash);
          gsap.to(flash, { alpha:0, duration:0.4, onComplete:()=>{ if(flash.parent) flash.parent.removeChild(flash); flash.destroy(); } });
          // shake
          gsap.fromTo(app.stage, { x: -10 }, { x: 0, duration: 0.3, ease:"elastic.out(2,0.3)" });
          // knock enemy back a touch
          e.mover.x += dir2(e.spr.x, body.x)*40;
        }
      }
    }

    // win check
    if(body.x >= WORLD_W - 110){ doWin(); }

    // timer end
    if(elapsed >= 27){ endGame(true); }

    // HUD
    const dist = Math.min(100, Math.round((body.x / (WORLD_W-110))*100));
    statText.text = `Kills ${score}  ${dist}%`;
  });

  function dir2(a: number, b: number){ return a >= b ? 1 : -1; }

  (window as any).__hero = hero;
}
void main();
