import { useState } from "react";
import { Button, Card, Flex, Switch, Text, TextField } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { adminDelete, adminPatch, adminPost } from "@/lib/adminGateway";
import { useAdminResource } from "@/lib/useAdminResource";
import type { TrafficReport } from "@/lib/contracts";
import { AdminError, AdminLoading, AdminPage } from "./AdminPage";

export default function TrafficReportsPage() {
  const { t } = useTranslation();
  const { data, error, loading, reload } = useAdminResource<{ reports: TrafficReport[] }>("/api/admin/traffic-reports");
  const [name, setName] = useState("Daily traffic");
  const [time, setTime] = useState("09:00");
  if (loading) return <AdminLoading />;
  if (error) return <AdminError message={error} onRetry={() => void reload()} />;

  return (
    <AdminPage title={t("notification.traffic_report.title")} description={t("nb.traffic.desc", "Scheduled traffic reports. Update and delete use the NodeBeacon Admin API.")}>
      <Flex direction="column" gap="3">
        <Flex gap="2" wrap="wrap">
          <TextField.Root value={name} onChange={(event) => setName(event.target.value)} />
          <TextField.Root value={time} onChange={(event) => setTime(event.target.value)} />
          <Button onClick={() => void adminPost("/api/admin/traffic-reports", { name, period: "daily", time, timezone: "Asia/Shanghai", nodeIds: [], channelIds: [], enabled: true }).then(() => reload())}>
            {t("common.add", "Add")}
          </Button>
        </Flex>
        {(data?.reports ?? []).map((report) => (
          <Card key={report.id}>
            <Flex justify="between" align="center" gap="3" wrap="wrap">
              <Flex direction="column">
                <Text weight="bold">{report.name}</Text>
                <Text size="2" color="gray">{report.period} · {report.time} · {report.timezone}</Text>
              </Flex>
              <Flex gap="2" align="center">
                <Switch checked={report.enabled} onCheckedChange={(checked) => void adminPatch(`/api/admin/traffic-reports/${report.id}`, { enabled: Boolean(checked) }).then(() => reload())} />
                <Button color="red" variant="soft" onClick={() => void adminDelete(`/api/admin/traffic-reports/${report.id}`).then(() => reload())}>{t("common.delete")}</Button>
              </Flex>
            </Flex>
          </Card>
        ))}
      </Flex>
    </AdminPage>
  );
}
