import { RadioTower } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ApiLatencyResponse } from "@nodebeacon/shared";
import { useApi } from "../../lib/useApi";
import { apiDelete, apiPost } from "../../lib/api";
import { useState } from "react";
import { PageError, PageLoading } from "../components/PageState";

export function LatencyPage() {
  const { t } = useTranslation();
  const { data, error, loading } = useApi<ApiLatencyResponse>("/api/latency");
  const managed = useApi<{ probes: Array<{ id: string; name: string; protocol: string; target: string; enabled: boolean }> }>("/api/admin/probes");
  const [name, setName] = useState(""); const [target, setTarget] = useState(""); const [protocol, setProtocol] = useState("http");
  const probes = data?.probes ?? [];

  if (loading) return <PageLoading />;
  if (error) return <PageError message={error} />;

  return (
    <div className="page page-wide">
      <div className="page-head">
        <h2>{t("admin.latency.title")}</h2>
        <span className="page-sub">{t("admin.latency.subtitle", { count: probes.length })}</span>
      </div>
      <section className="section-panel"><div className="section-head"><div><h3>Managed probes</h3><p>Central Blackbox HTTP/TCP/ICMP tasks; RIPE Atlas remains a separate internet view.</p></div><RadioTower size={20} /></div><div className="settings-action-row"><input className="text-input" placeholder="Display name" value={name} onChange={(event) => setName(event.target.value)} /><select className="selector" value={protocol} onChange={(event) => setProtocol(event.target.value)}><option>http</option><option>tcp</option><option>icmp</option></select><input className="text-input" placeholder="Target" value={target} onChange={(event) => setTarget(event.target.value)} /><button className="primary-btn" onClick={() => void apiPost("/api/admin/probes", { name, protocol, target }).then(() => { setName(""); setTarget(""); void managed.reload(); })}>Add probe</button></div><div className="setting-list">{managed.data?.probes.map((probe) => <div className="setting-card flat" key={probe.id}><div className="setting-text"><h3>{probe.name}</h3><p>{probe.protocol} · {probe.target}</p></div><button className="ghost-btn" onClick={() => void apiDelete(`/api/admin/probes/${probe.id}`).then(() => void managed.reload())}>Delete</button></div>)}</div></section>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("status.probes.target")}</th>
              <th>{t("status.probes.status")}</th>
              <th>{t("status.probes.latency")}</th>
              <th>{t("status.probes.rate")}</th>
              <th>{t("status.probes.cert")}</th>
            </tr>
          </thead>
          <tbody>
            {probes.map((probe) => (
              <tr key={probe.target}>
                <td><b>{probe.target}</b></td>
                <td>
                  <span className={probe.success ? "status-badge status-online" : "status-badge status-offline"}>
                    {probe.success ? t("admin.status.online") : t("admin.status.offline")}
                  </span>
                </td>
                <td className="mono">{probe.latencySeconds === null ? "-" : `${Math.round(probe.latencySeconds * 1000)} ms`}</td>
                <td className="mono">{probe.successRate24h === null ? "-" : `${Math.round(probe.successRate24h * 1000) / 10}%`}</td>
                <td className="mono">{probe.sslExpiresAt ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {probes.length === 0 && (
          <div className="empty-table">
            <RadioTower size={28} aria-hidden="true" />
            <b>{t("admin.latency.emptyTitle")}</b>
            <span>{t("admin.latency.emptyText")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
