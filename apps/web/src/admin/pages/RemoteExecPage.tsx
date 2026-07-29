import { Terminal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { apiPost } from "../../lib/api";
import { useApi } from "../../lib/useApi";

export function RemoteExecPage() {
  const { t } = useTranslation();
  const tasks = useApi<{ tasks: Array<{ id: string; label: string; risk: string }> }>("/api/admin/remote/tasks");
  const targets = useApi<{ targets: Array<{ id: string; nodeId: string; hostname: string; enabled: boolean }> }>("/api/admin/remote/targets");
  const runs = useApi<{ runs: Array<{ id: string; taskId: string; status: string; summary: string }> }>("/api/admin/remote/runs");
  const [taskId, setTaskId] = useState("system-info"); const [targetId, setTargetId] = useState(""); const [message, setMessage] = useState("");
  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("admin.remote.title")}</h2>
        <span className="page-sub">{t("admin.remote.subtitle")}</span>
      </div>
      <section className="section-panel">
        <div className="section-head">
          <div>
            <h3>{t("admin.remote.disabledTitle")}</h3>
            <p>{t("admin.remote.disabledText")}</p>
          </div>
          <Terminal size={20} />
        </div>
        <div className="admin-copy-note">{t("admin.remote.boundary")}</div>
        <div className="settings-action-row"><select className="selector" value={taskId} onChange={(event) => setTaskId(event.target.value)}>{tasks.data?.tasks.map((task) => <option key={task.id} value={task.id}>{task.label} · {task.risk}</option>)}</select><select className="selector" value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">Select target</option>{targets.data?.targets.map((target) => <option key={target.id} value={target.id}>{target.nodeId} · {target.hostname}</option>)}</select><button className="primary-btn" disabled={!targetId} onClick={() => void apiPost("/api/admin/remote/runs", { taskId, targetId }).then(() => { setMessage("Run queued"); void runs.reload(); }).catch((error: Error) => setMessage(error.message))}>Run allow-listed task</button></div>
        {message && <p className="page-sub">{message}</p>}
        <div className="setting-list">{runs.data?.runs.map((run) => <div className="setting-card flat" key={run.id}><div className="setting-text"><h3>{run.taskId}</h3><p>{run.summary}</p></div><span className="pill">{run.status}</span></div>)}</div>
      </section>
    </div>
  );
}
