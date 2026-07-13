import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ApiLatencyResponse, ApiStatusResponse, ProbeResult, StatusNode } from "@nodebeacon/shared";
import { apiGet } from "../lib/api";
import { fmtBytes, fmtRate } from "../lib/format";
import { buildNodeView } from "./nodeView";
import { StatusHeader } from "./components/StatusHeader";
import { StatBar, type StatKey, type StatVisibility } from "./components/StatBar";
import { NodeControls, type ViewMode } from "./components/NodeControls";
import { NodeCard } from "./components/NodeCard";
import { NodeTable } from "./components/NodeTable";
import { ProbePanel } from "./components/ProbePanel";
import { DataStatusBadge, type DataTone } from "./components/DataStatusBadge";
import "./status.css";

type Theme = "light" | "dark";

const REFRESH_MS = 20000;
const DEFAULT_CFG: StatVisibility = { time: true, online: true, region: true, traffic: true, speed: true };

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}

export function StatusPage() {
  const { t } = useTranslation();

  const [data, setData] = useState<ApiStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [probes, setProbes] = useState<ProbeResult[]>([]);

  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("nb-theme") as Theme) || "light");
  const [view, setView] = useState<ViewMode>(() => (localStorage.getItem("nb-view") as ViewMode) || "grid");
  const [cfg, setCfg] = useState<StatVisibility>(() => readJson("nb-status-cfg", DEFAULT_CFG));
  const [group, setGroup] = useState("All");
  const [query, setQuery] = useState("");

  useEffect(() => localStorage.setItem("nb-theme", theme), [theme]);
  useEffect(() => localStorage.setItem("nb-view", view), [view]);
  useEffect(() => localStorage.setItem("nb-status-cfg", JSON.stringify(cfg)), [cfg]);

  const mounted = useRef(true);
  const load = useCallback(async () => {
    try {
      const res = await apiGet<ApiStatusResponse>("/api/status");
      if (!mounted.current) return;
      setData(res);
      setError(false);
    } catch {
      if (mounted.current) setError(true);
    } finally {
      if (mounted.current) setLoading(false);
    }
    // Probes are additive — a failure just hides the panel.
    try {
      const latency = await apiGet<ApiLatencyResponse>("/api/latency");
      if (mounted.current) setProbes(latency.probes);
    } catch {
      if (mounted.current) setProbes([]);
    }
  }, []);

  // Initial fetch + auto-refresh (paused while the tab is hidden).
  useEffect(() => {
    mounted.current = true;
    void load();
    const id = window.setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mounted.current = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const publicNodes: StatusNode[] = useMemo(
    () => (data?.nodes ?? []).filter((n) => n.public !== false),
    [data]
  );

  const groups = useMemo(() => {
    const seen: string[] = [];
    for (const n of publicNodes) {
      if (n.group && !seen.includes(n.group)) seen.push(n.group);
    }
    return ["All", ...seen];
  }, [publicNodes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return publicNodes.filter((n) => {
      if (group !== "All" && n.group !== group) return false;
      if (!q) return true;
      return `${n.name} ${n.group} ${n.region} ${n.os?.name ?? ""}`.toLowerCase().includes(q);
    });
  }, [publicNodes, group, query]);

  const units = useMemo(
    () => ({ d: t("status.units.d"), h: t("status.units.h"), m: t("status.units.m") }),
    [t]
  );
  const views = useMemo(() => filtered.map((n) => buildNodeView(n, units)), [filtered, units]);

  // Aggregates over the public nodes actually shown.
  const total = publicNodes.length;
  const onlineCount = publicNodes.filter((n) => n.online).length;
  const regions = new Set(publicNodes.map((n) => n.region).filter(Boolean)).size;
  const totalTxRate = publicNodes.reduce((s, n) => s + (Number(n.metrics.networkTxBytesPerSecond) || 0), 0);
  const totalRxRate = publicNodes.reduce((s, n) => s + (Number(n.metrics.networkRxBytesPerSecond) || 0), 0);
  const totalTxBytes = publicNodes.reduce((s, n) => s + (Number(n.metrics.networkTxBytesTotal) || 0), 0);
  const totalRxBytes = publicNodes.reduce((s, n) => s + (Number(n.metrics.networkRxBytesTotal) || 0), 0);

  const tone: DataTone =
    loading && !data
      ? "loading"
      : error && !data
        ? "fallback"
        : data?.cache?.stale
          ? "stale"
          : total === 0
            ? "empty"
            : "live";

  const noMatch = total > 0 && filtered.length === 0;
  const showEmpty = total === 0 || noMatch;
  const lastUpdated = data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : "—";

  return (
    <div className="status-page" data-theme={theme}>
      <div className="status-container">
        <StatusHeader theme={theme} onToggleTheme={() => setTheme((p) => (p === "light" ? "dark" : "light"))} />

        <div className="status-body">
          <StatBar
            onlineText={`${onlineCount} / ${total}`}
            regions={regions}
            trafficUp={fmtBytes(totalTxBytes)}
            trafficDown={fmtBytes(totalRxBytes)}
            speedUp={fmtRate(totalTxRate)}
            speedDown={fmtRate(totalRxRate)}
            cfg={cfg}
            onToggle={(key: StatKey) => setCfg((c) => ({ ...c, [key]: !c[key] }))}
          />

          <NodeControls
            query={query}
            onQuery={setQuery}
            view={view}
            onView={setView}
            groups={groups}
            group={group}
            onGroup={setGroup}
          />

          <div className="status-meta">
            <div className="status-count">{t("status.count", { total, online: onlineCount })}</div>
            {tone !== "live" && <DataStatusBadge tone={tone} />}
          </div>

          {showEmpty ? (
            <div className="status-empty">
              <div className="status-empty-title">
                {noMatch ? t("status.empty.noMatchTitle") : t("status.empty.noConfigTitle")}
              </div>
              <div className="status-empty-text">
                {noMatch ? t("status.empty.noMatchText") : t("status.empty.noConfigText")}
              </div>
            </div>
          ) : view === "grid" ? (
            <div className="node-grid">
              {views.map((n) => (
                <NodeCard key={n.id} node={n} />
              ))}
            </div>
          ) : (
            <NodeTable nodes={views} />
          )}

          <ProbePanel probes={probes} />

          <div className="status-footer">
            {t("status.lastUpdated", { time: lastUpdated })} &middot; {t("status.footer")}
          </div>
        </div>
      </div>
    </div>
  );
}
