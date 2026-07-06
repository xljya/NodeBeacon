import { useState, type ReactNode } from "react";
import { AlertCircle, X } from "lucide-react";
import type { AdminNode, AdminNodesResponse } from "@nodebeacon/shared";
import { useApi } from "../../lib/useApi";
import { StatusBadge } from "../components/StatusBadge";

function formatSelector(labels: Record<string, string>): string {
  const inner = Object.entries(labels)
    .map(([k, v]) => `${k}="${v}"`)
    .join(", ");
  return `{${inner}}`;
}

export function NodesPage() {
  const { data, error, loading } = useApi<AdminNodesResponse>("/api/admin/nodes");
  const [selected, setSelected] = useState<AdminNode | null>(null);

  if (loading) return <div className="admin-state">加载中…</div>;
  if (error) {
    return (
      <div className="admin-state error">
        <AlertCircle size={16} /> {error}
      </div>
    );
  }
  const nodes = data?.nodes ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <h2>节点</h2>
        <span className="page-sub">{nodes.length} 台 · 展示配置来自节点注册表</span>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>分组</th>
              <th>区域</th>
              <th>供应商</th>
              <th>状态</th>
              <th>可见</th>
              <th>排序</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {nodes.map((n) => (
              <tr key={n.id} className="clickable" onClick={() => setSelected(n)}>
                <td>
                  <b>{n.name}</b>
                  <div className="muted mono">{n.id}</div>
                </td>
                <td>{n.group}</td>
                <td>{n.region}</td>
                <td>{n.provider}</td>
                <td>
                  <StatusBadge status={n.status} />
                </td>
                <td>{n.public ? "公开" : "隐藏"}</td>
                <td className="mono">{n.displayOrder}</td>
                <td className="row-action">查看</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && <NodeDrawer node={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function NodeDrawer({ node, onClose }: { node: AdminNode; onClose: () => void }) {
  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={`节点 ${node.name}`}>
        <div className="drawer-head">
          <h3>{node.name}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="drawer-body">
          <div className="edit-note">节点展示配置的编辑与写回将在下一步实现（本版只读）。</div>
          <Field label="展示名">
            <input value={node.name} disabled />
          </Field>
          <Field label="分组">
            <input value={node.group} disabled />
          </Field>
          <Field label="区域">
            <input value={node.region} disabled />
          </Field>
          <Field label="排序">
            <input value={String(node.displayOrder)} disabled />
          </Field>
          <Field label="标签">
            <input value={node.tags.join(", ")} disabled />
          </Field>
          <Field label="可见性">
            <input value={node.public ? "公开" : "隐藏"} disabled />
          </Field>
          <div className="field">
            <span>Prometheus 选择器</span>
            <code className="selector">{formatSelector(node.labels)}</code>
          </div>
          <button className="primary-btn" disabled title="下一步实现">
            保存（下一步）
          </button>
        </div>
      </aside>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
