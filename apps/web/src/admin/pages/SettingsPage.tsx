import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AdminSummaryResponse } from "@nodebeacon/shared";
import { useApi } from "../../lib/useApi";

export function SettingsPage() {
  const { t } = useTranslation();
  const { data, error, loading } = useApi<AdminSummaryResponse>("/api/admin/summary");

  if (loading) return <div className="admin-state">{t("common.loading")}</div>;
  if (error) {
    return (
      <div className="admin-state error">
        <AlertCircle size={16} /> {error}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("admin.settings.title")}</h2>
        <span className="page-sub">{t("admin.settings.subtitle")}</span>
      </div>

      <div className="setting-list">
        <SettingCard
          title={t("admin.settings.allowRegisterTitle")}
          desc={t("admin.settings.allowRegisterDesc")}
        >
          <span className={`pill ${data.auth.allowRegister ? "pill-warn" : "pill-ok"}`}>
            {data.auth.allowRegister ? t("admin.settings.on") : t("admin.settings.off")}
          </span>
        </SettingCard>

        <SettingCard title={t("admin.settings.ttlTitle")} desc={t("admin.settings.ttlDesc")}>
          <span className="pill mono">{data.cache.ttlSeconds}s</span>
        </SettingCard>

        <SettingCard
          title={t("admin.settings.prometheusTitle")}
          desc={t("admin.settings.prometheusDesc")}
        >
          <span className="pill mono">{data.prometheus.host ?? t("common.notConfigured")}</span>
        </SettingCard>

        <SettingCard
          title={t("admin.settings.publicPolicyTitle")}
          desc={t("admin.settings.publicPolicyDesc")}
        >
          <span className="pill">{t("admin.settings.publicPolicyValue")}</span>
        </SettingCard>
      </div>
    </div>
  );
}

function SettingCard({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <section className="setting-card">
      <div className="setting-text">
        <h3>{title}</h3>
        <p>{desc}</p>
      </div>
      <div className="setting-control">{children}</div>
    </section>
  );
}
