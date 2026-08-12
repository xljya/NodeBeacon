import { useEffect, useMemo, useState } from "react";
import { Card } from "@radix-ui/themes";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import Loading from "@/components/loading";
import { fetchJson } from "@/lib/nodebeacon";

type DetailSeries = {
  metric: "latency";
  key: string;
  unit: "milliseconds";
  labels?: Record<string, string>;
  points: Array<[number, number | null]>;
};

type DetailSeriesResponse = { series: DetailSeries[] };

type MiniPingChartProps = {
  uuid: string;
  width?: string | number;
  height?: string | number;
  hours?: number;
};

const COLORS = ["#5b5bd6", "#0d9488", "#ea580c", "#db2777"];

export default function MiniPingChart({
  uuid,
  width = "100%",
  height = 300,
  hours = 12,
}: MiniPingChartProps) {
  const { t } = useTranslation();
  const [series, setSeries] = useState<DetailSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const range = hours <= 24 ? "1d" : hours <= 24 * 7 ? "7d" : "30d";
    fetchJson<DetailSeriesResponse>(
      `/api/public/nodes/${encodeURIComponent(uuid)}/series?metrics=latency&range=${range}&aggregation=avg`,
      { signal: controller.signal },
    )
      .then((response) => setSeries(response.series.filter((item) => item.metric === "latency")))
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : "Error");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [hours, uuid]);

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
    <Card style={{ width, height }} className="km-mini-ping-chart flex min-h-0 flex-col gap-2 overflow-hidden">
      {loading && <div className="flex min-h-0 flex-1 items-center justify-center"><Loading /></div>}
      {!loading && error && <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">{t("common.none")}</div>}
      {!loading && !error && chartData.length === 0 && <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">{t("common.none")}</div>}
      {!loading && !error && chartData.length > 0 && (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 12, right: 12, bottom: 8, left: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="timestamp" tickFormatter={(value) => new Date(Number(value) * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} minTickGap={28} />
            <YAxis unit=" ms" width={58} />
            <Tooltip labelFormatter={(value) => new Date(Number(value) * 1000).toLocaleString()} formatter={(value) => [`${Number(value).toFixed(1)} ms`]} />
            {series.map((item, index) => (
              <Line key={`${item.key}-${index}`} dataKey={`series${index}`} name={item.labels?.vantage ?? item.labels?.peer ?? item.key} stroke={COLORS[index % COLORS.length]} dot={false} connectNulls={false} isAnimationActive={false} strokeWidth={2} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
