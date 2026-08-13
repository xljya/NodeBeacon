import { Badge, Button, Card, Flex, Grid, Text } from "@radix-ui/themes";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAdminResource } from "@/lib/useAdminResource";
import type { AdminNode, AdminSummaryResponse } from "@/lib/contracts";
import { AdminError, AdminLoading, AdminPage } from "./AdminPage";

export default function DashboardPage() {
  const { t } = useTranslation();
  const summary = useAdminResource<AdminSummaryResponse>("/api/admin/summary");
  const nodes = useAdminResource<{ nodes: AdminNode[] }>("/api/admin/nodes");

  if (summary.loading || nodes.loading) return <AdminLoading />;
  if (summary.error || nodes.error) {
    return <AdminError message={summary.error ?? nodes.error ?? ""} onRetry={() => void Promise.all([summary.reload(), nodes.reload()])} />;
  }
  const data = summary.data;
  if (!data) return null;
  const list = nodes.data?.nodes ?? [];
  const publicCount = list.filter((node) => node.public).length;

  return (
    <AdminPage
      title={t("common.dashboard")}
      description={t("nb.dashboard.desc", "Version, Prometheus, cache, nodes, alerts and backup status that NodeBeacon can actually serve.")}
      actions={
        <Button variant="soft" onClick={() => void Promise.all([summary.reload(), nodes.reload()])}>
          <RefreshCw size={14} /> {t("common.refresh", "Refresh")}
        </Button>
      }
    >
      <Grid columns={{ initial: "1", sm: "2", lg: "3" }} gap="3">
        <StatCard title={t("nb.dashboard.version", "Version")} value={`v${data.version}`} hint={new Date(data.generatedAt).toLocaleString()} />
        <StatCard
          title="Prometheus"
          value={data.prometheus.configured ? (data.prometheus.reachable ? t("nb.ok", "Reachable") : t("nb.bad", "Unreachable")) : t("nb.unconfigured", "Not configured")}
          hint={data.prometheus.host ?? "—"}
          tone={data.prometheus.reachable ? "green" : "red"}
        />
        <StatCard
          title={t("nb.dashboard.cache", "Cache")}
          value={`${data.cache.ttlSeconds}s`}
          hint={data.cache.stale ? t("nb.dashboard.stale", "Stale") : t("nb.dashboard.fresh", "Fresh")}
        />
        <StatCard
          title={t("common.server")}
          value={`${data.nodes.online}/${data.nodes.total}`}
          hint={t("nb.dashboard.nodeHint", "{{public}} public · {{degraded}} degraded · {{offline}} offline", {
            public: publicCount,
            degraded: data.nodes.degraded,
            offline: data.nodes.offline,
          })}
        />
        <StatCard
          title={t("nb.dashboard.owner", "Owner")}
          value={data.auth.ownerConfigured ? t("nb.ok", "Configured") : t("nb.unconfigured", "Not configured")}
          hint={t("nb.dashboard.noRegister", "Registration stays closed")}
        />
        <StatCard
          title={t("nb.dashboard.boundary", "Data plane")}
          value="Prometheus + SQLite"
          hint={t("nb.dashboard.noAgent", "No Komari Agent, Metric Store or plugin counts")}
        />
      </Grid>
    </AdminPage>
  );
}

function StatCard({
  title,
  value,
  hint,
  tone,
}: {
  title: string;
  value: string;
  hint: string;
  tone?: "green" | "red";
}) {
  return (
    <Card>
      <Flex direction="column" gap="2">
        <Text size="2" color="gray">
          {title}
        </Text>
        <Flex align="center" gap="2">
          <Text size="6" weight="bold">
            {value}
          </Text>
          {tone ? <Badge color={tone}>{tone === "green" ? "ok" : "warn"}</Badge> : null}
        </Flex>
        <Text size="2" color="gray">
          {hint}
        </Text>
      </Flex>
    </Card>
  );
}
