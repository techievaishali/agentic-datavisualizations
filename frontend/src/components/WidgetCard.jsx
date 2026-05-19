import { useState } from "react";
import { deleteWidget, getWidgetSummary, updateWidget } from "../api";
import ChartRenderer from "./ChartRenderer";

const CHART_TYPES = ["line", "bar", "scatter", "pie", "kpi"];
const PATTERNS = ["solid", "stripe", "dot", "crosshatch"];

export default function WidgetCard({
  widget,
  periodData,
  comparisonData = [],
  currentPeriodLabel = "current",
  comparisonPeriodLabel = "comparison",
  columns,
  onUpdated,
  isSelected,
  onToggleSelect,
  onDataPointClick,
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [form, setForm] = useState({
    title: widget.title,
    chart_type: widget.chart_type,
    x_field: widget.x_field || "",
    y_field: widget.y_field || "",
    color: widget.color,
    pattern: widget.pattern,
    show_trend_line: Boolean(widget.config?.show_trend_line),
  });

  const save = async () => {
    await updateWidget(widget.id, {
      title: form.title,
      chart_type: form.chart_type,
      x_field: form.x_field || null,
      y_field: form.y_field || null,
      color: form.color,
      pattern: form.pattern,
      config: { ...(widget.config || {}), show_trend_line: form.show_trend_line },
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

  const handleToggleSummary = async () => {
    if (showSummary) { setShowSummary(false); return; }
    if (summaryData) { setShowSummary(true); return; }
    setSummaryLoading(true);
    setSummaryError("");
    try {
      const result = await getWidgetSummary(widget.id, periodData);
      setSummaryData(result);
      setShowSummary(true);
    } catch {
      setSummaryError("Failed to generate summary.");
    } finally {
      setSummaryLoading(false);
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
          <button
            className={showSummary ? "ghost widget-summary-active" : "ghost"}
            onClick={handleToggleSummary}
            disabled={summaryLoading}
            title="Show or hide the AI-generated summary for this widget"
          >
            {summaryLoading ? "Generating..." : showSummary ? "Hide Graph Analysis" : "Graph Analysis"}
          </button>
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
          <label className="trend-line-toggle">
            <input
              type="checkbox"
              checked={form.show_trend_line}
              onChange={(e) => setForm({ ...form, show_trend_line: e.target.checked })}
            />
            <span>Show trend line</span>
          </label>
          <button onClick={save}>Save Widget</button>
        </div>
      )}

      <div className="widget-comparison-grid">
        <div>
          <p className="muted">Current: {currentPeriodLabel}</p>
          <ChartRenderer
            widget={widget}
            data={periodData}
            onDataPointClick={(row, meta) =>
              onDataPointClick?.(widget, row, periodData, currentPeriodLabel, meta)
            }
          />
        </div>
        <div>
          <p className="muted">Compare: {comparisonPeriodLabel}</p>
          <ChartRenderer
            widget={widget}
            data={comparisonData}
            onDataPointClick={(row, meta) =>
              onDataPointClick?.(widget, row, comparisonData, comparisonPeriodLabel, meta)
            }
          />
        </div>
      </div>

      {showSummary && (
        <div className="widget-summary-view">
          <p className="widget-summary-badge">
            Powered by LangChain · {summaryData?.provider || "deterministic"} · {summaryData?.model || "rules"}
          </p>
          <p className="widget-summary-text">{summaryData?.text || ""}</p>
          {summaryData?.mode === "fallback" && (
            <p className="muted widget-summary-note">
              Deterministic summary shown. Set LLM_PROVIDER env variable for LangChain LLM summary.
            </p>
          )}
        </div>
      )}

      {summaryError && <p className="error">{summaryError}</p>}
    </article>
  );
}
