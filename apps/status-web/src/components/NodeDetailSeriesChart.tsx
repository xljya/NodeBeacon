import { useMemo } from "react";
import { Card, Text } from "@radix-ui/themes";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import { formatBytes } from "@/utils/unitHelper";
import type { NodeBeaconDetailSeries } from "@/lib/nodebeacon";

const COLORS = ["#5b5bd6", "#0d9488", "#ea580c", "#db2777", "#2563eb"];

type NodeDetailSeriesChartProps = {
  metric?: string;
  title: string;
  series: NodeBeaconDetailSeries[];
  height?: number;
};

function formatValue(unit: NodeBeaconDetailSeries["unit"], value: number): string {
  if (unit === "percent") return `${value.toFixed(1)}%`;
  if (unit === "bytes") return formatBytes(value);
  if (unit === "bytes_per_second") return `${formatBytes(value)}/s`;
  if (unit === "milliseconds") return `${value.toFixed(1)} ms`;
  return value.toFixed(2);
}

export default function NodeDetailSeriesChart({ metric, title, series, height = 220 }: NodeDetailSeriesChartProps) {
  const { t } = useTranslation();
  const unit = series[0]?.unit ?? "percent";
  const chartData = useMemo(() => {
    const rows = new Map<number, Record<string, number | null>>();
    series.forEach((item, index) => {
      item.points.forEach(([timestamp, value]) => {
        const row = rows.get(timestamp) ?? { timestamp };
        row[`series${index}`] = value;
        rows.set(timestamp, row);
      });
    });
    return [...rows.values()].sort((left, right) => Number(left.timestamp) - Number(right.timestamp));
  }, [series]);

  return (
    <Card className="flex min-h-0 flex-col gap-2 overflow-hidden p-3" style={{ height }} data-chart={metric}>
      <Text size="2" weight="medium">{title}</Text>
      {chartData.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
          {t("common.none")}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={(value) => new Date(Number(value) * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              minTickGap={28}
            />
            <YAxis width={64} tickFormatter={(value) => formatValue(unit, Number(value))} />
            <Tooltip
              labelFormatter={(value) => new Date(Number(value) * 1000).toLocaleString()}
              formatter={(value, name) => {
                const index = Number(String(name).replace("series", ""));
                const label = series[index]?.labels?.vantage ?? series[index]?.labels?.peer ?? series[index]?.key ?? name;
                return [formatValue(unit, Number(value)), label];
              }}
            />
            {series.map((item, index) => (
              <Line
                key={`${item.metric}-${item.key}-${index}`}
                dataKey={`series${index}`}
                name={item.labels?.vantage ?? item.labels?.peer ?? item.key}
                stroke={COLORS[index % COLORS.length]}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
                strokeWidth={2}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
