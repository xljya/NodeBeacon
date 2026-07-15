import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  DETAIL_AGGREGATIONS,
  type ApiIncidentsResponse,
  type ApiNodeDetailSeriesResponse,
  type ApiNodeDetailV2Response,
  type ApiStatusResponse,
  type DetailAggregation,
  type DetailChartMetric,
  type DetailTimeRange,
  type StatusNode,
  type TrendSeries,
  type TrendUnit
} from "@nodebeacon/shared";
import { apiGet } from "../lib/api";
import { buildNodeView, type MetricView } from "./nodeView";
import { StatusHeader } from "./components/StatusHeader";
import { OsLogo } from "./components/OsLogo";
import { TrendChart } from "./components/TrendChart";
import { getStatusSnapshot, loadStatusSnapshot } from "./statusSnapshot";
import "./status.css";

type Theme = "light" | "dark";

const SNAPSHOT_REFRESH_MS = 20000;
const DETAIL_REFRESH_MS = 5000;
const DETAIL_RANGES: Array<{ id: DetailTimeRange; label: string }> = [
  { id: "realtime", label: "实时" },
  { id: "1d", label: "1天" },
  { id: "7d", label: "7天" },
  { id: "30d", label: "30天" },
  { id: "60d", label: "60天" },
  { id: "custom", label: "自定义" }
];

type ChartId = DetailChartMetric | "load";
interface ChartConfig {
  id: ChartId;
  metric: DetailChartMetric;
  size: "s" | "m" | "l";
  defaultSeries: string[];
}

const DEFAULT_CHARTS: ChartConfig[] = [
  { id: "cpu", metric: "cpu", size: "m", defaultSeries: ["cpu"] },
  { id: "load", metric: "cpu", size: "s", defaultSeries: ["load1"] },
  { id: "memory", metric: "memory", size: "m", defaultSeries: ["ram"] },
  { id: "swap", metric: "swap", size: "s", defaultSeries: ["swap"] },
  { id: "disk", metric: "disk", size: "m", defaultSeries: ["disk"] },
  { id: "network", metric: "network", size: "l", defaultSeries: ["rx", "tx"] },
  { id: "latency", metric: "latency", size: "s", defaultSeries: ["tcp"] },
  { id: "connections", metric: "connections", size: "s", defaultSeries: ["tcp", "udp"] }
];

type LayoutState = {
  charts: ChartConfig[];
  aggregation: DetailAggregation;
  ewma: boolean;
};

const LAYOUT_KEY = "nb-node-detail-layout:v1";

function defaultLayout(): LayoutState {
  return { charts: DEFAULT_CHARTS, aggregation: "avg", ewma: false };
}

function loadLayout(): LayoutState {
  try {
    const raw = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "null") as Partial<LayoutState> | null;
    if (!raw || !Array.isArray(raw.charts)) return defaultLayout();
    const known = new Map(DEFAULT_CHARTS.map((chart) => [chart.id, chart]));
    const charts = raw.charts
      .map((candidate) => {
        const base = known.get(candidate.id as ChartId);
        if (!base) return null;
        const size = candidate.size === "s" || candidate.size === "l" ? candidate.size : "m";
        const defaultSeries = Array.isArray(candidate.defaultSeries)
          ? candidate.defaultSeries.filter((value): value is string => typeof value === "string" && value.length < 80)
          : base.defaultSeries;
        return { ...base, size, defaultSeries: defaultSeries.length ? defaultSeries : base.defaultSeries };
      })
      .filter((chart): chart is ChartConfig => Boolean(chart));
    return {
      charts: charts.length ? charts : DEFAULT_CHARTS,
      aggregation: DETAIL_AGGREGATIONS.includes(raw.aggregation as DetailAggregation) ? raw.aggregation as DetailAggregation : "avg",
      ewma: Boolean(raw.ewma)
    };
  } catch {
    return defaultLayout();
  }
}

function formatBytes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let scaled = Math.max(0, value);
  let index = 0;
  while (scaled >= 1024 && index < units.length - 1) {
    scaled /= 1024;
    index += 1;
  }
  return `${scaled.toFixed(scaled >= 10 ? 0 : 2)} ${units[index]}`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

function trendUnit(unit: string): TrendUnit {
  if (unit === "bytes" || unit === "bytes_per_second" || unit === "load" || unit === "count" || unit === "milliseconds") {
    return unit;
  }
  return "percent";
}

function smoothSeries(series: TrendSeries[], enabled: boolean): TrendSeries[] {
  if (!enabled) return series;
  const alpha = 0.25;
  return series.map((item) => {
    let previous: number | null = null;
    return {
      ...item,
      points: item.points.map(([timestamp, value]) => {
        if (value === null) {
          previous = null;
          return [timestamp, null];
        }
        previous = previous === null ? value : alpha * value + (1 - alpha) * previous;
        return [timestamp, previous];
      })
    };
  });
}

function Metric({ label, m }: { label: string; m: MetricView }) {
  return (
    <div className="metric">
      <div className="metric-head">
        <span className="l">{label}</span>
        <span className="v">{m.text}</span>
      </div>
      <div className="bar">
        <div className={`bar-fill ${m.tone}`} style={{ width: `${Math.min(100, Math.max(0, m.pct))}%` }} />
      </div>
      {m.sub && <span className="metric-sub">{m.sub}</span>}
    </div>
  );
}

function chartTitle(id: ChartId): string {
  return ({ cpu: "CPU", load: "Load", memory: "Memory", swap: "Swap", disk: "Disk", network: "Network", latency: "Latency", connections: "Connections" } as Record<ChartId, string>)[id];
}

export function NodeDetailPage() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("nb-theme") as Theme) || "light");
  const [status, setStatus] = useState<ApiStatusResponse | null>(getStatusSnapshot());
  const [statusLoading, setStatusLoading] = useState(!getStatusSnapshot());
  const [detail, setDetail] = useState<ApiNodeDetailV2Response | null>(null);
  const [detailError, setDetailError] = useState(false);
  const [series, setSeries] = useState<ApiNodeDetailSeriesResponse | null>(null);
  const [incidents, setIncidents] = useState<ApiIncidentsResponse["incidents"]>([]);
  const [range, setRange] = useState<DetailTimeRange>("realtime");
  const [aggregation, setAggregation] = useState<DetailAggregation>(() => loadLayout().aggregation);
  const [ewma, setEwma] = useState(() => loadLayout().ewma);
  const [charts, setCharts] = useState<ChartConfig[]>(() => loadLayout().charts);
  const [customFrom, setCustomFrom] = useState(() => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [dragging, setDragging] = useState<ChartId | null>(null);
  const mounted = useRef(true);

  useEffect(() => localStorage.setItem("nb-theme", theme), [theme]);
  useEffect(() => {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ charts, aggregation, ewma } satisfies LayoutState));
  }, [charts, aggregation, ewma]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const response = await loadStatusSnapshot();
      if (mounted.current) setStatus(response);
    } catch {
      // Detail endpoint can still render the page if the summary snapshot is stale.
    } finally {
      if (mounted.current) setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    const timer = window.setInterval(() => { if (!document.hidden) void loadStatus(); }, SNAPSHOT_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadStatus]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    const loadDetail = async () => {
      try {
        const response = await apiGet<ApiNodeDetailV2Response>(`/api/public/nodes/${encodeURIComponent(id)}/detail`);
        if (active) { setDetail(response); setDetailError(false); }
      } catch {
        if (active) setDetailError(true);
      }
    };
    void loadDetail();
    const timer = window.setInterval(() => { if (!document.hidden) void loadDetail(); }, DETAIL_REFRESH_MS);
    return () => { active = false; window.clearInterval(timer); };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    const loadIncidents = async () => {
      try {
        const response = await apiGet<ApiIncidentsResponse>(`/api/incidents?nodeId=${encodeURIComponent(id)}&limit=5`);
        if (active) setIncidents(response.incidents);
      } catch {
        if (active) setIncidents([]);
      }
    };
    void loadIncidents();
    const timer = window.setInterval(() => { if (!document.hidden) void loadIncidents(); }, 60000);
    return () => { active = false; window.clearInterval(timer); };
  }, [id]);

  const loadSeries = useCallback(async () => {
    if (!id || !charts.length) return;
    const metrics = [...new Set(charts.map((chart) => chart.metric))].join(",");
    const params = new URLSearchParams({ metrics, aggregation });
    if (range === "custom") {
      params.set("range", "custom");
      params.set("from", `${customFrom}T00:00:00.000Z`);
      params.set("to", `${customTo}T23:59:59.999Z`);
    } else {
      params.set("range", range);
    }
    try {
      const response = await apiGet<ApiNodeDetailSeriesResponse>(`/api/public/nodes/${encodeURIComponent(id)}/series?${params.toString()}`);
      if (mounted.current) setSeries(response);
    } catch {
      if (mounted.current) setSeries(null);
    }
  }, [aggregation, charts, customFrom, customTo, id, range]);

  useEffect(() => {
    setSeries(null);
    void loadSeries();
    const timer = window.setInterval(() => { if (!document.hidden) void loadSeries(); }, range === "realtime" ? DETAIL_REFRESH_MS : 60000);
    return () => window.clearInterval(timer);
  }, [loadSeries, range]);

  const node: StatusNode | undefined = useMemo(
    () => status?.nodes.find((candidate) => candidate.id === id),
    [id, status]
  );
  const units = useMemo(() => ({ d: t("status.units.d"), h: t("status.units.h"), m: t("status.units.m") }), [t]);
  const view = useMemo(() => (node ? buildNodeView(node, units) : null), [node, units]);
  const groupedNodes = useMemo(() => (status?.nodes ?? []).reduce<Record<string, StatusNode[]>>((groups, candidate) => {
    (groups[candidate.group] ??= []).push(candidate);
    return groups;
  }, {}), [status]);
  const seriesByMetric = useMemo(() => {
    const map = new Map<DetailChartMetric, TrendSeries[]>();
    for (const item of series?.series ?? []) {
      const list = map.get(item.metric) ?? [];
      const suffix = item.metric === "disk" && item.labels?.mountpoint ? `:${item.labels.mountpoint}` : "";
      list.push({ name: `${item.key}${suffix}`, points: item.points });
      map.set(item.metric, list);
    }
    return map;
  }, [series]);

  const isSeriesSelected = (chart: ChartConfig, name: string): boolean => (
    chart.defaultSeries.includes(name)
    || (chart.id === "disk" && chart.defaultSeries.includes("disk") && name.startsWith("disk:"))
  );

  const toggleSeries = (chartId: ChartId, name: string, available: TrendSeries[]) => {
    setCharts((current) => current.map((chart) => {
      if (chart.id !== chartId) return chart;
      const selected = available.filter((item) => isSeriesSelected(chart, item.name)).map((item) => item.name);
      const next = selected.includes(name) ? selected.filter((item) => item !== name) : [...selected, name];
      return next.length > 0 ? { ...chart, defaultSeries: next } : chart;
    }));
  };

  const seriesLabel = (name: string): string => {
    if (name.startsWith("disk:")) return name.slice(5) || "/";
    return ({ rx: "Download", tx: "Upload", rxTotal: "Download total", txTotal: "Upload total", ram: "RAM", swap: "Swap", tcp: "TCP", udp: "UDP", running: "Running", load1: "Load" } as Record<string, string>)[name] ?? name;
  };

  const moveChart = (fromId: ChartId, toId: ChartId) => {
    if (fromId === toId) return;
    setCharts((current) => {
      const from = current.findIndex((chart) => chart.id === fromId);
      const to = current.findIndex((chart) => chart.id === toId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [item] = next.splice(from, 1);
      if (item) next.splice(to, 0, item);
      return next;
    });
  };

  const addChart = (chartId: ChartId) => {
    const candidate = DEFAULT_CHARTS.find((chart) => chart.id === chartId);
    if (!candidate || charts.some((chart) => chart.id === chartId)) return;
    setCharts((current) => [...current, candidate]);
  };

  return (
    <div className="status-page" data-theme={theme}>
      <div className="status-container detail-layout">
        <StatusHeader theme={theme} onToggleTheme={() => setTheme((previous) => (previous === "light" ? "dark" : "light"))} />
        <div className="status-body">
          <Link to="/" className="detail-back">← {t("status.detail.back")}</Link>

          {statusLoading && !status && !detail ? (
            <div className="status-empty"><div className="status-empty-title">{t("common.loading")}</div></div>
          ) : !detail && !node ? (
            <div className="status-empty">
              <div className="status-empty-title">{detailError ? "节点详情暂时不可用" : t("status.detail.notFoundTitle")}</div>
              <div className="status-empty-text">{t("status.detail.notFoundText", { id })}</div>
            </div>
          ) : (
            <>
              <div className="detail-main-grid">
                <aside className="detail-node-nav" aria-label="Nodes">
                  <div className="detail-nav-title">服务器列表</div>
                  {Object.entries(groupedNodes).map(([group, groupNodes]) => (
                    <div key={group} className="detail-nav-group">
                      <div className="detail-nav-group-title">{group}</div>
                      {groupNodes.map((candidate) => (
                        <Link key={candidate.id} to={`/nodes/${candidate.id}`} className={`detail-nav-item${candidate.id === id ? " active" : ""}`}>
                          <span>{candidate.name}</span>
                          <span className={`detail-nav-dot ${candidate.online ? "online" : "offline"}`} />
                        </Link>
                      ))}
                    </div>
                  ))}
                </aside>

                <main className="detail-main-content">
                  {view && (
                    <>
                      <div className="detail-head">
                        <div className="detail-head-main">
                          <span className="node-flag">{view.flag}</span>
                          <span className="detail-name">{view.name}</span>
                          <span className={`status-pill ${view.online ? "online" : "offline"}`}>{view.online ? t("status.card.online") : t("status.card.offline")}</span>
                        </div>
                        <div className="detail-head-meta">
                          <span className="detail-meta-item"><span className="node-os-logo"><OsLogo slug={view.osSlug} /></span>{detail?.profile.osName ?? view.osText}</span>
                          <span className="detail-meta-item">{t("status.card.uptime")}: {detail?.live.uptimeSeconds !== null && detail?.live.uptimeSeconds !== undefined ? formatDuration(detail.live.uptimeSeconds) : view.uptime}</span>
                          <span className="detail-meta-item">{t("status.card.load")}: {detail?.live.load1?.toFixed(2) ?? view.load1}</span>
                          <span className="detail-meta-item">最后上报: {detail?.live.lastReportAt ? new Date(detail.live.lastReportAt).toLocaleString() : view.updatedAt}</span>
                        </div>
                        {view.tags.length > 0 && <div className="node-tags">{view.tags.map((tag, index) => <span className="node-tag" key={`${tag}-${index}`}>{tag}</span>)}</div>}
                      </div>

                      {detail && <section className="detail-profile-card">
                        <div className="detail-profile-primary">
                          <div><b>CPU</b><span>{detail.profile.cpuModel ?? "Unknown"}{detail.profile.logicalCpuCores ? ` × ${detail.profile.logicalCpuCores}` : ""}</span></div>
                          <div><b>GPU</b><span>{detail.profile.gpuModel ?? "Unavailable"}</span></div>
                          <div><b>网络</b><span>{formatBytes(detail.live.networkRxBytesPerSecond)}/s ↓ · {formatBytes(detail.live.networkTxBytesPerSecond)}/s ↑</span></div>
                          <div><b>内存</b><span>{formatBytes(detail.live.memoryUsedBytes)} / {formatBytes(detail.live.memoryTotalBytes)}</span></div>
                          <div><b>Swap</b><span>{formatBytes(detail.live.swapUsedBytes)} / {formatBytes(detail.live.swapTotalBytes)}</span></div>
                          <div><b>总流量</b><span>↓ {formatBytes(detail.live.networkRxBytesTotal)} · ↑ {formatBytes(detail.live.networkTxBytesTotal)}</span></div>
                        </div>
                        <div className="detail-profile-secondary">
                          <div><b>架构</b><span>{detail.profile.arch ?? "—"}</span></div>
                          <div><b>虚拟化</b><span>{detail.profile.virtualization ?? "—"}</span></div>
                          <div><b>操作系统</b><span>{detail.profile.osName ?? "—"}</span></div>
                          <div><b>内核</b><span>{detail.profile.kernelVersion ?? "—"}</span></div>
                          <div><b>TCP / UDP</b><span>{detail.live.tcpConnections ?? "—"} / {detail.live.udpConnections ?? "—"}</span></div>
                          <div><b>磁盘</b><span>{detail.live.disks.map((disk) => `${disk.label}: ${formatBytes(disk.totalBytes)}`).join(" · ") || "—"}</span></div>
                        </div>
                      </section>}

                      <div className="detail-current">
                        <Metric label={t("status.card.cpu")} m={view.cpu} />
                        <Metric label={t("status.card.ram")} m={view.ram} />
                        <Metric label={t("status.card.disk")} m={view.disk} />
                        <div className="detail-netbox">
                          <div className="detail-netbox-row"><span className="l">{t("status.card.netSpd")}</span><span className="v">{view.net}</span></div>
                          <div className="detail-netbox-row"><span className="l">{t("status.card.traffic")}</span><span className="v">{view.traffic}</span></div>
                        </div>
                      </div>

                      {incidents.length > 0 && <IncidentPanel incidents={incidents} t={t} />}

                      <div className="detail-trends-head">
                        <span className="detail-trends-title">趋势与图表</span>
                        <div className="range-tabs">
                          {DETAIL_RANGES.map((candidate) => <button key={candidate.id} type="button" className={`range-tab${range === candidate.id ? " active" : ""}`} onClick={() => setRange(candidate.id)}>{candidate.label}</button>)}
                        </div>
                      </div>

                      {range === "custom" && <div className="detail-custom-range"><label>开始 <input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label><label>结束 <input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></label></div>}

                      <div className="detail-chart-toolbar">
                        <span>∿ 图表</span>
                        <label>采样算法 <select value={aggregation} onChange={(event) => setAggregation(event.target.value as DetailAggregation)}>{DETAIL_AGGREGATIONS.map((candidate) => <option key={candidate} value={candidate}>{candidate === "avg" ? "平均值" : candidate.toUpperCase()}</option>)}</select></label>
                        <button type="button" className={`detail-toggle${ewma ? " on" : ""}`} onClick={() => setEwma((value) => !value)}><span /> EWMA</button>
                        <button type="button" className="detail-tool-button" onClick={() => { const next = defaultLayout(); setCharts(next.charts); setAggregation(next.aggregation); setEwma(next.ewma); }}>↶ 重置</button>
                        <label className="detail-add-chart">新增图表 <select value="" onChange={(event) => { if (event.target.value) addChart(event.target.value as ChartId); }}><option value="">选择</option>{DEFAULT_CHARTS.filter((candidate) => !charts.some((current) => current.id === candidate.id)).map((candidate) => <option key={candidate.id} value={candidate.id}>{chartTitle(candidate.id)}</option>)}</select></label>
                      </div>

                      <div className="trend-grid detail-chart-grid">
                        {charts.map((chart) => {
                          const allSeries = seriesByMetric.get(chart.metric) ?? [];
                          const selected = allSeries.filter((item) => isSeriesSelected(chart, item.name));
                          const filtered = smoothSeries(selected, ewma);
                          const chartUnit = filtered[0]?.name === "load1" ? "load" : chart.id === "latency" ? "milliseconds" : chart.id === "connections" ? "count" : chart.id === "network" && filtered.some((item) => item.name.endsWith("Total")) ? "bytes" : chart.id === "network" ? "bytes_per_second" : chart.id === "memory" || chart.id === "swap" || chart.id === "disk" ? "bytes" : "percent";
                          return <div key={chart.id} draggable onDragStart={() => setDragging(chart.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragging) moveChart(dragging, chart.id); setDragging(null); }} className={`detail-chart-card chart-size-${chart.size}`}>
                            <div className="detail-chart-card-head"><span className="detail-drag-handle" title="拖拽排序">☰</span><span className="trend-chart-title">{chartTitle(chart.id)}</span><div className="detail-chart-actions"><button type="button" className={chart.size === "s" ? "active" : ""} onClick={() => setCharts((current) => current.map((item) => item.id === chart.id ? { ...item, size: "s" } : item))}>S</button><button type="button" className={chart.size === "m" ? "active" : ""} onClick={() => setCharts((current) => current.map((item) => item.id === chart.id ? { ...item, size: "m" } : item))}>M</button><button type="button" className={chart.size === "l" ? "active" : ""} onClick={() => setCharts((current) => current.map((item) => item.id === chart.id ? { ...item, size: "l" } : item))}>L</button><button type="button" aria-label={`删除${chartTitle(chart.id)}`} onClick={() => setCharts((current) => current.filter((item) => item.id !== chart.id))}>⌫</button></div></div>
                            {allSeries.length > 0 && <div className="detail-series-chips">{allSeries.map((item) => <button key={item.name} type="button" className={`detail-series-chip${isSeriesSelected(chart, item.name) ? " active" : ""}`} onClick={() => toggleSeries(chart.id, item.name, allSeries)}>{seriesLabel(item.name)}<span>{isSeriesSelected(chart, item.name) ? "×" : "+"}</span></button>)}</div>}
                            <TrendChart title="" unit={trendUnit(chartUnit)} series={filtered} legend={{ rx: "Download", tx: "Upload", ram: "RAM", swap: "Swap", tcp: "TCP", udp: "UDP", running: "Running", load1: "Load" }} emptyText={series ? "暂无该范围数据" : "加载中…"} />
                          </div>;
                        })}
                      </div>
                    </>
                  )}
                </main>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function IncidentPanel({ incidents, t }: { incidents: ApiIncidentsResponse["incidents"]; t: (key: string, options?: Record<string, unknown>) => string }) {
  return <section className="public-incident-panel"><div className="public-incident-head"><span>{t("status.detail.recentIncidents")}</span><small>{t("status.detail.recentIncidentsHint")}</small></div><div className="public-incident-list">{incidents.map((incident) => <div className="public-incident-row" key={incident.id}><span className={`incident-dot ${incident.status}`} /><div><b>{incident.summary ?? incident.alertName}</b><span>{new Date(incident.startedAt).toLocaleString()}</span></div><span className={`status-pill ${incident.status === "resolved" ? "online" : "offline"}`}>{t(`status.detail.incident_${incident.status}`)}</span></div>)}</div></section>;
}
