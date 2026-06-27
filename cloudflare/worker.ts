import { Redis } from "@upstash/redis/cloudflare";
import { applyAction, applyTimeProgress, createPlayer, derivePublicState, GameRuleError } from "../shared/game.js";
import type { GameAction, PlayerState } from "../shared/types.js";

interface Env {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  KV_REST_API_TOKEN: string;
  KV_REST_API_URL: string;
}

const SESSION_COOKIE = "xiuxian_sid";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (url.pathname === "/api/state") {
      return handleState(request, env);
    }

    if (url.pathname === "/api/action") {
      return handleAction(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleState(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const redis = makeRedis(env);
  const now = Date.now();
  const { sessionId, headers } = ensureSession(request);
  applyCors(request, headers);
  const player = await getOrCreatePlayer(redis, sessionId, now);
  applyTimeProgress(player, now);
  await savePlayer(redis, sessionId, player);
  return json(derivePublicState(player, now), 200, headers);
}

async function handleAction(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const redis = makeRedis(env);
  const now = Date.now();
  const { sessionId, headers } = ensureSession(request);
  applyCors(request, headers);
  const body = (await request.json().catch(() => ({}))) as { action?: GameAction };
  const action = body.action;

  if (!action?.type) {
    return json({ error: "缺少操作类型。" }, 400, headers);
  }

  if (action.type === "logout") {
    await redis.del(playerKey(sessionId));
    headers.append("Set-Cookie", `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure`);
    return json({ ok: true }, 200, headers);
  }

  try {
    const player = await getOrCreatePlayer(redis, sessionId, now);
    const result = applyAction(player, action, now);
    await savePlayer(redis, sessionId, result.player);
    return json(derivePublicState(result.player, now, result.lastBattle), 200, headers);
  } catch (error) {
    if (error instanceof GameRuleError) {
      return json({ error: error.message }, 409, headers);
    }
    console.error(error);
    return json({ error: "服务器内部错误。" }, 500, headers);
  }
}

function makeRedis(env: Env): Redis {
  if (!env.KV_REST_API_URL || !env.KV_REST_API_TOKEN) {
    throw new Error("缺少 Upstash KV 环境变量。");
  }
  return new Redis({
    url: env.KV_REST_API_URL,
    token: env.KV_REST_API_TOKEN,
  });
}

async function getOrCreatePlayer(redis: Redis, sessionId: string, now: number): Promise<PlayerState> {
  const value = await redis.get<string | PlayerState>(playerKey(sessionId));

  if (typeof value === "string") {
    return JSON.parse(value) as PlayerState;
  }

  if (value && typeof value === "object") {
    return value as PlayerState;
  }

  const player = createPlayer(crypto.randomUUID(), now);
  await savePlayer(redis, sessionId, player);
  return player;
}

async function savePlayer(redis: Redis, sessionId: string, player: PlayerState): Promise<void> {
  await redis.set(playerKey(sessionId), JSON.stringify(player));
}

function playerKey(sessionId: string): string {
  return `xiuxian:player:${sessionId}`;
}

function ensureSession(request: Request): { sessionId: string; headers: Headers } {
  const headers = new Headers();
  const headerSession = request.headers.get("X-Xiuxian-Session");
  if (headerSession && /^[a-f0-9-]{20,}$/i.test(headerSession)) {
    headers.set("X-Xiuxian-Session", headerSession);
    return { sessionId: headerSession, headers };
  }

  const existing = parseCookies(request.headers.get("Cookie"))[SESSION_COOKIE];
  if (existing && /^[a-f0-9-]{20,}$/i.test(existing)) {
    headers.set("X-Xiuxian-Session", existing);
    return { sessionId: existing, headers };
  }

  const sessionId = crypto.randomUUID();
  headers.set("X-Xiuxian-Session", sessionId);
  headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Max-Age=${365 * 24 * 60 * 60}; Path=/; HttpOnly; SameSite=Lax; Secure`,
  );
  return { sessionId, headers };
}

function parseCookies(header: string | null): Record<string, string> {
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

function json(payload: unknown, status: number, headers = new Headers()): Response {
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload), { status, headers });
}

function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  applyCors(request, headers);
  return headers;
}

function applyCors(request: Request, headers: Headers): void {
  const origin = request.headers.get("Origin");
  if (!origin) return;

  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, X-Xiuxian-Session");
  headers.set("Access-Control-Expose-Headers", "X-Xiuxian-Session");
  headers.set("Vary", "Origin");
}
