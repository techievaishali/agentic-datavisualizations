import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Cell,
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

/** Compute linear regression slope and intercept from chart data. */
function computeTrend(data, xField, yField) {
  const points = data
    .map((d, i) => ({ x: Number(d[xField] ?? i), y: Number(d[yField] ?? 0) }))
    .filter((p) => !isNaN(p.x) && !isNaN(p.y));
  if (points.length < 2) return null;
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

/** Append a _trend key to each data row using linear regression on the index. */
function augmentWithTrend(data, yField) {
  const points = data.map((d, i) => ({ x: i, y: Number(d[yField] ?? 0) })).filter((p) => !isNaN(p.y));
  if (points.length < 2) return data;
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return data;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return data.map((d, i) => ({ ...d, _trend: parseFloat((slope * i + intercept).toFixed(4)) }));
}

function extractRowFromEvent(event) {
  if (!event) return null;
  if (event?.payload && typeof event.payload === "object") return event.payload;
  if (event?.activePayload?.[0]?.payload) return event.activePayload[0].payload;
  if (event?.data && typeof event.data === "object") return event.data;
  return null;
}

function extractClickMeta(event) {
  if (!event) return {};
  return {
    clientX: event?.clientX ?? event?.nativeEvent?.clientX ?? null,
    clientY: event?.clientY ?? event?.nativeEvent?.clientY ?? null,
  };
}

export default function ChartRenderer({ widget, data, onDataPointClick }) {
  if (!data?.length) {
    return <p className="muted">No data available for this widget yet.</p>;
  }

  const { chart_type, x_field, y_field, color, config = {} } = widget;
  const showTrend = Boolean(config.show_trend_line);
  if (chart_type === "kpi") {
    const values = data.map((d) => Number(d[y_field] || 0));
    const total = values.reduce((a, b) => a + b, 0);
    return <div className="kpi-value">{total.toLocaleString()}</div>;
  }

  if (!x_field || !y_field) {
    return <p className="muted">Set x and y fields in widget settings.</p>;
  }

  const handlePointClick = (event) => {
    const row = extractRowFromEvent(event);
    if (row) {
      onDataPointClick?.(row, extractClickMeta(event));
    }
  };

  const renderClickableDot = (dotProps) => {
    const { cx, cy, payload } = dotProps;
    if (typeof cx !== "number" || typeof cy !== "number") return null;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill={color}
        stroke="#ffffff"
        strokeWidth={2}
        style={{ cursor: "pointer" }}
        onClick={(event) => onDataPointClick?.(payload, extractClickMeta(event))}
      />
    );
  };

  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        {chart_type === "line" ? (
          <LineChart data={showTrend ? augmentWithTrend(data, y_field) : data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={x_field} />
            <YAxis />
            <Tooltip />
            <Line
              type="monotone"
              dataKey={y_field}
              stroke={color}
              strokeWidth={2}
              dot={renderClickableDot}
              activeDot={{ r: 6, onClick: handlePointClick, style: { cursor: "pointer" } }}
            />
            {showTrend && (
              <Line
                type="linear"
                dataKey="_trend"
                stroke="#ff7300"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
                name="Trend"
              />
            )}
          </LineChart>
        ) : chart_type === "bar" ? (
          <ComposedChart data={showTrend ? augmentWithTrend(data, y_field) : data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={x_field} />
            <YAxis />
            <Tooltip />
            <Bar dataKey={y_field} fill={color} isAnimationActive={false}>
              {(showTrend ? augmentWithTrend(data, y_field) : data).map((entry, index) => (
                <Cell
                  key={`bar-cell-${index}`}
                  fill={color}
                  style={{ cursor: "pointer" }}
                  onClick={(event) => onDataPointClick?.(entry, extractClickMeta(event))}
                />
              ))}
            </Bar>
            {showTrend && (
              <Line
                type="linear"
                dataKey="_trend"
                stroke="#ff7300"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
                name="Trend"
              />
            )}
          </ComposedChart>
        ) : chart_type === "scatter" ? (
          <ScatterChart>
            <CartesianGrid />
            <XAxis type="number" dataKey={x_field} name={x_field} />
            <YAxis type="number" dataKey={y_field} name={y_field} />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} />
            <Scatter
              data={data}
              fill={color}
              shape={(props) => {
                const { cx, cy, payload } = props;
                if (typeof cx !== "number" || typeof cy !== "number") return null;
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={5}
                    fill={color}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                    style={{ cursor: "pointer" }}
                    onClick={(event) => onDataPointClick?.(payload, extractClickMeta(event))}
                  />
                );
              }}
              onClick={handlePointClick}
            />
            {showTrend && (() => {
              const xs = data.map((d) => Number(d[x_field])).filter((v) => !isNaN(v));
              const params = computeTrend(data, x_field, y_field);
              if (!params || xs.length < 2) return null;
              const minX = Math.min(...xs);
              const maxX = Math.max(...xs);
              const trendLine = [
                { [x_field]: minX, [y_field]: params.slope * minX + params.intercept },
                { [x_field]: maxX, [y_field]: params.slope * maxX + params.intercept },
              ];
              return (
                <Scatter
                  data={trendLine}
                  fill="#ff7300"
                  line={{ stroke: "#ff7300", strokeWidth: 2, strokeDasharray: "6 3" }}
                  shape={() => null}
                  name="Trend"
                />
              );
            })()}
          </ScatterChart>
        ) : (
          <PieChart>
            <Pie
              data={data}
              dataKey={y_field}
              nameKey={x_field}
              outerRadius={95}
              fill={color}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`pie-cell-${index}`}
                  fill={color}
                  style={{ cursor: "pointer" }}
                  onClick={(event) => onDataPointClick?.(entry, extractClickMeta(event))}
                />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
