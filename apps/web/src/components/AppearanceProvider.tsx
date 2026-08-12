import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Theme } from "@radix-ui/themes";
import type { ApiSiteConfigResponse, AppearanceTokensV1 } from "@nodebeacon/shared";
import { apiGet } from "../lib/api";
import {
  BUILTIN_APPEARANCE,
  clearAppearanceOverrides,
  loadAppearanceOverrides,
  sanitizeAppearanceTokens,
  saveAppearanceOverrides,
  type AppearanceOverrides
} from "../lib/appearance";

interface AppearanceContextValue {
  appearance: AppearanceTokensV1;
  resolvedMode: "light" | "dark";
  updateAppearance: (patch: AppearanceOverrides) => void;
  resetAppearance: () => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function systemMode(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [siteDefault, setSiteDefault] = useState<AppearanceTokensV1>(BUILTIN_APPEARANCE);
  const [overrides, setOverrides] = useState<AppearanceOverrides>(loadAppearanceOverrides);
  const [systemAppearance, setSystemAppearance] = useState<"light" | "dark">(systemMode);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setSystemAppearance(media.matches ? "dark" : "light");
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    void apiGet<ApiSiteConfigResponse>("/api/site-config")
      .then((config) => setSiteDefault(sanitizeAppearanceTokens(config.theme?.tokens)))
      .catch(() => undefined);
  }, []);

  const appearance = useMemo(
    () => ({ ...siteDefault, ...overrides, version: 1 as const }),
    [overrides, siteDefault]
  );
  const resolvedMode = appearance.mode === "system" ? systemAppearance : appearance.mode;

  const updateAppearance = useCallback((patch: AppearanceOverrides) => {
    setOverrides((current) => {
      const next = { ...current, ...patch };
      saveAppearanceOverrides(next);
      return next;
    });
  }, []);

  const resetAppearance = useCallback(() => {
    clearAppearanceOverrides();
    setOverrides({});
  }, []);

  const value = useMemo(
    () => ({ appearance, resolvedMode, updateAppearance, resetAppearance }),
    [appearance, resetAppearance, resolvedMode, updateAppearance]
  );

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedMode;
    document.documentElement.style.colorScheme = resolvedMode;
  }, [resolvedMode]);

  return (
    <AppearanceContext.Provider value={value}>
      <Theme
        appearance={resolvedMode}
        accentColor={appearance.accent}
        grayColor={appearance.grayColor}
        radius={appearance.radius}
        scaling={appearance.scaling}
        panelBackground={appearance.panelBackground}
        className="nb-theme-root"
      >
        {children}
      </Theme>
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceContextValue {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("useAppearance must be used inside AppearanceProvider");
  return value;
}
