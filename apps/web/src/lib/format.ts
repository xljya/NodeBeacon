/** Formatting helpers for the public status page, ported from the prototype. */

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

/** Human-readable byte size, e.g. 1536 -> "1.5 KB". */
export function fmtBytes(bytes: number): string {
  let n = Number(bytes) || 0;
  let i = 0;
  while (n >= 1024 && i < BYTE_UNITS.length - 1) {
    n /= 1024;
    i += 1;
  }
  const digits = n >= 10 || i === 0 ? 0 : 1;
  return `${n.toFixed(digits)} ${BYTE_UNITS[i]}`;
}

/** Byte rate, e.g. "1.5 KB/s". */
export function fmtRate(bytesPerSecond: number): string {
  return `${fmtBytes(bytesPerSecond)}/s`;
}

export interface UptimeUnits {
  d: string;
  h: string;
  m: string;
}

/**
 * Localized uptime, e.g. formatUptime(190080, {d:"d",h:"h",m:"m"}) -> "2d 04h 48m".
 * Returns null for non-positive input (caller shows a dash for offline nodes).
 */
export function formatUptime(seconds: number, u: UptimeUnits): string | null {
  const s = Number(seconds) || 0;
  if (s <= 0) return null;
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${days}${u.d} ${pad(hours)}${u.h} ${pad(minutes)}${u.m}`;
  if (hours > 0) return `${hours}${u.h} ${pad(minutes)}${u.m}`;
  return `${minutes}${u.m}`;
}

/** Flag emoji for a region code (matches the prototype's mapping, extended a little). */
export function regionFlag(region: string | undefined): string {
  const r = String(region || "").toUpperCase();
  const map: Record<string, string> = {
    CN: "🇨🇳",
    HK: "🇭🇰",
    TW: "🇹🇼",
    US: "🇺🇸",
    JP: "🇯🇵",
    KR: "🇰🇷",
    SG: "🇸🇬",
    EU: "🇪🇺",
    DE: "🇩🇪",
    GB: "🇬🇧",
    UK: "🇬🇧",
    FR: "🇫🇷",
    NL: "🇳🇱"
  };
  return map[r] ?? "🌐";
}

export type OsSlug = "windows" | "ubuntu" | "debian";

/** Coarse OS family used to pick a logo. Unknown distros fall back to debian. */
export function osSlug(name: string | undefined): OsSlug {
  const s = String(name || "").toLowerCase();
  if (s.includes("windows")) return "windows";
  if (s.includes("ubuntu")) return "ubuntu";
  return "debian";
}

/** Usage-percent color band: >=90 critical, >=75 warning, else ok. */
export function percentTone(percent: number): "ok" | "warn" | "crit" {
  if (percent >= 90) return "crit";
  if (percent >= 75) return "warn";
  return "ok";
}
