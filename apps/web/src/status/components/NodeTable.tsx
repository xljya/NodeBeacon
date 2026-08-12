import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ApiNodeDetailSeriesResponse } from "@nodebeacon/shared";
import { apiGet } from "../../lib/api";
import type { MetricView, NodeView } from "../nodeView";
import { OsLogo } from "./OsLogo";

type SortKey = "name" | "status" | "cpu" | "ram" | "disk" | "up" | "down";

function TMetric({ m }: { m: MetricView }) {
  return (
    <span className="tmetric">
      <span className="tcell">{m.text}</span>
      <span className="bar">
        <span className={`bar-fill ${m.tone}`} style={{ display: "block", width: `${Math.min(100, Math.max(0, m.pct))}%` }} />
      </span>
    </span>
  );
}

function SortButton({ sortKey, active, direction, children, onSort }: {
  sortKey: SortKey;
  active: boolean;
  direction: "asc" | "desc";
  children: string;
  onSort: (key: SortKey) => void;
}) {
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return <button type="button" className={active ? "table-sort active" : "table-sort"} onClick={() => onSort(sortKey)}>{children}<Icon size={13} /></button>;
}

function latencyPath(points: Array<[number, number | null]>): string | null {
  const values = points.filter((point): point is [number, number] => point[1] !== null && Number.isFinite(point[1]));
  if (values.length < 2) return null;
  const times = values.map(([time]) => time);
  const samples = values.map(([, value]) => value);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const minValue = Math.min(...samples);
  const maxValue = Math.max(...samples);
  const timeSpan = Math.max(1, maxTime - minTime);
  const valueSpan = Math.max(1, maxValue - minValue);
  return values.map(([time, value], index) => {
    const x = ((time - minTime) / timeSpan) * 220;
    const y = 54 - ((value - minValue) / valueSpan) * 44;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function MiniLatencyTrend({ nodeId }: { nodeId: string }) {
  const [path, setPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void apiGet<ApiNodeDetailSeriesResponse>(`/api/public/nodes/${encodeURIComponent(nodeId)}/series?metrics=latency&range=1d&aggregation=avg`)
      .then((response) => {
        const series = response.series.find((candidate) => candidate.metric === "latency");
        if (active) setPath(series ? latencyPath(series.points) : null);
      })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [nodeId]);

  return (
    <div className="table-latency-trend" aria-label="24 hour latency trend">
      <span>{loading ? "Loading latency…" : path ? "24h latency" : "Latency unavailable"}</span>
      {path && <svg viewBox="0 0 220 64" role="img" aria-label="Latency trend"><path className="table-trend-line" d={path} /></svg>}
    </div>
  );
}

export function NodeTable({ nodes }: { nodes: NodeView[] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "name", direction: "asc" });
  const sorted = useMemo(() => [...nodes].sort((left, right) => {
    const values = (node: NodeView): string | number => {
      switch (sort.key) {
        case "name": return node.name.toLowerCase();
        case "status": return node.status;
        case "cpu": return node.cpu.pct;
        case "ram": return node.ram.pct;
        case "disk": return node.disk.pct;
        case "up": return node.upSpeedValue;
        case "down": return node.downSpeedValue;
      }
    };
    const a = values(left);
    const b = values(right);
    const result = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
    return sort.direction === "asc" ? result : -result;
  }), [nodes, sort]);
  const onSort = (key: SortKey) => setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));

  return (
    <div className="node-table">
      <div className="node-table-head">
        <SortButton sortKey="name" active={sort.key === "name"} direction={sort.direction} onSort={onSort}>{t("status.table.name")}</SortButton>
        <span className="hide-sm">{t("status.table.system")}</span>
        <SortButton sortKey="status" active={sort.key === "status"} direction={sort.direction} onSort={onSort}>{t("status.table.status")}</SortButton>
        <SortButton sortKey="cpu" active={sort.key === "cpu"} direction={sort.direction} onSort={onSort}>{t("status.table.cpu")}</SortButton>
        <SortButton sortKey="ram" active={sort.key === "ram"} direction={sort.direction} onSort={onSort}>{t("status.table.ram")}</SortButton>
        <SortButton sortKey="disk" active={sort.key === "disk"} direction={sort.direction} onSort={onSort}>{t("status.table.disk")}</SortButton>
        <span className="hide-sm">{t("status.table.upSpeed")}</span>
        <span className="hide-sm">{t("status.table.downSpeed")}</span>
      </div>
      {sorted.map((node) => {
        const open = expanded === node.id;
        return (
          <Fragment key={node.id}>
            <div className={open ? "node-row expanded" : "node-row"}>
              <span className="tname">
                <button className="table-expand" type="button" aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`} onClick={() => setExpanded(open ? null : node.id)}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
                <span className="node-flag">{node.flag}</span>
                <Link to={`/nodes/${encodeURIComponent(node.id)}`} className="nm node-name-link">{node.name}</Link>
              </span>
              <span className="hide-sm"><span className="node-os-logo" style={{ width: 18, height: 18 }}><OsLogo slug={node.osSlug} /></span></span>
              <span><span className={`status-pill ${node.status}`}>{t(`status.card.${node.status}`)}</span></span>
              <TMetric m={node.cpu} />
              <TMetric m={node.ram} />
              <TMetric m={node.disk} />
              <span className="tcell up hide-sm">{node.upSpeed}</span>
              <span className="tcell down hide-sm">{node.downSpeed}</span>
            </div>
            {open && <div className="node-row-detail">
              <div className="table-detail-grid">
                <span><b>{t("status.card.os")}</b>{node.osText}</span>
                <span><b>{t("status.table.upTotal")}</b>{node.upTotal}</span>
                <span><b>{t("status.table.downTotal")}</b>{node.downTotal}</span>
                <span><b>{t("status.card.uptime")}</b>{node.uptime}</span>
                <span><b>{t("status.card.load")}</b>{node.load1}</span>
                <span><b>{t("status.card.updatedAt")}</b>{node.updatedAt}</span>
              </div>
              <MiniLatencyTrend nodeId={node.id} />
              <div className="node-tags table-detail-tags">{node.tags.map((tag) => <span className="node-tag" key={tag}>{tag}</span>)}</div>
            </div>}
          </Fragment>
        );
      })}
    </div>
  );
}
