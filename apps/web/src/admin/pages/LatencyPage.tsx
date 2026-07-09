import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ApiLatencyResponse } from "@nodebeacon/shared";
import { useApi } from "../../lib/useApi";

export function LatencyPage() {
  const { t } = useTranslation();
  const { data, error, loading } = useApi<ApiLatencyResponse>("/api/latency");
  const probes = data?.probes ?? [];

  if (loading) return <div className="admin-state">{t("common.loading")}</div>;
  if (error) {
    return (
      <div className="admin-state error">
        <AlertCircle size={16} /> {error}
      </div>
    );
  }

  return (
    <div className="page page-wide">
      <div className="page-head">
        <h2>{t("admin.latency.title")}</h2>
        <span className="page-sub">{t("admin.latency.subtitle", { count: probes.length })}</span>
      </div>
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
                <td>{probe.target}</td>
                <td>{probe.success ? t("admin.status.online") : t("admin.status.offline")}</td>
                <td>{probe.latencySeconds === null ? "-" : `${Math.round(probe.latencySeconds * 1000)} ms`}</td>
                <td>{probe.successRate24h === null ? "-" : `${Math.round(probe.successRate24h * 1000) / 10}%`}</td>
                <td>{probe.sslExpiresAt ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {probes.length === 0 && (
          <div className="empty-table">
            <b>{t("admin.latency.emptyTitle")}</b>
            <span>{t("admin.latency.emptyText")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
