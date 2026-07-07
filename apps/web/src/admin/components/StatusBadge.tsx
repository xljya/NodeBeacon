import { useTranslation } from "react-i18next";
import type { NodeHealthStatus } from "@nodebeacon/shared";

export function StatusBadge({ status }: { status: NodeHealthStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`status-badge status-${status}`}>{t(`admin.status.${status}`)}</span>
  );
}
