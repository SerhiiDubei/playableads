// Designer Studio — a tiny local web UI over the existing pipeline (epic: UI).
// Zero deps (node:http). Wraps already-tested modules: summarize (B), mechanics
// catalog (D), and serves built playables for live preview.
//
//   npm run studio   → http://localhost:4321
//
// API:
//   GET  /                 → the studio page
//   GET  /api/mechanics    → catalog (user mode) + whether a preview exists
//   POST /api/summarize    → { prompt } → top-3 + superbutton
//   POST /api/brief        → { prompt, refs[], style? } → { id, version }
//   GET  /playable/<id>    → built HTML from out/<id>.html (iframe preview)

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { listMechanics, listDrafts } from "../assetgen/mechanics.js";
import { summarizeBrief } from "../assetgen/brief/summarize.js";
import { createBrief } from "../assetgen/brief/store.js";
import { scaffoldMechanic, isValidMechanicId } from "../assetgen/scaffold.js";
import { agentTurn, type MechanicBrief } from "./agent.js";

const PORT = Number(process.env.STUDIO_PORT ?? 4321);
const UI = path.join(import.meta.dirname, "ui.html");
const UI_V2 = path.join(import.meta.dirname, "ui-v2.html");

// Latin kebab slug from a human name. Non-latin (Cyrillic) chars are dropped;
// returns "" if nothing usable remains (caller errors with a hint).
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().split(/\s+/).filter(Boolean).slice(0, 6).join("-").replace(/-+/g, "-");
}

function json(res: import("node:http").ServerResponse, code: number, body: unknown): void {
  const s = JSON.stringify(body);
  res.writeHead(code, { "content-type": "application/json", "content-length": Buffer.byteLength(s) });
  res.end(s);
}

async function readBody(req: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const p = url.pathname;

    if (req.method === "GET" && p === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(await readFile(UI, "utf8"));
      return;
    }

    if (req.method === "GET" && p === "/v2") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(await readFile(UI_V2, "utf8"));
      return;
    }

    if (req.method === "GET" && p === "/api/mechanics") {
      const mechs = await listMechanics("user");
      return json(res, 200, mechs.map((m) => ({
        id: m.id, name: m.name, description: m.description,
        hasPreview: existsSync(path.join("out", `${m.id}.html`)),
      })));
    }

    if (req.method === "GET" && p === "/api/drafts") {
      return json(res, 200, listDrafts().map((m) => ({ id: m.id, name: m.name, description: m.description, draft: true })));
    }

    if (req.method === "POST" && p === "/api/scaffold") {
      const b = (await readBody(req)) as { id?: string; name?: string; description?: string };
      // Auto-slug: designers type a human name; id is derived (kebab). Explicit
      // valid id wins; otherwise slugify name (or the id field) to latin kebab.
      const id = b.id && isValidMechanicId(b.id) ? b.id : slug(b.name || b.id || "");
      if (!id) return json(res, 400, { error: "дай назву з латинськими літерами (для id)" });
      try {
        const r = scaffoldMechanic({ id, name: b.name || id, description: b.description });
        return json(res, 200, { id: r.id, dir: r.dir });
      } catch (e) {
        return json(res, 409, { error: (e as Error).message });
      }
    }

    if (req.method === "POST" && p === "/api/agent") {
      const b = (await readBody(req)) as { text?: string; brief?: MechanicBrief };
      if (!b.text) return json(res, 400, { error: "text required" });
      try {
        const turn = await agentTurn(b.text, b.brief ?? {});
        return json(res, 200, turn);
      } catch (e) {
        return json(res, 500, { error: (e as Error).message });
      }
    }

    if (req.method === "POST" && p === "/api/summarize") {
      const { prompt } = (await readBody(req)) as { prompt?: string };
      if (!prompt) return json(res, 400, { error: "prompt required" });
      return json(res, 200, await summarizeBrief(prompt));
    }

    if (req.method === "POST" && p === "/api/brief") {
      const b = (await readBody(req)) as { prompt?: string; refs?: string[]; style?: string };
      if (!b.prompt || !b.refs?.length) return json(res, 400, { error: "prompt + ≥1 ref required" });
      const saved = createBrief({ prompt: b.prompt, refs: b.refs, style: b.style }, new Date().toISOString());
      return json(res, 200, { id: saved.id, version: saved.version });
    }

    if (req.method === "GET" && p.startsWith("/playable/")) {
      const id = p.slice("/playable/".length).replace(/[^a-z0-9-]/gi, "");
      const file = path.join("out", `${id}.html`);
      if (!existsSync(file)) return json(res, 404, { error: `no built playable for "${id}"` });
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(await readFile(file, "utf8"));
      return;
    }

    json(res, 404, { error: "not found" });
  } catch (e) {
    json(res, 500, { error: (e as Error)?.message ?? String(e) });
  }
});

server.listen(PORT, () => {
  console.log(`🎨 Designer Studio → http://localhost:${PORT}`);
});
