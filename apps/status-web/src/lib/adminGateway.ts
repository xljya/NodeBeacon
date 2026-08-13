import { toast } from "sonner";
import {
  getLoginPath,
  sanitizeNextPath,
  withAdminBase,
} from "./adminPaths.ts";

export class AdminGatewayError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AdminGatewayError";
    this.status = status;
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAdminErrorBody(status: number, body: unknown): AdminGatewayError {
  const payload = isRecord(body) ? body : {};
  const error = isRecord(payload.error) ? payload.error : {};
  const message =
    (typeof error.message === "string" && error.message) ||
    (typeof payload.message === "string" && payload.message) ||
    `${status} request failed`;
  const code = typeof error.code === "string" ? error.code : undefined;
  return new AdminGatewayError(message, status, code);
}

export function valueOr<T>(value: T | null | undefined, fallback: T): T {
  return value === null || value === undefined ? fallback : value;
}

function currentLocation(): string {
  if (typeof window === "undefined") return "/admin/dashboard";
  return `${window.location.pathname}${window.location.search}`;
}

function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const next = sanitizeNextPath(currentLocation());
  const login = `${getLoginPath()}?next=${encodeURIComponent(next)}`;
  if (`${window.location.pathname}${window.location.search}` === login) return;
  window.location.assign(login);
}

function redirectToForbidden(): void {
  if (typeof window === "undefined") return;
  window.location.assign(withAdminBase("/admin/forbidden"));
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text.slice(0, 240) };
  }
}

export interface AdminRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  toastOnError?: boolean;
}

async function adminRequest<T>(path: string, options: AdminRequestOptions = {}): Promise<T> {
  const { body, toastOnError, headers, ...init } = options;
  const method = (init.method ?? "GET").toUpperCase();
  const response = await fetch(path, {
    ...init,
    method,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await parseBody(response);
  if (response.status === 401 && !path.startsWith("/api/auth/")) {
    redirectToLogin();
    throw parseAdminErrorBody(response.status, payload);
  }
  if (response.status === 403 && path.startsWith("/api/admin/")) {
    redirectToForbidden();
    throw parseAdminErrorBody(response.status, payload);
  }
  if (!response.ok) {
    const error = parseAdminErrorBody(response.status, payload);
    if (toastOnError !== false && method !== "GET") toast.error(error.message);
    throw error;
  }
  return payload as T;
}

export function adminGet<T>(path: string, init?: AdminRequestOptions): Promise<T> {
  return adminRequest<T>(path, { ...init, method: "GET", toastOnError: false });
}

export function adminPost<T>(path: string, body?: unknown, init?: AdminRequestOptions): Promise<T> {
  return adminRequest<T>(path, { ...init, method: "POST", body });
}

export function adminPatch<T>(path: string, body?: unknown, init?: AdminRequestOptions): Promise<T> {
  return adminRequest<T>(path, { ...init, method: "PATCH", body });
}

export function adminDelete<T>(path: string, init?: AdminRequestOptions): Promise<T> {
  return adminRequest<T>(path, { ...init, method: "DELETE" });
}
