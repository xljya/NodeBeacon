import { Flex, Text, Badge } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import type { TrafficUsage } from "@/lib/traffic";

export default function TrafficSummary({ usage }: { usage: TrafficUsage }) {
  const { t } = useTranslation();
  const value = (n: number | null) => n === null ? "—" : `${n.toFixed(2)} ${usage.unit}`;
  const date = (v: string) => `${new Date(v).toISOString().slice(0,16).replace("T"," ")} UTC`;
  return <Flex direction="column" gap="1" data-testid="cycle-traffic" style={{minWidth:0,overflowWrap:"anywhere"}}>
    <Flex justify="between" wrap="wrap" gap="1">
      <Text size="2" color="gray">{t("traffic.cycle")}</Text>
      <Badge color="amber">{t("traffic.estimated")}</Badge>
    </Flex>
    {usage.status === "ok" ? <>
      <Text size="2">↑ {value(usage.tx)} · ↓ {value(usage.rx)}</Text>
      <Text size="1">{t("traffic.used")}: {value(usage.used)} / {value(usage.quota)} · {((usage.used ?? 0)/usage.quota*100).toFixed(1)}%</Text>
      <Text size="1" color="gray">{t("traffic.remaining")}: {value(usage.remaining)}</Text>
    </> : <Text size="2" color="amber">{t(usage.status === "needs_calibration" ? "traffic.recalibrate" : "traffic.unavailable")}</Text>}
    <details style={{fontSize:"var(--font-size-1)"}}>
      <summary style={{cursor:"pointer"}}>{t(usage.resetVerified ? "traffic.reset" : "traffic.expectedReset")}: {date(usage.periodEnd)}</summary>
      <p>{t("traffic.disclaimer")}</p>
      <p>{t("traffic.period")}: {date(usage.periodStart)} – {date(usage.periodEnd)}</p>
      <p>{t("traffic.mode")}: {t(`traffic.${usage.mode}`)}</p>
      <p>{t("traffic.calibrated")}: {date(usage.calibratedAt)}</p>
      <p>{t("traffic.updated")}: {date(usage.updatedAt)}</p>
    </details>
  </Flex>;
}
