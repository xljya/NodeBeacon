import { useMemo, useRef, useState } from "react";
import type { TrendSeries, TrendUnit } from "@nodebeacon/shared";
import { fmtRate } from "../../lib/format";

/** Hand-rolled SVG line/area chart — small enough that a chart lib isn't worth it. */

const W = 640;
const H = 200;
const PAD = { top: 12, right: 12, bottom: 26, left: 52 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

const SERIES_COLORS: Record<string, string> = {
  value: "var(--accent)",
  rx: "var(--ok)",
  tx: "var(--accent)"
};

function fmtValue(value: number, unit: TrendUnit): string {
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

function fmtTick(ts: number, rangeSeconds: number): string {
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

interface Scale {
  minTs: number;
  maxTs: number;
  maxV: number;
}

function computeScale(series: TrendSeries[], unit: TrendUnit): Scale | null {
  let minTs = Infinity;
  let maxTs = -Infinity;
  let maxV = 0;
  let hasPoint = false;
  for (const s of series) {
    for (const [ts, v] of s.points) {
      minTs = Math.min(minTs, ts);
      maxTs = Math.max(maxTs, ts);
      if (v !== null) {
        hasPoint = true;
        maxV = Math.max(maxV, v);
      }
    }
  }
  if (!hasPoint || maxTs <= minTs) return null;
  // Keep tiny percent wiggles from filling the whole chart.
  if (unit === "percent") maxV = Math.min(100, Math.max(5, maxV * 1.15));
  else maxV = maxV > 0 ? maxV * 1.15 : 1;
  return { minTs, maxTs, maxV };
}

function buildPaths(points: Array<[number, number | null]>, scale: Scale): { line: string; area: string } {
  const x = (ts: number) => PAD.left + ((ts - scale.minTs) / (scale.maxTs - scale.minTs)) * PLOT_W;
  const y = (v: number) => PAD.top + PLOT_H - (Math.max(0, Math.min(v, scale.maxV)) / scale.maxV) * PLOT_H;

  let line = "";
  let area = "";
  let segment: Array<[number, number]> = [];

  const flush = () => {
    const first = segment[0];
    const last = segment[segment.length - 1];
    if (!first || !last) return;
    line += segment.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
    area += `M${first[0].toFixed(1)},${(PAD.top + PLOT_H).toFixed(1)}`
      + segment.map(([px, py]) => `L${px.toFixed(1)},${py.toFixed(1)}`).join("")
      + `L${last[0].toFixed(1)},${(PAD.top + PLOT_H).toFixed(1)}Z`;
    segment = [];
  };

  for (const [ts, v] of points) {
    if (v === null) {
      flush();
      continue;
    }
    segment.push([x(ts), y(v)]);
  }
  flush();
  return { line, area };
}

export interface TrendChartProps {
  title: string;
  unit: TrendUnit;
  series: TrendSeries[];
  /** Localized legend labels per series name (only shown for multi-series). */
  legend?: Record<string, string>;
  emptyText: string;
}

export function TrendChart({ title, unit, series, legend, emptyText }: TrendChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const scale = useMemo(() => computeScale(series, unit), [series, unit]);
  const paths = useMemo(
    () => (scale ? series.map((s) => buildPaths(s.points, scale)) : []),
    [series, scale]
  );

  const timeline = series[0]?.points ?? [];
  const rangeSeconds = scale ? scale.maxTs - scale.minTs : 0;

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!scale || !svgRef.current || timeline.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const ts = scale.minTs + Math.max(0, Math.min(1, (ratio * W - PAD.left) / PLOT_W)) * rangeSeconds;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < timeline.length; i += 1) {
      const point = timeline[i];
      if (!point) continue;
      const dist = Math.abs(point[0] - ts);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    setHoverIdx(best);
  };

  const hover = hoverIdx !== null && scale ? timeline[hoverIdx] : undefined;
  const hoverX = hover && scale
    ? PAD.left + ((hover[0] - scale.minTs) / rangeSeconds) * PLOT_W
    : 0;

  const yTicks = scale
    ? [0.25, 0.5, 0.75, 1].map((f) => ({ f, v: scale.maxV * f, y: PAD.top + PLOT_H - PLOT_H * f }))
    : [];

  return (
    <div className="trend-chart">
      <div className="trend-chart-head">
        <span className="trend-chart-title">{title}</span>
        {series.length > 1 && (
          <span className="trend-legend">
            {series.map((s) => (
              <span className="trend-legend-item" key={s.name}>
                <span className="trend-legend-dot" style={{ background: SERIES_COLORS[s.name] ?? "var(--accent)" }} />
                {legend?.[s.name] ?? s.name}
              </span>
            ))}
          </span>
        )}
      </div>
      {!scale ? (
        <div className="trend-chart-empty">{emptyText}</div>
      ) : (
        <svg
          ref={svgRef}
          className="trend-chart-svg"
          viewBox={`0 0 ${W} ${H}`}
          onMouseMove={onMove}
          onMouseLeave={() => setHoverIdx(null)}
          role="img"
          aria-label={title}
        >
          {yTicks.map(({ f, v, y }) => (
            <g key={f}>
              <line className="trend-gridline" x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} />
              <text className="trend-tick" x={PAD.left - 6} y={y + 3} textAnchor="end">
                {fmtValue(v, unit)}
              </text>
            </g>
          ))}
          <line
            className="trend-gridline trend-gridline-base"
            x1={PAD.left}
            x2={W - PAD.right}
            y1={PAD.top + PLOT_H}
            y2={PAD.top + PLOT_H}
          />
          {[0, 0.5, 1].map((f) => (
            <text
              key={f}
              className="trend-tick"
              x={PAD.left + PLOT_W * f}
              y={H - 8}
              textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"}
            >
              {fmtTick(scale.minTs + rangeSeconds * f, rangeSeconds)}
            </text>
          ))}
          {series.map((s, i) => {
            const p = paths[i];
            if (!p) return null;
            const color = SERIES_COLORS[s.name] ?? "var(--accent)";
            return (
              <g key={s.name}>
                {series.length === 1 && <path d={p.area} fill={color} opacity={0.12} />}
                <path d={p.line} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
              </g>
            );
          })}
          {hover && (
            <g>
              <line className="trend-cursor" x1={hoverX} x2={hoverX} y1={PAD.top} y2={PAD.top + PLOT_H} />
              {series.map((s) => {
                const point = s.points[hoverIdx ?? 0];
                if (!point || point[1] === null) return null;
                const cy = PAD.top + PLOT_H - (Math.max(0, Math.min(point[1], scale.maxV)) / scale.maxV) * PLOT_H;
                return (
                  <circle
                    key={s.name}
                    cx={hoverX}
                    cy={cy}
                    r={3}
                    fill={SERIES_COLORS[s.name] ?? "var(--accent)"}
                  />
                );
              })}
            </g>
          )}
        </svg>
      )}
      <div className="trend-chart-readout">
        {hover && scale ? (
          <>
            <span className="trend-readout-time">{fmtTick(hover[0], rangeSeconds)}</span>
            {series.map((s) => {
              const point = s.points[hoverIdx ?? 0];
              return (
                <span className="trend-readout-value" key={s.name}>
                  {series.length > 1 ? `${legend?.[s.name] ?? s.name} ` : ""}
                  {point && point[1] !== null ? fmtValue(point[1], unit) : "—"}
                </span>
              );
            })}
          </>
        ) : (
          <span>&nbsp;</span>
        )}
      </div>
    </div>
  );
}
