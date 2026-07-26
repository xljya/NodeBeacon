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
  CircleHelp,
  ChartLine,
  ChevronDown,
  Eye,
  EyeOff,
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
  DETAIL_CHART_METRICS,
  type DetailAggregation,
  type DetailChartMetric,
  type DetailTimeRange,
  type StatusNode,
  type TrendUnit
} from "@nodebeacon/shared";
import { apiGet } from "../lib/api";
import { buildNodeView } from "./nodeView";
import { StatusHeader } from "./components/StatusHeader";
import { OsLogo } from "./components/OsLogo";
import {
  TrendChart,
  formatTrendValue,
  trendSeriesColor,
  type ChartTrendSeries
} from "./components/TrendChart";
import { getStatusSnapshot, loadStatusSnapshot } from "./statusSnapshot";
import { LatencySeriesInfo } from "./components/LatencySeriesInfo";
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
  range?: DetailTimeRange;
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
const LAYOUT_KEY = "nb-node-detail-layout:v3";
const V2_LAYOUT_KEY = "nb-node-detail-layout:v2";
const LEGACY_LAYOUT_KEY = "nb-node-detail-layout:v1";

const DETAIL_RANGES: DetailTimeRange[] = ["realtime", "1d", "7d", "30d", "60d", "custom"];

const CHART_CATALOG: ChartConfig[] = [
  { id: "cpu", metrics: ["cpu"], size: "s", defaultSeries: ["cpu", "load1"] },
  { id: "memory", metrics: ["memory", "swap"], size: "s", defaultSeries: ["ram", "swap"] },
  { id: "disk", metrics: ["disk"], size: "s", defaultSeries: ["disk"] },
  { id: "network", metrics: ["network"], size: "l", defaultSeries: ["rx", "tx", "rxTotal", "txTotal"] },
  { id: "latency", metrics: ["latency"], size: "l", defaultSeries: ["ping"] },
  { id: "connections", metrics: ["connections"], size: "s", defaultSeries: ["tcp", "udp"] }
];

const METRIC_UNITS: Record<DetailChartMetric, TrendUnit[]> = {
  cpu: ["percent", "load"],
  memory: ["bytes"],
  swap: ["bytes"],
  disk: ["bytes"],
  network: ["bytes_per_second", "bytes"],
  latency: ["milliseconds"],
  connections: ["count"]
};

const DEFAULT_CHART_IDS: ChartId[] = ["cpu", "memory", "disk", "network", "latency"];

const LATENCY_VANTAGE_ORDER = new Map([
  ["ping", 0],
  ["zhejiang_mobile", 1],
  ["zhejiang_unicom", 2],
  ["zhejiang_telecom", 3]
]);

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
  return [...new Set(series)];
}

function safeMetrics(value: unknown, fallback: DetailChartMetric[]): DetailChartMetric[] {
  if (!Array.isArray(value)) return [...fallback];
  const metrics = value.filter((item): item is DetailChartMetric =>
    DETAIL_CHART_METRICS.includes(item as DetailChartMetric));
  return metrics.length > 0 ? [...new Set(metrics)] : [...fallback];
}

function chartUnitCount(metrics: DetailChartMetric[]): number {
  return new Set(metrics.flatMap((metric) => METRIC_UNITS[metric])).size;
}

function safeSize(value: unknown, fallback: ChartSize): ChartSize {
  return value === "s" || value === "m" || value === "l" ? value : fallback;
}

function safeAggregation(value: unknown): DetailAggregation {
  return DETAIL_AGGREGATIONS.includes(value as DetailAggregation) ? value as DetailAggregation : "avg";
}

function safeRange(value: unknown): DetailTimeRange | undefined {
  return DETAIL_RANGES.includes(value as DetailTimeRange) && value !== "custom"
    ? value as DetailTimeRange
    : undefined;
}

function parseLayout(value: unknown): LayoutState | null {
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
      metrics: safeMetrics(candidate.metrics, base.metrics),
      size: safeSize(candidate.size, base.size),
      defaultSeries: safeSeries(candidate.defaultSeries, base.defaultSeries),
      range: safeRange(candidate.range)
    });
  }
  return {
    charts,
    aggregation: safeAggregation(raw.aggregation),
    ewma: Boolean(raw.ewma)
  };
}

function isStandardV2Layout(layout: LayoutState): boolean {
  const oldDefaults: Array<[ChartId, ChartSize, string[]]> = [
    ["cpu", "s", ["cpu", "load1"]],
    ["memory", "s", ["ram", "swap"]],
    ["disk", "s", ["disk"]],
    ["network", "l", ["rx", "tx"]],
    ["latency", "l", ["tcp"]]
  ];
  return layout.charts.length === oldDefaults.length && layout.charts.every((chart, index) => {
    const expected = oldDefaults[index];
    return expected
      && chart.id === expected[0]
      && chart.size === expected[1]
      && chart.defaultSeries.length === expected[2].length
      && chart.defaultSeries.every((series, seriesIndex) => series === expected[2][seriesIndex]);
  });
}

function migrateV2Layout(value: unknown): LayoutState | null {
  const parsed = parseLayout(value);
  if (!parsed) return null;
  if (isStandardV2Layout(parsed)) {
    return {
      ...defaultLayout(),
      aggregation: parsed.aggregation,
      ewma: parsed.ewma
    };
  }
  return {
    ...parsed,
    charts: parsed.charts.map((chart) => chart.id === "latency"
      ? {
          ...chart,
          defaultSeries: chart.defaultSeries.map((series) => series === "tcp" ? "ping" : series)
        }
      : chart)
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
      const parsed = parseLayout(JSON.parse(stored));
      if (parsed) return parsed;
    }
    const v2 = localStorage.getItem(V2_LAYOUT_KEY);
    if (v2) {
      const migrated = migrateV2Layout(JSON.parse(v2));
      if (migrated) return migrated;
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

function chartTitle(id: ChartId, t: (key: string) => string): string {
  return t(`status.detail.chart_${id}`);
}

function seriesLabel(name: string, t: (key: string) => string): string {
  if (name.startsWith("disk:")) return name.slice(5) || "/";
  if (name.startsWith("ping:")) return name.slice(5) || t("status.detail.series_ping");
  const key = name.split(":")[0];
  const known = ["cpu", "load1", "ram", "swap", "rx", "tx", "rxTotal", "txTotal", "ping", "tcp", "udp", "running"];
  return known.includes(key ?? "") ? t(`status.detail.series_${key}`) : name;
}

function isSeriesSelected(chart: ChartConfig, name: string): boolean {
  return chart.defaultSeries.includes(name)
    || (chart.defaultSeries.includes("disk") && name.startsWith("disk:"))
    || (chart.defaultSeries.includes("ping") && name.startsWith("ping:"));
}

const RANGE_SECONDS: Record<Exclude<DetailTimeRange, "custom">, number> = {
  realtime: 15 * 60,
  "1d": 24 * 60 * 60,
  "7d": 7 * 24 * 60 * 60,
  "30d": 30 * 24 * 60 * 60,
  "60d": 60 * 24 * 60 * 60
};

function availableChartRanges(
  globalRange: DetailTimeRange,
  customFrom: string,
  customTo: string
): Array<Exclude<DetailTimeRange, "custom">> {
  const globalSeconds = globalRange === "custom"
    ? Math.max(0, (Date.parse(`${customTo}T23:59:59.999Z`) - Date.parse(`${customFrom}T00:00:00.000Z`)) / 1000)
    : RANGE_SECONDS[globalRange];
  return (Object.keys(RANGE_SECONDS) as Array<Exclude<DetailTimeRange, "custom">>)
    .filter((candidate) => RANGE_SECONDS[candidate] < globalSeconds);
}

function effectiveChartRange(
  chart: ChartConfig,
  globalRange: DetailTimeRange,
  available: Array<Exclude<DetailTimeRange, "custom">>
): DetailTimeRange {
  return chart.range && available.includes(chart.range as Exclude<DetailTimeRange, "custom">)
    ? chart.range
    : globalRange;
}

function buildSeriesMap(
  response: ApiNodeDetailSeriesResponse | undefined,
  t: (key: string) => string
): Map<DetailChartMetric, ChartTrendSeries[]> {
  const map = new Map<DetailChartMetric, ChartTrendSeries[]>();
  for (const item of response?.series ?? []) {
    const list = map.get(item.metric) ?? [];
    const qualifier = item.metric === "disk"
      ? item.labels?.mountpoint
      : item.metric === "latency"
        ? item.labels?.vantage_name ?? item.labels?.peer ?? item.labels?.vantage
        : undefined;
    const name = qualifier ? `${item.key}:${qualifier}` : item.key;
    list.push({
      name,
      colorKey: item.metric === "latency" ? item.labels?.vantage ?? name : undefined,
      label: seriesLabel(name, t),
      unit: item.unit as TrendUnit,
      labels: item.labels,
      points: item.points
    });
    map.set(item.metric, list);
  }
  map.get("latency")?.sort((left, right) => {
    const leftOrder = LATENCY_VANTAGE_ORDER.get(left.labels?.vantage ?? "") ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = LATENCY_VANTAGE_ORDER.get(right.labels?.vantage ?? "") ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.label.localeCompare(right.label);
  });
  return map;
}

function latestSeriesSummary(series: ChartTrendSeries[]): string {
  return series.map((item) => {
    const point = [...item.points].reverse().find((candidate) => candidate[1] !== null);
    return `${item.label}: ${point?.[1] !== null && point?.[1] !== undefined
      ? formatTrendValue(point[1], item.unit)
      : "—"}`;
  }).join(" · ");
}

interface SortableChartCardProps {
  nodeId: string;
  chart: ChartConfig;
  allSeries: ChartTrendSeries[];
  renderedSeries: ChartTrendSeries[];
  availableRanges: Array<Exclude<DetailTimeRange, "custom">>;
  emptyText: string;
  latestLabel: string;
  title: string;
  t: (key: string, options?: Record<string, unknown>) => string;
  onResize: (size: ChartSize) => void;
  onRangeChange: (range: DetailTimeRange | undefined) => void;
  onRemove: () => void;
  onToggleAllSeries: () => void;
  addableMetricGroups: Array<{ id: ChartId; title: string }>;
  onAddOption: (value: string) => void;
  onRemoveSeries: (name: string) => void;
  onKeyboardMove: (offset: -1 | 1) => void;
}

function SortableChartCard({
  nodeId,
  chart,
  allSeries,
  renderedSeries,
  availableRanges,
  emptyText,
  latestLabel,
  title,
  t,
  onResize,
  onRangeChange,
  onRemove,
  onToggleAllSeries,
  addableMetricGroups,
  onAddOption,
  onRemoveSeries,
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
  const selectedSeries = allSeries.filter((item) => isSeriesSelected(chart, item.name));
  const availableSeries = allSeries.filter((item) => !isSeriesSelected(chart, item.name));
  const hasAddOptions = availableSeries.length > 0 || addableMetricGroups.length > 0;
  const allHidden = allSeries.length > 0 && selectedSeries.length === 0;

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
        <div className="detail-chart-heading-block">
          <span className="detail-chart-heading">
            <ChartLine size={18} strokeWidth={2} aria-hidden="true" />
            <span className="trend-chart-title">{title}</span>
          </span>
          <span className="detail-chart-latest">{latestSeriesSummary(renderedSeries)}</span>
        </div>
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
          {availableRanges.length > 0 && (
            <label className="detail-chart-range">
              <span className="sr-only">{t("status.detail.chartRange")}</span>
              <select
                value={chart.range && availableRanges.includes(chart.range as Exclude<DetailTimeRange, "custom">)
                  ? chart.range
                  : ""}
                aria-label={t("status.detail.chartRange")}
                title={t("status.detail.chartRange")}
                onChange={(event) => onRangeChange(
                  event.target.value
                    ? event.target.value as DetailTimeRange
                    : undefined
                )}
              >
                <option value="">{t("status.detail.rangeGlobal")}</option>
                {availableRanges.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {t(`status.detail.range_${candidate}`)}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} aria-hidden="true" />
            </label>
          )}
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
        <div className="detail-series-row">
          <button
            type="button"
            className="detail-series-visibility"
            aria-label={allHidden ? t("status.detail.showAllSeries") : t("status.detail.hideAllSeries")}
            title={allHidden ? t("status.detail.showAllSeries") : t("status.detail.hideAllSeries")}
            onClick={onToggleAllSeries}
          >
            {allHidden ? <Eye size={18} aria-hidden="true" /> : <EyeOff size={18} aria-hidden="true" />}
          </button>
          <div className="detail-series-chips">
            {selectedSeries.map((item) => {
              const colorIndex = allSeries.findIndex((candidate) => candidate.name === item.name);
              return (
                <span key={item.name} className="detail-series-chip active">
                  <span
                    className="detail-series-dot"
                    style={{ background: trendSeriesColor(item.colorKey ?? item.name, Math.max(0, colorIndex)) }}
                    aria-hidden="true"
                  />
                  <span>{item.label}</span>
                  {item.unit === "milliseconds" && item.labels?.vantage && item.labels.vantage !== "ping" && (
                    <LatencySeriesInfo nodeId={nodeId} series={item} t={t} />
                  )}
                  <button
                    type="button"
                    aria-label={t("status.detail.removeSeries", { series: item.label })}
                    title={t("status.detail.removeSeries", { series: item.label })}
                    onClick={() => onRemoveSeries(item.name)}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </span>
              );
            })}
            <label
              className={`detail-add-series${hasAddOptions ? "" : " is-disabled"}`}
              title={hasAddOptions ? t("status.detail.addSeries") : t("status.detail.noCompatibleSeries")}
            >
                <Plus size={15} aria-hidden="true" />
                <select
                  value=""
                  aria-label={t("status.detail.addSeries")}
                  title={hasAddOptions ? t("status.detail.addSeries") : t("status.detail.noCompatibleSeries")}
                  disabled={!hasAddOptions}
                  onChange={(event) => {
                    if (event.target.value) onAddOption(event.target.value);
                    event.target.value = "";
                  }}
                >
                  <option value="">{t("status.detail.addSeries")}</option>
                  {availableSeries.map((item) => (
                    <option key={item.name} value={`series:${item.name}`}>{item.label}</option>
                  ))}
                  {addableMetricGroups.map((item) => (
                    <option key={item.id} value={`metric:${item.id}`}>
                      {t("status.detail.addMetricGroup", { metric: item.title })}
                    </option>
                  ))}
                </select>
                <ChevronDown size={13} aria-hidden="true" />
              </label>
          </div>
        </div>
      )}
      <TrendChart
        title={title}
        series={renderedSeries}
        emptyText={emptyText}
        latestLabel={latestLabel}
        readoutMode="overlay"
      />
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
  const [seriesByChart, setSeriesByChart] = useState<Record<string, ApiNodeDetailSeriesResponse>>({});
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

  const chartRanges = useMemo(
    () => availableChartRanges(range, customFrom, customTo),
    [customFrom, customTo, range]
  );
  const chartQuerySignature = JSON.stringify(charts.map((chart) => ({
    id: chart.id,
    metrics: chart.metrics,
    range: effectiveChartRange(chart, range, chartRanges)
  })));

  const loadSeries = useCallback(async () => {
    const queryCharts = JSON.parse(chartQuerySignature) as Array<{
      id: ChartId;
      metrics: DetailChartMetric[];
      range: DetailTimeRange;
    }>;
    if (!id || queryCharts.length === 0) {
      setSeriesByChart({});
      setSeriesState("ready");
      return;
    }

    const groups = new Map<string, typeof queryCharts>();
    for (const chart of queryCharts) {
      const key = chart.range;
      const group = groups.get(key) ?? [];
      group.push(chart);
      groups.set(key, group);
    }

    setSeriesState("loading");
    try {
      const results = await Promise.all([...groups.entries()].map(async ([groupRange, groupCharts]) => {
        const metrics = [...new Set(groupCharts.flatMap((chart) => chart.metrics))].join(",");
        const params = new URLSearchParams({ metrics, aggregation });
        if (groupRange === "custom") {
          params.set("range", "custom");
          params.set("from", `${customFrom}T00:00:00.000Z`);
          params.set("to", `${customTo}T23:59:59.999Z`);
        } else {
          params.set("range", groupRange);
        }
        const response = await apiGet<ApiNodeDetailSeriesResponse>(
          `/api/public/nodes/${encodeURIComponent(id)}/series?${params.toString()}`
        );
        return { groupCharts, response };
      }));
      if (mounted.current) {
        const next: Record<string, ApiNodeDetailSeriesResponse> = {};
        for (const { groupCharts, response } of results) {
          for (const chart of groupCharts) next[chart.id] = response;
        }
        setSeriesByChart(next);
        setSeriesState("ready");
      }
    } catch {
      if (mounted.current) {
        setSeriesByChart({});
        setSeriesState("error");
      }
    }
  }, [aggregation, chartQuerySignature, customFrom, customTo, id]);

  useEffect(() => {
    void loadSeries();
    const hasRealtimeChart = (JSON.parse(chartQuerySignature) as Array<{ range: DetailTimeRange }>)
      .some((chart) => chart.range === "realtime");
    const timer = window.setInterval(() => {
      if (!document.hidden) void loadSeries();
    }, hasRealtimeChart ? DETAIL_REFRESH_MS : 60_000);
    return () => window.clearInterval(timer);
  }, [chartQuerySignature, loadSeries]);

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
  const setSelectedSeries = (
    chartId: ChartId,
    updater: (selected: string[], available: ChartTrendSeries[]) => string[],
    available: ChartTrendSeries[]
  ) => {
    setCharts((current) => current.map((chart) => {
      if (chart.id !== chartId) return chart;
      const selected = available.filter((item) => isSeriesSelected(chart, item.name)).map((item) => item.name);
      return { ...chart, defaultSeries: [...new Set(updater(selected, available))] };
    }));
  };

  const setChartRange = (chartId: ChartId, nextRange: DetailTimeRange | undefined) => {
    setCharts((current) => current.map((chart) => chart.id === chartId
      ? { ...chart, range: nextRange }
      : chart));
  };

  const addChart = (chartId: ChartId) => {
    const candidate = chartFromCatalog(chartId);
    if (!candidate || charts.some((chart) => chart.id === chartId)) return;
    setCharts((current) => [...current, candidate]);
  };

  const addMetricGroup = (chartId: ChartId, candidateId: ChartId) => {
    const candidate = chartFromCatalog(candidateId);
    if (!candidate) return;
    setCharts((current) => current.map((chart) => {
      if (chart.id !== chartId) return chart;
      const metrics = [...new Set([...chart.metrics, ...candidate.metrics])];
      if (metrics.length === chart.metrics.length || chartUnitCount(metrics) > 2) return chart;
      return {
        ...chart,
        metrics,
        defaultSeries: [...new Set([...chart.defaultSeries, ...candidate.defaultSeries])]
      };
    }));
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
                        <span className="detail-nav-flag" aria-hidden="true">
                          {buildNodeView(candidate, units).flag}
                        </span>
                        <span className="detail-nav-name">{candidate.name}</span>
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
                    <div className="detail-node-identity">
                      <span className="node-flag" aria-hidden="true">{view.flag}</span>
                      <h1>{view.name}</h1>
                      <span className={`status-pill ${view.online ? "online" : "offline"}`}>
                        {view.online ? t("status.card.online") : t("status.card.offline")}
                      </span>
                      {view.name !== view.id && <span className="detail-node-id">{view.id}</span>}
                    </div>

                    <section className="detail-overview-card">
                      {detail && (
                        <div className="detail-profile-card">
                          <div className="detail-profile-cpu">
                            <b>{t("status.detail.profileCpu")}</b>
                            <span>{detail.profile.cpuModel ?? t("status.detail.unknown")}{detail.profile.logicalCpuCores ? ` × ${detail.profile.logicalCpuCores}` : ""}</span>
                          </div>
                          <div className="detail-profile-arch"><b>{t("status.detail.profileArch")}</b><span>{detail.profile.arch ?? "—"}</span></div>
                          <div className="detail-profile-virt"><b>{t("status.detail.profileVirtualization")}</b><span>{detail.profile.virtualization ?? "—"}</span></div>
                          <div className="detail-profile-gpu"><b>{t("status.detail.profileGpu")}</b><span>{detail.profile.gpuModel ?? t("status.detail.unavailable")}</span></div>
                          <div className="detail-profile-os">
                            <b>{t("status.detail.profileOs")}</b>
                            <span className="detail-profile-value-with-icon">
                              <span className="node-os-logo"><OsLogo slug={view.osSlug} /></span>
                              {detail.profile.osName ?? view.osText}
                            </span>
                            <small>{detail.profile.kernelVersion ?? "—"}</small>
                          </div>
                          <div className="detail-profile-network"><b>{t("status.detail.profileNetwork")}</b><span>↑ {formatBytes(detail.live.networkTxBytesPerSecond)}/s · ↓ {formatBytes(detail.live.networkRxBytesPerSecond)}/s</span></div>
                          <div className="detail-profile-traffic"><b>{t("status.detail.profileTraffic")}</b><span>↑ {formatBytes(detail.live.networkTxBytesTotal)} · ↓ {formatBytes(detail.live.networkRxBytesTotal)}</span></div>
                          <div className="detail-profile-memory"><b>{t("status.card.ram")}</b><span>{formatBytes(detail.live.memoryUsedBytes)} / {formatBytes(detail.live.memoryTotalBytes)}</span></div>
                          <div className="detail-profile-swap"><b>{t("status.detail.chart_swap")}</b><span>{formatBytes(detail.live.swapUsedBytes)} / {formatBytes(detail.live.swapTotalBytes)}</span></div>
                          <div className="detail-profile-disk"><b>{t("status.card.disk")}</b><span>{view.disk.sub ?? view.disk.text}</span></div>
                          <div className="detail-profile-uptime"><b>{t("status.card.uptime")}</b><span>{detail.live.uptimeSeconds !== null ? formatDuration(detail.live.uptimeSeconds) : view.uptime}</span></div>
                          <div className="detail-profile-report"><b>{t("status.detail.lastReport")}</b><span>{detail.live.lastReportAt ? new Date(detail.live.lastReportAt).toLocaleString() : view.updatedAt}</span></div>
                        </div>
                      )}
                    </section>

                    {incidents.length > 0 && <IncidentPanel incidents={incidents} t={t} />}

                    <section className="detail-dashboard" aria-label={t("status.detail.trendsTitle")}>
                      <div className="detail-range-row">
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
                        <div className="detail-toolbar-primary">
                          <span className="detail-toolbar-title"><ChartLine size={18} aria-hidden="true" />{t("status.detail.charts")}</span>
                          <label className="detail-aggregation-control">
                            <span>
                              {t("status.detail.aggregation")}
                              <span
                                className="detail-aggregation-help"
                                aria-label={t("status.detail.aggregationHint")}
                                title={t("status.detail.aggregationHint")}
                                role="img"
                              >
                                <CircleHelp size={15} aria-hidden="true" />
                              </span>
                            </span>
                            <select
                              value={aggregation}
                              onChange={(event) => setAggregation(event.target.value as DetailAggregation)}
                            >
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
                        </div>
                        <div className="detail-toolbar-actions">
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
                            <span className="detail-select-wrap">
                              <select
                                value=""
                                aria-label={t("status.detail.addChart")}
                                onChange={(event) => {
                                  if (event.target.value) addChart(event.target.value as ChartId);
                                }}
                              >
                                <option value="">{t("status.detail.addChart")}</option>
                                {CHART_CATALOG.filter((candidate) => !charts.some((current) => current.id === candidate.id)).map((candidate) => (
                                  <option key={candidate.id} value={candidate.id}>{chartTitle(candidate.id, t)}</option>
                                ))}
                              </select>
                              <ChevronDown size={14} aria-hidden="true" />
                            </span>
                          </label>
                        </div>
                      </div>

                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={charts.map((chart) => chart.id)} strategy={rectSortingStrategy}>
                          <div className="trend-grid detail-chart-grid">
                            {charts.map((chart) => {
                              const seriesByMetric = buildSeriesMap(seriesByChart[chart.id], t);
                              const allSeries = chart.metrics.flatMap((metric) => seriesByMetric.get(metric) ?? []);
                              const selected = allSeries.filter((item) => isSeriesSelected(chart, item.name));
                              const addableMetricGroups = CHART_CATALOG
                                .filter((candidate) => candidate.metrics.some((metric) => !chart.metrics.includes(metric)))
                                .filter((candidate) => chartUnitCount([
                                  ...new Set([...chart.metrics, ...candidate.metrics])
                                ]) <= 2)
                                .map((candidate) => ({
                                  id: candidate.id,
                                  title: chartTitle(candidate.id, t)
                                }));
                              return (
                                <SortableChartCard
                                  key={chart.id}
                                  nodeId={id}
                                  chart={chart}
                                  allSeries={allSeries}
                                  renderedSeries={smoothSeries(selected, ewma)}
                                  availableRanges={chartRanges}
                                  emptyText={emptyText}
                                  latestLabel={t("status.detail.latest")}
                                  title={chartTitle(chart.id, t)}
                                  t={t}
                                  onResize={(size) => setCharts((current) => current.map((item) => item.id === chart.id ? { ...item, size } : item))}
                                  onRangeChange={(nextRange) => setChartRange(chart.id, nextRange)}
                                  onRemove={() => setCharts((current) => current.filter((item) => item.id !== chart.id))}
                                  onToggleAllSeries={() => setSelectedSeries(
                                    chart.id,
                                    (current, available) => current.length > 0
                                      ? []
                                      : available.map((item) => item.name),
                                    allSeries
                                  )}
                                  addableMetricGroups={addableMetricGroups}
                                  onAddOption={(value) => {
                                    if (value.startsWith("series:")) {
                                      const name = value.slice("series:".length);
                                      setSelectedSeries(
                                        chart.id,
                                        (current) => [...current, name],
                                        allSeries
                                      );
                                      return;
                                    }
                                    if (value.startsWith("metric:")) {
                                      addMetricGroup(chart.id, value.slice("metric:".length) as ChartId);
                                    }
                                  }}
                                  onRemoveSeries={(name) => setSelectedSeries(
                                    chart.id,
                                    (current) => current.filter((item) => item !== name),
                                    allSeries
                                  )}
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
