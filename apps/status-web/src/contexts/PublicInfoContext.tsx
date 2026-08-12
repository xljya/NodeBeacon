import React from "react";
import {
  fetchJson,
  type NodeBeaconAuthConfig,
  type NodeBeaconSiteConfig,
} from "@/lib/nodebeacon";

export interface PublicInfo {
  cors_origin_check_enabled: boolean;
  custom_body: string;
  custom_head: string;
  description: string;
  disable_password_login: boolean;
  oauth_provider: string;
  oauth_enable: boolean;
  metric_retention_days: number;
  sitename: string;
  private_site: boolean;
  theme: string;
  theme_settings: any;
  [property: string]: any;
}

interface PublicInfoContextType {
  publicInfo: PublicInfo | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const PublicInfoContext = React.createContext<PublicInfoContextType | undefined>(
  undefined
);

export const PublicInfoProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [publicInfo, setPublicInfo] = React.useState<PublicInfo | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const refresh = React.useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const [siteConfig, authConfig] = await Promise.all([
        fetchJson<NodeBeaconSiteConfig>("/api/site-config"),
        fetchJson<NodeBeaconAuthConfig>("/api/auth/config"),
      ]);
      setPublicInfo({
        cors_origin_check_enabled: true,
        custom_body: "",
        custom_head: "",
        description: siteConfig.site.description,
        disable_password_login: !authConfig.passwordLoginEnabled,
        oauth_provider: authConfig.githubLoginEnabled ? "github" : "",
        oauth_enable: authConfig.githubLoginEnabled,
        metric_retention_days: 0,
        sitename: siteConfig.site.name,
        private_site: false,
        theme: siteConfig.theme.id,
        theme_settings: {
          mainContentWidth: 100,
          offlineServerPosition: "Last",
          showIpTagsInCard: false,
          showServerListInDetails: true,
          nodeBeaconAppearance: siteConfig.theme.tokens,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <PublicInfoContext.Provider value={{ publicInfo, isLoading, error, refresh }}>
      {children}
    </PublicInfoContext.Provider>
  );
};

export const usePublicInfo = () => {
  const context = React.useContext(PublicInfoContext);
  if (!context) {
    throw new Error("usePublicInfo must be used within a PublicInfoProvider");
  }
  return context;
};
