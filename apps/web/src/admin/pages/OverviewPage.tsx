import type { ReactNode } from "react";
import { AlertCircle, Database, Gauge, Server, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AdminSummaryResponse } from "@nodebeacon/shared";
import { useApi } from "../../lib/useApi";

export function OverviewPage() {
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
        <h2>{t("admin.overview.title")}</h2>
        <span className="page-sub">
          {t("admin.overview.generatedAt", {
            time: new Date(data.generatedAt).toLocaleString(),
            version: data.version
          })}
        </span>
      </div>

      <div className="card-grid">
        <Card icon={<Server size={18} />} title={t("admin.overview.nodesCard")}>
          <div className="metric">
            {data.nodes.online}
            <span>{t("admin.overview.onlineSuffix", { total: data.nodes.total })}</span>
          </div>
          <div className="metric-sub">
            {t("admin.overview.degradedOffline", {
              degraded: data.nodes.degraded,
              offline: data.nodes.offline
            })}
          </div>
        </Card>

        <Card icon={<Database size={18} />} title={t("admin.overview.prometheus")}>
          <div className="kv">
            <span>{t("admin.overview.status")}</span>
            <b className={data.prometheus.reachable ? "ok" : "bad"}>
              {data.prometheus.configured
                ? data.prometheus.reachable
                  ? t("admin.overview.reachable")
                  : t("admin.overview.unreachable")
                : t("common.notConfigured")}
            </b>
          </div>
          <div className="kv">
            <span>{t("admin.overview.host")}</span>
            <b className="mono">{data.prometheus.host ?? "—"}</b>
          </div>
        </Card>

        <Card icon={<Gauge size={18} />} title={t("admin.overview.cache")}>
          <div className="kv">
            <span>{t("admin.overview.ttl")}</span>
            <b className="mono">{data.cache.ttlSeconds}s</b>
          </div>
          <div className="kv">
            <span>{t("admin.overview.data")}</span>
            <b className={data.cache.stale ? "bad" : "ok"}>
              {data.cache.stale ? t("admin.overview.stale") : t("admin.overview.realtime")}
            </b>
          </div>
        </Card>

        <Card icon={<ShieldCheck size={18} />} title={t("admin.overview.auth")}>
          <div className="kv">
            <span>{t("admin.overview.owner")}</span>
            <b className={data.auth.ownerConfigured ? "ok" : "bad"}>
              {data.auth.ownerConfigured ? t("admin.overview.configured") : t("common.notConfigured")}
            </b>
          </div>
          <div className="kv">
            <span>{t("admin.overview.allowRegister")}</span>
            <b>{data.auth.allowRegister ? t("common.yes") : t("common.no")}</b>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="card">
      <div className="card-title">
        {icon}
        <span>{title}</span>
      </div>
      <div className="card-body">{children}</div>
    </section>
  );
}
