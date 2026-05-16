"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface TrendPoint {
  date: string;
  avgRisk: number;
  alertCount: number;
}

interface RiskTrendChartProps {
  initialData?: TrendPoint[];
}

/** Format date for axis label */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * 7-day global risk trend line chart.
 * Uses Recharts for lightweight, accessible charting.
 */
export default function RiskTrendChart({ initialData = [] }: RiskTrendChartProps) {
  const [data, setData] = useState<TrendPoint[]>(initialData);
  const [isLoading, setIsLoading] = useState(initialData.length === 0);

  useEffect(() => {
    if (initialData.length === 0) {
      fetch("/api/v1/risk-scores/trend")
        .then((r) => r.json())
        .then((d) => setData(d.data ?? []))
        .catch(() => {})
        .finally(() => setIsLoading(false));
    }
  }, [initialData.length]);

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: "var(--brand-green)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No trend data yet — check back after the first ingestion run.
        </p>
      </div>
    );
  }

  const maxRisk = Math.max(...data.map((d) => d.avgRisk), 1);

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 11, fill: "var(--text-muted)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, Math.ceil(maxRisk * 1.2)]}
          tick={{ fontSize: 11, fill: "var(--text-muted)" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border-default)",
            borderRadius: "6px",
            fontSize: "12px",
            color: "var(--text-primary)",
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any, name: any) => [
            name === "avgRisk" ? `${value}/100` : value,
            name === "avgRisk" ? "Avg Risk" : "Alerts",
          ]}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          labelFormatter={(label: any) => formatDate(String(label))}
        />
        <Line
          type="monotone"
          dataKey="avgRisk"
          stroke="#1A5C4A"
          strokeWidth={2.5}
          dot={{ fill: "#1A5C4A", r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
