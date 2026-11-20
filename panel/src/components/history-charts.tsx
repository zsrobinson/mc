import { useState } from "react";
import {
  ChartCard,
  ChartRangeSelect,
  type ChartRange,
} from "@zsrobinson/shell/blocks/chart-card";
import { QueryError } from "@zsrobinson/shell/blocks/query-error";
import { historyConfig, historyPoints, useHistory } from "@/lib/history";
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
    const value = values?.at(-1)?.[1];
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
      <div className="flex justify-end">
        <ChartRangeSelect value={range} onChange={setRange} />
      </div>
      {history.error && (
        <QueryError
          title="History could not be loaded"
          error={history.error}
          onRetry={() => history.refetch()}
        />
      )}
      <ChartCard
        title="Players online"
        value={current("players", (n) => `${n} now`)}
        label="Players online over time"
        config={config}
        data={historyPoints(history.data, "players", names)}
        loading={history.isPending}
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
            />
          )}
        </div>
      )}
    </div>
  );
}
