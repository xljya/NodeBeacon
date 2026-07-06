import { AlertCircle } from "lucide-react";
import type { AdminUsersResponse } from "@nodebeacon/shared";
import { useApi } from "../../lib/useApi";

export function UsersPage() {
  const { data, error, loading } = useApi<AdminUsersResponse>("/api/admin/users");

  if (loading) return <div className="admin-state">加载中…</div>;
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
        <h2>用户</h2>
        <span className="page-sub">{users.length} 个账号 · owner 由环境变量创建</span>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>邮箱</th>
              <th>角色</th>
              <th>ID</th>
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

      <p className="admin-hint">
        多用户、`viewer` 角色和账号禁用将随 SQLite 持久化在后续版本加入。
      </p>
    </div>
  );
}
