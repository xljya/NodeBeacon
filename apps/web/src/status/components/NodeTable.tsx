import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { MetricView, NodeView } from "../nodeView";
import { OsLogo } from "./OsLogo";

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

export function NodeTable({ nodes }: { nodes: NodeView[] }) {
  const { t } = useTranslation();
  return (
    <div className="node-table">
      <div className="node-table-head">
        <span>{t("status.table.name")}</span>
        <span className="hide-sm">{t("status.table.system")}</span>
        <span>{t("status.table.status")}</span>
        <span>{t("status.table.cpu")}</span>
        <span>{t("status.table.ram")}</span>
        <span>{t("status.table.disk")}</span>
        <span className="hide-sm">{t("status.table.upSpeed")}</span>
        <span className="hide-sm">{t("status.table.downSpeed")}</span>
      </div>
      {nodes.map((node) => (
        <div className="node-row" key={node.id}>
          <span className="tname">
            <span className="node-flag">{node.flag}</span>
            <Link to={`/nodes/${encodeURIComponent(node.id)}`} className="nm node-name-link">
              {node.name}
            </Link>
          </span>
          <span className="hide-sm">
            <span className="node-os-logo" style={{ width: 18, height: 18 }}>
              <OsLogo slug={node.osSlug} />
            </span>
          </span>
          <span>
            <span className={`status-pill ${node.online ? "online" : "offline"}`}>
              {node.online ? t("status.card.online") : t("status.card.offline")}
            </span>
          </span>
          <TMetric m={node.cpu} />
          <TMetric m={node.ram} />
          <TMetric m={node.disk} />
          <span className="tcell up hide-sm">{node.upSpeed}</span>
          <span className="tcell down hide-sm">{node.downSpeed}</span>
        </div>
      ))}
    </div>
  );
}
