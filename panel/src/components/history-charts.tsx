import { useState } from "react";
import {
  ChartCard,
  ChartRangeSelect,
  type ChartRange,
} from "@zsrobinson/shell/blocks/chart-card";
import { historyConfig, historyPoints, useHistory } from "@/lib/history";
/**
 * Missing history is normal (no metrics source yet, a new server, a failed
 * fetch): charts say so plainly instead of raising an error.
 */
const EMPTY = "No data yet";

export function HistoryCharts({
  names,
  server,
  playersOnly = false,
}: {
  names: string[];
  server?: string;
  playersOnly?: boolean;
}) {
  const [range, setRange] = useState<ChartRange>("24h");
  const history = useHistory(range, server);
  const config = historyConfig(names);
  const current = (metric: string, format: (n: number) => string) => {
    if (!server) return undefined;
    const values = history.data?.series[metric]?.find(
      (s) => s.metric.server === server,
    )?.values;
    const last = values?.at(-1);
    const end = history.data?.end;
    const step = history.data?.step ?? 0;
    // An old sample (a stopped server) is not a current value.
    if (!last || (end != null && last[0] < end - 2 * step)) return undefined;
    const value = last[1];
    return value != null && Number.isFinite(Number(value))
      ? format(Number(value))
      : undefined;
  };
  const traffic = history.data
    ? historyPoints(
        {
          ...history.data,
          series: {
            requests: (history.data.series.requests ?? []).map((s) => ({
              ...s,
              metric: { server: "requests" },
            })),
          },
        },
        "requests",
        ["requests"],
      )
    : [];
  return (
    <div className="grid min-w-0 gap-4">
      {history.data?.unavailable ? null : (
        <div className="flex justify-end">
          <ChartRangeSelect value={range} onChange={setRange} />
        </div>
      )}
      <ChartCard
        title="Players online"
        value={current("players", (n) => `${n} now`)}
        label="Players online over time"
        config={config}
        data={historyPoints(history.data, "players", names)}
        loading={history.isPending}
        emptyMessage={EMPTY}
      />
      {!playersOnly && (
        <div
          className={`grid min-w-0 gap-4 md:grid-cols-2 ${server ? "lg:grid-cols-3" : ""}`}
        >
          {(
            [
              [
                "mspt",
                "Tick time",
                (n: number) => `${n.toFixed(n < 1 ? 3 : 1)} ms`,
              ],
              [
                "cpu",
                "CPU usage",
                (n: number) => `${n.toFixed(n < 1 ? 2 : n < 10 ? 1 : 0)}%`,
              ],
              [
                "memory",
                "Memory usage",
                (n: number) => `${(n / 1073741824).toFixed(1)} GiB`,
              ],
            ] as const
          ).map(([metric, title, format]) => (
            <ChartCard
              key={metric}
              title={title}
              value={current(metric, format)}
              label={`${title} over time`}
              config={config}
              data={historyPoints(history.data, metric, names)}
              loading={history.isPending}
              emptyMessage={EMPTY}
              format={format}
            />
          ))}
          {!server && (
            <ChartCard
              title="Panel requests"
              label="Panel requests per second over time"
              data={traffic}
              config={{
                requests: { label: "Requests/s", color: "var(--chart-2)" },
              }}
              format={(n) => `${n.toFixed(2)}/s`}
              loading={history.isPending}
              emptyMessage={EMPTY}
            />
          )}
        </div>
      )}
    </div>
  );
}
