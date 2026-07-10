import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  TREND_RANGES,
  type ApiIncidentsResponse,
  type ApiNodeRangeResponse,
  type ApiStatusResponse,
  type StatusNode,
  type TrendMetric,
  type TrendRange
} from "@nodebeacon/shared";
import { apiGet } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { buildNodeView, type MetricView } from "./nodeView";
import { StatusHeader } from "./components/StatusHeader";
import { OsLogo } from "./components/OsLogo";
import { TrendChart } from "./components/TrendChart";
import "./status.css";

type Theme = "light" | "dark";

const SNAPSHOT_REFRESH_MS = 20000;
const TREND_REFRESH_MS = 60000;
const CHART_METRICS: TrendMetric[] = ["cpu", "memory", "disk", "network", "load"];

type TrendState = Partial<Record<TrendMetric, ApiNodeRangeResponse | "error">>;

function isTrendRange(value: string | null): value is TrendRange {
  return value !== null && (TREND_RANGES as readonly string[]).includes(value);
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

export function NodeDetailPage() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();

  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("nb-theme") as Theme) || "light");
  useEffect(() => localStorage.setItem("nb-theme", theme), [theme]);

  const [status, setStatus] = useState<ApiStatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [range, setRange] = useState<TrendRange>(() => {
    const stored = localStorage.getItem("nb-trend-range");
    return isTrendRange(stored) ? stored : "1h";
  });
  useEffect(() => localStorage.setItem("nb-trend-range", range), [range]);

  const [trends, setTrends] = useState<TrendState>({});
  const [incidents, setIncidents] = useState<ApiIncidentsResponse["incidents"]>([]);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const res = await apiGet<ApiStatusResponse>("/api/status");
      if (mounted.current) setStatus(res);
    } catch {
      /* keep the previous snapshot */
    } finally {
      if (mounted.current) setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    const timer = window.setInterval(() => {
      if (!document.hidden) void loadStatus();
    }, SNAPSHOT_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadStatus]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    const loadIncidents = async () => {
      try {
        const response = await apiGet<ApiIncidentsResponse>(
          `/api/incidents?nodeId=${encodeURIComponent(id)}&limit=5`
        );
        if (active) setIncidents(response.incidents);
      } catch {
        /* incident history is supplemental; keep the node page available */
      }
    };
    void loadIncidents();
    const timer = window.setInterval(() => {
      if (!document.hidden) void loadIncidents();
    }, TREND_REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [id]);

  const loadTrends = useCallback(async () => {
    if (!id) return;
    await Promise.all(
      CHART_METRICS.map(async (metric) => {
        try {
          const res = await apiGet<ApiNodeRangeResponse>(
            `/api/nodes/${encodeURIComponent(id)}/range?metric=${metric}&range=${range}`
          );
          if (mounted.current) setTrends((prev) => ({ ...prev, [metric]: res }));
        } catch {
          if (mounted.current) setTrends((prev) => ({ ...prev, [metric]: "error" }));
        }
      })
    );
  }, [id, range]);

  useEffect(() => {
    if (!user) return;
    setTrends({});
    void loadTrends();
    const timer = window.setInterval(() => {
      if (!document.hidden) void loadTrends();
    }, TREND_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [user, loadTrends]);

  const node: StatusNode | undefined = useMemo(
    () => status?.nodes.find((candidate) => candidate.id === id),
    [status, id]
  );

  const units = useMemo(
    () => ({ d: t("status.units.d"), h: t("status.units.h"), m: t("status.units.m") }),
    [t]
  );
  const view = useMemo(() => (node ? buildNodeView(node, units) : null), [node, units]);

  const legend = useMemo(
    () => ({ rx: t("status.detail.legendRx"), tx: t("status.detail.legendTx") }),
    [t]
  );
  const metricTitles: Record<TrendMetric, string> = useMemo(
    () => ({
      cpu: t("status.detail.metricCpu"),
      memory: t("status.detail.metricMemory"),
      disk: t("status.detail.metricDisk"),
      network: t("status.detail.metricNetwork"),
      load: t("status.detail.metricLoad")
    }),
    [t]
  );

  return (
    <div className="status-page" data-theme={theme}>
      <div className="status-container">
        <StatusHeader theme={theme} onToggleTheme={() => setTheme((p) => (p === "light" ? "dark" : "light"))} />

        <div className="status-body">
          <Link to="/" className="detail-back">
            ← {t("status.detail.back")}
          </Link>

          {statusLoading && !status ? (
            <div className="status-empty">
              <div className="status-empty-title">{t("common.loading")}</div>
            </div>
          ) : !node || !view ? (
            <div className="status-empty">
              <div className="status-empty-title">{t("status.detail.notFoundTitle")}</div>
              <div className="status-empty-text">{t("status.detail.notFoundText", { id })}</div>
            </div>
          ) : (
            <>
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
                    <span className="node-os-logo">
                      <OsLogo slug={view.osSlug} />
                    </span>
                    {view.osText}
                  </span>
                  <span className="detail-meta-item">
                    {t("status.card.uptime")}: {view.uptime}
                  </span>
                  <span className="detail-meta-item">
                    {t("status.card.load")}: {view.load1}
                  </span>
                  <span className="detail-meta-item">
                    {t("status.card.updatedAt")}: {view.updatedAt}
                  </span>
                </div>
                {view.tags.length > 0 && (
                  <div className="node-tags">
                    {view.tags.map((tag, i) => (
                      <span className="node-tag" key={`${tag}-${i}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="detail-current">
                <Metric label={t("status.card.cpu")} m={view.cpu} />
                <Metric label={t("status.card.ram")} m={view.ram} />
                <Metric label={t("status.card.disk")} m={view.disk} />
                <div className="detail-netbox">
                  <div className="detail-netbox-row">
                    <span className="l">{t("status.card.netSpd")}</span>
                    <span className="v">{view.net}</span>
                  </div>
                  <div className="detail-netbox-row">
                    <span className="l">{t("status.card.traffic")}</span>
                    <span className="v">{view.traffic}</span>
                  </div>
                </div>
              </div>

              {incidents.length > 0 && (
                <section className="public-incident-panel">
                  <div className="public-incident-head">
                    <span>{t("status.detail.recentIncidents")}</span>
                    <small>{t("status.detail.recentIncidentsHint")}</small>
                  </div>
                  <div className="public-incident-list">
                    {incidents.map((incident) => (
                      <div className="public-incident-row" key={incident.id}>
                        <span className={`incident-dot ${incident.status}`}></span>
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
              )}

              <div className="detail-trends-head">
                <span className="detail-trends-title">{t("status.detail.trendsTitle")}</span>
                <div className="range-tabs">
                  {TREND_RANGES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`range-tab${r === range ? " active" : ""}`}
                      onClick={() => setRange(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {!authLoading && !user ? (
                <div className="status-empty">
                  <div className="status-empty-title">{t("status.detail.loginTitle")}</div>
                  <div className="status-empty-text">{t("status.detail.loginText")}</div>
                  <Link to="/login" className="detail-login-cta">
                    {t("status.header.login")}
                  </Link>
                </div>
              ) : (
                <div className="trend-grid">
                  {CHART_METRICS.map((metric) => {
                    const data = trends[metric];
                    return (
                      <TrendChart
                        key={metric}
                        title={metricTitles[metric]}
                        unit={data && data !== "error" ? data.unit : metric === "network" ? "bytes_per_second" : metric === "load" ? "load" : "percent"}
                        series={data && data !== "error" ? data.series : []}
                        legend={legend}
                        emptyText={
                          data === "error"
                            ? t("status.detail.chartError")
                            : data
                              ? t("status.detail.chartEmpty")
                              : t("common.loading")
                        }
                      />
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
