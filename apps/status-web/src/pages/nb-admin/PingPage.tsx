import { useEffect, useState } from "react";
import { Badge, Button, Card, Flex, Switch, Text, TextField } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { adminDelete, adminPatch, adminPost, adminGet } from "@/lib/adminGateway";
import { useAdminResource } from "@/lib/useAdminResource";
import type { AdminProbe, ProbeResult } from "@/lib/contracts";
import { AdminError, AdminLoading, AdminPage } from "./AdminPage";

export default function PingPage() {
  const { t } = useTranslation();
  const probes = useAdminResource<{ probes: AdminProbe[] }>("/api/admin/probes");
  const [results, setResults] = useState<ProbeResult[]>([]);
  const [name, setName] = useState("HTTPS check");
  const [target, setTarget] = useState("https://example.com");
  useEffect(() => {
    void adminGet<{ probes: ProbeResult[] }>("/api/latency")
      .then((payload) => setResults(payload.probes ?? []))
      .catch(() => setResults([]));
  }, []);
  if (probes.loading) return <AdminLoading />;
  if (probes.error) return <AdminError message={probes.error} onRetry={() => void probes.reload()} />;

  return (
    <AdminPage title={t("ping.title")} description={t("nb.ping.desc", "Managed latency probes and live blackbox results. PromQL is not accepted from the browser.")}>
      <Flex direction="column" gap="3">
        <Flex gap="2" wrap="wrap">
          <TextField.Root value={name} onChange={(event) => setName(event.target.value)} />
          <TextField.Root value={target} onChange={(event) => setTarget(event.target.value)} />
          <Button onClick={() => void adminPost("/api/admin/probes", { name, protocol: "http", target, intervalSeconds: 60, enabled: true }).then(() => probes.reload())}>
            {t("common.add", "Add")}
          </Button>
        </Flex>
        {(probes.data?.probes ?? []).map((probe) => (
          <Card key={probe.id}>
            <Flex justify="between" align="center" gap="3">
              <Flex direction="column">
                <Text weight="bold">{probe.name}</Text>
                <Text size="2" color="gray">{probe.protocol} · {probe.target}</Text>
              </Flex>
              <Flex gap="2" align="center">
                <Switch checked={Boolean(probe.enabled)} onCheckedChange={(checked) => void adminPatch(`/api/admin/probes/${probe.id}`, { enabled: Boolean(checked) }).then(() => probes.reload())} />
                <Button color="red" variant="soft" onClick={() => void adminDelete(`/api/admin/probes/${probe.id}`).then(() => probes.reload())}>{t("common.delete")}</Button>
              </Flex>
            </Flex>
          </Card>
        ))}
        <Text weight="bold">{t("nb.ping.live", "Live results")}</Text>
        {results.map((result) => (
          <Card key={result.target}>
            <Flex justify="between">
              <Text>{result.target}</Text>
              <Badge color={result.success ? "green" : "red"}>
                {result.success ? `${Math.round((result.latencySeconds ?? 0) * 1000)} ms` : "down"}
              </Badge>
            </Flex>
          </Card>
        ))}
      </Flex>
    </AdminPage>
  );
}
