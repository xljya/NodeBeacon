import { Activity, ChevronDown, Clock3, RefreshCw, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AdminAuditEvent, AdminAuditEventsResponse } from "@nodebeacon/shared";
import { useApi } from "../../lib/useApi";
import { PageError, PageLoading } from "../components/PageState";

const ACTION_KEYS: Record<string, string> = {
  "auth.login": "login",
  "auth.logout": "logout",
  "node.created": "nodeCreated",
  "node.updated": "nodeUpdated",
  "node.deleted": "nodeDeleted",
  "node.reordered": "nodeReordered",
  "session.revoked": "sessionRevoked"
};

export function ActivityPage() {
  const { t } = useTranslation();
  const audit = useApi<AdminAuditEventsResponse>("/api/admin/audit-events?limit=100");

  if (audit.loading) return <PageLoading />;
  if (audit.error) return <PageError message={audit.error} />;
  if (!audit.data) return null;

  return (
    <div className="page page-wide">
      <div className="page-head page-head-spread">
        <div>
          <h2>{t("admin.activity.title")}</h2>
          <span className="page-sub">{t("admin.activity.subtitle", { count: audit.data.events.length })}</span>
        </div>
        <button className="ghost-btn" onClick={audit.reload}>
          <RefreshCw size={15} /> {t("admin.actions.refresh")}
        </button>
      </div>

      <section className="admin-notice">
        <ShieldCheck size={18} />
        <div>
          <b>{t("admin.activity.persistedTitle")}</b>
          <p>{t("admin.activity.persistedText")}</p>
        </div>
      </section>

      <section className="section-panel">
        <div className="section-head">
          <div>
            <h3>{t("admin.activity.timelineTitle")}</h3>
            <p>{t("admin.activity.timelineDesc")}</p>
          </div>
          <Clock3 size={18} />
        </div>

        {audit.data.events.length === 0 ? (
          <div className="empty-table">
            <Activity size={28} />
            <b>{t("admin.activity.emptyTitle")}</b>
            <span>{t("admin.activity.emptyText")}</span>
          </div>
        ) : (
          <div className="activity-timeline audit-timeline">
            {audit.data.events.map((event) => <AuditItem key={event.id} event={event} />)}
          </div>
        )}
      </section>
    </div>
  );
}
function AuditItem({ event }: { event: AdminAuditEvent }) {
  const { t } = useTranslation();
  const actionKey = ACTION_KEYS[event.action];
  const title = actionKey ? t(`admin.activity.actions.${actionKey}`) : event.action;

  return (
    <div className="timeline-item ok audit-item">
      <span className="timeline-icon"><Activity size={16} /></span>
      <div className="audit-event-body">
        <div className="audit-event-head">
          <b>{title}</b>
          <time dateTime={event.timestamp}>{new Date(event.timestamp).toLocaleString()}</time>
        </div>
        <p>
          {t("admin.activity.actor", { actor: event.actor })}
          {event.entityId ? ` · ${t("admin.activity.entity", { entity: event.entityId })}` : ""}
        </p>
        {event.payload !== undefined && (
          <details className="audit-payload">
            <summary><ChevronDown size={14} /> {t("admin.activity.details")}</summary>
            <pre>{JSON.stringify(event.payload, null, 2)}</pre>
          </details>
        )}
      </div>
    </div>
  );
}
