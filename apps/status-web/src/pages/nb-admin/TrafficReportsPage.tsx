import { useState } from "react";
import { Button, Card, Checkbox, Dialog, Flex, Select, Switch, Text, TextField } from "@radix-ui/themes";
import { Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { adminDelete, adminPatch, adminPost } from "@/lib/adminGateway";
import ConfirmDeleteButton from "@/components/admin/ConfirmDeleteButton";
import { buildTrafficReportMutation } from "@/lib/adminForms";
import { useAdminResource } from "@/lib/useAdminResource";
import type { AdminNode, NotificationChannel, TrafficReport } from "@/lib/contracts";
import { AdminError, AdminLoading, AdminPage } from "./AdminPage";

export default function TrafficReportsPage() {
  const { t } = useTranslation();
  const reports = useAdminResource<{ reports: TrafficReport[] }>("/api/admin/traffic-reports");
  const nodes = useAdminResource<{ nodes: AdminNode[] }>("/api/admin/nodes");
  const channels = useAdminResource<{ channels: NotificationChannel[] }>("/api/admin/notification-channels");
  const [editing, setEditing] = useState<TrafficReport | "new" | null>(null);
  const reload = () => void Promise.all([reports.reload(), nodes.reload(), channels.reload()]);

  if (reports.loading || nodes.loading || channels.loading) return <AdminLoading />;
  if (reports.error || nodes.error || channels.error) {
    return <AdminError message={reports.error ?? nodes.error ?? channels.error ?? ""} onRetry={reload} />;
  }

  const list = reports.data?.reports ?? [];

  return (
    <AdminPage
      title={t("notification.traffic_report.title")}
      description={t("nb.traffic.desc", "Scheduled traffic reports with period, nodes and notification channels. There is no PromQL editor.")}
      actions={<Button onClick={() => setEditing("new")}>{t("common.add", "Add")}</Button>}
    >
      <Flex direction="column" gap="3">
        {list.map((report) => (
          <Card key={report.id}>
            <Flex justify="between" align="center" gap="3" wrap="wrap">
              <Flex direction="column">
                <Text weight="bold">{report.name}</Text>
                <Text size="2" color="gray">
                  {report.period} · {report.time} · {report.timezone} · {report.nodeIds.length || "all"} nodes · {report.channelIds.length} channel(s)
                </Text>
              </Flex>
              <Flex gap="2" align="center">
                <Switch
                  checked={report.enabled}
                  onCheckedChange={(checked) => void adminPatch(`/api/admin/traffic-reports/${report.id}`, { enabled: Boolean(checked) }).then(() => reports.reload())}
                />
                <Button variant="soft" onClick={() => setEditing(report)}>
                  <Pencil size={14} /> {t("common.edit", "Edit")}
                </Button>
                <ConfirmDeleteButton itemName={report.name} onConfirm={() => adminDelete(`/api/admin/traffic-reports/${report.id}`).then(() => reports.reload())}>
                  <Button color="red" variant="soft">{t("common.delete")}</Button>
                </ConfirmDeleteButton>
              </Flex>
            </Flex>
          </Card>
        ))}
        {list.length === 0 ? <Text color="gray">{t("nb.empty", "None")}</Text> : null}
      </Flex>
      {editing ? (
        <ReportEditor
          report={editing === "new" ? null : editing}
          nodes={nodes.data?.nodes ?? []}
          channels={channels.data?.channels ?? []}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reports.reload();
          }}
        />
      ) : null}
    </AdminPage>
  );
}

function ReportEditor({
  report,
  nodes,
  channels,
  onClose,
  onSaved,
}: {
  report: TrafficReport | null;
  nodes: AdminNode[];
  channels: NotificationChannel[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(report?.name ?? "Daily traffic");
  const [period, setPeriod] = useState<TrafficReport["period"]>(report?.period ?? "daily");
  const [time, setTime] = useState(report?.time ?? "09:00");
  const [timezone, setTimezone] = useState(report?.timezone ?? "Asia/Shanghai");
  const [nodeIds, setNodeIds] = useState<string[]>(report?.nodeIds ?? []);
  const [channelIds, setChannelIds] = useState<string[]>(report?.channelIds ?? []);
  const [enabled, setEnabled] = useState(report?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  const toggle = (list: string[], id: string, checked: boolean) =>
    checked ? [...new Set([...list, id])] : list.filter((item) => item !== id);

  const save = async () => {
    setSaving(true);
    try {
      const payload = buildTrafficReportMutation({ name, period, time, timezone, nodeIds, channelIds, enabled });
      if (report) await adminPatch(`/api/admin/traffic-reports/${report.id}`, payload);
      else await adminPost("/api/admin/traffic-reports", payload);
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid traffic report");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !saving && onClose()}>
      <Dialog.Content maxWidth="560px">
        <Dialog.Title>{report ? t("common.edit", "Edit") : t("common.add", "Add")}</Dialog.Title>
        <Dialog.Description size="2" color="gray">
          {t("nb.traffic.editor", "Leave nodes empty to include the whole fleet.")}
        </Dialog.Description>
        <Flex direction="column" gap="3" mt="3">
          <TextField.Root value={name} onChange={(event) => setName(event.target.value)} placeholder="Report name" aria-label="Report name" />
          <Select.Root value={period} onValueChange={(value) => setPeriod(value as TrafficReport["period"])}>
            <Select.Trigger aria-label="Period" />
            <Select.Content>
              <Select.Item value="daily">daily</Select.Item>
              <Select.Item value="weekly">weekly</Select.Item>
              <Select.Item value="monthly">monthly</Select.Item>
            </Select.Content>
          </Select.Root>
          <TextField.Root value={time} onChange={(event) => setTime(event.target.value)} placeholder="HH:MM" aria-label="Time" />
          <TextField.Root value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="Timezone" aria-label="Timezone" />
          <Text weight="bold" size="2">{t("common.server", "Nodes")}</Text>
          {nodes.map((node) => (
            <label key={node.id}>
              <Flex gap="2" align="center">
                <Checkbox checked={nodeIds.includes(node.id)} onCheckedChange={(checked) => setNodeIds((current) => toggle(current, node.id, Boolean(checked)))} />
                <Text size="2">{node.name} · {node.id}</Text>
              </Flex>
            </label>
          ))}
          <Text weight="bold" size="2">{t("settings.notification.title", "Channels")}</Text>
          {channels.length === 0 ? <Text size="2" color="gray">{t("nb.traffic.noChannels", "No notification channels configured.")}</Text> : null}
          {channels.map((channel) => (
            <label key={channel.id}>
              <Flex gap="2" align="center">
                <Checkbox checked={channelIds.includes(channel.id)} onCheckedChange={(checked) => setChannelIds((current) => toggle(current, channel.id, Boolean(checked)))} />
                <Text size="2">{channel.name} · {channel.type}</Text>
              </Flex>
            </label>
          ))}
          <label>
            <Flex gap="2" align="center">
              <Checkbox checked={enabled} onCheckedChange={(checked) => setEnabled(Boolean(checked))} />
              <Text size="2">{t("common.enabled", "Enabled")}</Text>
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
