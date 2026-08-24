import { Badge, Button, Callout, Card, Flex, Grid, Text } from "@radix-ui/themes";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAdminResource } from "@/lib/useAdminResource";
import type { AdminBackupStatus, AdminDataSource, AdminSummaryResponse } from "@/lib/contracts";
import { AdminError, AdminLoading, AdminPage } from "./AdminPage";

function formatBytes(bytes?: number): string {
  if (bytes === undefined) return "server-side";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export default function MetricsPage() {
  const { t } = useTranslation();
  const sources = useAdminResource<{ sources: AdminDataSource[] }>("/api/admin/data-sources");
  const summary = useAdminResource<AdminSummaryResponse>("/api/admin/summary");
  const backup = useAdminResource<AdminBackupStatus>("/api/admin/backup/status");
  const reload = () => void Promise.all([sources.reload(), summary.reload(), backup.reload()]);

  if (sources.loading || summary.loading || backup.loading) return <AdminLoading />;
  if (sources.error || summary.error || backup.error) {
    return <AdminError message={sources.error ?? summary.error ?? backup.error ?? ""} onRetry={reload} />;
  }

  const prometheus = summary.data?.prometheus;
  const cache = summary.data?.cache;

  return (
    <AdminPage
      title={t("settings.metrics.title")}
      description={t("nb.metrics.desc", "Prometheus, Loki and SQLite as the server sees them. The browser cannot submit PromQL.")}
      actions={
        <Button variant="soft" onClick={reload}>
          <RefreshCw size={14} /> {t("common.refresh", "Refresh")}
        </Button>
      }
    >
      <Callout.Root color="blue">
        <Callout.Text>
          {t("nb.metrics.boundary", "Queries stay on the Fastify BFF. There is no Metric Store, browser Prometheus or RPC2 data path.")}
        </Callout.Text>
      </Callout.Root>
      <Grid columns={{ initial: "1", sm: "2" }} gap="3">
        <Card>
          <Flex direction="column" gap="1">
            <Text size="2" color="gray">{t("nb.metrics.host", "Prometheus host")}</Text>
            <Text weight="bold">{prometheus?.host ?? "—"}</Text>
            <Text size="2" color="gray">
              {prometheus?.configured
                ? prometheus.reachable
                  ? t("nb.ok", "Reachable")
                  : t("nb.bad", "Unreachable")
                : t("nb.unconfigured", "Not configured")}
            </Text>
          </Flex>
        </Card>
        <Card>
          <Flex direction="column" gap="1">
            <Text size="2" color="gray">{t("nb.dashboard.cache", "Cache")}</Text>
            <Text weight="bold">{cache ? `${cache.ttlSeconds}s` : "—"}</Text>
            <Text size="2" color="gray">
              {cache?.stale ? t("nb.dashboard.stale", "Stale") : t("nb.dashboard.fresh", "Fresh")}
            </Text>
          </Flex>
        </Card>
        <Card>
          <Flex direction="column" gap="1">
            <Text size="2" color="gray">{t("nb.metrics.backup", "Last backup success")}</Text>
            <Text weight="bold">
              {backup.data?.lastSuccess ? new Date(backup.data.lastSuccess).toLocaleString() : t("nb.empty", "None")}
            </Text>
            <Text size="2" color="gray">{t("nb.metrics.backupHint", "Freshness is recorded by the production backup job.")}</Text>
          </Flex>
        </Card>
      </Grid>
      <Flex direction="column" gap="3">
        {(sources.data?.sources ?? []).map((source) => (
          <Card key={source.id}>
            <Flex justify="between" align="center" gap="3" wrap="wrap">
              <Flex direction="column" gap="1">
                <Text weight="bold">{source.id}</Text>
                <Text size="2" color="gray">
                  {source.host ?? (source.bytes !== undefined ? formatBytes(source.bytes) : "server-side")}
                </Text>
              </Flex>
              <Badge color={source.configured ? (source.reachable ? "green" : "red") : "orange"}>
                {source.configured ? (source.reachable ? "reachable" : "unreachable") : "unconfigured"}
              </Badge>
            </Flex>
          </Card>
        ))}
      </Flex>
    </AdminPage>
  );
}
