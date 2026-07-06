import type { NodeHealthStatus } from "@nodebeacon/shared";

const LABEL: Record<NodeHealthStatus, string> = {
  online: "在线",
  offline: "离线",
  degraded: "降级",
  unknown: "未知"
};

export function StatusBadge({ status }: { status: NodeHealthStatus }) {
  return <span className={`status-badge status-${status}`}>{LABEL[status]}</span>;
}
