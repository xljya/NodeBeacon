import { useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  Dialog,
  Flex,
  Switch,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { Pencil } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import ConfirmDeleteButton from "@/components/admin/ConfirmDeleteButton";
import { adminDelete, adminPatch, adminPost } from "@/lib/adminGateway";
import { buildAlertRuleMutation } from "@/lib/adminForms";
import { useAdminResource } from "@/lib/useAdminResource";
import type { AlertRule, NotificationChannel } from "@/lib/contracts";
import { AdminError, AdminLoading, AdminPage } from "./AdminPage";

export default function AlertRulesPage() {
  const { t } = useTranslation();
  const type = useLocation().pathname.endsWith("/load") ? "load" : "offline";
  const rulesResource = useAdminResource<{ rules: AlertRule[] }>("/api/admin/alert-rules");
  const channelsResource = useAdminResource<{ channels: NotificationChannel[] }>("/api/admin/notification-channels");
  const [editing, setEditing] = useState<AlertRule | "new" | null>(null);

  if (rulesResource.loading || channelsResource.loading) return <AdminLoading />;
  if (rulesResource.error || channelsResource.error) {
    return (
      <AdminError
        message={rulesResource.error ?? channelsResource.error ?? "Unavailable"}
        onRetry={() => void Promise.all([rulesResource.reload(), channelsResource.reload()])}
      />
    );
  }
  const rules = (rulesResource.data?.rules ?? []).filter((rule) => rule.type === type);

  return (
    <AdminPage
      title={type === "load" ? t("notification.load.title") : t("notification.offline.title")}
      description={t("nb.rules.desc", "Configure rule targets, channels and typed JSON settings. PromQL stays on the server.")}
      actions={<Button onClick={() => setEditing("new")}>{t("common.add", "Add")}</Button>}
    >
      <Flex direction="column" gap="3">
        {rules.map((rule) => (
          <Card key={rule.id}>
            <Flex justify="between" align="center" gap="3" wrap="wrap">
              <Flex direction="column">
                <Text weight="bold">{rule.name}</Text>
                <Text size="2" color="gray">
                  {rule.nodeId || "all nodes"} · {rule.channelIds.length} channel(s) · {rule.reconcileStatus}
                  {rule.reconcileError ? ` · ${rule.reconcileError}` : ""}
                </Text>
              </Flex>
              <Flex gap="2" align="center">
                <Switch
                  checked={rule.enabled}
                  onCheckedChange={(checked) => void adminPatch(`/api/admin/alert-rules/${rule.id}`, { enabled: Boolean(checked) }).then(() => rulesResource.reload())}
                />
                <Button variant="soft" onClick={() => setEditing(rule)}>
                  <Pencil size={14} /> {t("common.edit", "Edit")}
                </Button>
                <ConfirmDeleteButton itemName={rule.name} onConfirm={() => adminDelete(`/api/admin/alert-rules/${rule.id}`).then(() => rulesResource.reload())}>
                  <Button color="red" variant="soft">{t("common.delete")}</Button>
                </ConfirmDeleteButton>
              </Flex>
            </Flex>
          </Card>
        ))}
        {rules.length === 0 ? <Text color="gray">{t("nb.empty", "None")}</Text> : null}
      </Flex>
      {editing ? (
        <RuleEditor
          type={type}
          rule={editing === "new" ? null : editing}
          channels={channelsResource.data?.channels ?? []}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await rulesResource.reload();
          }}
        />
      ) : null}
    </AdminPage>
  );
}

function RuleEditor({
  type,
  rule,
  channels,
  onClose,
  onSaved,
}: {
  type: AlertRule["type"];
  rule: AlertRule | null;
  channels: NotificationChannel[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(rule?.name ?? (type === "load" ? "High load" : "Node offline"));
  const [nodeId, setNodeId] = useState(rule?.nodeId ?? "");
  const [channelIds, setChannelIds] = useState(rule?.channelIds ?? []);
  const [configText, setConfigText] = useState(
    JSON.stringify(
      rule?.config ?? (type === "load" ? { threshold: 2, durationSeconds: 300 } : { gracePeriodSeconds: 300 }),
      null,
      2,
    ),
  );
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  const toggleChannel = (id: string, checked: boolean) => {
    setChannelIds((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id));
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = buildAlertRuleMutation({ name, type, nodeId, channelIds, configText, enabled });
      if (rule) await adminPatch(`/api/admin/alert-rules/${rule.id}`, payload);
      else await adminPost("/api/admin/alert-rules", payload);
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid alert rule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !saving && onClose()}>
      <Dialog.Content maxWidth="560px">
        <Dialog.Title>{rule ? t("common.edit", "Edit") : t("common.add", "Add")}</Dialog.Title>
        <Dialog.Description size="2" color="gray">
          {type === "load" ? "Load rule" : "Offline rule"}
        </Dialog.Description>
        <Flex direction="column" gap="3" mt="3">
          <TextField.Root value={name} onChange={(event) => setName(event.target.value)} placeholder="Rule name" aria-label="Rule name" />
          <TextField.Root value={nodeId} onChange={(event) => setNodeId(event.target.value)} placeholder="Node ID (blank for all)" aria-label="Node ID" />
          <TextArea value={configText} onChange={(event) => setConfigText(event.target.value)} rows={7} aria-label="Rule configuration JSON" />
          <Text weight="bold" size="2">Notification channels</Text>
          {channels.length === 0 ? <Text size="2" color="gray">No notification channels configured.</Text> : null}
          {channels.map((channel) => (
            <label key={channel.id}>
              <Flex gap="2" align="center">
                <Checkbox checked={channelIds.includes(channel.id)} onCheckedChange={(checked) => toggleChannel(channel.id, Boolean(checked))} />
                <Text size="2">{channel.name} · {channel.type}</Text>
              </Flex>
            </label>
          ))}
          <label>
            <Flex gap="2" align="center">
              <Checkbox checked={enabled} onCheckedChange={(checked) => setEnabled(Boolean(checked))} />
              <Text size="2">Enabled</Text>
            </Flex>
          </label>
          <Flex justify="end" gap="2">
            <Button variant="soft" onClick={onClose} disabled={saving}>{t("common.cancel")}</Button>
            <Button onClick={() => void save()} disabled={saving}>{t("common.save")}</Button>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
