import { ScrollText, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useApi } from "../../lib/useApi";
import { PageError, PageLoading } from "../components/PageState";

interface LogResponse { source: string; entries: Array<{ timestamp: string; labels: Record<string, string>; line: string }>; nextCursor: string | null }

export function LogsPage() {
  const { t } = useTranslation();
  const [source, setSource] = useState("nodebeacon");
  const { data, error, loading, reload } = useApi<LogResponse>(`/api/admin/logs?source=${source}&limit=200`);
  if (loading) return <PageLoading />;
  if (error || !data) return <PageError message={error ?? t("common.loadFailed")} />;
  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("admin.logs.title")}</h2>
        <span className="page-sub">{t("admin.logs.subtitle")}</span>
      </div>
      <section className="section-panel">
        <div className="section-head">
          <div>
            <h3>{t("admin.logs.runtimeTitle")}</h3>
            <p>{t("admin.logs.runtimeText")}</p>
          </div>
          <ScrollText size={20} />
        </div>
          <div className="settings-action-row">
            <select className="selector" value={source} onChange={(event) => setSource(event.target.value)}>
              <option value="nodebeacon">NodeBeacon</option><option value="prometheus">Prometheus</option><option value="alertmanager">Alertmanager</option><option value="blackbox">Blackbox</option><option value="loki">Loki / Alloy</option>
            </select>
            <button className="ghost-btn" onClick={() => void reload()}><RefreshCw size={15} /> {t("admin.actions.refresh")}</button>
          </div>
          <div className="log-stream" role="log">
            {data.entries.length === 0 ? <p className="page-sub">No log entries in the selected source.</p> : data.entries.map((entry, index) => <div className="log-line" key={`${entry.timestamp}-${index}`}><time>{new Date(entry.timestamp).toLocaleTimeString()}</time><code>{entry.line}</code></div>)}
          </div>
      </section>
    </div>
  );
}
