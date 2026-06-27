import type { GameAction, PublicGameState } from "../../shared/types";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const SESSION_STORAGE_KEY = "xiuxian_session_id";

export async function fetchGameState(): Promise<PublicGameState> {
  const response = await fetch(apiUrl("/api/state"), {
    credentials: shouldUseCookies() ? "include" : "omit",
    headers: sessionHeaders(),
  });
  return readJson(response);
}

export async function sendGameAction(action: GameAction): Promise<PublicGameState | { ok: true }> {
  const response = await fetch(apiUrl("/api/action"), {
    method: "POST",
    credentials: shouldUseCookies() ? "include" : "omit",
    headers: { "Content-Type": "application/json", ...sessionHeaders() },
    body: JSON.stringify({ action }),
  });
  return readJson(response);
}

async function readJson<T>(response: Response): Promise<T> {
  rememberSession(response);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "请求失败");
  }
  return payload as T;
}

function apiUrl(path: string): string {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

function shouldUseCookies(): boolean {
  if (!API_BASE_URL) return true;
  return new URL(API_BASE_URL, window.location.href).origin === window.location.origin;
}

function sessionHeaders(): Record<string, string> {
  if (shouldUseCookies()) return {};
  const sessionId = window.localStorage.getItem(SESSION_STORAGE_KEY);
  return sessionId ? { "X-Xiuxian-Session": sessionId } : {};
}

function rememberSession(response: Response): void {
  if (shouldUseCookies()) return;
  const sessionId = response.headers.get("X-Xiuxian-Session");
  if (sessionId) {
    window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  }
}
