import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AdminUsersResponse } from "@nodebeacon/shared";
import { useApi } from "../../lib/useApi";

export function UsersPage() {
  const { t } = useTranslation();
  const { data, error, loading } = useApi<AdminUsersResponse>("/api/admin/users");

  if (loading) return <div className="admin-state">{t("common.loading")}</div>;
  if (error) {
    return (
      <div className="admin-state error">
        <AlertCircle size={16} /> {error}
      </div>
    );
  }
  const users = data?.users ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("admin.users.title")}</h2>
        <span className="page-sub">{t("admin.users.subtitle", { count: users.length })}</span>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("admin.users.thEmail")}</th>
              <th>{t("admin.users.thRole")}</th>
              <th>{t("admin.users.thId")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <b>{u.email}</b>
                </td>
                <td>
                  <span className="role-badge">{u.role}</span>
                </td>
                <td className="mono muted">{u.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="admin-hint">{t("admin.users.hint")}</p>
    </div>
  );
}
