import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function ChartRenderer({ widget, data }) {
  if (!data?.length) {
    return <p className="muted">No data available for this widget yet.</p>;
  }

  const { chart_type, x_field, y_field, color } = widget;
  if (chart_type === "kpi") {
    const values = data.map((d) => Number(d[y_field] || 0));
    const total = values.reduce((a, b) => a + b, 0);
    return <div className="kpi-value">{total.toLocaleString()}</div>;
  }

  if (!x_field || !y_field) {
    return <p className="muted">Set x and y fields in widget settings.</p>;
  }

  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        {chart_type === "line" ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={x_field} />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey={y_field} stroke={color} strokeWidth={2} />
          </LineChart>
        ) : chart_type === "bar" ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={x_field} />
            <YAxis />
            <Tooltip />
            <Bar dataKey={y_field} fill={color} />
          </BarChart>
        ) : chart_type === "scatter" ? (
          <ScatterChart>
            <CartesianGrid />
            <XAxis type="number" dataKey={x_field} />
            <YAxis type="number" dataKey={y_field} />
            <Tooltip />
            <Scatter data={data} fill={color} />
          </ScatterChart>
        ) : (
          <PieChart>
            <Pie data={data} dataKey={y_field} nameKey={x_field} outerRadius={95} fill={color} />
            <Tooltip />
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
