import { useState } from "react";
import { deleteWidget, updateWidget } from "../api";
import ChartRenderer from "./ChartRenderer";

const CHART_TYPES = ["line", "bar", "scatter", "pie", "kpi"];
const PATTERNS = ["solid", "stripe", "dot", "crosshatch"];

export default function WidgetCard({ widget, periodData, columns, onUpdated, isSelected, onToggleSelect }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    title: widget.title,
    chart_type: widget.chart_type,
    x_field: widget.x_field || "",
    y_field: widget.y_field || "",
    color: widget.color,
    pattern: widget.pattern,
  });

  const save = async () => {
    await updateWidget(widget.id, {
      title: form.title,
      chart_type: form.chart_type,
      x_field: form.x_field || null,
      y_field: form.y_field || null,
      color: form.color,
      pattern: form.pattern,
    });
    setEditing(false);
    onUpdated();
  };

  const remove = async () => {
    const ok = window.confirm(`Delete widget \"${widget.title}\"?`);
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteWidget(widget.id);
      onUpdated();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <article className="card widget-card">
      <div className="widget-head">
        <div className="widget-title-row">
          <label className="widget-select">
            <input
              type="checkbox"
              checked={Boolean(isSelected)}
              onChange={() => onToggleSelect?.(widget.id)}
            />
            <span>Select</span>
          </label>
          <h4>{widget.title}</h4>
        </div>
        <div className="widget-actions">
          <button className="ghost" onClick={() => setEditing((v) => !v)}>
            {editing ? "Cancel" : "Customize"}
          </button>
          <button className="danger" onClick={remove} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
      <p className="muted">Pattern: {widget.pattern}</p>

      {editing && (
        <div className="widget-config">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <select
            value={form.chart_type}
            onChange={(e) => setForm({ ...form, chart_type: e.target.value })}
          >
            {CHART_TYPES.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
          <select value={form.x_field} onChange={(e) => setForm({ ...form, x_field: e.target.value })}>
            <option value="">No x field</option>
            {columns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select value={form.y_field} onChange={(e) => setForm({ ...form, y_field: e.target.value })}>
            <option value="">No y field</option>
            {columns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label>
            Color
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
            />
          </label>
          <select value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })}>
            {PATTERNS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button onClick={save}>Save Widget</button>
        </div>
      )}

      <ChartRenderer widget={widget} data={periodData} />
    </article>
  );
}
