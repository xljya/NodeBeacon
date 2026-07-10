import { RadioTower } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ApiLatencyResponse } from "@nodebeacon/shared";
import { useApi } from "../../lib/useApi";
import { PageError, PageLoading } from "../components/PageState";

export function LatencyPage() {
  const { t } = useTranslation();
  const { data, error, loading } = useApi<ApiLatencyResponse>("/api/latency");
  const probes = data?.probes ?? [];

  if (loading) return <PageLoading />;
  if (error) return <PageError message={error} />;

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
