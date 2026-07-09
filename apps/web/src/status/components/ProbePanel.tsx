import { useTranslation } from "react-i18next";
import type { ProbeResult } from "@nodebeacon/shared";

function shortTarget(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function fmtLatency(seconds: number | null): string {
  if (seconds === null) return "—";
  const ms = seconds * 1000;
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(0)} ms`;
}

function fmtRate(rate: number | null): string {
  if (rate === null) return "—";
  return `${(rate * 100).toFixed(rate >= 0.999 ? 0 : 2)}%`;
}

function certDays(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const days = (new Date(expiresAt).getTime() - Date.now()) / 86400000;
  return Number.isFinite(days) ? Math.floor(days) : null;
}

/** Public blackbox probe summary shown under the node list. */
export function ProbePanel({ probes }: { probes: ProbeResult[] }) {
  const { t } = useTranslation();
  if (probes.length === 0) return null;

  return (
    <div className="probe-panel">
      <div className="probe-title">{t("status.probes.title")}</div>
      <div className="probe-table">
        <div className="probe-head">
          <span>{t("status.probes.target")}</span>
          <span>{t("status.probes.status")}</span>
          <span>{t("status.probes.latency")}</span>
          <span className="hide-sm">{t("status.probes.rate")}</span>
          <span className="hide-sm">{t("status.probes.cert")}</span>
        </div>
        {probes.map((probe) => {
          const days = certDays(probe.sslExpiresAt);
          return (
            <div className="probe-row" key={probe.target}>
              <span className="probe-target" title={probe.target}>
                {shortTarget(probe.target)}
              </span>
              <span>
                <span className={`status-pill ${probe.success ? "online" : "offline"}`}>
                  {probe.success ? t("status.card.online") : t("status.card.offline")}
                  {probe.httpStatusCode !== null ? ` · ${probe.httpStatusCode}` : ""}
                </span>
              </span>
              <span className="probe-cell">{fmtLatency(probe.latencySeconds)}</span>
              <span className="probe-cell hide-sm">{fmtRate(probe.successRate24h)}</span>
              <span className="probe-cell hide-sm">
                {days === null ? "—" : t("status.probes.certDays", { days })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
