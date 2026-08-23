import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, Button, Card, Flex, Grid, Select, Text } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import Flag from "@/components/Flag";
import Loading from "@/components/loading";
import NodeDetailLatencyStats from "@/components/NodeDetailLatencyStats";
import NodeDetailSeriesChart from "@/components/NodeDetailSeriesChart";
import UsageBar from "@/components/UsageBar";
import {
  NODE_DETAIL_METRICS,
  NODE_DETAIL_RANGES,
  buildPublicNodeSeriesPath,
  fetchJson,
  fetchStatus,
  getNodeDetailPath,
  type NodeBeaconDetailResponse,
  type NodeBeaconDetailSeriesResponse,
  type NodeBeaconStatusNode,
  type NodeDetailRange,
} from "@/lib/nodebeacon";
import { formatBytes } from "@/utils/unitHelper";

function formatUptime(seconds: number, t: (key: string) => string): string {
  if (!seconds || seconds < 0) return `0 ${t("nodeCard.time_second")}`;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d} ${t("nodeCard.time_day")}`);
  if (h) parts.push(`${h} ${t("nodeCard.time_hour")}`);
  if (m) parts.push(`${m} ${t("nodeCard.time_minute")}`);
  return parts.join(" ") || `0 ${t("nodeCard.time_second")}`;
}

function diskUsage(detail: NodeBeaconDetailResponse["live"]): { used: number; total: number; percent: number } {
  const first = detail.disks[0];
  const used = first?.usedBytes ?? 0;
  const total = first?.totalBytes ?? 0;
  const percent = first?.usedPercent ?? (total > 0 ? (used / total) * 100 : 0);
  return { used, total, percent };
}

export default function NodeDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const decodedId = decodeURIComponent(id);
  const [range, setRange] = useState<NodeDetailRange>("1d");
  const [nodes, setNodes] = useState<NodeBeaconStatusNode[]>([]);
  const [detail, setDetail] = useState<NodeBeaconDetailResponse | null>(null);
  const [series, setSeries] = useState<NodeBeaconDetailSeriesResponse["series"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let controller = new AbortController();
    let cancelled = false;
    const load = (background: boolean) => {
      controller.abort();
      const request = new AbortController();
      controller = request;
      if (!background) {
        setLoading(true);
        setError(null);
      }
      const seriesPath = buildPublicNodeSeriesPath(decodedId, {
        metrics: NODE_DETAIL_METRICS,
        range,
      });
      Promise.all([
        fetchStatus(true),
        fetchJson<NodeBeaconDetailResponse>(`/api/public/nodes/${encodeURIComponent(decodedId)}/detail`, { signal: request.signal }),
        seriesPath
          ? fetchJson<NodeBeaconDetailSeriesResponse>(seriesPath, { signal: request.signal }).catch((seriesError) => {
              if (request.signal.aborted) throw seriesError;
              return { nodeId: decodedId, series: [] as NodeBeaconDetailSeriesResponse["series"] };
            })
          : Promise.resolve({ nodeId: decodedId, series: [] as NodeBeaconDetailSeriesResponse["series"] }),
      ])
        .then(([status, nextDetail, nextSeries]) => {
          if (cancelled || request.signal.aborted) return;
          setNodes(status.nodes);
          setDetail(nextDetail);
          setSeries(nextSeries.series);
        })
        .catch((requestError) => {
          if (cancelled || request.signal.aborted) return;
          if (!background) {
            setDetail(null);
            setSeries([]);
            setError(requestError instanceof Error ? requestError.message : t("nodes.unavailable"));
          }
        })
        .finally(() => {
          if (!cancelled && !request.signal.aborted) setLoading(false);
        });
    };
    load(false);
    const timer = window.setInterval(() => load(true), range === "realtime" ? 5_000 : 20_000);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [decodedId, range, t]);

  const groupedNodes = useMemo(() => {
    return nodes.reduce<Record<string, NodeBeaconStatusNode[]>>((groups, node) => {
      (groups[node.group] ??= []).push(node);
      return groups;
    }, {});
  }, [nodes]);
  const live = detail?.live;
  const disk = live ? diskUsage(live) : { used: 0, total: 0, percent: 0 };
  const memoryPercent = live?.memoryTotalBytes
    ? ((live.memoryUsedBytes ?? 0) / live.memoryTotalBytes) * 100
    : 0;

  if (loading && !detail) {
    return <div className="flex min-h-64 items-center justify-center" data-testid="node-detail-loading"><Loading /></div>;
  }
  if (!detail) {
    return (
      <Card className="mt-3 p-6" data-page="node-detail">
        <Flex direction="column" gap="3">
          <Text weight="bold">{error ? t("nodes.unavailable") : t("nodes.notFound", { id: decodedId })}</Text>
          <Button asChild variant="soft"><Link to="/">{t("go_to_home")}</Link></Button>
        </Flex>
      </Card>
    );
  }

  return (
    <div className="nb-node-detail mt-3" data-page="node-detail">
      <Grid columns={{ initial: "1", md: "220px 1fr" }} gap="3">
        <Card className="p-3">
          <Text size="2" weight="bold">{t("nodes.servers")}</Text>
          <Flex direction="column" gap="3" className="mt-3">
            {Object.entries(groupedNodes).map(([group, groupNodes]) => (
              <Flex key={group} direction="column" gap="1">
                <Text size="1" color="gray">{group}</Text>
                {groupNodes.map((node) => (
                  <Link
                    key={node.id}
                    to={getNodeDetailPath(node.id)}
                    className={`flex items-center gap-2 rounded px-2 py-1 ${node.id === decodedId ? "bg-accent-3" : "hover:bg-accent-2"}`}
                    aria-current={node.id === decodedId ? "page" : undefined}
                  >
                    <Flag flag={node.countryCode ?? node.region} />
                    <Text size="2">{node.name}</Text>
                    <span className="ml-auto h-2 w-2 rounded-full" style={{ background: node.online ? "var(--green-9)" : "var(--gray-8)" }} />
                  </Link>
                ))}
              </Flex>
            ))}
          </Flex>
        </Card>
        <Flex direction="column" gap="3">
          <Card className="p-4">
            <Flex justify="between" align="center" wrap="wrap" gap="3">
              <Flex align="center" gap="3">
                <Flag flag={detail.node.countryCode ?? detail.node.region} />
                <Text size="5" weight="bold">{detail.node.name}</Text>
                <Badge color={detail.node.online ? "green" : "gray"}>
                  {detail.node.online ? t("nodeCard.online") : t("nodeCard.offline")}
                </Badge>
              </Flex>
              <Select.Root value={range} onValueChange={(value) => setRange(value as NodeDetailRange)}>
                <Select.Trigger />
                <Select.Content>
                  {NODE_DETAIL_RANGES.map((item) => (
                    <Select.Item key={item} value={item}>{t(`nodes.range_${item}`)}</Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Flex>
            <Grid columns={{ initial: "1", sm: "2" }} gap="3" className="mt-4">
              <UsageBar label={t("nodeCard.resourceUsage") + " CPU"} value={live?.cpuPercent ?? 0} />
              <UsageBar label={t("nodeCard.ram")} value={memoryPercent} />
              <UsageBar label={t("nodeCard.disk")} value={disk.percent} />
              <Flex direction="column" gap="1">
                <Text size="2">{t("nodeCard.uptime")}: {formatUptime(live?.uptimeSeconds ?? 0, t)}</Text>
                <Text size="2">{t("nodeCard.load")}: {(live?.load1 ?? 0).toFixed(2)}</Text>
                <Text size="2">{t("nodeCard.os")}: {detail.profile.osName ?? "—"} {detail.profile.arch ?? ""}</Text>
                <Text size="2">{t("nodeCard.networkSpeed")}: ↓ {formatBytes(live?.networkRxBytesPerSecond ?? 0)}/s · ↑ {formatBytes(live?.networkTxBytesPerSecond ?? 0)}/s</Text>
              </Flex>
            </Grid>
          </Card>
          <Grid columns={{ initial: "1", lg: "2" }} gap="3">
            <NodeDetailSeriesChart metric="cpu" title={t("nodeCard.resourceUsage") + " CPU"} series={series.filter((item) => item.metric === "cpu")} />
            <NodeDetailSeriesChart metric="memory" title={t("nodeCard.ram")} series={series.filter((item) => item.metric === "memory")} />
            <NodeDetailSeriesChart metric="disk" title={t("nodeCard.disk")} series={series.filter((item) => item.metric === "disk")} />
            <NodeDetailSeriesChart metric="network" title={t("nodeCard.networkSpeed")} series={series.filter((item) => item.metric === "network")} />
            <NodeDetailSeriesChart metric="connections" title={t("chart.connections")} series={series.filter((item) => item.metric === "connections")} />
            <NodeDetailSeriesChart metric="latency" title={t("nodeCard.ping")} series={series.filter((item) => item.metric === "latency")} height={240} />
            <NodeDetailLatencyStats nodeId={decodedId} series={series.filter((item) => item.metric === "latency")} />
          </Grid>
        </Flex>
      </Grid>
    </div>
  );
}
