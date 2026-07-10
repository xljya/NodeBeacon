import { useState } from "react";
import { Cookie, MonitorSmartphone, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AdminSession, AdminSessionsResponse } from "@nodebeacon/shared";
import { apiDelete } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import { PageError, PageLoading } from "../components/PageState";

export function SessionsPage() {
  const { t } = useTranslation();
  const sessions = useApi<AdminSessionsResponse>("/api/admin/sessions");
  const [revoking, setRevoking] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const revoke = async (session: AdminSession) => {
    setRevoking(session.id);
    setActionError(null);
    try {
      await apiDelete(`/api/admin/sessions/${session.id}`);
      if (session.current) {
        window.location.assign("/login");
        return;
      }
      await sessions.reload();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t("common.requestFailed", { status: "" }));
    } finally {
      setRevoking(null);
    }
  };

  if (sessions.loading) return <PageLoading />;
  if (sessions.error) return <PageError message={sessions.error} />;
  if (!sessions.data) return null;

  return (
    <div className="page page-wide">
      <div className="page-head page-head-spread">
        <div>
          <h2>{t("admin.sessions.title")}</h2>
          <span className="page-sub">{t("admin.sessions.subtitle", { count: sessions.data.sessions.length })}</span>
        </div>
        <button className="ghost-btn" onClick={sessions.reload}>
          <RefreshCw size={15} /> {t("admin.actions.refresh")}
        </button>
      </div>

      <section className="admin-notice">
        <ShieldCheck size={18} />
        <div>
          <b>{t("admin.sessions.persistedTitle")}</b>
          <p>{t("admin.sessions.persistedText")}</p>
        </div>
      </section>

      {actionError && <div className="page-error table-action-error">{actionError}</div>}

      <section className="section-panel">
        <div className="section-head">
          <div>
            <h3>{t("admin.sessions.activeTitle")}</h3>
            <p>{t("admin.sessions.activeText")}</p>
          </div>
          <Cookie size={18} />
        </div>
        <div className="list-stack session-list">
          {sessions.data.sessions.map((session) => (
            <div className="session-row" key={session.id}>
              <span className="session-device"><MonitorSmartphone size={17} /></span>
              <div className="session-main">
                <div>
                  <b>{session.current ? t("admin.sessions.current") : t("admin.sessions.other")}</b>
                  {session.current && <span className="status-pill ok">{t("admin.sessions.thisBrowser")}</span>}
                </div>
                <span>{session.userAgent ?? t("admin.sessions.unknownClient")}</span>
                <span className="mono">{session.ipAddress ?? t("admin.sessions.unknownIp")} · {session.id.slice(0, 10)}…</span>
              </div>
              <div className="session-times">
                <span>{t("admin.sessions.created", { time: new Date(session.createdAt).toLocaleString() })}</span>
                <span>{t("admin.sessions.expires", { time: new Date(session.expiresAt).toLocaleString() })}</span>
              </div>
              <button
                className="ghost-btn danger"
                disabled={revoking === session.id}
                onClick={() => void revoke(session)}
                title={session.current ? t("admin.sessions.revokeCurrentHint") : t("admin.sessions.revoke")}
              >
                <Trash2 size={15} />
                {revoking === session.id ? t("admin.sessions.revoking") : t("admin.sessions.revoke")}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
