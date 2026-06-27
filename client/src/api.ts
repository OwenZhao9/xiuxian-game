import {
  applyAction,
  applyTimeProgress,
  createPlayer,
  derivePublicState,
  GameRuleError,
} from "../../shared/game";
import type { GameAction, PlayerState, PublicGameState } from "../../shared/types";

const SESSION_STORAGE_KEY = "xiuxian_session_id";
const ACTIVE_API_BASE_STORAGE_KEY = "xiuxian_api_base_url";
const STATIC_PREVIEW_STORAGE_KEY = "xiuxian_static_preview_player";
const REQUEST_TIMEOUT_MS = 5000;
const API_BASE_URLS = parseApiBaseUrls(import.meta.env.VITE_API_BASE_URL ?? "");
const STATIC_PREVIEW = import.meta.env.VITE_STATIC_PREVIEW === "1";

export async function fetchGameState(): Promise<PublicGameState> {
  if (STATIC_PREVIEW) {
    return fetchStaticPreviewState();
  }

  return requestJson<PublicGameState>("/api/state", {
    method: "GET",
  });
}

export async function sendGameAction(action: GameAction): Promise<PublicGameState | { ok: true }> {
  if (STATIC_PREVIEW) {
    return sendStaticPreviewAction(action);
  }

  return requestJson<PublicGameState | { ok: true }>("/api/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

async function fetchStaticPreviewState(): Promise<PublicGameState> {
  const now = Date.now();
  const player = loadStaticPreviewPlayer(now);
  applyTimeProgress(player, now);
  saveStaticPreviewPlayer(player);
  return derivePublicState(player, now);
}

async function sendStaticPreviewAction(action: GameAction): Promise<PublicGameState | { ok: true }> {
  if (action.type === "logout") {
    window.localStorage.removeItem(STATIC_PREVIEW_STORAGE_KEY);
    return { ok: true };
  }

  const now = Date.now();
  const player = loadStaticPreviewPlayer(now);
  try {
    const result = applyAction(player, action, now);
    saveStaticPreviewPlayer(result.player);
    return derivePublicState(result.player, now, result.lastBattle);
  } catch (error) {
    if (error instanceof GameRuleError) {
      throw new Error(error.message);
    }
    throw error;
  }
}

function loadStaticPreviewPlayer(now: number): PlayerState {
  const raw = window.localStorage.getItem(STATIC_PREVIEW_STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as PlayerState;
    } catch {
      window.localStorage.removeItem(STATIC_PREVIEW_STORAGE_KEY);
    }
  }

  const player = createPlayer(crypto.randomUUID(), now);
  saveStaticPreviewPlayer(player);
  return player;
}

function saveStaticPreviewPlayer(player: PlayerState): void {
  window.localStorage.setItem(STATIC_PREVIEW_STORAGE_KEY, JSON.stringify(player));
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const bases = apiCandidates();
  const failures: string[] = [];

  for (const baseUrl of bases) {
    try {
      const response = await fetchWithTimeout(apiUrl(baseUrl, path), {
        ...init,
        credentials: shouldUseCookies(baseUrl) ? "include" : "omit",
        headers: { ...headersToRecord(init.headers), ...sessionHeaders(baseUrl) },
      });
      const payload = await readJson(response);

      if (!response.ok) {
        throw new ApiResponseError(payload.error ?? `请求失败 (${response.status})`);
      }

      rememberApiBase(baseUrl);
      rememberSession(baseUrl, response);
      return payload as T;
    } catch (error) {
      if (error instanceof ApiResponseError) throw error;
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  const message = failures[0] ?? "未知网络错误";
  throw new Error(`无法连接服务器，请检查网络后重试。${message ? ` (${message})` : ""}`);
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function readJson(response: Response): Promise<{ error?: string; [key: string]: unknown }> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return typeof payload === "object" && payload ? payload as { error?: string; [key: string]: unknown } : {};
  }
  return payload as { [key: string]: unknown };
}

function parseApiBaseUrls(value: string): string[] {
  return value
    .split(",")
    .map((baseUrl) => baseUrl.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function apiCandidates(): string[] {
  if (API_BASE_URLS.length === 0) return [""];
  const active = window.localStorage.getItem(ACTIVE_API_BASE_STORAGE_KEY);
  if (!active || !API_BASE_URLS.includes(active)) return API_BASE_URLS;
  return [active, ...API_BASE_URLS.filter((baseUrl) => baseUrl !== active)];
}

function apiUrl(baseUrl: string, path: string): string {
  return baseUrl ? `${baseUrl}${path}` : path;
}

function shouldUseCookies(baseUrl: string): boolean {
  if (!baseUrl) return true;
  return new URL(baseUrl, window.location.href).origin === window.location.origin;
}

function sessionHeaders(baseUrl: string): Record<string, string> {
  if (shouldUseCookies(baseUrl)) return {};
  const sessionId = window.localStorage.getItem(SESSION_STORAGE_KEY);
  return sessionId ? { "X-Xiuxian-Session": sessionId } : {};
}

function rememberSession(baseUrl: string, response: Response): void {
  if (shouldUseCookies(baseUrl)) return;
  const sessionId = response.headers.get("X-Xiuxian-Session");
  if (sessionId) {
    window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  }
}

function rememberApiBase(baseUrl: string): void {
  if (!baseUrl) return;
  window.localStorage.setItem(ACTIVE_API_BASE_STORAGE_KEY, baseUrl);
}

function headersToRecord(headers: RequestInit["headers"]): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers;
}

class ApiResponseError extends Error {}
