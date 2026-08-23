import { useEffect, useMemo, useState } from "react";
import { Button, Card, Flex, Text } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import {
  buildPublicNodeLatencyStatsPath,
  fetchJson,
  isNodeDetailLatencyVantage,
  type NodeBeaconDetailSeries,
  type NodeBeaconLatencyStatsResponse,
} from "@/lib/nodebeacon";

type NodeDetailLatencyStatsProps = {
  nodeId: string;
  series: NodeBeaconDetailSeries[];
};

function formatMs(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)} ms`;
}

export default function NodeDetailLatencyStats({ nodeId, series }: NodeDetailLatencyStatsProps) {
  const { t } = useTranslation();
  const vantages = useMemo(
    () => [...new Set(series
      .map((item) => item.labels?.vantage ?? item.key)
      .filter(isNodeDetailLatencyVantage))],
    [series],
  );
  const [vantage, setVantage] = useState<string>("");
  const [stats, setStats] = useState<NodeBeaconLatencyStatsResponse | null>(null);
  const [error, setError] = useState(false);
  const selected = vantage && vantages.includes(vantage as typeof vantages[number]) ? vantage : (vantages[0] ?? "");

  useEffect(() => {
    const path = buildPublicNodeLatencyStatsPath(nodeId, selected);
    if (!path) {
      setStats(null);
      return;
    }
    const controller = new AbortController();
    setError(false);
    fetchJson<NodeBeaconLatencyStatsResponse>(path, { signal: controller.signal })
      .then(setStats)
      .catch(() => {
        if (!controller.signal.aborted) {
          setStats(null);
          setError(true);
        }
      });
    return () => controller.abort();
  }, [nodeId, selected]);

  if (vantages.length === 0) return null;

  return (
    <Card className="p-3" data-latency-stats="">
      <Flex justify="between" align="center" wrap="wrap" gap="2">
        <Text size="2" weight="medium">{t("nodes.latencyStats")}</Text>
        <Flex gap="1" wrap="wrap">
          {vantages.map((item) => (
            <Button
              key={item}
              size="1"
              variant={item === selected ? "solid" : "soft"}
              onClick={() => setVantage(item)}
            >
              {series.find((candidate) => (candidate.labels?.vantage ?? candidate.key) === item)?.labels?.vantage_name
                ?? series.find((candidate) => (candidate.labels?.vantage ?? candidate.key) === item)?.labels?.vantage
                ?? item}
            </Button>
          ))}
        </Flex>
      </Flex>
      {error ? (
        <Text size="2" color="gray" className="mt-2">{t("nodes.unavailable")}</Text>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Text size="2">{t("nodes.latest")}: {formatMs(stats?.latestMs ?? null)}</Text>
          <Text size="2">{t("nodes.average")}: {formatMs(stats?.averageMs ?? null)}</Text>
          <Text size="2">{t("nodes.packetLoss")}: {stats?.packetLossPercent == null ? "—" : `${stats.packetLossPercent.toFixed(1)}%`}</Text>
          <Text size="2">{t("nodes.interval")}: {stats ? `${stats.intervalSeconds}s` : "—"}</Text>
          <Text size="2">{t("nodes.samples")}: {stats?.sampleCount ?? "—"}</Text>
          <Text size="2">{t("nodes.packets")}: {stats ? `${stats.packetsReceived} / ${stats.packetsSent}` : "—"}</Text>
          <Text size="2">{t("nodes.type")}: {stats?.type ?? "ICMP"}</Text>
          <Text size="2">{stats?.source.city ?? "—"} · {stats?.source.asn ?? ""}</Text>
        </div>
      )}
    </Card>
  );
}
