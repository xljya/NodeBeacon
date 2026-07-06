/** Small fetch helpers that always send the session cookie and normalize errors. */

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function toError(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => null);
  const message = body?.error?.message ?? `请求失败 (${res.status})`;
  return new ApiError(message, res.status);
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) throw await toError(res);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!res.ok) throw await toError(res);
  return res.json() as Promise<T>;
}
