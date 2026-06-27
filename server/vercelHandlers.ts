import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { applyAction, applyTimeProgress, derivePublicState, GameRuleError } from "../shared/game.js";
import type { GameAction } from "../shared/types.js";
import { KvPlayerStore } from "./kvStore.js";

const SESSION_COOKIE = "xiuxian_sid";
const store = new KvPlayerStore();

export async function handleState(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (handleOptions(request, response)) return;

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  applyCors(request, response);
  const now = Date.now();
  const sessionId = ensureSession(request, response);
  const player = await store.getOrCreateBySession(sessionId, now);
  applyTimeProgress(player, now);
  await store.save(sessionId, player);
  sendJson(response, 200, derivePublicState(player, now));
}

export async function handleAction(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (handleOptions(request, response)) return;

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  applyCors(request, response);
  const now = Date.now();
  const sessionId = ensureSession(request, response);
  const body = await readJsonBody<{ action?: GameAction }>(request);
  const action = body.action;

  if (!action?.type) {
    sendJson(response, 400, { error: "缺少操作类型。" });
    return;
  }

  if (action.type === "logout") {
    await store.deleteBySession(sessionId);
    clearSession(response);
    sendJson(response, 200, { ok: true });
    return;
  }

  try {
    const player = await store.getOrCreateBySession(sessionId, now);
    const result = applyAction(player, action, now);
    await store.save(sessionId, result.player);
    sendJson(response, 200, derivePublicState(result.player, now, result.lastBattle));
  } catch (error) {
    if (error instanceof GameRuleError) {
      sendJson(response, 409, { error: error.message });
      return;
    }
    console.error(error);
    sendJson(response, 500, { error: "服务器内部错误。" });
  }
}

function ensureSession(request: IncomingMessage, response: ServerResponse): string {
  const headerSession = request.headers["x-xiuxian-session"];
  const sessionFromHeader = Array.isArray(headerSession) ? headerSession[0] : headerSession;
  if (sessionFromHeader && /^[a-f0-9-]{20,}$/i.test(sessionFromHeader)) {
    response.setHeader("X-Xiuxian-Session", sessionFromHeader);
    return sessionFromHeader;
  }

  const cookies = parseCookies(request.headers.cookie);
  const existing = cookies[SESSION_COOKIE];
  if (existing && /^[a-f0-9-]{20,}$/i.test(existing)) {
    response.setHeader("X-Xiuxian-Session", existing);
    return existing;
  }

  const sessionId = randomUUID();
  response.setHeader("X-Xiuxian-Session", sessionId);
  appendSetCookie(
    response,
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Max-Age=${365 * 24 * 60 * 60}; Path=/; HttpOnly; SameSite=Lax; Secure`,
  );
  return sessionId;
}

function clearSession(response: ServerResponse): void {
  appendSetCookie(response, `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure`);
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

function appendSetCookie(response: ServerResponse, cookie: string): void {
  const existing = response.getHeader("Set-Cookie");
  if (!existing) {
    response.setHeader("Set-Cookie", cookie);
  } else if (Array.isArray(existing)) {
    response.setHeader("Set-Cookie", [...existing, cookie]);
  } else {
    response.setHeader("Set-Cookie", [String(existing), cookie]);
  }
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? (JSON.parse(raw) as T) : ({} as T);
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function handleOptions(request: IncomingMessage, response: ServerResponse): boolean {
  if (request.method !== "OPTIONS") return false;
  applyCors(request, response);
  response.statusCode = 204;
  response.end();
  return true;
}

function applyCors(request: IncomingMessage, response: ServerResponse): void {
  const origin = request.headers.origin;
  if (!origin) return;

  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Xiuxian-Session");
  response.setHeader("Access-Control-Expose-Headers", "X-Xiuxian-Session");
  response.setHeader("Vary", "Origin");
}
