import type { ReactNode } from "react";
import {
  AlertCircle,
  Database,
  Gauge,
  Globe2,
  LockKeyhole,
  RefreshCw,
  Rocket,
  ShieldCheck,
  SlidersHorizontal
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AdminSummaryResponse } from "@nodebeacon/shared";
import { useApi } from "../../lib/useApi";

export function SettingsPage() {
  const { t } = useTranslation();
  const { data, error, loading, reload } = useApi<AdminSummaryResponse>("/api/admin/summary");

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
    <div className="page page-wide">
      <div className="page-head page-head-spread">
        <div>
          <h2>{t("admin.settings.title")}</h2>
          <span className="page-sub">{t("admin.settings.subtitle")}</span>
        </div>
        <button className="ghost-btn" onClick={reload}>
          <RefreshCw size={15} /> {t("admin.actions.refresh")}
        </button>
      </div>

      <section className="admin-notice">
        <SlidersHorizontal size={18} />
        <div>
          <b>{t("admin.settings.readOnlyTitle")}</b>
          <p>{t("admin.settings.readOnlyText")}</p>
        </div>
      </section>

      <div className="settings-grid">
        <SettingSection icon={<Database size={18} />} title={t("admin.settings.dataSection")} desc={t("admin.settings.dataSectionDesc")}>
          <SettingCard title={t("admin.settings.prometheusTitle")} desc={t("admin.settings.prometheusDesc")}>
            <span className="pill mono">{data.prometheus.host ?? t("common.notConfigured")}</span>
          </SettingCard>
          <SettingCard title={t("admin.settings.prometheusReachableTitle")} desc={t("admin.settings.prometheusReachableDesc")}>
            <span className={`pill ${data.prometheus.reachable ? "pill-ok" : "pill-warn"}`}>
              {data.prometheus.reachable ? t("admin.overview.reachable") : t("admin.overview.unreachable")}
            </span>
          </SettingCard>
        </SettingSection>

        <SettingSection icon={<Gauge size={18} />} title={t("admin.settings.cacheSection")} desc={t("admin.settings.cacheSectionDesc")}>
          <SettingCard title={t("admin.settings.ttlTitle")} desc={t("admin.settings.ttlDesc")}>
            <span className="pill mono">{data.cache.ttlSeconds}s</span>
          </SettingCard>
          <SettingCard title={t("admin.settings.cacheFreshTitle")} desc={t("admin.settings.cacheFreshDesc")}>
            <span className={`pill ${data.cache.stale ? "pill-warn" : "pill-ok"}`}>
              {data.cache.stale ? t("admin.overview.stale") : t("admin.overview.realtime")}
            </span>
          </SettingCard>
        </SettingSection>

        <SettingSection icon={<LockKeyhole size={18} />} title={t("admin.settings.authSection")} desc={t("admin.settings.authSectionDesc")}>
          <SettingCard title={t("admin.settings.ownerTitle")} desc={t("admin.settings.ownerDesc")}>
            <span className={`pill ${data.auth.ownerConfigured ? "pill-ok" : "pill-warn"}`}>
              {data.auth.ownerConfigured ? t("admin.overview.configured") : t("common.notConfigured")}
            </span>
          </SettingCard>
          <SettingCard title={t("admin.settings.allowRegisterTitle")} desc={t("admin.settings.allowRegisterDesc")}>
            <span className={`pill ${data.auth.allowRegister ? "pill-warn" : "pill-ok"}`}>
              {data.auth.allowRegister ? t("admin.settings.on") : t("admin.settings.off")}
            </span>
          </SettingCard>
        </SettingSection>

        <SettingSection icon={<Globe2 size={18} />} title={t("admin.settings.publicSection")} desc={t("admin.settings.publicSectionDesc")}>
          <SettingCard title={t("admin.settings.publicPolicyTitle")} desc={t("admin.settings.publicPolicyDesc")}>
            <span className="pill">{t("admin.settings.publicPolicyValue")}</span>
          </SettingCard>
          <SettingCard title={t("admin.settings.nodeConfigTitle")} desc={t("admin.settings.nodeConfigDesc")}>
            <span className="pill">{t("admin.settings.registryValue")}</span>
          </SettingCard>
        </SettingSection>

        <SettingSection icon={<ShieldCheck size={18} />} title={t("admin.settings.securitySection")} desc={t("admin.settings.securitySectionDesc")}>
          <SettingCard title={t("admin.settings.prometheusBoundaryTitle")} desc={t("admin.settings.prometheusBoundaryDesc")}>
            <span className="pill pill-ok">{t("admin.settings.enforced")}</span>
          </SettingCard>
          <SettingCard title={t("admin.settings.adminGuardTitle")} desc={t("admin.settings.adminGuardDesc")}>
            <span className="pill pill-ok">{t("admin.settings.ownerOnly")}</span>
          </SettingCard>
        </SettingSection>

        <SettingSection icon={<Rocket size={18} />} title={t("admin.settings.releaseSection")} desc={t("admin.settings.releaseSectionDesc")}>
          <SettingCard title={t("admin.settings.versionTitle")} desc={t("admin.settings.versionDesc")}>
            <span className="pill mono">v{data.version}</span>
          </SettingCard>
          <SettingCard title={t("admin.settings.deliveryTitle")} desc={t("admin.settings.deliveryDesc")}>
            <span className="pill">{t("admin.settings.singleContainer")}</span>
          </SettingCard>
        </SettingSection>
      </div>
    </div>
  );
}

function SettingSection({ icon, title, desc, children }: { icon: ReactNode; title: string; desc: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <div className="section-head">
        <div>
          <h3>{title}</h3>
          <p>{desc}</p>
        </div>
        {icon}
      </div>
      <div className="setting-list compact">{children}</div>
    </section>
  );
}

function SettingCard({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <section className="setting-card flat">
      <div className="setting-text">
        <h3>{title}</h3>
        <p>{desc}</p>
      </div>
      <div className="setting-control">{children}</div>
    </section>
  );
}
