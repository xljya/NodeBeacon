import { randomUUID } from "node:crypto";
import type { SqliteDatabase } from "./database.js";

export interface SiteSettings {
  name: string;
  description: string;
  defaultLocale: "en" | "zh-CN" | "zh-TW";
  timezone: string;
}

export interface GeneralSettings {
  statusCacheTtlSeconds: number;
  incidentRetentionDays: number;
  auditRetentionDays: number;
  executionRetentionDays: number;
}

export interface ThemeTokens {
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  radius: number;
  fontFamily: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  tokens: ThemeTokens;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_SITE: SiteSettings = {
  name: "NodeBeacon",
  description: "Self-hosted infrastructure status and monitoring.",
  defaultLocale: "en",
  timezone: "Asia/Shanghai"
};

const DEFAULT_GENERAL: GeneralSettings = {
  statusCacheTtlSeconds: 30,
  incidentRetentionDays: 180,
  auditRetentionDays: 365,
  executionRetentionDays: 30
};

export const DEFAULT_THEME_TOKENS: ThemeTokens = {
  background: "#eef3f9",
  surface: "#ffffff",
  text: "#1c2530",
  muted: "#6b7887",
  accent: "#2f6bff",
  radius: 10,
  fontFamily: "Space Grotesk"
};

function parse<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function rowValue(db: SqliteDatabase, key: string): string | undefined {
  const row = db.prepare("SELECT value_json FROM settings WHERE key = ?").get(key) as { value_json?: string } | undefined;
  return row?.value_json;
}

function writeValue(db: SqliteDatabase, key: string, value: unknown): void {
  db.prepare(`
    INSERT INTO settings(key, value_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value), Date.now());
}

function validColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

export function sanitizeThemeTokens(value: unknown): ThemeTokens {
  const input = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const tokens: ThemeTokens = {
    background: typeof input.background === "string" && validColor(input.background) ? input.background : DEFAULT_THEME_TOKENS.background,
    surface: typeof input.surface === "string" && validColor(input.surface) ? input.surface : DEFAULT_THEME_TOKENS.surface,
    text: typeof input.text === "string" && validColor(input.text) ? input.text : DEFAULT_THEME_TOKENS.text,
    muted: typeof input.muted === "string" && validColor(input.muted) ? input.muted : DEFAULT_THEME_TOKENS.muted,
    accent: typeof input.accent === "string" && validColor(input.accent) ? input.accent : DEFAULT_THEME_TOKENS.accent,
    radius: typeof input.radius === "number" && Number.isFinite(input.radius) ? Math.min(24, Math.max(0, input.radius)) : DEFAULT_THEME_TOKENS.radius,
    fontFamily: typeof input.fontFamily === "string" && /^[a-zA-Z0-9 ,.'-]{1,80}$/.test(input.fontFamily) ? input.fontFamily : DEFAULT_THEME_TOKENS.fontFamily
  };
  return tokens;
}

export interface SettingsService {
  getSite(): SiteSettings;
  updateSite(patch: Partial<SiteSettings>): SiteSettings;
  getGeneral(): GeneralSettings;
  updateGeneral(patch: Partial<GeneralSettings>): GeneralSettings;
  listThemes(): ThemePreset[];
  saveTheme(input: { id?: string; name: string; tokens: unknown; isDefault?: boolean }): ThemePreset;
  deleteTheme(id: string): boolean;
  getDefaultTheme(): ThemePreset;
}

export function createSettingsService(db: SqliteDatabase): SettingsService {
  const ensureDefaults = db.transaction(() => {
    if (!rowValue(db, "site")) writeValue(db, "site", DEFAULT_SITE);
    if (!rowValue(db, "general")) writeValue(db, "general", DEFAULT_GENERAL);
    const count = (db.prepare("SELECT COUNT(*) AS count FROM theme_presets").get() as { count: number }).count;
    if (count === 0) {
      const now = Date.now();
      db.prepare("INSERT INTO theme_presets(id, name, tokens_json, is_default, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)")
        .run("nodebeacon-default", "NodeBeacon Default", JSON.stringify(DEFAULT_THEME_TOKENS), now, now);
    }
  });
  ensureDefaults();

  const service: SettingsService = {
    getSite: () => ({ ...DEFAULT_SITE, ...parse<SiteSettings>(rowValue(db, "site"), DEFAULT_SITE) }),
    updateSite(patch) {
      const current = service.getSite();
      const next: SiteSettings = {
        name: typeof patch.name === "string" ? patch.name.trim().slice(0, 80) || current.name : current.name,
        description: typeof patch.description === "string" ? patch.description.trim().slice(0, 240) : current.description,
        defaultLocale: patch.defaultLocale === "zh-CN" || patch.defaultLocale === "zh-TW" || patch.defaultLocale === "en" ? patch.defaultLocale : current.defaultLocale,
        timezone: typeof patch.timezone === "string" && /^[A-Za-z0-9_+./-]{1,64}$/.test(patch.timezone) ? patch.timezone : current.timezone
      };
      writeValue(db, "site", next);
      return next;
    },
    getGeneral: () => ({ ...DEFAULT_GENERAL, ...parse<GeneralSettings>(rowValue(db, "general"), DEFAULT_GENERAL) }),
    updateGeneral(patch) {
      const current = service.getGeneral();
      const bounded = (value: unknown, min: number, max: number, fallback: number) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : fallback;
      };
      const next: GeneralSettings = {
        statusCacheTtlSeconds: bounded(patch.statusCacheTtlSeconds, 5, 300, current.statusCacheTtlSeconds),
        incidentRetentionDays: bounded(patch.incidentRetentionDays, 7, 730, current.incidentRetentionDays),
        auditRetentionDays: bounded(patch.auditRetentionDays, 7, 730, current.auditRetentionDays),
        executionRetentionDays: bounded(patch.executionRetentionDays, 1, 365, current.executionRetentionDays)
      };
      writeValue(db, "general", next);
      return next;
    },
    listThemes() {
      const rows = db.prepare("SELECT id, name, tokens_json, is_default, created_at, updated_at FROM theme_presets ORDER BY is_default DESC, name COLLATE NOCASE").all() as Array<{ id: string; name: string; tokens_json: string; is_default: number; created_at: number; updated_at: number }>;
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        tokens: sanitizeThemeTokens(parse(row.tokens_json, DEFAULT_THEME_TOKENS)),
        isDefault: row.is_default === 1,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString()
      }));
    },
    saveTheme(input) {
      const id = input.id?.trim() || `theme-${randomUUID()}`;
      const name = input.name.trim().slice(0, 80) || "Untitled theme";
      const tokens = sanitizeThemeTokens(input.tokens);
      const now = Date.now();
      const tx = db.transaction(() => {
        const existing = db.prepare("SELECT is_default FROM theme_presets WHERE id = ?").get(id) as { is_default?: number } | undefined;
        const isDefault = input.isDefault === undefined ? existing?.is_default === 1 : input.isDefault;
        if (isDefault) db.prepare("UPDATE theme_presets SET is_default = 0").run();
        db.prepare(`
          INSERT INTO theme_presets(id, name, tokens_json, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET name = excluded.name, tokens_json = excluded.tokens_json, is_default = excluded.is_default, updated_at = excluded.updated_at
        `).run(id, name, JSON.stringify(tokens), isDefault ? 1 : 0, now, now);
      });
      tx();
      return service.listThemes().find((theme) => theme.id === id) as ThemePreset;
    },
    deleteTheme(id) {
      const current = db.prepare("SELECT is_default FROM theme_presets WHERE id = ?").get(id) as { is_default?: number } | undefined;
      if (!current || current.is_default === 1) return false;
      return db.prepare("DELETE FROM theme_presets WHERE id = ?").run(id).changes > 0;
    },
    getDefaultTheme() {
      return service.listThemes().find((theme) => theme.isDefault) ?? service.listThemes()[0] as ThemePreset;
    }
  };
  return service;
}
