import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertCircle,
  Check,
  ChevronRight,
  CircleDollarSign,
  Columns3,
  Copy,
  Download,
  GripVertical,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Terminal,
  Trash2,
  X
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AdminNode, AdminNodeMutation, AdminNodeResponse, AdminNodesResponse } from "@nodebeacon/shared";
import { apiDelete, apiPatch, apiPost } from "../../lib/api";
import { useApi } from "../../lib/useApi";

type DrawerState =
  | { type: "add" }
  | { type: "edit"; node: AdminNode }
  | { type: "billing"; node: AdminNode }
  | { type: "install"; node: AdminNode }
  | { type: "remote"; node: AdminNode }
  | null;

interface NodeFormState {
  id: string;
  name: string;
  provider: string;
  group: string;
  region: string;
  location: string;
  displayOrder: string;
  public: boolean;
  labelsText: string;
  tagsText: string;
  ipAddress: string;
  clientVersion: string;
  privateNotes: string;
}

interface BillingFormState {
  price: string;
  currency: string;
  cycleDays: string;
  expiresAt: string;
  autoRenewal: boolean;
}

type OptionalColumn = "ip" | "version" | "group" | "notes" | "billing";

const OPTIONAL_COLUMNS: { id: OptionalColumn; labelKey: string }[] = [
  { id: "ip", labelKey: "admin.nodes.thIp" },
  { id: "version", labelKey: "admin.nodes.thClientVersion" },
  { id: "group", labelKey: "admin.nodes.thGroup" },
  { id: "notes", labelKey: "admin.nodes.thPrivateNotes" },
  { id: "billing", labelKey: "admin.nodes.thBilling" }
];

const EMPTY_FORM: NodeFormState = {
  id: "",
  name: "",
  provider: "",
  group: "default",
  region: "unknown",
  location: "",
  displayOrder: "",
  public: true,
  labelsText: "job=node-exporter",
  tagsText: "",
  ipAddress: "",
  clientVersion: "",
  privateNotes: ""
};

export function NodesPage() {
  const { t } = useTranslation();
  const { data, error, loading, reload } = useApi<AdminNodesResponse>("/api/admin/nodes");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<OptionalColumn, boolean>>({
    ip: true,
    version: true,
    group: true,
    notes: true,
    billing: true
  });
  const [actionError, setActionError] = useState<string | null>(null);

  const nodes = data?.nodes ?? [];
  const filteredNodes = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return nodes;
    return nodes.filter((node) =>
      [
        node.id,
        node.name,
        node.provider,
        node.group,
        node.region,
        node.ipAddress ?? "",
        node.clientVersion ?? "",
        node.privateNotes ?? "",
        node.tags.join(" "),
        formatSelector(node.labels)
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [nodes, query]);

  const allFilteredSelected =
    filteredNodes.length > 0 && filteredNodes.every((node) => selectedIds.includes(node.id));
  const selectedNodes = nodes.filter((node) => selectedIds.includes(node.id));

  const toggleFilteredSelection = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filteredNodes.some((node) => node.id === id)));
      return;
    }
    setSelectedIds((prev) => [...new Set([...prev, ...filteredNodes.map((node) => node.id)])]);
  };

  const toggleNodeSelection = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const copySelectedSelectors = async () => {
    await copyText(selectedNodes.map((node) => `${node.name} ${formatSelector(node.labels)}`).join("\n"));
  };

  const downloadSelected = () => {
    if (selectedNodes.length === 0) return;
    downloadText(selectedNodes.map(toNodeConfigSnippet).join("\n"), "nodebeacon-nodes.yaml");
  };

  const deleteNode = async (node: AdminNode) => {
    if (!window.confirm(t("admin.nodes.confirmDelete", { name: node.name }))) return;
    try {
      setActionError(null);
      await apiDelete<{ ok: true }>(`/api/admin/nodes/${encodeURIComponent(node.id)}`);
      setSelectedIds((prev) => prev.filter((id) => id !== node.id));
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("common.requestFailed", { status: 0 }));
    }
  };

  const downloadNode = (node: AdminNode) => {
    downloadText(toNodeConfigSnippet(node), `${node.id}.nodebeacon.yaml`);
  };

  const reorderNodes = async (targetId: string) => {
    if (!draggingId || draggingId === targetId || query.trim()) return;
    const from = nodes.findIndex((node) => node.id === draggingId);
    const to = nodes.findIndex((node) => node.id === targetId);
    if (from < 0 || to < 0) return;

    const reordered = [...nodes];
    const [moved] = reordered.splice(from, 1);
    if (!moved) return;
    reordered.splice(to, 0, moved);
    setDraggingId(null);
    setReordering(true);
    setActionError(null);
    try {
      await Promise.all(
        reordered.map((node, index) =>
          apiPatch<AdminNodeResponse>(`/api/admin/nodes/${encodeURIComponent(node.id)}`, { displayOrder: (index + 1) * 10 })
        )
      );
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("common.requestFailed", { status: 0 }));
    } finally {
      setReordering(false);
    }
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
    <div className="komari-page">
      <div className="komari-page-head">
        <h2>{t("admin.nodes.title")}</h2>
        <div className="komari-list-actions">
          <label className="komari-search">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("admin.nodes.searchPlaceholder")} />
          </label>
          <button className="komari-muted-btn" onClick={reload} title={t("admin.actions.refresh")}>
            <RefreshCw size={18} />
          </button>
          <div className="komari-column-menu">
            <button className="komari-muted-btn" onClick={() => setColumnsOpen((open) => !open)} title="Configure columns" aria-expanded={columnsOpen}>
              <Columns3 size={18} />
            </button>
            {columnsOpen && (
              <div className="komari-column-popover">
                {OPTIONAL_COLUMNS.map(({ id, labelKey }) => (
                  <label key={id}>
                    <input type="checkbox" checked={visibleColumns[id]} onChange={() => setVisibleColumns((columns) => ({ ...columns, [id]: !columns[id] }))} />
                    {t(labelKey)}
                  </label>
                ))}
              </div>
            )}
          </div>
          <button className="komari-add-btn" onClick={() => setDrawer({ type: "add" })}>
            <Plus size={19} />
            <span>{t("admin.nodes.addNode")}</span>
          </button>
        </div>
      </div>

      {selectedNodes.length > 0 && (
        <div className="komari-bulk-bar">
          <span>{t("admin.nodes.selectedCount", { count: selectedNodes.length })}</span>
          <button className="ghost-btn" onClick={copySelectedSelectors}>
            <Copy size={15} /> {t("admin.nodes.copySelectedSelectors")}
          </button>
          <button className="ghost-btn" onClick={downloadSelected}>
            <Download size={15} /> {t("admin.nodes.downloadConfig")}
          </button>
          <button className="icon-btn" onClick={() => setSelectedIds([])} title={t("admin.nodes.clearSelection")}>
            <X size={15} />
          </button>
        </div>
      )}

      {actionError && <div className="admin-state error table-action-error"><AlertCircle size={16} /> {actionError}</div>}

      <div className="komari-table-wrap">
        <table className="komari-table">
          <thead>
            <tr>
              <th className="komari-grip-col" />
              <th className="komari-select-col">
                <input type="checkbox" checked={allFilteredSelected} onChange={toggleFilteredSelection} aria-label={t("admin.nodes.selectAll")} />
              </th>
              <th>{t("admin.nodes.thName")}</th>
              {visibleColumns.ip && <th>{t("admin.nodes.thIp")}</th>}
              {visibleColumns.version && <th>{t("admin.nodes.thClientVersion")}</th>}
              {visibleColumns.group && <th>{t("admin.nodes.thGroup")}</th>}
              {visibleColumns.notes && <th>{t("admin.nodes.thPrivateNotes")}</th>}
              {visibleColumns.billing && <th>{t("admin.nodes.thBilling")}</th>}
              <th className="komari-action-col">{t("admin.nodes.thActions")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredNodes.map((node) => (
              <tr
                key={node.id}
                className={draggingId === node.id ? "node-row-dragging" : undefined}
                draggable={!query.trim() && !reordering}
                onDragStart={() => setDraggingId(node.id)}
                onDragEnd={() => setDraggingId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => void reorderNodes(node.id)}
              >
                <td className="komari-grip-col">
                  <span title={query.trim() ? "Clear search to reorder nodes" : "Drag to reorder"}><GripVertical size={18} /></span>
                </td>
                <td className="komari-select-col">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(node.id)}
                    onChange={() => toggleNodeSelection(node.id)}
                    aria-label={t("admin.nodes.selectNode", { name: node.name })}
                  />
                </td>
                <td className="node-name-cell">
                  <span className={node.online ? "node-mini-status online" : "node-mini-status"} />
                  <button className="node-name-button" onClick={() => setDrawer({ type: "edit", node })}>
                    {node.name}
                  </button>
                </td>
                {visibleColumns.ip && <td><button className="inline-copy" onClick={() => void copyText(displayIp(node))} title={t("admin.nodes.copyIp")}>{displayIp(node)}<Copy size={16} /></button></td>}
                {visibleColumns.version && <td>{node.clientVersion || t("admin.nodes.defaultClientVersion")}</td>}
                {visibleColumns.group && <td>{node.group || "-"}</td>}
                {visibleColumns.notes && <td className="notes-cell">{node.privateNotes || "-"}</td>}
                {visibleColumns.billing && <td>{formatBilling(node)}</td>}
                <td>
                  <div className="komari-row-actions">
                    <button title={t("admin.nodes.downloadConfig")} onClick={() => downloadNode(node)}>
                      <Download size={19} />
                    </button>
                    <button title={t("admin.nodes.remoteTerminal")} onClick={() => setDrawer({ type: "remote", node })}>
                      <Terminal size={19} />
                      <ChevronRight size={15} />
                    </button>
                    <button title={t("admin.nodes.editInfo")} onClick={() => setDrawer({ type: "edit", node })}>
                      <Pencil size={19} />
                    </button>
                    <button title={t("admin.nodes.billing")} onClick={() => setDrawer({ type: "billing", node })}>
                      <CircleDollarSign size={19} />
                    </button>
                    <button className="danger" title={t("admin.nodes.delete")} onClick={() => void deleteNode(node)}>
                      <Trash2 size={19} />
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

      {drawer?.type === "add" && <NodeEditor mode="add" onClose={() => setDrawer(null)} onSaved={reload} />}
      {drawer?.type === "edit" && <NodeEditor mode="edit" node={drawer.node} onClose={() => setDrawer(null)} onSaved={reload} />}
      {drawer?.type === "billing" && <BillingEditor node={drawer.node} onClose={() => setDrawer(null)} onSaved={reload} />}
      {drawer?.type === "install" && <InstallDrawer node={drawer.node} onClose={() => setDrawer(null)} />}
      {drawer?.type === "remote" && <RemoteDrawer node={drawer.node} onClose={() => setDrawer(null)} />}
    </div>
  );
}

function NodeEditor({
  mode,
  node,
  onClose,
  onSaved
}: {
  mode: "add" | "edit";
  node?: AdminNode;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<NodeFormState>(() => (node ? formFromNode(node) : EMPTY_FORM));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = mutationFromForm(form);
      if (mode === "add") {
        await apiPost<AdminNodeResponse>("/api/admin/nodes", payload);
      } else if (node) {
        await apiPatch<AdminNodeResponse>(`/api/admin/nodes/${encodeURIComponent(node.id)}`, payload);
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.requestFailed", { status: 0 }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminDrawer title={mode === "add" ? t("admin.nodes.addNode") : t("admin.nodes.editInfo")} onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        {error && <div className="login-error">{error}</div>}
        <FormGrid>
          <Field label={t("admin.nodes.fId")}>
            <input value={form.id} disabled={mode === "edit"} onChange={(event) => setForm({ ...form, id: event.target.value })} required />
          </Field>
          <Field label={t("admin.nodes.fName")}>
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </Field>
          <Field label={t("admin.nodes.thIp")}>
            <input value={form.ipAddress} onChange={(event) => setForm({ ...form, ipAddress: event.target.value })} placeholder="10.77.0.2:9100" />
          </Field>
          <Field label={t("admin.nodes.thClientVersion")}>
            <input value={form.clientVersion} onChange={(event) => setForm({ ...form, clientVersion: event.target.value })} placeholder="node-exporter" />
          </Field>
          <Field label={t("admin.nodes.fProvider")}>
            <input value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value })} />
          </Field>
          <Field label={t("admin.nodes.fGroup")}>
            <input value={form.group} onChange={(event) => setForm({ ...form, group: event.target.value })} />
          </Field>
          <Field label={t("admin.nodes.fRegion")}>
            <input value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} />
          </Field>
          <Field label={t("admin.nodes.location")}>
            <input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
          </Field>
          <Field label={t("admin.nodes.fOrder")}>
            <input type="number" value={form.displayOrder} onChange={(event) => setForm({ ...form, displayOrder: event.target.value })} />
          </Field>
          <label className="field field-check">
            <input type="checkbox" checked={form.public} onChange={(event) => setForm({ ...form, public: event.target.checked })} />
            <span>{t("admin.nodes.visiblePublic")}</span>
          </label>
        </FormGrid>
        <Field label={t("admin.nodes.selector")}>
          <textarea value={form.labelsText} onChange={(event) => setForm({ ...form, labelsText: event.target.value })} rows={4} />
        </Field>
        <Field label={t("admin.nodes.fTags")}>
          <input value={form.tagsText} onChange={(event) => setForm({ ...form, tagsText: event.target.value })} placeholder="k3s, prometheus" />
        </Field>
        <Field label={t("admin.nodes.thPrivateNotes")}>
          <textarea value={form.privateNotes} onChange={(event) => setForm({ ...form, privateNotes: event.target.value })} rows={3} />
        </Field>
        <div className="drawer-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>{t("admin.nodes.close")}</button>
          <button type="submit" className="primary-btn" disabled={saving}>
            <Check size={15} /> {saving ? t("common.loading") : t("admin.nodes.save")}
          </button>
        </div>
      </form>
    </AdminDrawer>
  );
}

function BillingEditor({ node, onClose, onSaved }: { node: AdminNode; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useTranslation();
  const [form, setForm] = useState<BillingFormState>(() => ({
    price: node.billing?.price?.toString() ?? "",
    currency: node.billing?.currency ?? "USD",
    cycleDays: node.billing?.cycleDays?.toString() ?? "",
    expiresAt: node.billing?.expiresAt ?? "",
    autoRenewal: Boolean(node.billing?.autoRenewal)
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiPatch<AdminNodeResponse>(`/api/admin/nodes/${encodeURIComponent(node.id)}`, {
        billing: {
          price: form.price ? Number(form.price) : undefined,
          currency: form.currency,
          cycleDays: form.cycleDays ? Number(form.cycleDays) : undefined,
          expiresAt: form.expiresAt || undefined,
          autoRenewal: form.autoRenewal
        }
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.requestFailed", { status: 0 }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminDrawer title={t("admin.nodes.billing")} onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        {error && <div className="login-error">{error}</div>}
        <FormGrid>
          <Field label={t("admin.nodes.billingPrice")}>
            <input type="number" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} />
          </Field>
          <Field label={t("admin.nodes.billingCurrency")}>
            <input value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} />
          </Field>
          <Field label={t("admin.nodes.billingCycle")}>
            <input type="number" value={form.cycleDays} onChange={(event) => setForm({ ...form, cycleDays: event.target.value })} />
          </Field>
          <Field label={t("admin.nodes.billingExpires")}>
            <input type="date" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} />
          </Field>
          <label className="field field-check">
            <input type="checkbox" checked={form.autoRenewal} onChange={(event) => setForm({ ...form, autoRenewal: event.target.checked })} />
            <span>{t("admin.nodes.billingAutoRenewal")}</span>
          </label>
        </FormGrid>
        <div className="drawer-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>{t("admin.nodes.close")}</button>
          <button type="submit" className="primary-btn" disabled={saving}>{t("admin.nodes.save")}</button>
        </div>
      </form>
    </AdminDrawer>
  );
}

function InstallDrawer({ node, onClose }: { node: AdminNode; onClose: () => void }) {
  const { t } = useTranslation();
  const text = toNodeConfigSnippet(node);
  return (
    <AdminDrawer title={t("admin.nodes.installCommand")} onClose={onClose}>
      <p className="admin-copy-note">{t("admin.nodes.installHint")}</p>
      <code className="selector block-selector">{text}</code>
      <div className="drawer-actions">
        <button className="ghost-btn" onClick={() => copyText(text)}>
          <Copy size={15} /> {t("admin.nodes.copySelector")}
        </button>
      </div>
    </AdminDrawer>
  );
}

function RemoteDrawer({ node, onClose }: { node: AdminNode; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <AdminDrawer title={t("admin.nodes.remoteTerminal")} onClose={onClose}>
      <div className="admin-notice compact-notice">
        <Terminal size={18} />
        <div>
          <b>{t("admin.remote.disabledTitle")}</b>
          <p>{t("admin.remote.disabledText")}</p>
        </div>
      </div>
      <Field label={t("admin.nodes.selector")}>
        <code className="selector">{formatSelector(node.labels)}</code>
      </Field>
      <div className="drawer-actions">
        <a className="ghost-btn" href={`/nodes/${node.id}`}>
          {t("admin.nodes.openDetail")}
        </a>
      </div>
    </AdminDrawer>
  );
}

function AdminDrawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer komari-drawer" role="dialog" aria-label={title}>
        <div className="drawer-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  );
}

function FormGrid({ children }: { children: ReactNode }) {
  return <div className="form-grid">{children}</div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function formFromNode(node: AdminNode): NodeFormState {
  return {
    id: node.id,
    name: node.name,
    provider: node.provider,
    group: node.group,
    region: node.region,
    location: node.location ?? "",
    displayOrder: String(node.displayOrder),
    public: node.public,
    labelsText: labelsToText(node.labels),
    tagsText: node.tags.join(", "),
    ipAddress: node.ipAddress ?? "",
    clientVersion: node.clientVersion ?? "",
    privateNotes: node.privateNotes ?? ""
  };
}

function mutationFromForm(form: NodeFormState): AdminNodeMutation {
  return {
    id: form.id.trim(),
    name: form.name.trim(),
    provider: form.provider.trim() || "unknown",
    group: form.group.trim() || "default",
    region: form.region.trim() || "unknown",
    location: form.location.trim() || undefined,
    displayOrder: form.displayOrder ? Number(form.displayOrder) : undefined,
    public: form.public,
    labels: parseLabels(form.labelsText),
    tags: form.tagsText.split(",").map((tag) => tag.trim()).filter(Boolean),
    ipAddress: form.ipAddress.trim() || undefined,
    clientVersion: form.clientVersion.trim() || undefined,
    privateNotes: form.privateNotes.trim() || undefined
  };
}

function parseLabels(text: string): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const line of text.split(/\r?\n|,/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [rawKey, ...rawValue] = trimmed.split("=");
    const key = rawKey?.trim();
    const value = rawValue.join("=").trim().replace(/^"|"$/g, "");
    if (key && value) labels[key] = value;
  }
  return labels;
}

function labelsToText(labels: Record<string, string>): string {
  return Object.entries(labels).map(([key, value]) => `${key}=${value}`).join("\n");
}

function formatSelector(labels: Record<string, string>): string {
  const inner = Object.entries(labels)
    .map(([key, value]) => `${key}="${value}"`)
    .join(", ");
  return `{${inner}}`;
}

function displayIp(node: AdminNode): string {
  return node.ipAddress ?? node.labels.instance ?? node.labels.address ?? node.labels.job ?? "-";
}

function formatBilling(node: AdminNode): string {
  if (!node.billing) return "-";
  const parts = [];
  if (node.billing.price !== undefined) parts.push(`${node.billing.currency ?? "USD"} ${node.billing.price}`);
  if (node.billing.cycleDays) parts.push(`${node.billing.cycleDays}d`);
  if (node.billing.expiresAt) parts.push(node.billing.expiresAt);
  return parts.join(" / ") || "-";
}

function toNodeConfigSnippet(node: AdminNode): string {
  const lines = [
    `- id: ${node.id}`,
    `  name: ${node.name}`,
    `  provider: ${node.provider}`,
    `  group: ${node.group}`,
    `  region: ${node.region}`,
    `  displayOrder: ${node.displayOrder}`,
    `  public: ${node.public}`,
    "  labels:"
  ];
  for (const [key, value] of Object.entries(node.labels)) lines.push(`    ${key}: ${value}`);
  if (node.tags.length > 0) {
    lines.push("  tags:");
    for (const tag of node.tags) lines.push(`    - ${tag}`);
  }
  return `${lines.join("\n")}\n`;
}

function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: "text/yaml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function copyText(text: string): Promise<void> {
  await navigator.clipboard?.writeText(text);
}
