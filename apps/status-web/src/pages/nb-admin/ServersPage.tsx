import { useMemo, useState } from "react";
import {
  Button,
  Checkbox,
  Dialog,
  Flex,
  IconButton,
  Switch,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MenuIcon, Pencil, Plus, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import Flag from "@/components/Flag";
import ConfirmDeleteButton from "@/components/admin/ConfirmDeleteButton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminDelete, adminPatch, adminPost } from "@/lib/adminGateway";
import { useAdminResource } from "@/lib/useAdminResource";
import type { AdminNode, AdminNodeMutation } from "@/lib/contracts";
import { AdminError, AdminLoading, AdminPage } from "./AdminPage";

function formatLabels(labels: Record<string, string>): string {
  return Object.entries(labels).map(([key, value]) => `${key}=${value}`).join(",");
}

function parseLabels(text: string): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const part of text.split(/[,;\n]/)) {
    const [key, ...rest] = part.split("=");
    if (key?.trim()) labels[key.trim()] = rest.join("=").trim();
  }
  return labels;
}

export default function ServersPage() {
  const { t } = useTranslation();
  const { data, error, loading, reload } = useAdminResource<{ nodes: AdminNode[] }>("/api/admin/nodes");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<AdminNode | "new" | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = [...(data?.nodes ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);
    if (!term) return list;
    return list.filter((node) =>
      [node.id, node.name, node.provider, node.group, node.region, node.ipAddress ?? "", node.privateNotes ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [data?.nodes, query]);

  const reorder = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = filtered.map((node) => node.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    await adminPatch("/api/admin/nodes/order", { ids: next });
    await reload();
  };

  if (loading) return <AdminLoading />;
  if (error) return <AdminError message={error} onRetry={() => void reload()} />;

  return (
    <AdminPage
      title={t("admin.nodeTable.nodeList", "Servers")}
      description={t("nb.servers.desc", "Create, edit, reorder and hide nodes. Private IP, labels, notes and billing stay on Owner pages.")}
      actions={
        <Flex gap="2">
          <TextField.Root placeholder={t("admin.nodeTable.searchByName")} value={query} onChange={(event) => setQuery(event.target.value)} />
          <Button onClick={() => setEditing("new")}>
            <Plus size={16} /> {t("admin.nodeTable.addNode")}
          </Button>
        </Flex>
      }
    >
      <div className="rounded-md overflow-hidden">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void reorder(event)}>
          <Table>
            <TableHeader style={{ backgroundColor: "var(--accent-4)" }}>
              <TableRow>
                <TableHead />
                <TableHead>{t("admin.nodeTable.name")}</TableHead>
                <TableHead>{t("admin.nodeDetail.ipAddress")}</TableHead>
                <TableHead>{t("common.group")}</TableHead>
                <TableHead>{t("nb.servers.public", "Public")}</TableHead>
                <TableHead>{t("admin.nodeEdit.remark")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              <SortableContext items={filtered.map((node) => node.id)} strategy={verticalListSortingStrategy}>
                {filtered.map((node) => (
                  <SortableServerRow
                    key={node.id}
                    node={node}
                    onEdit={() => setEditing(node)}
                    onDelete={async () => {
                      await adminDelete(`/api/admin/nodes/${encodeURIComponent(node.id)}`);
                      await reload();
                    }}
                    onTogglePublic={async (next) => {
                      await adminPatch(`/api/admin/nodes/${encodeURIComponent(node.id)}`, { public: next });
                      await reload();
                    }}
                  />
                ))}
              </SortableContext>
            </TableBody>
          </Table>
        </DndContext>
      </div>
      {editing ? (
        <ServerEditor
          node={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      ) : null}
    </AdminPage>
  );
}

function SortableServerRow({
  node,
  onEdit,
  onDelete,
  onTogglePublic,
}: {
  node: AdminNode;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onTogglePublic: (value: boolean) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: node.id });
  return (
    <TableRow ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="hover:bg-accent-a2">
      <TableCell>
        <div {...attributes} {...listeners} className="cursor-move p-2">
          <MenuIcon size={16} color="var(--gray-8)" />
        </div>
      </TableCell>
      <TableCell>
        <Flex align="center" gap="2">
          <Flag flag={node.countryCode ?? node.region} size="6" />
          <Text weight="bold">{node.name}</Text>
        </Flex>
      </TableCell>
      <TableCell><Text size="2">{node.ipAddress || "—"}</Text></TableCell>
      <TableCell><Text size="2">{node.group}</Text></TableCell>
      <TableCell>
        <Switch checked={node.public} onCheckedChange={(checked) => void onTogglePublic(Boolean(checked))} />
      </TableCell>
      <TableCell><Text size="2">{node.privateNotes || "—"}</Text></TableCell>
      <TableCell>
        <Flex gap="2">
          <IconButton variant="ghost" onClick={onEdit} title={t("admin.nodeEdit.editInfo")}>
            <Pencil size={16} />
          </IconButton>
          <ConfirmDeleteButton itemName={node.name} onConfirm={onDelete}>
            <IconButton variant="ghost" color="red" title={t("common.delete")} aria-label={t("common.delete")}>
              <Trash2Icon size={16} />
            </IconButton>
          </ConfirmDeleteButton>
        </Flex>
      </TableCell>
    </TableRow>
  );
}

function ServerEditor({
  node,
  onClose,
  onSaved,
}: {
  node: AdminNode | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [id, setId] = useState(node?.id ?? "");
  const [name, setName] = useState(node?.name ?? "");
  const [provider, setProvider] = useState(node?.provider ?? "");
  const [group, setGroup] = useState(node?.group ?? "default");
  const [region, setRegion] = useState(node?.region ?? "");
  const [countryCode, setCountryCode] = useState(node?.countryCode ?? "");
  const [location, setLocation] = useState(node?.location ?? "");
  const [isPublic, setIsPublic] = useState(node?.public ?? true);
  const [labelsText, setLabelsText] = useState(formatLabels(node?.labels ?? { job: "node-exporter" }));
  const [tagsText, setTagsText] = useState((node?.tags ?? []).join(","));
  const [ipAddress, setIpAddress] = useState(node?.ipAddress ?? "");
  const [clientVersion, setClientVersion] = useState(node?.clientVersion ?? "");
  const [privateNotes, setPrivateNotes] = useState(node?.privateNotes ?? "");
  const [price, setPrice] = useState(String(node?.billing?.price ?? ""));
  const [currency, setCurrency] = useState(node?.billing?.currency ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const payload: AdminNodeMutation = {
      name,
      provider,
      group,
      region,
      countryCode,
      location,
      public: isPublic,
      labels: parseLabels(labelsText),
      tags: tagsText.split(/[,;]/).map((item) => item.trim()).filter(Boolean),
      ipAddress,
      clientVersion,
      privateNotes,
      billing: {
        price: price ? Number(price) : undefined,
        currency: currency || undefined,
      },
    };
    try {
      if (node) {
        await adminPatch(`/api/admin/nodes/${encodeURIComponent(node.id)}`, payload);
      } else {
        await adminPost("/api/admin/nodes", { ...payload, id });
      }
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Content>
        <Dialog.Title>{node ? t("admin.nodeEdit.editInfo") : t("admin.nodeTable.addNode")}</Dialog.Title>
        <Flex direction="column" gap="3" mt="3">
          {!node ? <TextField.Root placeholder="id" value={id} onChange={(event) => setId(event.target.value)} /> : null}
          <TextField.Root placeholder={t("admin.nodeEdit.name")} value={name} onChange={(event) => setName(event.target.value)} />
          <TextField.Root placeholder="provider" value={provider} onChange={(event) => setProvider(event.target.value)} />
          <TextField.Root placeholder={t("common.group")} value={group} onChange={(event) => setGroup(event.target.value)} />
          <TextField.Root placeholder="region" value={region} onChange={(event) => setRegion(event.target.value)} />
          <TextField.Root placeholder="country code" value={countryCode} onChange={(event) => setCountryCode(event.target.value)} />
          <TextField.Root placeholder="location" value={location} onChange={(event) => setLocation(event.target.value)} />
          <TextField.Root placeholder={t("admin.nodeDetail.ipAddress")} value={ipAddress} onChange={(event) => setIpAddress(event.target.value)} />
          <TextField.Root placeholder="labels" value={labelsText} onChange={(event) => setLabelsText(event.target.value)} />
          <TextField.Root placeholder={t("common.tags")} value={tagsText} onChange={(event) => setTagsText(event.target.value)} />
          <TextField.Root placeholder="client version" value={clientVersion} onChange={(event) => setClientVersion(event.target.value)} />
          <TextArea placeholder={t("admin.nodeEdit.remark")} value={privateNotes} onChange={(event) => setPrivateNotes(event.target.value)} />
          <Flex gap="2">
            <TextField.Root placeholder="price" value={price} onChange={(event) => setPrice(event.target.value)} />
            <TextField.Root placeholder="currency" value={currency} onChange={(event) => setCurrency(event.target.value)} />
          </Flex>
          <Flex align="center" gap="2">
            <Checkbox checked={isPublic} onCheckedChange={(checked) => setIsPublic(Boolean(checked))} />
            <Text size="2">{t("nb.servers.public", "Public")}</Text>
          </Flex>
          <Flex justify="end" gap="2">
            <Button variant="soft" onClick={onClose}>{t("common.cancel")}</Button>
            <Button disabled={saving} onClick={() => void save()}>{t("common.save")}</Button>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
