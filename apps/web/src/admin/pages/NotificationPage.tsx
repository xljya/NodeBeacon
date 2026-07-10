import { Link, useParams } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  Clock3,
  Gauge,
  PlugZap,
  RefreshCw,
  Settings2
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AdminAlert, AdminAlertsResponse, AdminIncidentsResponse } from "@nodebeacon/shared";
import { useApi } from "../../lib/useApi";

const RULES = [
  { slug: "offline", title: "Offline", icon: PlugZap, pattern: /down|offline|unavailable|probe/i },
  { slug: "load", title: "Load", icon: Gauge, pattern: /cpu|memory|load|disk/i },
  { slug: "traffic-report", title: "Traffic Report", icon: Activity, pattern: /traffic|network/i },
  { slug: "general", title: "General", icon: Settings2, pattern: /.*/ }
] as const;

function alertName(alert: AdminAlert): string {
  return alert.labels.alertname ?? "UnknownAlert";
}

export function NotificationPage() {
  const { t } = useTranslation();
  const { kind = "general" } = useParams();
  const rule = RULES.find((item) => item.slug === kind) ?? RULES[3];
  const Icon = rule.icon;
  const alerts = useApi<AdminAlertsResponse>("/api/admin/alerts");
  const incidents = useApi<AdminIncidentsResponse>("/api/admin/incidents?limit=20");

  const visibleAlerts = (alerts.data?.alerts ?? []).filter((alert) =>
    alertName(alert) !== "Watchdog" && rule.pattern.test(alertName(alert))
  );
  const reload = async () => Promise.all([alerts.reload(), incidents.reload()]);

  return (
    <div className="page page-wide notification-workspace">
      <div className="page-head page-head-spread">
        <div>
          <h2>{rule.title}</h2>
          <span className="page-sub">{t("admin.notification.subtitle")}</span>
        </div>
        <button className="ghost-btn" onClick={() => void reload()} disabled={alerts.loading || incidents.loading}>
          <RefreshCw size={15} /> {t("admin.actions.refresh")}
        </button>
      </div>

      <section className="notification-rule-grid" aria-label="Notification categories">
        {RULES.map(({ slug, title, icon: RuleIcon }) => (
          <Link key={slug} to={`/admin/notification/${slug}`} className={slug === rule.slug ? "notification-rule active" : "notification-rule"}>
            <RuleIcon size={18} />
            <span>{title}</span>
          </Link>
        ))}
      </section>

      <div className="notification-live-grid">
        <section className="section-panel notification-focus-panel">
          <div className="section-head">
            <div>
              <h3>{t("admin.notification.firingTitle")}</h3>
              <p>{t("admin.notification.firingText")}</p>
            </div>
            <Icon size={20} />
          </div>

          {alerts.error ? (
            <div className="admin-notice compact-notice warning-notice">
              <AlertTriangle size={18} />
              <div><b>{t("admin.notification.unavailable")}</b><p>{alerts.error}</p></div>
            </div>
          ) : visibleAlerts.length === 0 ? (
            <div className="empty-table compact-empty">
              <CheckCircle2 size={28} />
              <b>{alerts.loading ? t("common.loading") : t("admin.notification.noFiring")}</b>
              <span>{t("admin.notification.watchdogHidden")}</span>
            </div>
          ) : (
            <div className="notification-alert-list">
              {visibleAlerts.map((alert) => (
                <div className="notification-alert-row" key={alert.fingerprint}>
                  <span className="notification-alert-icon"><Bell size={16} /></span>
                  <div>
                    <b>{alertName(alert)}</b>
                    <p>{alert.annotations.summary ?? alert.annotations.description ?? t("admin.notification.noDescription")}</p>
                    <span>{t("admin.notification.started", { time: new Date(alert.startsAt).toLocaleString() })}</span>
                  </div>
                  <span className={`status-pill ${alert.labels.severity === "critical" ? "offline" : "degraded"}`}>
                    {alert.labels.severity ?? alert.state}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="section-panel notification-focus-panel">
          <div className="section-head">
            <div>
              <h3>{t("admin.notification.incidentTitle")}</h3>
              <p>{t("admin.notification.incidentText")}</p>
            </div>
            <Clock3 size={20} />
          </div>
          {(incidents.data?.incidents.length ?? 0) === 0 ? (
            <div className="empty-table compact-empty">
              <Clock3 size={28} />
              <b>{incidents.loading ? t("common.loading") : t("admin.notification.noIncidents")}</b>
              <span>{t("admin.notification.noIncidentsText")}</span>
            </div>
          ) : (
            <div className="notification-incident-list">
              {incidents.data?.incidents.slice(0, 10).map((incident) => (
                <div className="notification-incident-row" key={incident.id}>
                  <span className={`incident-state ${incident.status}`}></span>
                  <div>
                    <b>{incident.alertName}</b>
                    <p>{incident.summary ?? incident.description ?? incident.nodeId ?? t("admin.notification.noDescription")}</p>
                    <span>{new Date(incident.startedAt).toLocaleString()}</span>
                  </div>
                  <span className={`status-pill ${incident.status === "resolved" ? "online" : "offline"}`}>
                    {t(`admin.notification.${incident.status}`)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <Link className="ghost-btn notification-settings-link" to="/admin/settings/notifications">
            {t("admin.notification.settings")} <ArrowUpRight size={15} />
          </Link>
        </section>
      </div>
    </div>
  );
}
