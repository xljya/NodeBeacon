import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { MetricView, NodeView } from "../nodeView";
import { OsLogo } from "./OsLogo";

function Metric({ label, m, showSub }: { label: string; m: MetricView; showSub?: boolean }) {
  return (
    <div className="metric">
      <div className="metric-head">
        <span className="l">{label}</span>
        <span className="v">{m.text}</span>
      </div>
      <div className="bar">
        <div className={`bar-fill ${m.tone}`} style={{ width: `${Math.min(100, Math.max(0, m.pct))}%` }} />
      </div>
      {showSub && m.sub && <span className="metric-sub">{m.sub}</span>}
    </div>
  );
}

export function NodeCard({ node }: { node: NodeView }) {
  const { t } = useTranslation();

  return (
    <Link
      to={`/nodes/${encodeURIComponent(node.id)}`}
      className="node-card"
    >
      <div className="node-card-head">
        <div className="node-name-wrap">
          <span className="node-flag">{node.flag}</span>
          <span className="node-name">{node.name}</span>
        </div>
        <span className={`status-pill ${node.status}`}>
          {t(`status.card.${node.status}`)}
        </span>
      </div>

      {node.tags.length > 0 && (
        <div className="node-tags">
          {node.tags.map((tag, i) => (
            <span className="node-tag" key={`${tag}-${i}`}>
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="node-kv">
        <span className="node-kv-label">{t("status.card.os")}</span>
        <span className="node-kv-value">
          <span className="node-os-logo">
            <OsLogo slug={node.osSlug} />
          </span>
          {node.osText}
        </span>
      </div>

      <Metric label={t("status.card.cpu")} m={node.cpu} />
      <Metric label={t("status.card.ram")} m={node.ram} showSub />
      <Metric label={t("status.card.disk")} m={node.disk} showSub />

      <div className="node-foot">
        <div className="node-foot-row">
          <span className="l">{t("status.card.traffic")}</span>
          <span className="v">{node.traffic}</span>
        </div>
        <div className="node-foot-row">
          <span className="l">{t("status.card.netSpd")}</span>
          <span className="v">{node.net}</span>
        </div>
        <div className="node-foot-row">
          <span className="l">{t("status.card.uptime")}</span>
          <span className="v">{node.uptime}</span>
        </div>
      </div>
    </Link>
  );
}
