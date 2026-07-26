import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Info, LoaderCircle, X } from "lucide-react";
import type { ApiNodeLatencyStatsResponse } from "@nodebeacon/shared";
import { apiGet } from "../../lib/api";
import type { ChartTrendSeries } from "./TrendChart";

interface LatencySeriesInfoProps {
  nodeId: string;
  series: ChartTrendSeries;
  t: (key: string, options?: Record<string, unknown>) => string;
}

function formatMilliseconds(value: number | null): string {
  if (value === null) return "—";
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ms`;
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function formatTimestamp(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

function supportsFineHover(): boolean {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export function LatencySeriesInfo({ nodeId, series, t }: LatencySeriesInfoProps) {
  const vantage = series.labels?.vantage;
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const popoverRef = useRef<HTMLSpanElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const ignoreHoverUntilRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [stats, setStats] = useState<ApiNodeLatencyStatsResponse | null>(null);
  const [mobileLayout, setMobileLayout] = useState(false);

  const loadStats = useCallback(async () => {
    if (!vantage || stats || loading) return;
    setLoading(true);
    setError(false);
    try {
      const response = await apiGet<ApiNodeLatencyStatsResponse>(
        `/api/public/nodes/${encodeURIComponent(nodeId)}/latency-stats?vantage=${encodeURIComponent(vantage)}`
      );
      setStats(response);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [loading, nodeId, stats, vantage]);

  const cancelScheduledClose = useCallback(() => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const openStats = useCallback(() => {
    if (Date.now() < ignoreHoverUntilRef.current) return;
    cancelScheduledClose();
    setOpen(true);
    void loadStats();
  }, [cancelScheduledClose, loadStats]);

  const scheduleClose = useCallback(() => {
    cancelScheduledClose();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 120);
  }, [cancelScheduledClose]);

  const closeStats = useCallback(() => {
    cancelScheduledClose();
    setOpen(false);
  }, [cancelScheduledClose]);

  useEffect(() => {
    cancelScheduledClose();
    setOpen(false);
    setStats(null);
    setError(false);
  }, [cancelScheduledClose, nodeId, vantage]);

  useEffect(() => () => cancelScheduledClose(), [cancelScheduledClose]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 720px)");
    const updateLayout = () => setMobileLayout(media.matches);
    updateLayout();
    media.addEventListener("change", updateLayout);
    return () => media.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnPointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (!vantage || vantage === "ping") return null;
  const source = [
    series.labels?.city,
    series.labels?.provider,
    series.labels?.asn,
    series.labels?.probe_id ? `Probe ${series.labels.probe_id}` : undefined
  ].filter(Boolean).join(" · ");

  const rows = stats ? [
    [t("status.detail.statsPacketLoss"), formatPercent(stats.packetLossPercent)],
    [t("status.detail.statsMinimum"), formatMilliseconds(stats.minimumMs)],
    [t("status.detail.statsMaximum"), formatMilliseconds(stats.maximumMs)],
    [t("status.detail.statsAverage"), formatMilliseconds(stats.averageMs)],
    [t("status.detail.statsLatest"), formatMilliseconds(stats.latestMs)],
    ["P50", formatMilliseconds(stats.p50Ms)],
    ["P99", formatMilliseconds(stats.p99Ms)],
    [t("status.detail.statsStddev"), formatMilliseconds(stats.standardDeviationMs)],
    [t("status.detail.statsJitter"), formatMilliseconds(stats.jitterMs)],
    [t("status.detail.statsSamples"), String(stats.sampleCount)],
    [t("status.detail.statsValidSamples"), String(stats.validSampleCount)],
    [t("status.detail.statsPackets"), `${stats.packetsReceived} / ${stats.packetsSent}`],
    [t("status.detail.statsInterval"), `${stats.intervalSeconds}s`],
    [t("status.detail.statsType"), stats.type]
  ] : [];

  return (
    <span
      className="detail-series-info-wrap"
      ref={rootRef}
      onPointerDownCapture={(event) => {
        if (event.pointerType === "touch") ignoreHoverUntilRef.current = Date.now() + 800;
      }}
    >
      <button
        type="button"
        className="detail-series-info"
        aria-expanded={open}
        aria-label={t("status.detail.openSeriesStats", { series: series.label })}
        title={t("status.detail.seriesSource", { source })}
        onMouseEnter={() => {
          if (supportsFineHover()) openStats();
        }}
        onMouseLeave={() => {
          if (supportsFineHover()) scheduleClose();
        }}
        onClick={(event) => {
          const recentTouch = Date.now() < ignoreHoverUntilRef.current;
          if (!recentTouch && supportsFineHover() && event.detail !== 0) return;
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen) void loadStats();
        }}
      >
        <Info size={16} color="gray" strokeWidth={2} aria-hidden="true" />
      </button>
      {open && (() => {
        const content = (
        <span
          ref={popoverRef}
          className="detail-latency-stats-popover"
          role="dialog"
          aria-label={t("status.detail.seriesStatsTitle", { series: series.label })}
          onMouseEnter={() => {
            if (supportsFineHover()) cancelScheduledClose();
          }}
          onMouseLeave={() => {
            if (supportsFineHover()) scheduleClose();
          }}
        >
          <span className="detail-latency-stats-head">
            <span>
              <strong>{series.label}</strong>
              <small>{t("status.detail.statsWindow24h")}</small>
            </span>
            <button
              type="button"
              aria-label={t("status.detail.closeSeriesStats")}
              onPointerUp={(event) => {
                if (event.pointerType !== "touch") return;
                event.preventDefault();
                event.stopPropagation();
                closeStats();
              }}
              onClick={(event) => {
                event.stopPropagation();
                closeStats();
              }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </span>
          <span className="detail-latency-stats-source">{source}</span>
          {loading && (
            <span className="detail-latency-stats-state">
              <LoaderCircle size={17} aria-hidden="true" />
              {t("status.detail.statsLoading")}
            </span>
          )}
          {error && (
            <span className="detail-latency-stats-state is-error">
              {t("status.detail.statsError")}
              <button type="button" onClick={() => void loadStats()}>{t("status.detail.statsRetry")}</button>
            </span>
          )}
          {stats && (
            <>
              <span className="detail-latency-stats-grid">
                {rows.map(([label, value]) => (
                  <span key={label} className="detail-latency-stats-row">
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </span>
                ))}
              </span>
              <span className="detail-latency-stats-foot">
                <span>{t("status.detail.statsLastResult")}: {formatTimestamp(stats.updatedAt)}</span>
                <a
                  href={`https://atlas.ripe.net/measurements/${stats.source.measurementId}/`}
                  target="_blank"
                  rel="noreferrer"
                >
                  RIPE Atlas <ExternalLink size={12} aria-hidden="true" />
                </a>
              </span>
            </>
          )}
        </span>
        );
        return mobileLayout ? createPortal(content, document.body) : content;
      })()}
    </span>
  );
}
