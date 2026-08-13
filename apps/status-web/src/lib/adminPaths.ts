export type AdminBase = "/admin" | "/admin-v2";
export type LoginPath = "/login" | "/login-v2";

const SAFE_PREFIXES = ["/admin", "/admin-v2", "/login", "/login-v2"] as const;

function currentPathname(pathname?: string): string {
  if (pathname) return pathname;
  if (typeof window === "undefined") return "/admin";
  return window.location.pathname;
}

export function getAdminBase(pathname?: string): AdminBase {
  const path = currentPathname(pathname);
  return path === "/admin-v2" || path.startsWith("/admin-v2/") || path === "/login-v2"
    ? "/admin-v2"
    : "/admin";
}

export function getLoginPath(pathname?: string): LoginPath {
  return getAdminBase(pathname) === "/admin-v2" ? "/login-v2" : "/login";
}

export function getAdminHome(pathname?: string): string {
  return `${getAdminBase(pathname)}/dashboard`;
}

export function withAdminBase(path: string, pathname?: string): string {
  if (path === "/" || path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = getAdminBase(pathname);
  if (path === "/admin" || path.startsWith("/admin/")) {
    return `${base}${path.slice("/admin".length)}`;
  }
  if (path === "/login" || path.startsWith("/login/")) {
    return `${getLoginPath(pathname)}${path.slice("/login".length)}`;
  }
  return path;
}

export function sanitizeNextPath(raw: unknown, fallback?: string, pathname?: string): string {
  const defaultFallback = fallback ?? getAdminHome(pathname);
  if (typeof raw !== "string") return defaultFallback;
  const trimmed = raw.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("://") ||
    trimmed.includes("\\") ||
    /[\n\r\t]/.test(trimmed)
  ) {
    return defaultFallback;
  }
  const pathOnly = trimmed.split("?")[0] ?? trimmed;
  const allowed = SAFE_PREFIXES.some(
    (prefix) => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`),
  );
  return allowed ? trimmed : defaultFallback;
}

export function readNextParam(search: string, pathname?: string): string {
  const query = search.startsWith("?") ? search.slice(1) : search;
  return sanitizeNextPath(new URLSearchParams(query).get("next"), undefined, pathname);
}
