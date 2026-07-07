import { useTranslation } from "react-i18next";

export type DataTone = "live" | "loading" | "fallback" | "stale" | "empty";

const TEXT_KEY: Record<DataTone, string> = {
  live: "status.badge.live",
  loading: "status.badge.loading",
  fallback: "status.badge.fallback",
  stale: "status.badge.stale",
  empty: "status.badge.empty"
};

export function DataStatusBadge({ tone }: { tone: DataTone }) {
  const { t } = useTranslation();
  return <div className={`data-badge ${tone}`}>{t(TEXT_KEY[tone])}</div>;
}
