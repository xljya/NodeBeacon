import { Badge, Button, Card, Flex, Tabs, Text } from "@radix-ui/themes";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAdminResource } from "@/lib/useAdminResource";
import type { AdminAlert, AdminIncident, NotificationDelivery } from "@/lib/contracts";
import { AdminError, AdminLoading, AdminPage } from "./AdminPage";

function formatWhen(value?: string | number | null): string {
  if (value === undefined || value === null || value === "") return "—";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function NotificationGeneralPage() {
  const { t } = useTranslation();
  const alerts = useAdminResource<{ alerts: AdminAlert[] }>("/api/admin/alerts");
  const incidents = useAdminResource<{ incidents: AdminIncident[] }>("/api/admin/incidents");
  const outbox = useAdminResource<{ deliveries: NotificationDelivery[] }>("/api/admin/notification-outbox");
  const reload = () => void Promise.all([alerts.reload(), incidents.reload(), outbox.reload()]);

  if (alerts.loading || incidents.loading || outbox.loading) return <AdminLoading />;
  if (alerts.error || incidents.error || outbox.error) {
    return <AdminError message={alerts.error ?? incidents.error ?? outbox.error ?? ""} onRetry={reload} />;
  }

  const alertList = alerts.data?.alerts ?? [];
  const incidentList = incidents.data?.incidents ?? [];
  const deliveries = outbox.data?.deliveries ?? [];

  return (
    <AdminPage
      title={t("notification.title")}
      description={t("nb.events.desc", "Active alerts, incident history and the notification send queue.")}
      actions={
        <Button variant="soft" onClick={reload}>
          <RefreshCw size={14} /> {t("common.refresh", "Refresh")}
        </Button>
      }
    >
      <Tabs.Root defaultValue="alerts">
        <Tabs.List>
          <Tabs.Trigger value="alerts">{t("nb.events.alerts", "Active alerts")} ({alertList.length})</Tabs.Trigger>
          <Tabs.Trigger value="incidents">{t("nb.events.incidents", "Incidents")} ({incidentList.length})</Tabs.Trigger>
          <Tabs.Trigger value="queue">{t("nb.events.queue", "Send queue")} ({deliveries.length})</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="alerts">
          <Flex direction="column" gap="2" mt="3">
            {alertList.map((alert) => (
              <Card key={alert.fingerprint}>
                <Flex justify="between" align="start" gap="3" wrap="wrap">
                  <Flex direction="column" gap="1">
                    <Text weight="bold">{alert.labels.alertname ?? alert.fingerprint}</Text>
                    <Text size="2" color="gray">
                      {alert.annotations.summary ?? alert.annotations.description ?? alert.fingerprint}
                    </Text>
                    <Text size="2" color="gray">{t("nb.events.started", "Started")}: {formatWhen(alert.startsAt)}</Text>
                  </Flex>
                  <Badge color={alert.state === "firing" ? "red" : "orange"}>{alert.state}</Badge>
                </Flex>
              </Card>
            ))}
            {alertList.length === 0 ? <Text color="gray">{t("nb.empty", "None")}</Text> : null}
          </Flex>
        </Tabs.Content>
        <Tabs.Content value="incidents">
          <Flex direction="column" gap="2" mt="3">
            {incidentList.map((incident) => (
              <Card key={incident.id}>
                <Flex justify="between" align="start" gap="3" wrap="wrap">
                  <Flex direction="column" gap="1">
                    <Text weight="bold">{incident.alertName}</Text>
                    {incident.summary ? <Text size="2" color="gray">{incident.summary}</Text> : null}
                    <Text size="2" color="gray">
                      {formatWhen(incident.startedAt)}
                      {incident.resolvedAt ? ` → ${formatWhen(incident.resolvedAt)}` : ""}
                    </Text>
                  </Flex>
                  <Badge color={incident.status === "firing" ? "red" : "green"}>{incident.status}</Badge>
                </Flex>
              </Card>
            ))}
            {incidentList.length === 0 ? <Text color="gray">{t("nb.empty", "None")}</Text> : null}
          </Flex>
        </Tabs.Content>
        <Tabs.Content value="queue">
          <Flex direction="column" gap="2" mt="3">
            {deliveries.map((item) => (
              <Card key={item.id}>
                <Flex justify="between" align="start" gap="3" wrap="wrap">
                  <Flex direction="column" gap="1">
                    <Text weight="bold">{item.eventType}</Text>
                    <Text size="2" color="gray">
                      {t("nb.events.channel", "Channel")} {item.channelId} · {t("nb.events.attempts", "attempts")} {item.attempts}
                    </Text>
                    <Text size="2" color="gray">{formatWhen(item.createdAt)}</Text>
                    {item.lastError ? <Text size="2" color="red">{item.lastError}</Text> : null}
                  </Flex>
                  <Badge color={item.status === "sent" ? "green" : item.status === "failed" ? "red" : "orange"}>{item.status}</Badge>
                </Flex>
              </Card>
            ))}
            {deliveries.length === 0 ? <Text color="gray">{t("nb.empty", "None")}</Text> : null}
          </Flex>
        </Tabs.Content>
      </Tabs.Root>
    </AdminPage>
  );
}
