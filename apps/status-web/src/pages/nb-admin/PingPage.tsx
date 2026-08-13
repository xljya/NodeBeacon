import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Callout,
  Card,
  Checkbox,
  Flex,
  Select,
  Switch,
  Text,
  TextField,
} from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { adminDelete, adminPatch, adminPost, adminGet } from "@/lib/adminGateway";
import ConfirmDeleteButton from "@/components/admin/ConfirmDeleteButton";
import { useAdminResource } from "@/lib/useAdminResource";
import type {
  AdminProbe,
  AdminProbeResult,
  ChinaIspPingBatchDeleteResponse,
  ChinaIspPingBatchResponse,
  ChinaIspPingCatalog,
  ProbeReconcileResponse,
} from "@/lib/contracts";
import { isProbeReconciled } from "@/lib/probeSync";
import { AdminError, AdminLoading, AdminPage } from "./AdminPage";

function toggleCode(list: string[], code: string, checked: boolean): string[] {
  if (checked) return list.includes(code) ? list : [...list, code];
  return list.filter((item) => item !== code);
}

export default function PingPage() {
  const { t } = useTranslation();
  const probes = useAdminResource<{ probes: AdminProbe[] }>("/api/admin/probes");
  const catalog = useAdminResource<ChinaIspPingCatalog>("/api/admin/probes/catalog");
  const [results, setResults] = useState<AdminProbeResult[]>([]);
  const [name, setName] = useState("HTTPS check");
  const [target, setTarget] = useState("https://example.com");
  const [protocol, setProtocol] = useState<"http" | "tcp" | "icmp">("http");
  const [provinces, setProvinces] = useState<string[]>([]);
  const [carriers, setCarriers] = useState<string[]>([]);
  const [families, setFamilies] = useState<string[]>(["v4"]);
  const [busy, setBusy] = useState(false);
  const [unsynced, setUnsynced] = useState(false);

  const reloadResults = () =>
    adminGet<{ probes: AdminProbeResult[] }>("/api/admin/probes/results")
      .then((payload) => setResults(payload.probes ?? []))
      .catch(() => setResults([]));

  useEffect(() => {
    void reloadResults();
  }, []);

  useEffect(() => {
    if (!catalog.data) return;
    setProvinces(catalog.data.defaultProvinceCodes);
    setCarriers(catalog.data.carriers.map((item) => item.code));
    setFamilies(["v4"]);
  }, [catalog.data]);

  const previewCount = provinces.length * carriers.length * families.length;
  const selection = useMemo(
    () => ({ provinces, carriers, ipFamilies: families, intervalSeconds: 60, enabled: true }),
    [provinces, carriers, families],
  );

  if (probes.loading || catalog.loading) return <AdminLoading />;
  if (probes.error) return <AdminError message={probes.error} onRetry={() => void probes.reload()} />;

  const noteReconcile = (result: { reconciled?: boolean }) => {
    const synced = isProbeReconciled(result);
    setUnsynced(!synced);
    return synced;
  };

  const runBatch = async () => {
    setBusy(true);
    try {
      const result = await adminPost<ChinaIspPingBatchResponse>("/api/admin/probes/batch", selection);
      if (noteReconcile(result)) {
        toast.success(t("ping.china_isp.added", { created: result.created, skipped: result.skipped }));
      } else {
        toast.warning(t("ping.china_isp.saved_not_synced", { created: result.created, skipped: result.skipped }));
      }
      await probes.reload();
      await reloadResults();
    } finally {
      setBusy(false);
    }
  };

  const runDelete = async () => {
    setBusy(true);
    try {
      const result = await adminPost<ChinaIspPingBatchDeleteResponse>("/api/admin/probes/batch/delete", selection);
      if (noteReconcile(result)) {
        toast.success(t("ping.china_isp.deleted", { deleted: result.deleted }));
      } else {
        toast.warning(t("ping.china_isp.deleted_not_synced", { deleted: result.deleted }));
      }
      await probes.reload();
      await reloadResults();
    } finally {
      setBusy(false);
    }
  };

  const retrySync = async () => {
    setBusy(true);
    try {
      const result = await adminPost<ProbeReconcileResponse>("/api/admin/probes/reconcile", {});
      if (noteReconcile(result)) {
        toast.success(t("ping.china_isp.synced"));
        await reloadResults();
      } else {
        toast.warning(t("ping.china_isp.retry_failed"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminPage
      title={t("ping.title")}
      description={t("ping.desc", "Managed latency probes and live Blackbox results. PromQL is not accepted from the browser.")}
    >
      <Flex direction="column" gap="3">
        <Flex gap="2" wrap="wrap">
          <TextField.Root value={name} onChange={(event) => setName(event.target.value)} placeholder={t("common.name", "Name")} />
          <Select.Root value={protocol} onValueChange={(value) => setProtocol(value as "http" | "tcp" | "icmp")}>
            <Select.Trigger />
            <Select.Content>
              <Select.Item value="http">HTTP</Select.Item>
              <Select.Item value="tcp">TCP</Select.Item>
              <Select.Item value="icmp">ICMP</Select.Item>
            </Select.Content>
          </Select.Root>
          <TextField.Root value={target} onChange={(event) => setTarget(event.target.value)} placeholder={t("ping.target")} />
          <Button
            onClick={() =>
              void adminPost<{ reconciled?: boolean }>("/api/admin/probes", { name, protocol, target, intervalSeconds: 60, enabled: true }).then((result) => {
                if (!noteReconcile(result)) toast.warning(t("ping.china_isp.saved_not_synced", { created: 1, skipped: 0 }));
                return probes.reload();
              })
            }
          >
            {t("common.add", "Add")}
          </Button>
        </Flex>

        {catalog.data ? (
          <Card>
            <Flex direction="column" gap="3">
              <Flex direction="column" gap="1">
                <Text weight="bold">{t("ping.china_isp.title")}</Text>
                <Text size="2" color="gray">{t("ping.china_isp.desc")}</Text>
              </Flex>
              <Flex gap="2" wrap="wrap">
                <Button
                  size="1"
                  variant="soft"
                  onClick={() => setProvinces(catalog.data?.defaultProvinceCodes ?? [])}
                >
                  {t("ping.china_isp.core20")}
                </Button>
                <Button
                  size="1"
                  variant="soft"
                  onClick={() => setProvinces((catalog.data?.provinces ?? []).map((item) => item.code))}
                >
                  {t("ping.china_isp.all_provinces")}
                </Button>
                <Button size="1" variant="soft" color="gray" onClick={() => setProvinces([])}>
                  {t("common.reset")}
                </Button>
              </Flex>
              <Text size="2" weight="bold">{t("ping.china_isp.provinces")}</Text>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(108px, 1fr))",
                  gap: 8,
                }}
              >
                {catalog.data.provinces.map((province) => (
                  <label key={province.code} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={provinces.includes(province.code)}
                      onCheckedChange={(checked) => setProvinces((current) => toggleCode(current, province.code, Boolean(checked)))}
                    />
                    {province.name}
                  </label>
                ))}
              </div>
              <Flex gap="4" wrap="wrap">
                <Flex direction="column" gap="2">
                  <Text size="2" weight="bold">{t("ping.china_isp.carriers")}</Text>
                  {catalog.data.carriers.map((carrier) => (
                    <label key={carrier.code} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={carriers.includes(carrier.code)}
                        onCheckedChange={(checked) => setCarriers((current) => toggleCode(current, carrier.code, Boolean(checked)))}
                      />
                      {carrier.name}
                    </label>
                  ))}
                </Flex>
                <Flex direction="column" gap="2">
                  <Text size="2" weight="bold">{t("ping.china_isp.ip_families")}</Text>
                  {catalog.data.ipFamilies.map((family) => (
                    <label key={family} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={families.includes(family)}
                        onCheckedChange={(checked) => setFamilies((current) => toggleCode(current, family, Boolean(checked)))}
                      />
                      {family === "v4" ? "IPv4" : "IPv6"}
                    </label>
                  ))}
                </Flex>
              </Flex>
              <Text size="2" color="gray">{t("ping.china_isp.preview", { count: previewCount })}</Text>
              {unsynced ? (
                <Callout.Root color="amber">
                  <Callout.Text>{t("ping.china_isp.unsynced_callout")}</Callout.Text>
                </Callout.Root>
              ) : null}
              <Flex gap="2" wrap="wrap">
                <Button disabled={busy || previewCount === 0} onClick={() => void runBatch()}>
                  {t("ping.china_isp.add_batch")}
                </Button>
                <Button variant="soft" disabled={busy} onClick={() => void retrySync()}>
                  {t("ping.china_isp.retry_sync")}
                </Button>
                <ConfirmDeleteButton
                  itemName={t("ping.china_isp.title")}
                  description={t("ping.china_isp.delete_confirm", { count: previewCount })}
                  onConfirm={runDelete}
                >
                  <Button color="red" variant="soft" disabled={busy || previewCount === 0}>
                    {t("ping.china_isp.delete_batch")}
                  </Button>
                </ConfirmDeleteButton>
              </Flex>
            </Flex>
          </Card>
        ) : catalog.error ? (
          <Callout.Root color="amber">
            <Callout.Text>{catalog.error}</Callout.Text>
          </Callout.Root>
        ) : null}

        {(probes.data?.probes ?? []).map((probe) => (
          <Card key={probe.id}>
            <Flex justify="between" align="center" gap="3" wrap="wrap">
              <Flex direction="column">
                <Text weight="bold">{probe.name}</Text>
                <Text size="2" color="gray">{probe.protocol} · {probe.target}</Text>
              </Flex>
              <Flex gap="2" align="center">
                <Switch
                  checked={Boolean(probe.enabled)}
                  onCheckedChange={(checked) =>
                    void adminPatch<{ reconciled?: boolean }>(`/api/admin/probes/${probe.id}`, { enabled: Boolean(checked) }).then((result) => {
                      if (!noteReconcile(result)) toast.warning(t("ping.china_isp.unsynced_callout"));
                      return probes.reload();
                    })
                  }
                />
                <ConfirmDeleteButton itemName={probe.name} onConfirm={() => adminDelete(`/api/admin/probes/${probe.id}`).then(() => probes.reload())}>
                  <Button color="red" variant="soft">{t("common.delete")}</Button>
                </ConfirmDeleteButton>
              </Flex>
            </Flex>
          </Card>
        ))}
        <Text weight="bold">{t("ping.live", "Live results")}</Text>
        {results.map((result) => (
          <Card key={`${result.job}-${result.target}`}>
            <Flex justify="between" gap="3" wrap="wrap">
              <Flex direction="column">
                <Text>{result.target}</Text>
                {result.job ? <Text size="1" color="gray">{result.job}</Text> : null}
              </Flex>
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
