import type { Card } from "./types";

export class ApiError extends Error {
  status: number;
  code: string;
  task?: Card;
  prompt?: { field: string; input: string };

  constructor(status: number, body: Record<string, unknown>) {
    super(String(body.message ?? `HTTP ${status}`));
    this.status = status;
    this.code = String(body.code ?? "http_error");
    this.task = body.task as Card | undefined;
    this.prompt = body.prompt as { field: string; input: string } | undefined;
  }
}

let reauthStarted = false;

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    // The API never redirects, so any redirect is an auth boundary (e.g.
    // Authentik forward-auth session expiry) sending us to a cross-origin
    // login page that fetch() cannot follow. Detect it and re-enter the
    // login flow with a full navigation instead of surfacing a CORS error.
    redirect: "manual",
  });
  if (res.type === "opaqueredirect") {
    if (!reauthStarted && navigator.onLine) {
      reauthStarted = true;
      window.location.assign(
        "/outpost.goauthentik.io/start?rd=" + encodeURIComponent(window.location.href),
      );
    }
    throw new ApiError(401, { code: "unauthorized", message: "Signing in again…" });
  }
  const text = await res.text();
  let json: Record<string, unknown> = {};
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { message: text.slice(0, 200) };
    }
  }
  if (!res.ok) {
    throw new ApiError(res.status, json);
  }
  return json as T;
}
