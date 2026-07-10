import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  Clock3,
  Database,
  Eye,
  EyeOff,
  Gauge,
  Globe2,
  RefreshCw,
  Server,
  Settings,
  ShieldCheck,
  Users
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AdminNode, AdminNodesResponse, AdminSummaryResponse } from "@nodebeacon/shared";
import { useApi } from "../../lib/useApi";
import { PageError, PageLoading } from "../components/PageState";
import { StatusBadge } from "../components/StatusBadge";

export function OverviewPage() {
  const { t } = useTranslation();
  const summary = useApi<AdminSummaryResponse>("/api/admin/summary");
  const nodeResult = useApi<AdminNodesResponse>("/api/admin/nodes");

  if (summary.loading || nodeResult.loading) return <PageLoading />;
  if (summary.error || nodeResult.error) {
    return <PageError message={summary.error ?? nodeResult.error ?? ""} />;
  }
  const data = summary.data;
  if (!data) return null;

  const nodes = nodeResult.data?.nodes ?? [];
  const onlineRatio = percent(data.nodes.online, data.nodes.total);
  const visibleNodes = nodes.filter((node) => node.public).length;
  const hiddenNodes = nodes.length - visibleNodes;
  const regions = new Set(nodes.map((node) => node.region).filter(Boolean)).size;
  const providers = new Set(nodes.map((node) => node.provider).filter(Boolean)).size;
  const groups = summarizeBy(nodes, "group");
  const recentNodes = [...nodes]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 5);

  const reloadAll = async () => {
    await Promise.all([summary.reload(), nodeResult.reload()]);
  };

  return (
    <div className="page page-wide">
      <div className="page-head page-head-spread">
        <div>
          <h2>{t("admin.overview.title")}</h2>
          <span className="page-sub">
            {t("admin.overview.generatedAt", {
              time: new Date(data.generatedAt).toLocaleString(),
              version: data.version
            })}
          </span>
        </div>
        <button className="ghost-btn" onClick={reloadAll}>
          <RefreshCw size={15} /> {t("admin.actions.refresh")}
        </button>
      </div>

      <section className="admin-hero">
        <div className="admin-hero-copy">
          <div className="eyebrow">{t("admin.overview.heroEyebrow")}</div>
          <h3>{t("admin.overview.heroTitle", { online: data.nodes.online, total: data.nodes.total })}</h3>
          <p>{t("admin.overview.heroText", { regions, providers })}</p>
        </div>
        <div className="admin-hero-meter" aria-label={t("admin.overview.healthRatio", { ratio: onlineRatio })}>
          <div className="meter-ring" style={{ "--meter": `${onlineRatio}%` } as CSSProperties}>
            <strong>{onlineRatio}%</strong>
            <span>{t("admin.overview.healthy")}</span>
          </div>
        </div>
      </section>

      <div className="card-grid dense">
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
          <div className="progress-line" aria-hidden="true">
            <span style={{ width: `${onlineRatio}%` }} />
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

        <Card icon={<Globe2 size={18} />} title={t("admin.overview.coverage")}>
          <div className="kv">
            <span>{t("admin.overview.regions")}</span>
            <b className="mono">{regions}</b>
          </div>
          <div className="kv">
            <span>{t("admin.overview.providers")}</span>
            <b className="mono">{providers}</b>
          </div>
        </Card>

        <Card icon={<Eye size={18} />} title={t("admin.overview.visibility")}>
          <div className="kv">
            <span>{t("admin.nodes.visiblePublic")}</span>
            <b className="mono">{visibleNodes}</b>
          </div>
          <div className="kv">
            <span>{t("admin.nodes.visibleHidden")}</span>
            <b className="mono">{hiddenNodes}</b>
          </div>
        </Card>
      </div>

      <div className="admin-section-grid">
        <section className="section-panel">
          <div className="section-head">
            <div>
              <h3>{t("admin.overview.fleetMap")}</h3>
              <p>{t("admin.overview.fleetMapSub")}</p>
            </div>
            <Activity size={18} />
          </div>
          <div className="list-stack">
            {groups.map((group) => (
              <div className="list-row" key={group.name}>
                <div>
                  <b>{group.name}</b>
                  <span>{t("admin.overview.groupNodes", { count: group.total })}</span>
                </div>
                <div className="mini-bar" aria-hidden="true">
                  <span style={{ width: `${percent(group.online, group.total)}%` }} />
                </div>
                <strong className="mono">{group.online}/{group.total}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="section-panel">
          <div className="section-head">
            <div>
              <h3>{t("admin.overview.recentReports")}</h3>
              <p>{t("admin.overview.recentReportsSub")}</p>
            </div>
            <Clock3 size={18} />
          </div>
          <div className="list-stack">
            {recentNodes.map((node) => (
              <Link className="list-row link-row" to={`/nodes/${node.id}`} key={node.id}>
                <div>
                  <b>{node.name}</b>
                  <span>
                    {node.provider} · {node.region}
                  </span>
                </div>
                <StatusBadge status={node.status} />
                <strong className="mono">{formatAge(node.updatedAt, t("admin.overview.justNow"))}</strong>
              </Link>
            ))}
          </div>
        </section>

        <section className="section-panel span-2">
          <div className="section-head">
            <div>
              <h3>{t("admin.overview.quickActions")}</h3>
              <p>{t("admin.overview.quickActionsSub")}</p>
            </div>
          </div>
          <div className="action-grid">
            <QuickAction to="/admin/nodes" icon={<Server size={18} />} title={t("admin.nav.nodes")} desc={t("admin.overview.qaNodes")} />
            <QuickAction to="/admin/users" icon={<Users size={18} />} title={t("admin.nav.users")} desc={t("admin.overview.qaUsers")} />
            <QuickAction to="/admin/settings" icon={<Settings size={18} />} title={t("admin.nav.settings")} desc={t("admin.overview.qaSettings")} />
            <QuickAction to="/" icon={<EyeOff size={18} />} title={t("admin.nav.public")} desc={t("admin.overview.qaPublic")} />
          </div>
        </section>
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

function QuickAction({ to, icon, title, desc }: { to: string; icon: ReactNode; title: string; desc: string }) {
  return (
    <Link className="quick-action" to={to}>
      <span>{icon}</span>
      <div>
        <b>{title}</b>
        <p>{desc}</p>
      </div>
    </Link>
  );
}

function percent(value: number, total: number): number {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function summarizeBy(nodes: AdminNode[], key: "group") {
  const grouped = new Map<string, { name: string; total: number; online: number }>();
  for (const node of nodes) {
    const name = node[key] || "—";
    const current = grouped.get(name) ?? { name, total: 0, online: 0 };
    current.total += 1;
    if (node.online) current.online += 1;
    grouped.set(name, current);
  }
  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function formatAge(value: string, justNow: string): string {
  const diffSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1000));
  if (diffSeconds < 60) return justNow;
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h`;
  return `${Math.floor(diffSeconds / 86400)}d`;
}
