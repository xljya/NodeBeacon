import { useState } from "react";
import { Badge, Button, Card, Flex, Text } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { adminPost } from "@/lib/adminGateway";
import { useAdminResource } from "@/lib/useAdminResource";
import type { RemoteRun, RemoteTarget, RemoteTask } from "@/lib/contracts";
import { AdminError, AdminLoading, AdminPage } from "./AdminPage";

export default function ExecPage() {
  const { t } = useTranslation();
  const tasks = useAdminResource<{ tasks: RemoteTask[] }>("/api/admin/remote/tasks");
  const targets = useAdminResource<{ targets: RemoteTarget[] }>("/api/admin/remote/targets");
  const runs = useAdminResource<{ runs: RemoteRun[] }>("/api/admin/remote/runs");
  const [taskId, setTaskId] = useState("system-info");
  const [targetId, setTargetId] = useState("");
  const [totpCode, setTotpCode] = useState("");
  if (tasks.loading || targets.loading || runs.loading) return <AdminLoading />;
  if (tasks.error || targets.error || runs.error) {
    return <AdminError message={tasks.error ?? targets.error ?? runs.error ?? ""} />;
  }

  return (
    <AdminPage
      title={t("exec.title")}
      description={t("nb.exec.desc", "Only backend-fixed task IDs can be queued. There is no command box, terminal or RPC2 session.")}
    >
      <Flex direction="column" gap="3">
        <Flex gap="2" wrap="wrap">
          <select className="rt-reset rt-SelectTrigger" value={taskId} onChange={(event) => setTaskId(event.target.value)}>
            {(tasks.data?.tasks ?? []).map((task) => (
              <option key={task.id} value={task.id}>{task.label} · {task.risk}</option>
            ))}
          </select>
          <select className="rt-reset rt-SelectTrigger" value={targetId} onChange={(event) => setTargetId(event.target.value)}>
            <option value="">{t("nb.exec.target", "Select target")}</option>
            {(targets.data?.targets ?? []).map((target) => (
              <option key={target.id} value={target.id}>{target.nodeId}</option>
            ))}
          </select>
          <input className="rt-TextFieldRoot" inputMode="numeric" placeholder="TOTP" value={totpCode} onChange={(event) => setTotpCode(event.target.value)} aria-label="TOTP" />
          <Button disabled={!targetId} onClick={() => void adminPost("/api/admin/remote/runs", { taskId, targetId, totpCode }).then(() => runs.reload())}>
            {t("nb.exec.run", "Queue task")}
          </Button>
        </Flex>
        {(runs.data?.runs ?? []).map((run) => (
          <Card key={run.id}>
            <Flex justify="between">
              <Text>{run.taskId} · {run.summary}</Text>
              <Badge>{run.status}</Badge>
            </Flex>
          </Card>
        ))}
      </Flex>
    </AdminPage>
  );
}
