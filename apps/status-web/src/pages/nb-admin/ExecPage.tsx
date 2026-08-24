import { useState } from "react";
import { Badge, Button, Callout, Card, Flex, Text, TextField } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { adminPost } from "@/lib/adminGateway";
import { useAdminResource } from "@/lib/useAdminResource";
import type { RemoteRun, RemoteTarget, RemoteTask } from "@/lib/contracts";
import { AdminError, AdminLoading, AdminPage } from "./AdminPage";

type RemoteStatus = {
  enabled: boolean;
  executor?: string;
  canary?: string;
};

export default function ExecPage() {
  const { t } = useTranslation();
  const tasks = useAdminResource<{ tasks: RemoteTask[] }>("/api/admin/remote/tasks");
  const targets = useAdminResource<{ targets: RemoteTarget[] }>("/api/admin/remote/targets");
  const runs = useAdminResource<{ runs: RemoteRun[] }>("/api/admin/remote/runs");
  const status = useAdminResource<RemoteStatus>("/api/admin/remote/status");
  const [taskId, setTaskId] = useState("system-info");
  const [targetId, setTargetId] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [queueing, setQueueing] = useState(false);

  if (tasks.loading || targets.loading || runs.loading || status.loading) return <AdminLoading />;
  if (tasks.error || targets.error || runs.error) {
    return (
      <AdminError
        message={tasks.error ?? targets.error ?? runs.error ?? ""}
        onRetry={() => void Promise.all([tasks.reload(), targets.reload(), runs.reload(), status.reload()])}
      />
    );
  }

  const executorEnabled = status.data?.enabled === true;
  const queue = async () => {
    setQueueing(true);
    try {
      await adminPost("/api/admin/remote/runs", { taskId, targetId, totpCode });
      setTotpCode("");
      await runs.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to queue the allow-listed task");
    } finally {
      setQueueing(false);
    }
  };

  return (
    <AdminPage
      title={t("exec.title")}
      description={t("nb.exec.desc", "Only backend-fixed task IDs can be queued. There is no command box, terminal or RPC2 session.")}
    >
      <Flex direction="column" gap="3">
        <Callout.Root color={executorEnabled ? "green" : "amber"}>
          <Callout.Text>
            {executorEnabled
              ? t("nb.exec.enabled", "Executor is enabled for allow-listed tasks.")
              : t("nb.exec.disabled", "Executor is disabled until a canary rollout. Queueing still records an audit event, but no interactive terminal or free-form shell is available.")}
            {status.data?.canary ? ` · canary ${status.data.canary}` : ""}
          </Callout.Text>
        </Callout.Root>
        <Flex gap="2" wrap="wrap">
          <select className="rt-reset rt-SelectTrigger" value={taskId} onChange={(event) => setTaskId(event.target.value)} aria-label="Task">
            {(tasks.data?.tasks ?? []).map((task) => (
              <option key={task.id} value={task.id}>{task.label} · {task.risk}</option>
            ))}
          </select>
          <select className="rt-reset rt-SelectTrigger" value={targetId} onChange={(event) => setTargetId(event.target.value)} aria-label="Target">
            <option value="">{t("nb.exec.target", "Select target")}</option>
            {(targets.data?.targets ?? []).map((target) => (
              <option key={target.id} value={target.id}>{target.nodeId}{target.enabled ? "" : " · disabled"}</option>
            ))}
          </select>
          <TextField.Root inputMode="numeric" placeholder="TOTP" value={totpCode} onChange={(event) => setTotpCode(event.target.value)} aria-label="TOTP" />
          <Button disabled={!targetId || queueing} onClick={() => void queue()}>
            {t("nb.exec.run", "Queue task")}
          </Button>
        </Flex>
        {(runs.data?.runs ?? []).map((run) => (
          <Card key={run.id}>
            <Flex justify="between" align="start" gap="3" wrap="wrap">
              <Flex direction="column" gap="1">
                <Text weight="bold">{run.taskId}</Text>
                <Text size="2" color="gray">{run.summary || t("nb.empty", "None")}</Text>
              </Flex>
              <Badge>{run.status}</Badge>
            </Flex>
          </Card>
        ))}
        {(runs.data?.runs ?? []).length === 0 ? <Text color="gray">{t("nb.empty", "None")}</Text> : null}
      </Flex>
    </AdminPage>
  );
}
