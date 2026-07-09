import type { ReactNode } from "react";
import { AlertCircle, KeyRound, RefreshCw, ShieldCheck, UserCheck, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AdminUsersResponse } from "@nodebeacon/shared";
import { useApi } from "../../lib/useApi";

export function UsersPage() {
  const { t } = useTranslation();
  const { data, error, loading, reload } = useApi<AdminUsersResponse>("/api/admin/users");

  if (loading) return <div className="admin-state">{t("common.loading")}</div>;
  if (error) {
    return (
      <div className="admin-state error">
        <AlertCircle size={16} /> {error}
      </div>
    );
  }
  const usersList = data?.users ?? [];
  const owners = usersList.filter((user) => user.role === "owner").length;
  const viewers = usersList.filter((user) => user.role === "viewer").length;

  return (
    <div className="page page-wide">
      <div className="page-head page-head-spread">
        <div>
          <h2>{t("admin.users.title")}</h2>
          <span className="page-sub">{t("admin.users.subtitle", { count: usersList.length })}</span>
        </div>
        <button className="ghost-btn" onClick={reload}>
          <RefreshCw size={15} /> {t("admin.actions.refresh")}
        </button>
      </div>

      <div className="mini-stat-grid">
        <MiniStat icon={<Users size={17} />} label={t("admin.users.totalAccounts")} value={usersList.length} />
        <MiniStat icon={<ShieldCheck size={17} />} label={t("admin.users.ownerAccounts")} value={owners} tone="ok" />
        <MiniStat icon={<UserCheck size={17} />} label={t("admin.users.viewerAccounts")} value={viewers} />
        <MiniStat icon={<KeyRound size={17} />} label={t("admin.users.authSource")} value={t("admin.users.envBacked")} />
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("admin.users.thEmail")}</th>
              <th>{t("admin.users.thRole")}</th>
              <th>{t("admin.users.thSource")}</th>
              <th>{t("admin.users.thId")}</th>
            </tr>
          </thead>
          <tbody>
            {usersList.map((user) => (
              <tr key={user.id}>
                <td>
                  <b>{user.email}</b>
                  <div className="muted">{t("admin.users.primaryIdentity")}</div>
                </td>
                <td>
                  <span className="role-badge">{user.role}</span>
                </td>
                <td>{t("admin.users.envBacked")}</td>
                <td className="mono muted">{user.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="section-panel">
        <div className="section-head">
          <div>
            <h3>{t("admin.users.accessModelTitle")}</h3>
            <p>{t("admin.users.accessModelText")}</p>
          </div>
          <ShieldCheck size={18} />
        </div>
        <div className="setting-list compact">
          <div className="setting-card flat">
            <div className="setting-text">
              <h3>{t("admin.users.ownerOnlyTitle")}</h3>
              <p>{t("admin.users.ownerOnlyDesc")}</p>
            </div>
            <span className="pill pill-ok">{t("admin.users.active")}</span>
          </div>
          <div className="setting-card flat">
            <div className="setting-text">
              <h3>{t("admin.users.persistenceTitle")}</h3>
              <p>{t("admin.users.persistenceDesc")}</p>
            </div>
            <span className="pill pill-warn">{t("admin.users.planned")}</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function MiniStat({ icon, label, value, tone }: { icon: ReactNode; label: string; value: ReactNode; tone?: "ok" }) {
  return (
    <section className={tone === "ok" ? "mini-stat ok-bg" : "mini-stat"}>
      <span>{icon}</span>
      <div>
        <b>{value}</b>
        <p>{label}</p>
      </div>
    </section>
  );
}
