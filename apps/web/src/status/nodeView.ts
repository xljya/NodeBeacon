import type { StatusNode } from "@nodebeacon/shared";
import {
  fmtBytes,
  fmtRate,
  formatUptime,
  osSlug,
  percentTone,
  countryFlag,
  type OsSlug,
  type UptimeUnits
} from "../lib/format";

export interface MetricView {
  pct: number;
  text: string;
  tone: "ok" | "warn" | "crit";
  sub?: string;
}

export interface NodeView {
  id: string;
  name: string;
  group: string;
  flag: string;
  online: boolean;
  osSlug: OsSlug;
  osText: string;
  tags: string[];
  cpu: MetricView;
  ram: MetricView;
  disk: MetricView;
  upSpeed: string;
  downSpeed: string;
  upTotal: string;
  downTotal: string;
  traffic: string;
  net: string;
  uptime: string;
  load1: string;
  updatedAt: string;
}

const DASH = "—";

/** Derive all display strings for a node card/row from the raw API node. */
export function buildNodeView(node: StatusNode, units: UptimeUnits): NodeView {
  const m = node.metrics;
  const tx = Number(m.networkTxBytesPerSecond) || 0;
  const rx = Number(m.networkRxBytesPerSecond) || 0;
  const txTotal = Number(m.networkTxBytesTotal) || 0;
  const rxTotal = Number(m.networkRxBytesTotal) || 0;
  const upSpeed = `↑ ${fmtRate(tx)}`;
  const downSpeed = `↓ ${fmtRate(rx)}`;
  const upTotal = `↑ ${fmtBytes(txTotal)}`;
  const downTotal = `↓ ${fmtBytes(rxTotal)}`;

  const cpuPct = Number(m.cpuPercent) || 0;
  const ramPct = Number(m.memoryPercent) || 0;
  const diskPct = Number(m.diskPercent) || 0;

  const uptime = node.online ? formatUptime(m.uptimeSeconds, units) ?? DASH : DASH;

  const tags = [node.provider, node.group, ...(node.tags ?? [])].filter(
    (t): t is string => Boolean(t)
  );

  return {
    id: node.id,
    name: node.name || node.id,
    group: node.group || "",
    flag: countryFlag(node.countryCode, node.region),
    online: !!node.online,
    osSlug: osSlug(node.os?.name),
    osText: `${node.os?.name ?? "Linux"} / ${node.os?.arch ?? "amd64"}`,
    tags,
    cpu: { pct: cpuPct, text: `${cpuPct.toFixed(1)}%`, tone: percentTone(cpuPct) },
    ram: {
      pct: ramPct,
      text: `${ramPct.toFixed(1)}%`,
      tone: percentTone(ramPct),
      sub: `${fmtBytes(m.memoryUsedBytes)} / ${fmtBytes(m.memoryTotalBytes)}`
    },
    disk: {
      pct: diskPct,
      text: `${diskPct.toFixed(1)}%`,
      tone: percentTone(diskPct),
      sub: `${fmtBytes(m.diskUsedBytes)} / ${fmtBytes(m.diskTotalBytes)}`
    },
    upSpeed,
    downSpeed,
    upTotal,
    downTotal,
    traffic: `${upTotal}  ${downTotal}`,
    net: `${upSpeed}  ${downSpeed}`,
    uptime,
    load1: node.online ? (Number(m.load1) || 0).toFixed(2) : DASH,
    updatedAt: node.updatedAt ? new Date(node.updatedAt).toLocaleString() : DASH
  };
}
