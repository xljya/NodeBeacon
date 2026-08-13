import { Badge, Card, Flex, Text } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { useAdminResource } from "@/lib/useAdminResource";
import type { AdminDataSource, AdminSummaryResponse } from "@/lib/contracts";
import { AdminError, AdminLoading, AdminPage } from "./AdminPage";

export default function MetricsPage() {
  const { t } = useTranslation();
  const sources = useAdminResource<{ sources: AdminDataSource[] }>("/api/admin/data-sources");
  const summary = useAdminResource<AdminSummaryResponse>("/api/admin/summary");
  if (sources.loading || summary.loading) return <AdminLoading />;
  if (sources.error || summary.error) {
    return <AdminError message={sources.error ?? summary.error ?? ""} onRetry={() => void Promise.all([sources.reload(), summary.reload()])} />;
  }

  return (
    <AdminPage
      title={t("settings.metrics.title")}
      description={t("nb.metrics.desc", "Prometheus and other server-selected data sources. The browser cannot submit PromQL.")}
    >
      <Flex direction="column" gap="3">
        <Card>
          <Text size="2" color="gray">
            {t("nb.metrics.host", "Prometheus host")}: {summary.data?.prometheus.host ?? "—"}
          </Text>
        </Card>
        {(sources.data?.sources ?? []).map((source) => (
          <Card key={source.id}>
            <Flex justify="between" align="center">
              <Flex direction="column" gap="1">
                <Text weight="bold">{source.id}</Text>
                <Text size="2" color="gray">
                  {source.host ?? (source.bytes ? `${source.bytes} bytes` : "server-side")}
                </Text>
              </Flex>
              <Badge color={source.reachable ? "green" : "red"}>
                {source.configured ? (source.reachable ? "reachable" : "unreachable") : "unconfigured"}
              </Badge>
            </Flex>
          </Card>
        ))}
      </Flex>
    </AdminPage>
  );
}
