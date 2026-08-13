import { useState } from "react";
import { Button, Card, Flex, Switch, Text, TextField } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { adminDelete, adminPatch, adminPost } from "@/lib/adminGateway";
import ConfirmDeleteButton from "@/components/admin/ConfirmDeleteButton";
import {
  buildNotificationChannelConfig,
  type NotificationChannelFields,
  type NotificationChannelType,
} from "@/lib/adminForms";
import { useAdminResource } from "@/lib/useAdminResource";
import type { NotificationChannel } from "@/lib/contracts";
import { AdminError, AdminLoading, AdminPage } from "./AdminPage";

export default function NotificationChannelsPage() {
  const { t } = useTranslation();
  const { data, error, loading, reload } = useAdminResource<{ channels: NotificationChannel[] }>("/api/admin/notification-channels");
  const [name, setName] = useState("Ops webhook");
  const [type, setType] = useState<NotificationChannelType>("webhook");
  const [fields, setFields] = useState<NotificationChannelFields>({ port: "465" });
  if (loading) return <AdminLoading />;
  if (error) return <AdminError message={error} onRetry={() => void reload()} />;

  const create = async () => {
    try {
      const config = buildNotificationChannelConfig(type, fields);
      await adminPost("/api/admin/notification-channels", { name, type, config, enabled: true });
      setFields({ port: "465" });
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid notification channel");
    }
  };

  const field = (key: string, value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
  };

  return (
    <AdminPage title={t("settings.notification.title")} description={t("nb.notify.desc", "Notification channels and send tests. Secrets are masked by the API.")}>
      <Flex direction="column" gap="3">
        <Flex gap="2" wrap="wrap">
          <TextField.Root placeholder="name" value={name} onChange={(event) => setName(event.target.value)} />
          <select className="rt-reset rt-SelectTrigger" value={type} onChange={(event) => { setType(event.target.value as typeof type); setFields({ port: "465" }); }}>
            <option value="webhook">webhook</option>
            <option value="telegram">telegram</option>
            <option value="smtp">smtp</option>
          </select>
          {type === "webhook" ? (
            <TextField.Root
              placeholder="https://hooks.example.com/nodebeacon"
              value={fields.url ?? ""}
              onChange={(event) => field("url", event.target.value)}
              aria-label="Webhook URL"
            />
          ) : null}
          {type === "telegram" ? (
            <>
              <TextField.Root
                type="password"
                placeholder={t("settings.notification.telegram.bot_token")}
                value={fields.botToken ?? ""}
                onChange={(event) => field("botToken", event.target.value)}
                aria-label={t("settings.notification.telegram.bot_token")}
              />
              <TextField.Root
                placeholder={t("settings.notification.telegram.chat_id")}
                value={fields.chatId ?? ""}
                onChange={(event) => field("chatId", event.target.value)}
                aria-label={t("settings.notification.telegram.chat_id")}
              />
            </>
          ) : null}
          {type === "smtp" ? (
            <>
              <TextField.Root placeholder={t("settings.notification.email.host")} value={fields.host ?? ""} onChange={(event) => field("host", event.target.value)} aria-label={t("settings.notification.email.host")} />
              <TextField.Root type="number" placeholder={t("settings.notification.email.port")} value={fields.port ?? "465"} onChange={(event) => field("port", event.target.value)} aria-label={t("settings.notification.email.port")} />
              <TextField.Root placeholder={t("settings.notification.email.username")} value={fields.username ?? ""} onChange={(event) => field("username", event.target.value)} aria-label={t("settings.notification.email.username")} />
              <TextField.Root type="password" placeholder={t("settings.notification.email.password")} value={fields.password ?? ""} onChange={(event) => field("password", event.target.value)} aria-label={t("settings.notification.email.password")} />
              <TextField.Root type="email" placeholder={t("settings.notification.email.sender")} value={fields.from ?? ""} onChange={(event) => field("from", event.target.value)} aria-label={t("settings.notification.email.sender")} />
              <TextField.Root type="email" placeholder={t("settings.notification.email.receiver")} value={fields.to ?? ""} onChange={(event) => field("to", event.target.value)} aria-label={t("settings.notification.email.receiver")} />
            </>
          ) : null}
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
                <ConfirmDeleteButton itemName={channel.name} onConfirm={() => adminDelete(`/api/admin/notification-channels/${channel.id}`).then(() => reload())}>
                  <Button color="red" variant="soft">{t("common.delete")}</Button>
                </ConfirmDeleteButton>
              </Flex>
            </Flex>
          </Card>
        ))}
      </Flex>
    </AdminPage>
  );
}
