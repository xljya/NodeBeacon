import { useState, type ReactNode } from "react";
import { AlertCircle, X } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const { data, error, loading } = useApi<AdminNodesResponse>("/api/admin/nodes");
  const [selected, setSelected] = useState<AdminNode | null>(null);

  if (loading) return <div className="admin-state">{t("common.loading")}</div>;
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
        <h2>{t("admin.nodes.title")}</h2>
        <span className="page-sub">{t("admin.nodes.subtitle", { count: nodes.length })}</span>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("admin.nodes.thName")}</th>
              <th>{t("admin.nodes.thGroup")}</th>
              <th>{t("admin.nodes.thRegion")}</th>
              <th>{t("admin.nodes.thProvider")}</th>
              <th>{t("admin.nodes.thStatus")}</th>
              <th>{t("admin.nodes.thVisible")}</th>
              <th>{t("admin.nodes.thOrder")}</th>
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
                <td>{n.public ? t("admin.nodes.visiblePublic") : t("admin.nodes.visibleHidden")}</td>
                <td className="mono">{n.displayOrder}</td>
                <td className="row-action">{t("admin.nodes.view")}</td>
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
  const { t } = useTranslation();
  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={t("admin.nodes.drawerAria", { name: node.name })}>
        <div className="drawer-head">
          <h3>{node.name}</h3>
          <button className="icon-btn" onClick={onClose} aria-label={t("admin.nodes.close")}>
            <X size={18} />
          </button>
        </div>
        <div className="drawer-body">
          <div className="edit-note">{t("admin.nodes.editNote")}</div>
          <Field label={t("admin.nodes.fName")}>
            <input value={node.name} disabled />
          </Field>
          <Field label={t("admin.nodes.fGroup")}>
            <input value={node.group} disabled />
          </Field>
          <Field label={t("admin.nodes.fRegion")}>
            <input value={node.region} disabled />
          </Field>
          <Field label={t("admin.nodes.fOrder")}>
            <input value={String(node.displayOrder)} disabled />
          </Field>
          <Field label={t("admin.nodes.fTags")}>
            <input value={node.tags.join(", ")} disabled />
          </Field>
          <Field label={t("admin.nodes.fVisibility")}>
            <input value={node.public ? t("admin.nodes.visiblePublic") : t("admin.nodes.visibleHidden")} disabled />
          </Field>
          <div className="field">
            <span>{t("admin.nodes.selector")}</span>
            <code className="selector">{formatSelector(node.labels)}</code>
          </div>
          <button className="primary-btn" disabled title={t("admin.nodes.saveNextTitle")}>
            {t("admin.nodes.saveNext")}
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
