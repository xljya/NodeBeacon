import { useState } from "react";
import { Button, Card, Flex, Switch, Text, TextField } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { adminDelete, adminPatch, adminPost } from "@/lib/adminGateway";
import { useAdminResource } from "@/lib/useAdminResource";
import type { NotificationChannel } from "@/lib/contracts";
import { AdminError, AdminLoading, AdminPage } from "./AdminPage";

export default function NotificationChannelsPage() {
  const { t } = useTranslation();
  const { data, error, loading, reload } = useAdminResource<{ channels: NotificationChannel[] }>("/api/admin/notification-channels");
  const [name, setName] = useState("Ops webhook");
  const [type, setType] = useState<"telegram" | "smtp" | "webhook">("webhook");
  const [endpoint, setEndpoint] = useState("");
  if (loading) return <AdminLoading />;
  if (error) return <AdminError message={error} onRetry={() => void reload()} />;

  const create = async () => {
    const config =
      type === "webhook" ? { url: endpoint } :
      type === "telegram" ? { botToken: endpoint, chatId: "" } :
      { host: endpoint };
    await adminPost("/api/admin/notification-channels", { name, type, config, enabled: true });
    setEndpoint("");
    await reload();
  };

  return (
    <AdminPage title={t("settings.notification.title")} description={t("nb.notify.desc", "Notification channels and send tests. Secrets are masked by the API.")}>
      <Flex direction="column" gap="3">
        <Flex gap="2" wrap="wrap">
          <TextField.Root placeholder="name" value={name} onChange={(event) => setName(event.target.value)} />
          <select className="rt-reset rt-SelectTrigger" value={type} onChange={(event) => setType(event.target.value as typeof type)}>
            <option value="webhook">webhook</option>
            <option value="telegram">telegram</option>
            <option value="smtp">smtp</option>
          </select>
          <TextField.Root placeholder="url / host / token" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} />
          <Button onClick={() => void create()}>{t("common.add", "Add")}</Button>
        </Flex>
        {(data?.channels ?? []).map((channel) => (
          <Card key={channel.id}>
            <Flex justify="between" align="center" gap="3" wrap="wrap">
              <Flex direction="column">
                <Text weight="bold">{channel.name}</Text>
                <Text size="2" color="gray">{channel.type}</Text>
              </Flex>
              <Flex gap="2" align="center">
                <Switch checked={channel.enabled} onCheckedChange={(checked) => void adminPatch(`/api/admin/notification-channels/${channel.id}`, { name: channel.name, type: channel.type, config: {}, enabled: Boolean(checked) }).then(() => reload())} />
                <Button variant="soft" onClick={() => void adminPost(`/api/admin/notification-channels/${channel.id}/test`)}>{t("nb.notify.test", "Send test")}</Button>
                <Button color="red" variant="soft" onClick={() => void adminDelete(`/api/admin/notification-channels/${channel.id}`).then(() => reload())}>{t("common.delete")}</Button>
              </Flex>
            </Flex>
          </Card>
        ))}
      </Flex>
    </AdminPage>
  );
}
