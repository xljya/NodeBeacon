import {
  APPEARANCE_ACCENTS,
  APPEARANCE_GRAYS,
  APPEARANCE_MODES,
  APPEARANCE_PANELS,
  APPEARANCE_RADII,
  APPEARANCE_SCALINGS,
  type AppearanceTokensV1
} from "@nodebeacon/shared";

export const APPEARANCE_STORAGE_KEY = "nb-appearance-v1";

export const BUILTIN_APPEARANCE: AppearanceTokensV1 = {
  version: 1,
  mode: "system",
  accent: "iris",
  grayColor: "slate",
  radius: "medium",
  scaling: "110%",
  panelBackground: "translucent"
};

export type AppearanceOverrides = Partial<Omit<AppearanceTokensV1, "version">>;

function enumValue<T extends readonly string[]>(value: unknown, values: T): T[number] | undefined {
  return typeof value === "string" && values.includes(value) ? value as T[number] : undefined;
}

export function sanitizeAppearanceOverrides(value: unknown): AppearanceOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const result: AppearanceOverrides = {};
  const mode = enumValue(input.mode, APPEARANCE_MODES);
  const accent = enumValue(input.accent, APPEARANCE_ACCENTS);
  const grayColor = enumValue(input.grayColor, APPEARANCE_GRAYS);
  const radius = enumValue(input.radius, APPEARANCE_RADII);
  const scaling = enumValue(input.scaling, APPEARANCE_SCALINGS);
  const panelBackground = enumValue(input.panelBackground, APPEARANCE_PANELS);
  if (mode) result.mode = mode;
  if (accent) result.accent = accent;
  if (grayColor) result.grayColor = grayColor;
  if (radius) result.radius = radius;
  if (scaling) result.scaling = scaling;
  if (panelBackground) result.panelBackground = panelBackground;
  return result;
}

export function sanitizeAppearanceTokens(value: unknown): AppearanceTokensV1 {
  const overrides = sanitizeAppearanceOverrides(value);
  return { ...BUILTIN_APPEARANCE, ...overrides, version: 1 };
}

function legacyOverrides(): AppearanceOverrides {
  const legacyTheme = localStorage.getItem("nb-theme") ?? localStorage.getItem("nb-admin-theme");
  const legacyAccent = localStorage.getItem("nb-admin-accent")?.toLowerCase();
  const accentMap: Record<string, AppearanceTokensV1["accent"]> = {
    "#2f6bff": "iris",
    "#0ea67a": "teal",
    "#d55b2d": "orange"
  };
  return {
    mode: legacyTheme === "light" || legacyTheme === "dark" ? legacyTheme : undefined,
    accent: legacyAccent ? accentMap[legacyAccent] : undefined
  };
}

export function loadAppearanceOverrides(): AppearanceOverrides {
  try {
    const stored = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (stored) return sanitizeAppearanceOverrides(JSON.parse(stored));
    const migrated = sanitizeAppearanceOverrides(legacyOverrides());
    if (Object.values(migrated).some(Boolean)) {
      saveAppearanceOverrides(migrated);
    }
    return migrated;
  } catch {
    return {};
  }
}

export function saveAppearanceOverrides(value: AppearanceOverrides): void {
  localStorage.setItem(
    APPEARANCE_STORAGE_KEY,
    JSON.stringify({ version: 1, ...sanitizeAppearanceOverrides(value) })
  );
  localStorage.removeItem("nb-theme");
  localStorage.removeItem("nb-admin-theme");
  localStorage.removeItem("nb-admin-accent");
}

export function clearAppearanceOverrides(): void {
  localStorage.removeItem(APPEARANCE_STORAGE_KEY);
  localStorage.removeItem("nb-theme");
  localStorage.removeItem("nb-admin-theme");
  localStorage.removeItem("nb-admin-accent");
}
