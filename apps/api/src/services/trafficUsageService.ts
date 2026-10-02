import type { NodeConfigEntry, TrafficConfig, TrafficUsage } from "@nodebeacon/shared";
import type { PrometheusClient } from "./prometheusClient.js";
import { metric, networkDeviceExclude } from "./metricsService.js";

/** Stored in the owner registry, never inferred from invoice renewal dates. */
export function normalizeTraffic(raw: unknown): TrafficConfig | undefined {
  if (raw === undefined || raw === null) return undefined;
  const fail = (): never => { throw new Error("Invalid traffic calibration: use a positive quota, GB/GiB, sum/max/tx/rx, an explicit period (at most 35 days), and non-negative readings inside that period."); };
  if (typeof raw !== "object" || Array.isArray(raw)) return fail();
  const r = raw as Record<string, unknown>;
  const c = r.calibration as Record<string, unknown> | undefined;
  const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER;
  const date = (v: unknown): v is string => typeof v === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
  if (!finite(r.quota) || r.quota <= 0 || !["GB", "GiB"].includes(String(r.unit)) || !["sum", "max", "tx", "rx"].includes(String(r.mode)) || typeof r.resetVerified !== "boolean" || !date(r.periodStart) || !date(r.periodEnd) || !c || !date(c.observedAt) || !finite(c.rx) || !finite(c.tx)) return fail();
  const start = Date.parse(r.periodStart), end = Date.parse(r.periodEnd), observed = Date.parse(c.observedAt);
  if (end <= start || end - start > 35 * 86400_000 || observed < start || observed >= end) return fail();
  return { quota: r.quota, unit: r.unit as TrafficConfig["unit"], mode: r.mode as TrafficConfig["mode"], periodStart:r.periodStart, periodEnd:r.periodEnd, resetVerified:r.resetVerified, calibration:{observedAt:c.observedAt, rx:c.rx, tx:c.tx} };
}

export async function getTrafficUsage(client: Pick<PrometheusClient, "queryNumber"> | null, node: NodeConfigEntry, now: string): Promise<TrafficUsage | undefined> {
  const config = node.traffic;
  if (!config) return undefined;
  const usage: TrafficUsage = {
    source: "calibrated_estimate", status: "unavailable", unit:config.unit, mode:config.mode,
    quota:config.quota, periodStart:config.periodStart, periodEnd:config.periodEnd,
    resetVerified:config.resetVerified, calibratedAt:config.calibration.observedAt, updatedAt:now,
    rx:null, tx:null, used:null, remaining:null
  };
  const end = Date.parse(now) / 1000, anchor = Date.parse(config.calibration.observedAt) / 1000;
  if (end >= Date.parse(config.periodEnd)/1000) return {...usage,status:"needs_calibration"};
  if (!client || end < anchor || end < Date.parse(config.periodStart)/1000) return usage;
  // Wait for at least two ordinary 30-second scrapes; never fabricate a zero increment.
  const duration = Math.floor(end-anchor);
  if (duration < 60) return usage;
  const devices = node.detail?.networkDevices?.filter(Boolean) ?? [];
  const matchers = devices.length ? [{name:"device", operator:"=~" as const, value:devices.map(d => d.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|")}] : [{name:"device",operator:"!~" as const,value:networkDeviceExclude}];
  const rxMetric=metric("node_network_receive_bytes_total",node.labels,matchers);
  const txMetric=metric("node_network_transmit_bytes_total",node.labels,matchers);
  try {
    const [rx,tx,startAge,endAge,availability] = await Promise.all([
      client.queryNumber(`sum(increase(${rxMetric}[${duration}s] @ ${end}))`),
      client.queryNumber(`sum(increase(${txMetric}[${duration}s] @ ${end}))`),
      client.queryNumber(`${anchor} - min(timestamp(${rxMetric} @ ${anchor}))`),
      client.queryNumber(`${end} - min(timestamp(${rxMetric} @ ${end}))`),
      client.queryNumber(`min(min_over_time(${metric("up",node.labels)}[${duration}s] @ ${end}))`)
    ]);
    if (rx===null || tx===null || rx<0 || tx<0 || startAge===null || endAge===null || startAge>120 || endAge>120 || availability!==1) return usage;
    const divisor=config.unit==="GiB" ? 1024**3 : 1e9;
    const received=config.calibration.rx + rx/divisor, sent=config.calibration.tx + tx/divisor;
    const used=config.mode==="sum" ? received+sent : config.mode==="max" ? Math.max(received,sent) : config.mode==="rx" ? received : sent;
    return {...usage,status:"ok",rx:received,tx:sent,used,remaining:Math.max(0,config.quota-used)};
  } catch { return usage; }
}
