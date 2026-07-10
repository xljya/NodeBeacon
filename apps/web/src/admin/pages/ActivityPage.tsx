import type { ReactNode } from "react";
import {
  Activity,
  Clock3,
  Database,
  RefreshCw,
  Server,
  ShieldCheck,
  Users
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AdminNodesResponse, AdminSummaryResponse, AdminUsersResponse } from "@nodebeacon/shared";
import { useApi } from "../../lib/useApi";
import { PageError, PageLoading } from "../components/PageState";
import { StatusBadge } from "../components/StatusBadge";

export function ActivityPage() {
  const { t } = useTranslation();
  const summary = useApi<AdminSummaryResponse>("/api/admin/summary");
  const nodes = useApi<AdminNodesResponse>("/api/admin/nodes");
  const users = useApi<AdminUsersResponse>("/api/admin/users");

  const loading = summary.loading || nodes.loading || users.loading;
  const error = summary.error ?? nodes.error ?? users.error;

  const reload = async () => {
    await Promise.all([summary.reload(), nodes.reload(), users.reload()]);
  };

  if (loading) return <PageLoading />;
  if (error) return <PageError message={error} />;
  if (!summary.data || !nodes.data || !users.data) return null;

  const latestNodes = [...nodes.data.nodes]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 6);

  return (
    <div className="page page-wide">
      <div className="page-head page-head-spread">
        <div>
          <h2>{t("admin.activity.title")}</h2>
          <span className="page-sub">
            {t("admin.activity.subtitle", { time: new Date(summary.data.generatedAt).toLocaleString() })}
          </span>
        </div>
        <button className="ghost-btn" onClick={reload}>
          <RefreshCw size={15} /> {t("admin.actions.refresh")}
        </button>
      </div>

      <section className="admin-notice">
        <Activity size={18} />
        <div>
          <b>{t("admin.activity.snapshotTitle")}</b>
          <p>{t("admin.activity.snapshotText")}</p>
        </div>
      </section>

      <div className="activity-layout">
        <section className="section-panel">
          <div className="section-head">
            <div>
              <h3>{t("admin.activity.timelineTitle")}</h3>
              <p>{t("admin.activity.timelineDesc")}</p>
            </div>
            <Clock3 size={18} />
          </div>
          <div className="activity-timeline">
            <TimelineItem
              icon={<Server size={16} />}
              title={t("admin.activity.nodeSnapshot")}
              detail={t("admin.activity.nodeSnapshotText", {
                online: summary.data.nodes.online,
                total: summary.data.nodes.total
              })}
              meta={new Date(summary.data.generatedAt).toLocaleString()}
            />
            <TimelineItem
              icon={<Database size={16} />}
              title={t("admin.activity.dataSource")}
              detail={
                summary.data.prometheus.reachable
                  ? t("admin.activity.prometheusReachable")
                  : t("admin.activity.prometheusDegraded")
              }
              meta={summary.data.prometheus.host ?? t("common.notConfigured")}
              tone={summary.data.prometheus.reachable ? "ok" : "warn"}
            />
            <TimelineItem
              icon={<ShieldCheck size={16} />}
              title={t("admin.activity.adminGuard")}
              detail={summary.data.auth.ownerConfigured ? t("admin.activity.ownerConfigured") : t("admin.activity.ownerMissing")}
              meta={summary.data.auth.allowRegister ? t("admin.settings.on") : t("admin.settings.off")}
              tone={summary.data.auth.ownerConfigured ? "ok" : "warn"}
            />
            <TimelineItem
              icon={<Users size={16} />}
              title={t("admin.activity.userSnapshot")}
              detail={t("admin.activity.userSnapshotText", { count: users.data.users.length })}
              meta={t("admin.users.envBacked")}
            />
          </div>
        </section>

        <section className="section-panel">
          <div className="section-head">
            <div>
              <h3>{t("admin.activity.recentNodes")}</h3>
              <p>{t("admin.activity.recentNodesDesc")}</p>
            </div>
            <Server size={18} />
          </div>
          <div className="list-stack">
            {latestNodes.map((node) => (
              <div className="activity-node-row" key={node.id}>
                <div>
                  <b>{node.name}</b>
                  <span>{node.group} - {node.region}</span>
                </div>
                <StatusBadge status={node.status} />
                <span className="mono muted">{new Date(node.updatedAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function TimelineItem({
  icon,
  title,
  detail,
  meta,
  tone
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  meta: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className={`timeline-item ${tone === "ok" ? "ok" : tone === "warn" ? "warn" : ""}`}>
      <span className="timeline-icon">{icon}</span>
      <div>
        <b>{title}</b>
        <p>{detail}</p>
        <span>{meta}</span>
      </div>
    </div>
  );
}
