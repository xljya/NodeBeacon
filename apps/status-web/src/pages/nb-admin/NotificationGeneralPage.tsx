import { Badge, Card, Flex, Tabs, Text } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { useAdminResource } from "@/lib/useAdminResource";
import type { AdminAlert, AdminIncident, NotificationDelivery } from "@/lib/contracts";
import { AdminError, AdminLoading, AdminPage } from "./AdminPage";

export default function NotificationGeneralPage() {
  const { t } = useTranslation();
  const alerts = useAdminResource<{ alerts: AdminAlert[] }>("/api/admin/alerts");
  const incidents = useAdminResource<{ incidents: AdminIncident[] }>("/api/admin/incidents");
  const outbox = useAdminResource<{ deliveries: NotificationDelivery[] }>("/api/admin/notification-outbox");
  if (alerts.loading || incidents.loading || outbox.loading) return <AdminLoading />;
  if (alerts.error || incidents.error || outbox.error) {
    return <AdminError message={alerts.error ?? incidents.error ?? outbox.error ?? ""} />;
  }

  return (
    <AdminPage title={t("notification.title")} description={t("nb.events.desc", "Active alerts, incident history and the notification send queue.")}>
      <Tabs.Root defaultValue="alerts">
        <Tabs.List>
          <Tabs.Trigger value="alerts">{t("nb.events.alerts", "Active alerts")}</Tabs.Trigger>
          <Tabs.Trigger value="incidents">{t("nb.events.incidents", "Incidents")}</Tabs.Trigger>
          <Tabs.Trigger value="queue">{t("nb.events.queue", "Send queue")}</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="alerts">
          <Flex direction="column" gap="2" mt="3">
            {(alerts.data?.alerts ?? []).map((alert) => (
              <Card key={alert.fingerprint}>
                <Flex justify="between">
                  <Text weight="bold">{alert.labels.alertname ?? alert.fingerprint}</Text>
                  <Badge>{alert.state}</Badge>
                </Flex>
              </Card>
            ))}
            {(alerts.data?.alerts ?? []).length === 0 ? <Text color="gray">{t("nb.empty", "None")}</Text> : null}
          </Flex>
        </Tabs.Content>
        <Tabs.Content value="incidents">
          <Flex direction="column" gap="2" mt="3">
            {(incidents.data?.incidents ?? []).map((incident) => (
              <Card key={incident.id}>
                <Flex justify="between">
                  <Text weight="bold">{incident.alertName}</Text>
                  <Badge color={incident.status === "firing" ? "red" : "green"}>{incident.status}</Badge>
                </Flex>
              </Card>
            ))}
          </Flex>
        </Tabs.Content>
        <Tabs.Content value="queue">
          <Flex direction="column" gap="2" mt="3">
            {(outbox.data?.deliveries ?? []).map((item) => (
              <Card key={item.id}>
                <Flex justify="between">
                  <Text>{item.eventType}</Text>
                  <Badge>{item.status}</Badge>
                </Flex>
              </Card>
            ))}
          </Flex>
        </Tabs.Content>
      </Tabs.Root>
    </AdminPage>
  );
}
