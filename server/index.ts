import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { applyAction, applyTimeProgress, derivePublicState, GameRuleError } from "../shared/game.js";
import type { GameAction } from "../shared/types.js";
import { PlayerStore } from "./store.js";

const SESSION_COOKIE = "xiuxian_sid";
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const port = Number(process.env.PORT ?? 5173);
const isProduction = process.env.NODE_ENV === "production";

const app = express();
const store = new PlayerStore(process.env.GAME_DB_PATH);

app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));

app.get("/api/state", (request, response) => {
  const now = Date.now();
  const sessionId = ensureSession(request, response);
  const player = store.getOrCreateBySession(sessionId, now);
  applyTimeProgress(player, now);
  store.save(sessionId, player, now);
  response.json(derivePublicState(player, now));
});

app.post("/api/action", (request, response) => {
  const now = Date.now();
  const sessionId = ensureSession(request, response);
  const action = request.body?.action as GameAction | undefined;
  if (!action?.type) {
    response.status(400).json({ error: "缺少操作类型。" });
    return;
  }

  if (action.type === "logout") {
    store.deleteBySession(sessionId);
    response.clearCookie(SESSION_COOKIE, { path: "/" });
    response.json({ ok: true });
    return;
  }

  try {
    const player = store.getOrCreateBySession(sessionId, now);
    const result = applyAction(player, action, now);
    store.save(sessionId, result.player, now);
    response.json(derivePublicState(result.player, now, result.lastBattle));
  } catch (error) {
    if (error instanceof GameRuleError) {
      response.status(409).json({ error: error.message });
      return;
    }
    console.error(error);
    response.status(500).json({ error: "服务器内部错误。" });
  }
});

if (isProduction) {
  const distPath = resolve(root, "dist");
  if (existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("*", (_request, response) => response.sendFile(resolve(distPath, "index.html")));
  }
} else {
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

app.listen(port, () => {
  console.log(`《今生我要修成仙》H5 server listening on http://localhost:${port}`);
});

function ensureSession(request: Request, response: Response): string {
  const cookies = parseCookies(request.headers.cookie);
  const existing = cookies[SESSION_COOKIE];
  if (existing && /^[a-f0-9-]{20,}$/i.test(existing)) {
    return existing;
  }

  const sessionId = randomUUID();
  response.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 365 * 24 * 60 * 60 * 1000,
  });
  return sessionId;
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").flatMap((part) => {
      const index = part.indexOf("=");
      if (index === -1) return [];
      const key = part.slice(0, index).trim();
      const value = decodeURIComponent(part.slice(index + 1).trim());
      return [[key, value]];
    }),
  );
}
