export type AdminTheme = "light" | "dark";

export const ADMIN_ACCENTS = ["#2f6bff", "#0ea67a", "#d55b2d"] as const;
export const ADMIN_APPEARANCE_EVENT = "nodebeacon-admin-appearance";

const ADMIN_THEME_KEY = "nb-admin-theme";
const ADMIN_THEME_MIGRATION_KEY = "nb-admin-komari-theme-v1";

export interface AdminAppearance {
  theme: AdminTheme;
  accent: string;
}

export function getAdminAppearance(): AdminAppearance {
  const hasKomariThemeMigration = localStorage.getItem(ADMIN_THEME_MIGRATION_KEY) === "1";
  const savedTheme = localStorage.getItem(ADMIN_THEME_KEY);
  const accent = localStorage.getItem("nb-admin-accent");
  const resolvedAccent = ADMIN_ACCENTS.includes(accent as (typeof ADMIN_ACCENTS)[number])
    ? accent ?? ADMIN_ACCENTS[0]
    : ADMIN_ACCENTS[0];

  // Existing installations may have persisted the previous light console.
  // Migrate once so every owner actually sees the redesigned operator theme;
  // later user-selected light/dark changes remain persistent.
  const theme = hasKomariThemeMigration && savedTheme === "light" ? "light" : "dark";
  if (!hasKomariThemeMigration) {
    localStorage.setItem(ADMIN_THEME_KEY, theme);
    localStorage.setItem(ADMIN_THEME_MIGRATION_KEY, "1");
  }

  return {
    theme,
    accent: resolvedAccent
  };
}

export function saveAdminAppearance(next: Partial<AdminAppearance>): void {
  const current = getAdminAppearance();
  const appearance = { ...current, ...next };
  localStorage.setItem(ADMIN_THEME_KEY, appearance.theme);
  localStorage.setItem(ADMIN_THEME_MIGRATION_KEY, "1");
  localStorage.setItem("nb-admin-accent", appearance.accent);
  window.dispatchEvent(new Event(ADMIN_APPEARANCE_EVENT));
}
