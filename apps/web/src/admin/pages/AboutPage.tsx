import type { ReactNode } from "react";
import {
  AlertCircle,
  Database,
  ExternalLink,
  Github,
  LockKeyhole,
  RefreshCw,
  Rocket,
  Server,
  ShieldCheck
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AdminSummaryResponse } from "@nodebeacon/shared";
import { useApi } from "../../lib/useApi";

export function AboutPage() {
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
          <h2>{t("admin.about.title")}</h2>
          <span className="page-sub">
            {t("admin.about.generatedAt", {
              time: new Date(data.generatedAt).toLocaleString(),
              version: data.version
            })}
          </span>
        </div>
        <button className="ghost-btn" onClick={reload}>
          <RefreshCw size={15} /> {t("admin.actions.refresh")}
        </button>
      </div>

      <section className="admin-notice">
        <Rocket size={18} />
        <div>
          <b>{t("admin.about.identityTitle")}</b>
          <p>{t("admin.about.identityText")}</p>
        </div>
      </section>

      <div className="admin-section-grid">
        <section className="section-panel">
          <div className="section-head">
            <div>
              <h3>{t("admin.about.productSection")}</h3>
              <p>{t("admin.about.productDesc")}</p>
            </div>
            <Server size={18} />
          </div>
          <div className="about-fact-list">
            <Fact label={t("admin.about.application")} value="NodeBeacon" desc={t("admin.about.applicationDesc")} />
            <Fact label={t("admin.about.delivery")} value={t("admin.settings.singleContainer")} desc={t("admin.about.deliveryDesc")} />
            <Fact label={t("admin.about.version")} value={`v${data.version}`} desc={t("admin.about.versionDesc")} mono />
          </div>
        </section>

        <section className="section-panel">
          <div className="section-head">
            <div>
              <h3>{t("admin.about.runtimeSection")}</h3>
              <p>{t("admin.about.runtimeDesc")}</p>
            </div>
            <Database size={18} />
          </div>
          <div className="about-fact-list">
            <Fact label={t("admin.about.prometheusHost")} value={data.prometheus.host ?? t("common.notConfigured")} mono />
            <Fact label={t("admin.about.cacheTtl")} value={`${data.cache.ttlSeconds}s`} mono />
            <Fact
              label={t("admin.about.authGuard")}
              value={data.auth.ownerConfigured ? t("admin.overview.configured") : t("common.notConfigured")}
              tone={data.auth.ownerConfigured ? "ok" : "warn"}
            />
          </div>
        </section>

        <section className="section-panel span-2">
          <div className="section-head">
            <div>
              <h3>{t("admin.about.securitySection")}</h3>
              <p>{t("admin.about.securityDesc")}</p>
            </div>
            <ShieldCheck size={18} />
          </div>
          <div className="boundary-grid">
            <Boundary icon={<LockKeyhole size={17} />} title={t("admin.about.adminBoundary")} desc={t("admin.about.adminBoundaryDesc")} />
            <Boundary icon={<ShieldCheck size={17} />} title={t("admin.about.promqlBoundary")} desc={t("admin.about.promqlBoundaryDesc")} />
            <Boundary icon={<Server size={17} />} title={t("admin.about.noRemoteExec")} desc={t("admin.about.noRemoteExecDesc")} />
          </div>
        </section>

        <section className="section-panel span-2">
          <div className="section-head">
            <div>
              <h3>{t("admin.about.linksSection")}</h3>
              <p>{t("admin.about.linksDesc")}</p>
            </div>
            <ExternalLink size={18} />
          </div>
          <div className="action-grid">
            <AboutLink href="/" icon={<Server size={17} />} title={t("admin.about.publicStatus")} desc={t("admin.about.publicStatusDesc")} />
            <AboutLink
              href="https://github.com/xljya/NodeBeacon"
              icon={<Github size={17} />}
              title={t("admin.about.githubRepo")}
              desc={t("admin.about.githubRepoDesc")}
              external
            />
            <AboutLink
              href="https://github.com/komari-monitor/komari-web"
              icon={<ExternalLink size={17} />}
              title={t("admin.about.komariReference")}
              desc={t("admin.about.komariReferenceDesc")}
              external
            />
            <AboutLink href="/admin/settings" icon={<Database size={17} />} title={t("admin.about.runtimeSettings")} desc={t("admin.about.runtimeSettingsDesc")} />
          </div>
        </section>
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  desc,
  mono,
  tone
}: {
  label: string;
  value: ReactNode;
  desc?: string;
  mono?: boolean;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="about-fact">
      <span>{label}</span>
      <b className={`${mono ? "mono" : ""} ${tone === "ok" ? "ok" : tone === "warn" ? "warn" : ""}`.trim()}>{value}</b>
      {desc && <p>{desc}</p>}
    </div>
  );
}

function Boundary({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return (
    <div className="boundary-item">
      <span>{icon}</span>
      <div>
        <b>{title}</b>
        <p>{desc}</p>
      </div>
    </div>
  );
}

function AboutLink({
  href,
  icon,
  title,
  desc,
  external
}: {
  href: string;
  icon: ReactNode;
  title: string;
  desc: string;
  external?: boolean;
}) {
  return (
    <a className="quick-action" href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>
      <span>{icon}</span>
      <div>
        <b>{title}</b>
        <p>{desc}</p>
      </div>
    </a>
  );
}
