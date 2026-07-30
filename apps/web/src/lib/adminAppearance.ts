export type AdminTheme = "light" | "dark";

export const ADMIN_ACCENTS = ["#2f6bff", "#0ea67a", "#d55b2d"] as const;
export const ADMIN_APPEARANCE_EVENT = "nodebeacon-admin-appearance";

export interface AdminAppearance {
  theme: AdminTheme;
  accent: string;
}

export function getAdminAppearance(): AdminAppearance {
  const theme = localStorage.getItem("nb-admin-theme");
  const accent = localStorage.getItem("nb-admin-accent");
  const resolvedAccent = ADMIN_ACCENTS.includes(accent as (typeof ADMIN_ACCENTS)[number])
    ? accent ?? ADMIN_ACCENTS[0]
    : ADMIN_ACCENTS[0];
  return {
    // The management console is data-dense by design; match the low-glare
    // operator-focused default while respecting an explicitly saved choice.
    theme: theme === "light" ? "light" : "dark",
    accent: resolvedAccent
  };
}

export function saveAdminAppearance(next: Partial<AdminAppearance>): void {
  const current = getAdminAppearance();
  const appearance = { ...current, ...next };
  localStorage.setItem("nb-admin-theme", appearance.theme);
  localStorage.setItem("nb-admin-accent", appearance.accent);
  window.dispatchEvent(new Event(ADMIN_APPEARANCE_EVENT));
}
