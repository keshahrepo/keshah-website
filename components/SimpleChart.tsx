"use client";

import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
  height?: number;
}

export function ChartCard({ title, children, height = 240 }: ChartCardProps) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 14,
      padding: "20px 24px",
    }}>
      <h3 style={{
        fontSize: 13,
        fontWeight: 600,
        color: "rgba(255,255,255,0.5)",
        marginBottom: 16,
        letterSpacing: "0.3px",
        textTransform: "uppercase",
      }}>
        {title}
      </h3>
      <div style={{ width: "100%", height }}>
        {children}
      </div>
    </div>
  );
}

const tooltipStyle = {
  contentStyle: {
    background: "rgba(0,0,0,0.9)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 8,
    fontSize: 12,
    color: "#fff",
  },
  itemStyle: { color: "#fff" },
  labelStyle: { color: "rgba(255,255,255,0.5)" },
};

const axisStyle = {
  tick: { fill: "rgba(255,255,255,0.3)", fontSize: 11 },
  axisLine: false as const,
  tickLine: false as const,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ChartRow = Record<string, any>;

interface SimpleLineChartProps {
  data: ChartRow[];
  dataKey: string;
  xKey?: string;
  color?: string;
  height?: number;
}

export function SimpleLineChart({ data, dataKey, xKey = "label", color = "#818cf8", height = 200 }: SimpleLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
        <XAxis dataKey={xKey} {...axisStyle} />
        <YAxis {...axisStyle} />
        <Tooltip {...tooltipStyle} />
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface SimpleBarChartProps {
  data: ChartRow[];
  dataKey: string;
  xKey?: string;
  color?: string;
  height?: number;
}

export function SimpleBarChart({ data, dataKey, xKey = "label", color = "#818cf8", height = 200 }: SimpleBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
        <XAxis dataKey={xKey} {...axisStyle} />
        <YAxis {...axisStyle} />
        <Tooltip {...tooltipStyle} />
        <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const DONUT_COLORS = ["#818cf8", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#38bdf8"];

interface DonutChartProps {
  data: Array<{ name: string; value: number }>;
  height?: number;
}

export function DonutChart({ data, height = 200 }: DonutChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={75}
          paddingAngle={2}
          dataKey="value"
          stroke="none"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip {...tooltipStyle} />
      </PieChart>
    </ResponsiveContainer>
  );
}
