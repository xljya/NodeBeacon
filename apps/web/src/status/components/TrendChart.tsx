import { useEffect, useMemo, useRef, useState } from "react";
import type { TrendUnit } from "@nodebeacon/shared";
import { fmtRate } from "../../lib/format";

const MIN_CHART_HEIGHT = 220;
const MAX_CHART_HEIGHT = 604;
const PLOT_TOP = 14;
const PLOT_BOTTOM = 32;
const AXIS_WIDTH = 58;
const MIN_CHART_WIDTH = 280;

const SERIES_COLORS: Record<string, string> = {
  cpu: "var(--accent)",
  load1: "var(--warn)",
  ram: "var(--accent)",
  swap: "var(--warn)",
  rx: "var(--ok)",
  tx: "var(--accent)",
  rxTotal: "var(--ok)",
  txTotal: "var(--accent)",
  tcp: "var(--accent)",
  udp: "var(--warn)"
};

const FALLBACK_COLORS = [
  "var(--accent)",
  "var(--ok)",
  "var(--warn)",
  "var(--crit)",
  "#8b5cf6",
  "#06b6d4"
];

export interface ChartTrendSeries {
  name: string;
  label: string;
  unit: TrendUnit;
  points: Array<[number, number | null]>;
}

interface UnitScale {
  unit: TrendUnit;
  maxV: number;
}

interface ChartScale {
  minTs: number;
  maxTs: number;
  units: UnitScale[];
}

export function formatTrendValue(value: number, unit: TrendUnit): string {
  if (unit === "percent") return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
  if (unit === "bytes_per_second") return fmtRate(value);
  if (unit === "bytes") {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let scaled = Math.max(0, value);
    let index = 0;
    while (scaled >= 1024 && index < units.length - 1) {
      scaled /= 1024;
      index += 1;
    }
    return `${scaled.toFixed(scaled >= 10 ? 0 : 2)} ${units[index]}`;
  }
  if (unit === "milliseconds") return `${value.toFixed(value >= 10 ? 0 : 1)} ms`;
  if (unit === "count") return value.toFixed(value >= 10 ? 0 : 1);
  return value.toFixed(2);
}

function formatTick(ts: number, rangeSeconds: number): string {
  const date = new Date(ts * 1000);
  if (rangeSeconds > 25 * 3600) {
    return date.toLocaleString(undefined, {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function maximumForUnit(series: ChartTrendSeries[], unit: TrendUnit): number {
  let maximum = 0;
  for (const item of series) {
    if (item.unit !== unit) continue;
    for (const [, value] of item.points) {
      if (value !== null) maximum = Math.max(maximum, value);
    }
  }
  if (unit === "percent") return Math.min(100, Math.max(5, maximum * 1.15));
  return maximum > 0 ? maximum * 1.15 : 1;
}

function computeScale(series: ChartTrendSeries[]): ChartScale | null {
  let minTs = Infinity;
  let maxTs = -Infinity;
  let hasPoint = false;
  const units: TrendUnit[] = [];

  for (const item of series) {
    if (!units.includes(item.unit)) units.push(item.unit);
    for (const [timestamp, value] of item.points) {
      minTs = Math.min(minTs, timestamp);
      maxTs = Math.max(maxTs, timestamp);
      if (value !== null) hasPoint = true;
    }
  }

  if (!hasPoint || maxTs <= minTs) return null;
  return {
    minTs,
    maxTs,
    units: units.slice(0, 2).map((unit) => ({ unit, maxV: maximumForUnit(series, unit) }))
  };
}

function buildPath(
  points: Array<[number, number | null]>,
  scale: ChartScale,
  unitScale: UnitScale,
  plotLeft: number,
  plotWidth: number,
  plotHeight: number
): { line: string; area: string } {
  const x = (timestamp: number) => plotLeft + ((timestamp - scale.minTs) / (scale.maxTs - scale.minTs)) * plotWidth;
  const y = (value: number) => PLOT_TOP + plotHeight - (Math.max(0, Math.min(value, unitScale.maxV)) / unitScale.maxV) * plotHeight;
  let line = "";
  let area = "";
  let segment: Array<[number, number]> = [];

  const flush = () => {
    const first = segment[0];
    const last = segment[segment.length - 1];
    if (!first || !last) return;
    line += segment.map(([px, py], index) => `${index === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
    area += `M${first[0].toFixed(1)},${(PLOT_TOP + plotHeight).toFixed(1)}`
      + segment.map(([px, py]) => `L${px.toFixed(1)},${py.toFixed(1)}`).join("")
      + `L${last[0].toFixed(1)},${(PLOT_TOP + plotHeight).toFixed(1)}Z`;
    segment = [];
  };

  for (const [timestamp, value] of points) {
    if (value === null) {
      flush();
      continue;
    }
    segment.push([x(timestamp), y(value)]);
  }
  flush();
  return { line, area };
}

function nearestPoint(points: Array<[number, number | null]>, timestamp: number): [number, number | null] | undefined {
  let result: [number, number | null] | undefined;
  let distance = Infinity;
  for (const point of points) {
    const nextDistance = Math.abs(point[0] - timestamp);
    if (nextDistance < distance) {
      distance = nextDistance;
      result = point;
    }
  }
  return result;
}

function latestPoint(points: Array<[number, number | null]>): [number, number | null] | undefined {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];
    if (point?.[1] !== null) return point;
  }
  return points.at(-1);
}

export function trendSeriesColor(name: string, index: number): string {
  const baseName = name.split(":")[0] ?? name;
  return SERIES_COLORS[baseName] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length] ?? "var(--accent)";
}

export interface TrendChartProps {
  title: string;
  series: ChartTrendSeries[];
  emptyText: string;
  latestLabel: string;
  readoutMode?: "footer" | "overlay";
}

export function TrendChart({
  title,
  series,
  emptyText,
  latestLabel,
  readoutMode = "footer"
}: TrendChartProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(640);
  const [hoverTimestamp, setHoverTimestamp] = useState<number | null>(null);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const updateWidth = () => setWidth(Math.max(MIN_CHART_WIDTH, Math.round(element.getBoundingClientRect().width)));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const scale = useMemo(() => computeScale(series), [series]);
  const hasRightAxis = (scale?.units.length ?? 0) > 1;
  const chartHeight = Math.max(
    MIN_CHART_HEIGHT,
    Math.min(MAX_CHART_HEIGHT, Math.round(width * 9 / 16))
  );
  const plotLeft = AXIS_WIDTH;
  const plotRight = hasRightAxis ? AXIS_WIDTH : 14;
  const plotWidth = Math.max(1, width - plotLeft - plotRight);
  const plotHeight = chartHeight - PLOT_TOP - PLOT_BOTTOM;
  const rangeSeconds = scale ? scale.maxTs - scale.minTs : 0;
  const paths = useMemo(() => {
    if (!scale) return [];
    return series.map((item) => {
      const unitScale = scale.units.find((candidate) => candidate.unit === item.unit) ?? scale.units[0];
      return unitScale ? buildPath(item.points, scale, unitScale, plotLeft, plotWidth, plotHeight) : { line: "", area: "" };
    });
  }, [plotLeft, plotWidth, plotHeight, scale, series]);

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!scale) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(plotLeft, Math.min(width - plotRight, event.clientX - rect.left));
    setHoverTimestamp(scale.minTs + ((x - plotLeft) / plotWidth) * rangeSeconds);
  };

  const readoutTimestamp = hoverTimestamp ?? (
    series.reduce<number>((latest, item) => Math.max(latest, latestPoint(item.points)?.[0] ?? 0), 0)
  );
  const cursorX = hoverTimestamp !== null && scale
    ? plotLeft + ((hoverTimestamp - scale.minTs) / rangeSeconds) * plotWidth
    : null;

  return (
    <div className="trend-chart" ref={viewportRef}>
      {!scale ? (
        <div className="trend-chart-empty" style={{ height: chartHeight }}>{emptyText}</div>
      ) : (
        <svg
          className="trend-chart-svg"
          width={width}
          height={chartHeight}
          viewBox={`0 0 ${width} ${chartHeight}`}
          style={{ height: chartHeight }}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHoverTimestamp(null)}
          role="img"
          aria-label={title}
        >
          {scale.units.map((axis, axisIndex) => (
            <g key={axis.unit} className={axisIndex === 0 ? "trend-axis-left" : "trend-axis-right"}>
              {[0.25, 0.5, 0.75, 1].map((fraction) => {
                const y = PLOT_TOP + plotHeight - plotHeight * fraction;
                return (
                  <g key={fraction}>
                    {axisIndex === 0 && (
                      <line className="trend-gridline" x1={plotLeft} x2={width - plotRight} y1={y} y2={y} />
                    )}
                    <text
                      className="trend-tick"
                      x={axisIndex === 0 ? plotLeft - 8 : width - plotRight + 8}
                      y={y + 4}
                      textAnchor={axisIndex === 0 ? "end" : "start"}
                    >
                      {formatTrendValue(axis.maxV * fraction, axis.unit)}
                    </text>
                  </g>
                );
              })}
            </g>
          ))}
          <line
            className="trend-gridline trend-gridline-base"
            x1={plotLeft}
            x2={width - plotRight}
            y1={PLOT_TOP + plotHeight}
            y2={PLOT_TOP + plotHeight}
          />
          {[0, 0.5, 1].map((fraction) => (
            <text
              key={fraction}
              className="trend-tick"
              x={plotLeft + plotWidth * fraction}
              y={chartHeight - 8}
              textAnchor={fraction === 0 ? "start" : fraction === 1 ? "end" : "middle"}
            >
              {formatTick(scale.minTs + rangeSeconds * fraction, rangeSeconds)}
            </text>
          ))}
          {series.map((item, index) => {
            const path = paths[index];
            const unitScale = scale.units.find((candidate) => candidate.unit === item.unit) ?? scale.units[0];
            if (!path || !unitScale) return null;
            const color = trendSeriesColor(item.name, index);
            return (
              <g key={item.name}>
                {series.length === 1 && <path d={path.area} fill={color} opacity={0.1} />}
                <path d={path.line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
          {cursorX !== null && (
            <g>
              <line className="trend-cursor" x1={cursorX} x2={cursorX} y1={PLOT_TOP} y2={PLOT_TOP + plotHeight} />
              {series.map((item, index) => {
                const point = nearestPoint(item.points, hoverTimestamp ?? 0);
                const unitScale = scale.units.find((candidate) => candidate.unit === item.unit) ?? scale.units[0];
                if (!point || point[1] === null || !unitScale) return null;
                const y = PLOT_TOP + plotHeight - (Math.max(0, Math.min(point[1], unitScale.maxV)) / unitScale.maxV) * plotHeight;
                return <circle key={item.name} cx={cursorX} cy={y} r={3.5} fill={trendSeriesColor(item.name, index)} />;
              })}
            </g>
          )}
        </svg>
      )}
      {(readoutMode === "footer" || hoverTimestamp !== null) && (
        <div
          className={`trend-chart-readout${readoutMode === "overlay" ? " trend-chart-readout-overlay" : ""}`}
          aria-live="polite"
        >
        {scale && readoutTimestamp > 0 ? (
          <>
            <span className="trend-readout-time">
              {hoverTimestamp === null ? latestLabel : formatTick(readoutTimestamp, rangeSeconds)}
            </span>
            {series.map((item) => {
              const point = hoverTimestamp === null
                ? latestPoint(item.points)
                : nearestPoint(item.points, readoutTimestamp);
              return (
                <span className="trend-readout-value" key={item.name}>
                  {item.label} {point?.[1] !== null && point?.[1] !== undefined ? formatTrendValue(point[1], item.unit) : "—"}
                </span>
              );
            })}
          </>
        ) : (
          <span>&nbsp;</span>
        )}
        </div>
      )}
    </div>
  );
}
