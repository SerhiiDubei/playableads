import { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { gsap } from "gsap";
import type { PlayableConfig } from "../../src/types.js";

declare const __PLAYABLE_CONFIG__: PlayableConfig;
const cfg: PlayableConfig = __PLAYABLE_CONFIG__;

const SEGMENTS = Number(cfg.params.ropeSegments ?? 16);
const CORD = String(cfg.params.cordColor ?? "#e23b3b");

function num(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

// Decode a base64 data URI into a Pixi texture without the Assets loader
// (no fetch, no network — data URIs are inline).
async function loadTexture(dataUri: string): Promise<Texture> {
  const img = new Image();
  img.src = dataUri;
  await img.decode();
  return Texture.from(img);
}

interface Point {
  x: number;
  y: number;
  px: number;
  py: number;
  pinned: boolean;
}

async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: num(cfg.style.colors.background),
    antialias: true,
  });
  document.body.appendChild(app.canvas);
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  const root = new Container();
  app.stage.addChild(root);

  const title = new Text({
    text: cfg.copy.title,
    style: {
      fill: cfg.style.colors.text,
      fontFamily: cfg.style.font.family,
      fontWeight: "bold",
      fontSize: 56,
      align: "center",
    },
  });
  title.anchor.set(0.5);
  root.addChild(title);

  // Rope is drawn under the sprites.
  const ropeGfx = new Graphics();
  root.addChild(ropeGfx);

  const socketTex = await loadTexture(cfg.assets["socket.webp"]);
  const plugTex = await loadTexture(cfg.assets["plug.webp"]);

  const socket = new Sprite(socketTex);
  socket.anchor.set(0.5);
  root.addChild(socket);

  const plug = new Sprite(plugTex);
  plug.anchor.set(0.5);
  plug.eventMode = "static";
  plug.cursor = "grab";
  root.addChild(plug);

  // Verlet rope: point[0] pinned at a fixed anchor, last point follows the plug.
  const rope: Point[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    rope.push({ x: 0, y: 0, px: 0, py: 0, pinned: i === 0 });
  }

  // CTA (hidden until connected).
  const cta = new Container();
  const ctaBg = new Graphics().roundRect(-180, -44, 360, 88, 44).fill({ color: cfg.style.colors.accent });
  const ctaText = new Text({
    text: cfg.copy.cta,
    style: { fill: cfg.style.colors.background, fontFamily: cfg.style.font.family, fontWeight: "bold", fontSize: 40 },
  });
  ctaText.anchor.set(0.5);
  cta.addChild(ctaBg, ctaText);
  cta.visible = false;
  cta.eventMode = "static";
  cta.cursor = "pointer";
  cta.on("pointertap", () => window.FbPlayableAd.onCTAClick());
  root.addChild(cta);

  let anchor = { x: 0, y: 0 };
  let socketTarget = { x: 0, y: 0 };
  let snapRadius = 80;
  let connected = false;
  let dragging = false;

  function layout(): void {
    const w = app.screen.width;
    const h = app.screen.height;
    title.position.set(w / 2, h * 0.1);

    socket.width = w * 0.34;
    socket.scale.y = socket.scale.x;
    socket.position.set(w * 0.72, h * 0.42);

    plug.width = w * 0.24;
    plug.scale.y = plug.scale.x;

    snapRadius = w * 0.13;
    // Where the plug must land to "connect" (just left of the socket face).
    socketTarget = { x: socket.x - socket.width * 0.32, y: socket.y };
    // The cable enters from the bottom-left corner.
    anchor = { x: w * 0.12, y: h * 0.9 };

    cta.position.set(w / 2, h * 0.82);

    if (!connected && !dragging) {
      plug.position.set(w * 0.3, h * 0.7);
      resetRope();
    }
  }

  function resetRope(): void {
    for (let i = 0; i < SEGMENTS; i++) {
      const t = i / (SEGMENTS - 1);
      const x = anchor.x + (plug.x - anchor.x) * t;
      const y = anchor.y + (plug.y - anchor.y) * t;
      rope[i].x = rope[i].px = x;
      rope[i].y = rope[i].py = y;
    }
  }

  function simulateRope(): void {
    const gravity = 0.6;
    // Integrate.
    for (const p of rope) {
      if (p.pinned) continue;
      const vx = (p.x - p.px) * 0.98;
      const vy = (p.y - p.py) * 0.98;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy + gravity;
    }
    // Pin endpoints.
    rope[0].x = anchor.x;
    rope[0].y = anchor.y;
    rope[SEGMENTS - 1].x = plug.x;
    rope[SEGMENTS - 1].y = plug.y;
    // Satisfy distance constraints.
    const total = Math.hypot(plug.x - anchor.x, plug.y - anchor.y);
    const segLen = Math.max(total / (SEGMENTS - 1), 6) * 1.04;
    for (let iter = 0; iter < 12; iter++) {
      for (let i = 0; i < SEGMENTS - 1; i++) {
        const a = rope[i];
        const b = rope[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const diff = (segLen - dist) / dist / 2;
        const ox = dx * diff;
        const oy = dy * diff;
        if (i !== 0) {
          a.x -= ox;
          a.y -= oy;
        }
        if (i + 1 !== SEGMENTS - 1) {
          b.x += ox;
          b.y += oy;
        }
      }
      rope[0].x = anchor.x;
      rope[0].y = anchor.y;
      rope[SEGMENTS - 1].x = plug.x;
      rope[SEGMENTS - 1].y = plug.y;
    }
  }

  function drawRope(): void {
    ropeGfx.clear();
    ropeGfx.moveTo(rope[0].x, rope[0].y);
    for (let i = 1; i < SEGMENTS; i++) ropeGfx.lineTo(rope[i].x, rope[i].y);
    ropeGfx.stroke({ width: Math.max(8, app.screen.width * 0.02), color: num(CORD), cap: "round", join: "round" });
  }

  // Dragging.
  plug.on("pointerdown", () => {
    if (connected) return;
    dragging = true;
    plug.cursor = "grabbing";
  });
  app.stage.on("pointermove", (e) => {
    if (!dragging || connected) return;
    plug.position.set(e.global.x, e.global.y);
    if (Math.hypot(plug.x - socketTarget.x, plug.y - socketTarget.y) < snapRadius) connect();
  });
  app.stage.on("pointerup", () => {
    dragging = false;
    plug.cursor = "grab";
  });
  app.stage.on("pointerupoutside", () => {
    dragging = false;
  });

  function connect(): void {
    if (connected) return;
    connected = true;
    dragging = false;
    gsap.to(plug, { x: socketTarget.x, y: socketTarget.y, duration: 0.25, ease: "back.out(2)" });
    spark(socketTarget.x, socketTarget.y);
    cta.visible = true;
    cta.scale.set(0);
    gsap.to(cta.scale, { x: 1, y: 1, duration: 0.5, ease: "back.out(1.6)", delay: 0.15 });
    gsap.to(cta, { y: cta.y - 6, duration: 0.7, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }

  function spark(x: number, y: number): void {
    for (let i = 0; i < 10; i++) {
      const s = new Graphics().circle(0, 0, 6).fill({ color: cfg.style.colors.accent });
      s.position.set(x, y);
      root.addChild(s);
      const ang = (i / 10) * Math.PI * 2;
      gsap.to(s, {
        x: x + Math.cos(ang) * 120,
        y: y + Math.sin(ang) * 120,
        alpha: 0,
        duration: 0.6,
        ease: "power2.out",
        onComplete: () => s.destroy(),
      });
    }
  }

  app.ticker.add(() => {
    simulateRope();
    drawRope();
  });

  layout();
  resetRope();
  window.addEventListener("resize", layout);
}

void main();
