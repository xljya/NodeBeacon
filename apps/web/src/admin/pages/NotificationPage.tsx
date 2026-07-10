import { Link, useParams } from "react-router-dom";
import { Activity, ArrowUpRight, Bell, Gauge, PlugZap, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";

const RULES = [
  { slug: "offline", title: "Offline", icon: PlugZap, text: "Node availability alerts will use the incident pipeline when it is enabled." },
  { slug: "load", title: "Load", icon: Gauge, text: "CPU, memory and load thresholds remain visible in the public monitoring data." },
  { slug: "traffic-report", title: "Traffic Report", icon: Activity, text: "Traffic summaries are currently read from Prometheus and can be reviewed from the status page." },
  { slug: "general", title: "General", icon: Settings2, text: "Delivery channels are intentionally not configured until Alertmanager persistence is in place." }
] as const;

export function NotificationPage() {
  const { t } = useTranslation();
  const { kind = "general" } = useParams();
  const rule = RULES.find((item) => item.slug === kind) ?? RULES[3];
  const Icon = rule.icon;

  return (
    <div className="page notification-workspace">
      <div className="page-head">
        <h2>{rule.title}</h2>
        <span className="page-sub">{t("admin.notification.subtitle")}</span>
      </div>
      <section className="section-panel notification-focus-panel">
        <div className="section-head">
          <div>
            <h3>{rule.title}</h3>
            <p>{rule.text}</p>
          </div>
          <Icon size={20} />
        </div>
        <div className="admin-notice compact-notice">
          <Bell size={18} />
          <div>
            <b>{t("admin.notification.currentTitle")}</b>
            <p>{t("admin.notification.currentText")}</p>
          </div>
        </div>
        <Link className="ghost-btn notification-settings-link" to="/admin/settings/notifications">
          Notification settings <ArrowUpRight size={15} />
        </Link>
      </section>
      <section className="notification-rule-grid" aria-label="Notification categories">
        {RULES.map(({ slug, title, icon: RuleIcon }) => (
          <Link key={slug} to={`/admin/notification/${slug}`} className={slug === rule.slug ? "notification-rule active" : "notification-rule"}>
            <RuleIcon size={18} />
            <span>{title}</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
