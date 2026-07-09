import { useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Filter,
  Info,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Tag,
  X
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AdminNode, AdminNodesResponse, NodeHealthStatus } from "@nodebeacon/shared";
import { useApi } from "../../lib/useApi";
import { StatusBadge } from "../components/StatusBadge";

type StatusFilter = "all" | NodeHealthStatus;
type VisibilityFilter = "all" | "public" | "hidden";

function formatSelector(labels: Record<string, string>): string {
  const inner = Object.entries(labels)
    .map(([k, v]) => `${k}="${v}"`)
    .join(", ");
  return `{${inner}}`;
}

export function NodesPage() {
  const { t } = useTranslation();
  const { data, error, loading, reload } = useApi<AdminNodesResponse>("/api/admin/nodes");
  const [selected, setSelected] = useState<AdminNode | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [group, setGroup] = useState("all");
  const [region, setRegion] = useState("all");
  const [visibility, setVisibility] = useState<VisibilityFilter>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const nodes = data?.nodes ?? [];
  const groups = useMemo(() => unique(nodes.map((node) => node.group)), [nodes]);
  const regions = useMemo(() => unique(nodes.map((node) => node.region)), [nodes]);

  const filteredNodes = useMemo(() => {
    const term = query.trim().toLowerCase();
    return nodes.filter((node) => {
      if (status !== "all" && node.status !== status) return false;
      if (group !== "all" && node.group !== group) return false;
      if (region !== "all" && node.region !== region) return false;
      if (visibility === "public" && !node.public) return false;
      if (visibility === "hidden" && node.public) return false;
      if (!term) return true;
      return [
        node.name,
        node.id,
        node.provider,
        node.group,
        node.region,
        node.location ?? "",
        node.tags.join(" "),
        formatSelector(node.labels)
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [nodes, query, status, group, region, visibility]);

  const online = nodes.filter((node) => node.online).length;
  const hidden = nodes.filter((node) => !node.public).length;
  const selectedNodes = useMemo(
    () => nodes.filter((node) => selectedIds.includes(node.id)),
    [nodes, selectedIds]
  );
  const allFilteredSelected =
    filteredNodes.length > 0 && filteredNodes.every((node) => selectedIds.includes(node.id));

  const copyNodeSelector = async (node: AdminNode) => {
    await navigator.clipboard?.writeText(formatSelector(node.labels));
  };

  const copySelectedSelectors = async () => {
    await navigator.clipboard?.writeText(
      selectedNodes.map((node) => `${node.name} ${formatSelector(node.labels)}`).join("\n")
    );
  };

  const toggleNodeSelection = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const toggleFilteredSelection = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filteredNodes.some((node) => node.id === id)));
      return;
    }
    setSelectedIds((prev) => [...new Set([...prev, ...filteredNodes.map((node) => node.id)])]);
  };

  if (loading) return <div className="admin-state">{t("common.loading")}</div>;
  if (error) {
    return (
      <div className="admin-state error">
        <AlertCircle size={16} /> {error}
      </div>
    );
  }

  return (
    <div className="page page-wide">
      <div className="page-head page-head-spread">
        <div>
          <h2>{t("admin.nodes.title")}</h2>
          <span className="page-sub">{t("admin.nodes.subtitle", { count: nodes.length })}</span>
        </div>
        <div className="page-actions">
          <button className="ghost-btn" onClick={reload}>
            <RefreshCw size={15} /> {t("admin.actions.refresh")}
          </button>
          <button className="primary-btn" disabled title={t("admin.nodes.addNextTitle")}>
            <Plus size={15} /> {t("admin.nodes.addNode")}
          </button>
        </div>
      </div>

      <div className="mini-stat-grid">
        <MiniStat icon={<CheckCircle2 size={17} />} label={t("admin.nodes.onlineNow")} value={`${online}/${nodes.length}`} tone="ok" />
        <MiniStat icon={<EyeOff size={17} />} label={t("admin.nodes.hiddenCount")} value={hidden} />
        <MiniStat icon={<MapPin size={17} />} label={t("admin.nodes.regionCount")} value={regions.length} />
        <MiniStat icon={<Filter size={17} />} label={t("admin.nodes.filteredCount")} value={filteredNodes.length} />
      </div>

      <div className="admin-toolbar">
        <label className="toolbar-search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("admin.nodes.searchPlaceholder")} />
        </label>
        <Select label={t("admin.nodes.filterStatus")} value={status} onChange={(value) => setStatus(value as StatusFilter)}>
          <option value="all">{t("admin.filters.all")}</option>
          <option value="online">{t("admin.status.online")}</option>
          <option value="degraded">{t("admin.status.degraded")}</option>
          <option value="offline">{t("admin.status.offline")}</option>
          <option value="unknown">{t("admin.status.unknown")}</option>
        </Select>
        <Select label={t("admin.nodes.filterGroup")} value={group} onChange={setGroup}>
          <option value="all">{t("admin.filters.allGroups")}</option>
          {groups.map((item) => (
            <option value={item} key={item}>{item}</option>
          ))}
        </Select>
        <Select label={t("admin.nodes.filterRegion")} value={region} onChange={setRegion}>
          <option value="all">{t("admin.filters.allRegions")}</option>
          {regions.map((item) => (
            <option value={item} key={item}>{item}</option>
          ))}
        </Select>
        <Select label={t("admin.nodes.filterVisibility")} value={visibility} onChange={(value) => setVisibility(value as VisibilityFilter)}>
          <option value="all">{t("admin.filters.allVisibility")}</option>
          <option value="public">{t("admin.nodes.visiblePublic")}</option>
          <option value="hidden">{t("admin.nodes.visibleHidden")}</option>
        </Select>
      </div>

      {selectedNodes.length > 0 && (
        <div className="bulk-bar">
          <div>
            <b>{t("admin.nodes.selectedCount", { count: selectedNodes.length })}</b>
            <span>{t("admin.nodes.bulkHint")}</span>
          </div>
          <div className="bulk-actions">
            <button className="ghost-btn" onClick={copySelectedSelectors}>
              <Copy size={15} /> {t("admin.nodes.copySelectedSelectors")}
            </button>
            <button className="primary-btn" disabled title={t("admin.nodes.saveNextTitle")}>
              {t("admin.nodes.editSelectedNext")}
            </button>
            <button className="icon-btn" onClick={() => setSelectedIds([])} title={t("admin.nodes.clearSelection")}>
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="select-col">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleFilteredSelection}
                  aria-label={t("admin.nodes.selectAll")}
                />
              </th>
              <th>{t("admin.nodes.thName")}</th>
              <th>{t("admin.nodes.thGroup")}</th>
              <th>{t("admin.nodes.thRegion")}</th>
              <th>{t("admin.nodes.thProvider")}</th>
              <th>{t("admin.nodes.thStatus")}</th>
              <th>{t("admin.nodes.thVisible")}</th>
              <th>{t("admin.nodes.thUpdated")}</th>
              <th>{t("admin.nodes.thOrder")}</th>
              <th>{t("admin.nodes.thActions")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredNodes.map((node) => (
              <tr
                key={node.id}
                className={selectedIds.includes(node.id) ? "clickable selected" : "clickable"}
                onClick={() => setSelected(node)}
              >
                <td className="select-col">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(node.id)}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => toggleNodeSelection(node.id)}
                    aria-label={t("admin.nodes.selectNode", { name: node.name })}
                  />
                </td>
                <td>
                  <b>{node.name}</b>
                  <div className="muted mono">{node.id}</div>
                </td>
                <td>{node.group}</td>
                <td>
                  {node.region}
                  {node.location && <div className="muted">{node.location}</div>}
                </td>
                <td>{node.provider}</td>
                <td>
                  <StatusBadge status={node.status} />
                </td>
                <td>
                  <span className={node.public ? "visibility-chip" : "visibility-chip muted-chip"}>
                    {node.public ? <Eye size={13} /> : <EyeOff size={13} />}
                    {node.public ? t("admin.nodes.visiblePublic") : t("admin.nodes.visibleHidden")}
                  </span>
                </td>
                <td className="mono muted">{new Date(node.updatedAt).toLocaleString()}</td>
                <td className="mono">{node.displayOrder}</td>
                <td>
                  <div className="table-actions">
                    <button
                      className="icon-btn table-icon-action"
                      title={t("admin.nodes.copySelectorTitle")}
                      aria-label={t("admin.nodes.copySelectorTitle")}
                      onClick={(event) => {
                        event.stopPropagation();
                        void copyNodeSelector(node);
                      }}
                    >
                      <Copy size={14} />
                    </button>
                    {node.public ? (
                      <a
                        className="icon-btn table-icon-action"
                        href={`/nodes/${node.id}`}
                        title={t("admin.nodes.openDetailTitle")}
                        aria-label={t("admin.nodes.openDetailTitle")}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <ExternalLink size={14} />
                      </a>
                    ) : (
                      <button
                        className="icon-btn table-icon-action"
                        disabled
                        title={t("admin.nodes.openHiddenTitle")}
                        aria-label={t("admin.nodes.openHiddenTitle")}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <ExternalLink size={14} />
                      </button>
                    )}
                    <button
                      className="icon-btn table-icon-action"
                      title={t("admin.nodes.viewDetailsTitle")}
                      aria-label={t("admin.nodes.viewDetailsTitle")}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelected(node);
                      }}
                    >
                      <Info size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredNodes.length === 0 && (
          <div className="empty-table">
            <b>{t("admin.nodes.emptyTitle")}</b>
            <span>{t("admin.nodes.emptyText")}</span>
          </div>
        )}
      </div>

      {selected && <NodeDrawer node={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function NodeDrawer({ node, onClose }: { node: AdminNode; onClose: () => void }) {
  const { t } = useTranslation();
  const selector = formatSelector(node.labels);

  const copySelector = async () => {
    await navigator.clipboard.writeText(selector);
  };

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={t("admin.nodes.drawerAria", { name: node.name })}>
        <div className="drawer-head">
          <div>
            <h3>{node.name}</h3>
            <span className="muted mono">{node.id}</span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={t("admin.nodes.close")}>
            <X size={18} />
          </button>
        </div>
        <div className="drawer-body">
          <div className="drawer-summary">
            <StatusBadge status={node.status} />
            <span className={node.public ? "visibility-chip" : "visibility-chip muted-chip"}>
              {node.public ? <Eye size={13} /> : <EyeOff size={13} />}
              {node.public ? t("admin.nodes.visiblePublic") : t("admin.nodes.visibleHidden")}
            </span>
          </div>
          <div className="edit-note">{t("admin.nodes.editNote")}</div>
          <div className="drawer-metrics">
            <InfoTile icon={<Clock3 size={16} />} label={t("admin.nodes.lastReport")} value={new Date(node.updatedAt).toLocaleString()} />
            <InfoTile icon={<MapPin size={16} />} label={t("admin.nodes.location")} value={node.location ?? node.region} />
            <InfoTile icon={<Tag size={16} />} label={t("admin.nodes.tagCount")} value={String(node.tags.length)} />
          </div>
          <Field label={t("admin.nodes.fName")}>
            <input value={node.name} disabled />
          </Field>
          <Field label={t("admin.nodes.fProvider")}>
            <input value={node.provider} disabled />
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
            <input value={node.tags.join(", ") || "—"} disabled />
          </Field>
          <Field label={t("admin.nodes.fVisibility")}>
            <input value={node.public ? t("admin.nodes.visiblePublic") : t("admin.nodes.visibleHidden")} disabled />
          </Field>
          <div className="field">
            <span>{t("admin.nodes.selector")}</span>
            <code className="selector">{selector}</code>
          </div>
          <div className="drawer-actions">
            <button className="ghost-btn" onClick={copySelector}>
              <Copy size={15} /> {t("admin.nodes.copySelector")}
            </button>
            {node.public && (
              <a className="ghost-btn" href={`/nodes/${node.id}`}>
                <ExternalLink size={15} /> {t("admin.nodes.openDetail")}
              </a>
            )}
            <button className="primary-btn" disabled title={t("admin.nodes.saveNextTitle")}>
              {t("admin.nodes.saveNext")}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <label className="toolbar-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
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

function InfoTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <section className="info-tile">
      {icon}
      <span>{label}</span>
      <b>{value}</b>
    </section>
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

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
