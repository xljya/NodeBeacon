import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Activity,
  ArrowLeft,
  ChartLine,
  ChevronDown,
  GripHorizontal,
  Plus,
  RotateCcw,
  Server,
  Trash2,
  X
} from "lucide-react";
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
  type TrendUnit
} from "@nodebeacon/shared";
import { apiGet } from "../lib/api";
import { buildNodeView, type MetricView } from "./nodeView";
import { StatusHeader } from "./components/StatusHeader";
import { OsLogo } from "./components/OsLogo";
import { TrendChart, trendSeriesColor, type ChartTrendSeries } from "./components/TrendChart";
import { getStatusSnapshot, loadStatusSnapshot } from "./statusSnapshot";
import "./status.css";

type Theme = "light" | "dark";
type ChartId = "cpu" | "memory" | "disk" | "network" | "latency" | "connections";
type ChartSize = "s" | "m" | "l";
type SeriesState = "loading" | "ready" | "error";

interface ChartConfig {
  id: ChartId;
  metrics: DetailChartMetric[];
  size: ChartSize;
  defaultSeries: string[];
}

interface LegacyChartConfig {
  id?: string;
  metric?: DetailChartMetric;
  size?: ChartSize;
  defaultSeries?: unknown;
}

type LayoutState = {
  charts: ChartConfig[];
  aggregation: DetailAggregation;
  ewma: boolean;
};

const SNAPSHOT_REFRESH_MS = 20_000;
const DETAIL_REFRESH_MS = 5_000;
const LAYOUT_KEY = "nb-node-detail-layout:v2";
const LEGACY_LAYOUT_KEY = "nb-node-detail-layout:v1";

const DETAIL_RANGES: DetailTimeRange[] = ["realtime", "1d", "7d", "30d", "60d", "custom"];

const CHART_CATALOG: ChartConfig[] = [
  { id: "cpu", metrics: ["cpu"], size: "s", defaultSeries: ["cpu", "load1"] },
  { id: "memory", metrics: ["memory", "swap"], size: "s", defaultSeries: ["ram", "swap"] },
  { id: "disk", metrics: ["disk"], size: "s", defaultSeries: ["disk"] },
  { id: "network", metrics: ["network"], size: "l", defaultSeries: ["rx", "tx"] },
  { id: "latency", metrics: ["latency"], size: "l", defaultSeries: ["tcp"] },
  { id: "connections", metrics: ["connections"], size: "s", defaultSeries: ["tcp", "udp"] }
];

const DEFAULT_CHART_IDS: ChartId[] = ["cpu", "memory", "disk", "network", "latency"];

const LEGACY_DEFAULT_CHARTS = [
  { id: "cpu", size: "m", defaultSeries: ["cpu"] },
  { id: "load", size: "s", defaultSeries: ["load1"] },
  { id: "memory", size: "m", defaultSeries: ["ram"] },
  { id: "swap", size: "s", defaultSeries: ["swap"] },
  { id: "disk", size: "m", defaultSeries: ["disk"] },
  { id: "network", size: "l", defaultSeries: ["rx", "tx"] },
  { id: "latency", size: "s", defaultSeries: ["tcp"] },
  { id: "connections", size: "s", defaultSeries: ["tcp", "udp"] }
] as const;

function cloneChart(chart: ChartConfig): ChartConfig {
  return { ...chart, metrics: [...chart.metrics], defaultSeries: [...chart.defaultSeries] };
}

function chartFromCatalog(id: ChartId): ChartConfig | undefined {
  const chart = CHART_CATALOG.find((candidate) => candidate.id === id);
  return chart ? cloneChart(chart) : undefined;
}

function defaultLayout(): LayoutState {
  return {
    charts: DEFAULT_CHART_IDS.map(chartFromCatalog).filter((chart): chart is ChartConfig => Boolean(chart)),
    aggregation: "avg",
    ewma: false
  };
}

function isChartId(value: unknown): value is ChartId {
  return typeof value === "string" && CHART_CATALOG.some((chart) => chart.id === value);
}

function safeSeries(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const series = value.filter((item): item is string => typeof item === "string" && item.length > 0 && item.length < 80);
  return series.length > 0 ? [...new Set(series)] : [...fallback];
}

function safeSize(value: unknown, fallback: ChartSize): ChartSize {
  return value === "s" || value === "m" || value === "l" ? value : fallback;
}

function safeAggregation(value: unknown): DetailAggregation {
  return DETAIL_AGGREGATIONS.includes(value as DetailAggregation) ? value as DetailAggregation : "avg";
}

function parseV2Layout(value: unknown): LayoutState | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<LayoutState>;
  if (!Array.isArray(raw.charts)) return null;
  const seen = new Set<ChartId>();
  const charts: ChartConfig[] = [];
  for (const candidate of raw.charts) {
    if (!candidate || !isChartId(candidate.id) || seen.has(candidate.id)) continue;
    const base = chartFromCatalog(candidate.id);
    if (!base) continue;
    seen.add(candidate.id);
    charts.push({
      ...base,
      size: safeSize(candidate.size, base.size),
      defaultSeries: safeSeries(candidate.defaultSeries, base.defaultSeries)
    });
  }
  return {
    charts,
    aggregation: safeAggregation(raw.aggregation),
    ewma: Boolean(raw.ewma)
  };
}

function isStandardLegacyLayout(charts: LegacyChartConfig[]): boolean {
  return charts.length === LEGACY_DEFAULT_CHARTS.length && charts.every((chart, index) => {
    const expected = LEGACY_DEFAULT_CHARTS[index];
    if (!expected || chart.id !== expected.id || chart.size !== expected.size || !Array.isArray(chart.defaultSeries)) return false;
    return chart.defaultSeries.length === expected.defaultSeries.length
      && chart.defaultSeries.every((series, seriesIndex) => series === expected.defaultSeries[seriesIndex]);
  });
}

function migrateLegacyLayout(value: unknown): LayoutState | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { charts?: LegacyChartConfig[]; aggregation?: unknown; ewma?: unknown };
  if (!Array.isArray(raw.charts)) return null;
  if (isStandardLegacyLayout(raw.charts)) {
    return {
      ...defaultLayout(),
      aggregation: safeAggregation(raw.aggregation),
      ewma: Boolean(raw.ewma)
    };
  }

  const sizeWeight: Record<ChartSize, number> = { s: 1, m: 2, l: 3 };
  const migrated: ChartConfig[] = [];
  for (const legacy of raw.charts) {
    const mappedId = legacy.id === "load" ? "cpu" : legacy.id === "swap" ? "memory" : legacy.id;
    if (!isChartId(mappedId)) continue;
    const base = chartFromCatalog(mappedId);
    if (!base) continue;
    const series = safeSeries(legacy.defaultSeries, base.defaultSeries);
    const size = safeSize(legacy.size, base.size);
    const existing = migrated.find((chart) => chart.id === mappedId);
    if (existing) {
      existing.defaultSeries = [...new Set([...existing.defaultSeries, ...series])];
      if (sizeWeight[size] > sizeWeight[existing.size]) existing.size = size;
    } else {
      migrated.push({ ...base, size, defaultSeries: series });
    }
  }

  return {
    charts: migrated.length > 0 ? migrated : defaultLayout().charts,
    aggregation: safeAggregation(raw.aggregation),
    ewma: Boolean(raw.ewma)
  };
}

function loadLayout(): LayoutState {
  try {
    const stored = localStorage.getItem(LAYOUT_KEY);
    if (stored) {
      const parsed = parseV2Layout(JSON.parse(stored));
      if (parsed) return parsed;
    }
    const legacy = localStorage.getItem(LEGACY_LAYOUT_KEY);
    if (legacy) {
      const migrated = migrateLegacyLayout(JSON.parse(legacy));
      if (migrated) return migrated;
    }
  } catch {
    // A corrupt local preference should never prevent the public page rendering.
  }
  return defaultLayout();
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

function smoothSeries(series: ChartTrendSeries[], enabled: boolean): ChartTrendSeries[] {
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

function Metric({ label, metric }: { label: string; metric: MetricView }) {
  return (
    <div className="metric">
      <div className="metric-head">
        <span className="l">{label}</span>
        <span className="v">{metric.text}</span>
      </div>
      <div className="bar">
        <div className={`bar-fill ${metric.tone}`} style={{ width: `${Math.min(100, Math.max(0, metric.pct))}%` }} />
      </div>
      {metric.sub && <span className="metric-sub">{metric.sub}</span>}
    </div>
  );
}

function chartTitle(id: ChartId, t: (key: string) => string): string {
  return t(`status.detail.chart_${id}`);
}

function seriesLabel(name: string, t: (key: string) => string): string {
  if (name.startsWith("disk:")) return name.slice(5) || "/";
  const key = name.split(":")[0];
  const known = ["cpu", "load1", "ram", "swap", "rx", "tx", "rxTotal", "txTotal", "tcp", "udp", "running"];
  return known.includes(key ?? "") ? t(`status.detail.series_${key}`) : name;
}

function isSeriesSelected(chart: ChartConfig, name: string): boolean {
  return chart.defaultSeries.includes(name)
    || (chart.id === "disk" && chart.defaultSeries.includes("disk") && name.startsWith("disk:"));
}

interface SortableChartCardProps {
  chart: ChartConfig;
  allSeries: ChartTrendSeries[];
  renderedSeries: ChartTrendSeries[];
  emptyText: string;
  latestLabel: string;
  title: string;
  t: (key: string) => string;
  onResize: (size: ChartSize) => void;
  onRemove: () => void;
  onToggleSeries: (name: string) => void;
  onKeyboardMove: (offset: -1 | 1) => void;
}

function SortableChartCard({
  chart,
  allSeries,
  renderedSeries,
  emptyText,
  latestLabel,
  title,
  t,
  onResize,
  onRemove,
  onToggleSeries,
  onKeyboardMove
}: SortableChartCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging
  } = useSortable({ id: chart.id, transition: null });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform) };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`detail-chart-card chart-size-${chart.size}${isDragging ? " is-dragging" : ""}`}
      data-chart-id={chart.id}
    >
      <div className="detail-chart-card-head">
        <button
          type="button"
          className="detail-drag-handle"
          aria-label={t("status.detail.reorderChart")}
          title={t("status.detail.reorderChart")}
          {...attributes}
          {...listeners}
          onKeyDown={(event) => {
            if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowUp")) {
              event.preventDefault();
              onKeyboardMove(-1);
              return;
            }
            if (event.altKey && (event.key === "ArrowRight" || event.key === "ArrowDown")) {
              event.preventDefault();
              onKeyboardMove(1);
              return;
            }
            listeners?.onKeyDown?.(event);
          }}
        >
          <GripHorizontal size={18} aria-hidden="true" />
        </button>
        <span className="detail-chart-heading">
          <ChartLine size={18} strokeWidth={2} aria-hidden="true" />
          <span className="trend-chart-title">{title}</span>
        </span>
        <div className="detail-chart-actions" role="group" aria-label={t("status.detail.chartActions")}>
          {(["s", "m", "l"] as ChartSize[]).map((size) => (
            <button
              key={size}
              type="button"
              className={chart.size === size ? "active" : ""}
              aria-pressed={chart.size === size}
              aria-label={t(`status.detail.chartSize_${size}`)}
              title={t(`status.detail.chartSize_${size}`)}
              onClick={() => onResize(size)}
            >
              {size.toUpperCase()}
            </button>
          ))}
          <button
            type="button"
            className="detail-icon-action detail-remove-chart"
            aria-label={t("status.detail.removeChart")}
            title={t("status.detail.removeChart")}
            onClick={onRemove}
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      {allSeries.length > 0 && (
        <div className="detail-series-chips">
          {allSeries.map((item, index) => {
            const selected = isSeriesSelected(chart, item.name);
            return (
              <button
                key={item.name}
                type="button"
                className={`detail-series-chip${selected ? " active" : ""}`}
                aria-pressed={selected}
                onClick={() => onToggleSeries(item.name)}
              >
                <span
                  className="detail-series-dot"
                  style={selected ? { background: trendSeriesColor(item.name, index) } : undefined}
                  aria-hidden="true"
                />
                <span>{item.label}</span>
                {selected ? <X size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
      <TrendChart title={title} series={renderedSeries} emptyText={emptyText} latestLabel={latestLabel} />
    </article>
  );
}

export function NodeDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const initialLayout = useMemo(loadLayout, []);
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("nb-theme") as Theme) || "light");
  const [status, setStatus] = useState<ApiStatusResponse | null>(getStatusSnapshot());
  const [statusLoading, setStatusLoading] = useState(!getStatusSnapshot());
  const [detail, setDetail] = useState<ApiNodeDetailV2Response | null>(null);
  const [detailError, setDetailError] = useState(false);
  const [series, setSeries] = useState<ApiNodeDetailSeriesResponse | null>(null);
  const [seriesState, setSeriesState] = useState<SeriesState>("loading");
  const [incidents, setIncidents] = useState<ApiIncidentsResponse["incidents"]>([]);
  const [range, setRange] = useState<DetailTimeRange>("realtime");
  const [aggregation, setAggregation] = useState<DetailAggregation>(initialLayout.aggregation);
  const [ewma, setEwma] = useState(initialLayout.ewma);
  const [charts, setCharts] = useState<ChartConfig[]>(initialLayout.charts);
  const [customFrom, setCustomFrom] = useState(() => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().slice(0, 10));
  const mounted = useRef(true);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

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
      // The detail endpoint can still render if the summary snapshot is stale.
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
        if (active) {
          setDetail(response);
          setDetailError(false);
        }
      } catch {
        if (active) setDetailError(true);
      }
    };
    void loadDetail();
    const timer = window.setInterval(() => { if (!document.hidden) void loadDetail(); }, DETAIL_REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
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
    const timer = window.setInterval(() => { if (!document.hidden) void loadIncidents(); }, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [id]);

  const loadSeries = useCallback(async () => {
    if (!id || charts.length === 0) {
      setSeries(null);
      setSeriesState("ready");
      return;
    }
    const metrics = [...new Set(charts.flatMap((chart) => chart.metrics))].join(",");
    const params = new URLSearchParams({ metrics, aggregation });
    if (range === "custom") {
      params.set("range", "custom");
      params.set("from", `${customFrom}T00:00:00.000Z`);
      params.set("to", `${customTo}T23:59:59.999Z`);
    } else {
      params.set("range", range);
    }
    setSeriesState("loading");
    try {
      const response = await apiGet<ApiNodeDetailSeriesResponse>(`/api/public/nodes/${encodeURIComponent(id)}/series?${params.toString()}`);
      if (mounted.current) {
        setSeries(response);
        setSeriesState("ready");
      }
    } catch {
      if (mounted.current) {
        setSeries(null);
        setSeriesState("error");
      }
    }
  }, [aggregation, charts, customFrom, customTo, id, range]);

  useEffect(() => {
    void loadSeries();
    const timer = window.setInterval(() => {
      if (!document.hidden) void loadSeries();
    }, range === "realtime" ? DETAIL_REFRESH_MS : 60_000);
    return () => window.clearInterval(timer);
  }, [loadSeries, range]);

  const node: StatusNode | undefined = useMemo(
    () => status?.nodes.find((candidate) => candidate.id === id),
    [id, status]
  );
  const units = useMemo(
    () => ({ d: t("status.units.d"), h: t("status.units.h"), m: t("status.units.m") }),
    [t]
  );
  const view = useMemo(() => (node ? buildNodeView(node, units) : null), [node, units]);
  const groupedNodes = useMemo(() => (status?.nodes ?? []).reduce<Record<string, StatusNode[]>>((groups, candidate) => {
    (groups[candidate.group] ??= []).push(candidate);
    return groups;
  }, {}), [status]);
  const seriesByMetric = useMemo(() => {
    const map = new Map<DetailChartMetric, ChartTrendSeries[]>();
    for (const item of series?.series ?? []) {
      const list = map.get(item.metric) ?? [];
      const suffix = item.metric === "disk" && item.labels?.mountpoint ? `:${item.labels.mountpoint}` : "";
      const name = `${item.key}${suffix}`;
      list.push({
        name,
        label: seriesLabel(name, t),
        unit: item.unit as TrendUnit,
        points: item.points
      });
      map.set(item.metric, list);
    }
    return map;
  }, [series, t]);

  const toggleSeries = (chartId: ChartId, name: string, available: ChartTrendSeries[]) => {
    setCharts((current) => current.map((chart) => {
      if (chart.id !== chartId) return chart;
      const selected = available.filter((item) => isSeriesSelected(chart, item.name)).map((item) => item.name);
      const next = selected.includes(name) ? selected.filter((item) => item !== name) : [...selected, name];
      return next.length > 0 ? { ...chart, defaultSeries: next } : chart;
    }));
  };

  const addChart = (chartId: ChartId) => {
    const candidate = chartFromCatalog(chartId);
    if (!candidate || charts.some((chart) => chart.id === chartId)) return;
    setCharts((current) => [...current, candidate]);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setCharts((current) => {
      const from = current.findIndex((chart) => chart.id === active.id);
      const to = current.findIndex((chart) => chart.id === over.id);
      return from >= 0 && to >= 0 ? arrayMove(current, from, to) : current;
    });
  };

  const rangeLabel = (candidate: DetailTimeRange) => t(`status.detail.range_${candidate}`);
  const emptyText = seriesState === "error"
    ? t("status.detail.chartError")
    : seriesState === "loading"
      ? t("common.loading")
      : t("status.detail.chartEmpty");

  return (
    <div className="status-page" data-theme={theme}>
      <div className="status-container detail-layout">
        <StatusHeader theme={theme} onToggleTheme={() => setTheme((previous) => (previous === "light" ? "dark" : "light"))} />
        <div className="status-body">
          <Link to="/" className="detail-back">
            <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
            {t("status.detail.back")}
          </Link>

          {statusLoading && !status && !detail ? (
            <div className="status-empty"><div className="status-empty-title">{t("common.loading")}</div></div>
          ) : !detail && !node ? (
            <div className="status-empty">
              <div className="status-empty-title">
                {detailError ? t("status.detail.unavailableTitle") : t("status.detail.notFoundTitle")}
              </div>
              <div className="status-empty-text">{t("status.detail.notFoundText", { id })}</div>
            </div>
          ) : (
            <div className="detail-main-grid">
              <aside className="detail-node-nav" aria-label={t("status.detail.serverList")}>
                <div className="detail-nav-title">
                  <Server size={18} aria-hidden="true" />
                  {t("status.detail.serverList")}
                </div>
                {Object.entries(groupedNodes).map(([group, groupNodes]) => (
                  <div key={group} className="detail-nav-group">
                    <div className="detail-nav-group-title">{group}</div>
                    {groupNodes.map((candidate) => (
                      <Link
                        key={candidate.id}
                        to={`/nodes/${candidate.id}`}
                        className={`detail-nav-item${candidate.id === id ? " active" : ""}`}
                        aria-current={candidate.id === id ? "page" : undefined}
                      >
                        <span>{candidate.name}</span>
                        <span className={`detail-nav-dot ${candidate.online ? "online" : "offline"}`} />
                      </Link>
                    ))}
                  </div>
                ))}
              </aside>

              <main className="detail-main-content">
                <label className="detail-mobile-node-select">
                  <span><Server size={18} aria-hidden="true" />{t("status.detail.server")}</span>
                  <span className="detail-mobile-select-control">
                    <select value={id} onChange={(event) => navigate(`/nodes/${event.target.value}`)}>
                      {Object.entries(groupedNodes).map(([group, groupNodes]) => (
                        <optgroup key={group} label={group}>
                          {groupNodes.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.online ? "●" : "○"} {candidate.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <ChevronDown size={16} aria-hidden="true" />
                  </span>
                </label>

                {view && (
                  <>
                    <section className="detail-overview-card">
                      <div className="detail-head">
                        <div className="detail-head-main">
                          <span className="node-flag">{view.flag}</span>
                          <span className="detail-name">{view.name}</span>
                          <span className={`status-pill ${view.online ? "online" : "offline"}`}>
                            {view.online ? t("status.card.online") : t("status.card.offline")}
                          </span>
                        </div>
                        <div className="detail-head-meta">
                          <span className="detail-meta-item">
                            <span className="node-os-logo"><OsLogo slug={view.osSlug} /></span>
                            {detail?.profile.osName ?? view.osText}
                          </span>
                          <span className="detail-meta-item">{t("status.card.uptime")}: {detail?.live.uptimeSeconds !== null && detail?.live.uptimeSeconds !== undefined ? formatDuration(detail.live.uptimeSeconds) : view.uptime}</span>
                          <span className="detail-meta-item">{t("status.card.load")}: {detail?.live.load1?.toFixed(2) ?? view.load1}</span>
                          <span className="detail-meta-item">{t("status.detail.lastReport")}: {detail?.live.lastReportAt ? new Date(detail.live.lastReportAt).toLocaleString() : view.updatedAt}</span>
                        </div>
                        {view.tags.length > 0 && (
                          <div className="node-tags">
                            {view.tags.map((tag, index) => <span className="node-tag" key={`${tag}-${index}`}>{tag}</span>)}
                          </div>
                        )}
                      </div>

                      {detail && (
                        <div className="detail-profile-card">
                          <div><b>{t("status.detail.profileCpu")}</b><span>{detail.profile.cpuModel ?? t("status.detail.unknown")}{detail.profile.logicalCpuCores ? ` × ${detail.profile.logicalCpuCores}` : ""}</span></div>
                          <div><b>{t("status.detail.profileGpu")}</b><span>{detail.profile.gpuModel ?? t("status.detail.unavailable")}</span></div>
                          <div><b>{t("status.detail.profileArch")}</b><span>{detail.profile.arch ?? "—"}</span></div>
                          <div><b>{t("status.detail.profileVirtualization")}</b><span>{detail.profile.virtualization ?? "—"}</span></div>
                          <div><b>{t("status.detail.profileKernel")}</b><span>{detail.profile.kernelVersion ?? "—"}</span></div>
                          <div><b>{t("status.detail.profileConnections")}</b><span>{detail.live.tcpConnections ?? "—"} / {detail.live.udpConnections ?? "—"}</span></div>
                          <div><b>{t("status.detail.profileNetwork")}</b><span>{formatBytes(detail.live.networkRxBytesPerSecond)}/s ↓ · {formatBytes(detail.live.networkTxBytesPerSecond)}/s ↑</span></div>
                          <div><b>{t("status.detail.profileTraffic")}</b><span>↓ {formatBytes(detail.live.networkRxBytesTotal)} · ↑ {formatBytes(detail.live.networkTxBytesTotal)}</span></div>
                        </div>
                      )}

                      <div className="detail-current">
                        <Metric label={t("status.card.cpu")} metric={view.cpu} />
                        <Metric label={t("status.card.ram")} metric={view.ram} />
                        <Metric label={t("status.card.disk")} metric={view.disk} />
                        <div className="detail-netbox">
                          <div className="detail-netbox-row"><span className="l">{t("status.card.netSpd")}</span><span className="v">{view.net}</span></div>
                          <div className="detail-netbox-row"><span className="l">{t("status.card.traffic")}</span><span className="v">{view.traffic}</span></div>
                        </div>
                      </div>
                    </section>

                    {incidents.length > 0 && <IncidentPanel incidents={incidents} t={t} />}

                    <section className="detail-dashboard" aria-labelledby="detail-trends-title">
                      <div className="detail-trends-head">
                        <span className="detail-trends-title" id="detail-trends-title">
                          <Activity size={20} aria-hidden="true" />
                          {t("status.detail.trendsTitle")}
                        </span>
                        <div className="range-tabs" aria-label={t("status.detail.timeRange")}>
                          {DETAIL_RANGES.map((candidate) => (
                            <button
                              key={candidate}
                              type="button"
                              className={`range-tab${range === candidate ? " active" : ""}`}
                              aria-pressed={range === candidate}
                              onClick={() => setRange(candidate)}
                            >
                              {rangeLabel(candidate)}
                            </button>
                          ))}
                        </div>
                      </div>

                      {range === "custom" && (
                        <div className="detail-custom-range">
                          <label>{t("status.detail.startDate")}<input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label>
                          <label>{t("status.detail.endDate")}<input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></label>
                        </div>
                      )}

                      <div className="detail-chart-toolbar">
                        <span className="detail-toolbar-title"><ChartLine size={18} aria-hidden="true" />{t("status.detail.charts")}</span>
                        <label>{t("status.detail.aggregation")}
                          <select value={aggregation} onChange={(event) => setAggregation(event.target.value as DetailAggregation)}>
                            {DETAIL_AGGREGATIONS.map((candidate) => (
                              <option key={candidate} value={candidate}>{t(`status.detail.aggregation_${candidate}`)}</option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={ewma}
                          className={`detail-toggle${ewma ? " on" : ""}`}
                          onClick={() => setEwma((value) => !value)}
                          title={t("status.detail.ewmaHint")}
                        >
                          <span className="detail-switch-track"><span /></span>
                          EWMA
                        </button>
                        <button
                          type="button"
                          className="detail-tool-button"
                          onClick={() => {
                            const next = defaultLayout();
                            setCharts(next.charts);
                            setAggregation(next.aggregation);
                            setEwma(next.ewma);
                          }}
                        >
                          <RotateCcw size={16} aria-hidden="true" />
                          {t("status.detail.reset")}
                        </button>
                        <label className="detail-add-chart">
                          <Plus size={16} aria-hidden="true" />
                          {t("status.detail.addChart")}
                          <span className="detail-select-wrap">
                            <select
                              value=""
                              aria-label={t("status.detail.addChart")}
                              onChange={(event) => {
                                if (event.target.value) addChart(event.target.value as ChartId);
                              }}
                            >
                              <option value="">{t("status.detail.selectChart")}</option>
                              {CHART_CATALOG.filter((candidate) => !charts.some((current) => current.id === candidate.id)).map((candidate) => (
                                <option key={candidate.id} value={candidate.id}>{chartTitle(candidate.id, t)}</option>
                              ))}
                            </select>
                            <ChevronDown size={14} aria-hidden="true" />
                          </span>
                        </label>
                      </div>

                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={charts.map((chart) => chart.id)} strategy={rectSortingStrategy}>
                          <div className="trend-grid detail-chart-grid">
                            {charts.map((chart) => {
                              const allSeries = chart.metrics.flatMap((metric) => seriesByMetric.get(metric) ?? []);
                              const selected = allSeries.filter((item) => isSeriesSelected(chart, item.name));
                              return (
                                <SortableChartCard
                                  key={chart.id}
                                  chart={chart}
                                  allSeries={allSeries}
                                  renderedSeries={smoothSeries(selected, ewma)}
                                  emptyText={emptyText}
                                  latestLabel={t("status.detail.latest")}
                                  title={chartTitle(chart.id, t)}
                                  t={t}
                                  onResize={(size) => setCharts((current) => current.map((item) => item.id === chart.id ? { ...item, size } : item))}
                                  onRemove={() => setCharts((current) => current.filter((item) => item.id !== chart.id))}
                                  onToggleSeries={(name) => toggleSeries(chart.id, name, allSeries)}
                                  onKeyboardMove={(offset) => setCharts((current) => {
                                    const from = current.findIndex((item) => item.id === chart.id);
                                    const to = Math.max(0, Math.min(current.length - 1, from + offset));
                                    return from >= 0 && from !== to ? arrayMove(current, from, to) : current;
                                  })}
                                />
                              );
                            })}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </section>
                  </>
                )}
              </main>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function IncidentPanel({
  incidents,
  t
}: {
  incidents: ApiIncidentsResponse["incidents"];
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <section className="public-incident-panel">
      <div className="public-incident-head">
        <span>{t("status.detail.recentIncidents")}</span>
        <small>{t("status.detail.recentIncidentsHint")}</small>
      </div>
      <div className="public-incident-list">
        {incidents.map((incident) => (
          <div className="public-incident-row" key={incident.id}>
            <span className={`incident-dot ${incident.status}`} />
            <div>
              <b>{incident.summary ?? incident.alertName}</b>
              <span>{new Date(incident.startedAt).toLocaleString()}</span>
            </div>
            <span className={`status-pill ${incident.status === "resolved" ? "online" : "offline"}`}>
              {t(`status.detail.incident_${incident.status}`)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
