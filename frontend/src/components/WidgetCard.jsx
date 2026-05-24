import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { deleteWidget, getWidgetSummary, updateWidget } from "../api";

const ChartRenderer = lazy(() => import("./ChartRenderer"));

const CHART_TYPES = ["line", "line_compare", "bar", "scatter", "pie", "kpi", "dual_axis_combo", "grouped_bar", "stacked_bar", "horizontal_bar"];
const PATTERNS = ["solid", "stripe", "dot", "crosshatch"];

export default function WidgetCard({
  widget,
  periodData,
  comparisonData = [],
  currentPeriodLabel = "current",
  comparisonPeriodLabel = "comparison",
  columns,
  profile,
  onUpdated,
  isSelected,
  onToggleSelect,
  onDataPointClick,
}) {
  // Hide widget if no chart/data
  const isEmpty = (!periodData || periodData.length === 0) && (!comparisonData || comparisonData.length === 0);
  if (isEmpty) return null;

  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [form, setForm] = useState({
    title: widget.title,
    chart_type: widget.chart_type,
    x_field: widget.x_field || "",
    y_field: widget.y_field || "",
    secondary_y_field: widget.config?.secondary_y_field || "",
    color: widget.color,
    pattern: widget.pattern,
    show_trend_line: Boolean(widget.config?.show_trend_line),
  });
  const chartDataColumns = useMemo(() => {
    const keys = new Set();
    const sampleRows = [...(periodData || []).slice(0, 20), ...(comparisonData || []).slice(0, 20)];
    sampleRows.forEach((row) => {
      if (!row || typeof row !== "object") return;
      Object.keys(row).forEach((key) => keys.add(key));
    });
    return Array.from(keys);
  }, [periodData, comparisonData]);

  const numericChartColumns = useMemo(() => {
    const rows = [...(periodData || []), ...(comparisonData || [])];
    return chartDataColumns.filter((col) =>
      rows.some((row) => Number.isFinite(Number(row?.[col])))
    );
  }, [chartDataColumns, periodData, comparisonData]);

  const profileNumericColumns = useMemo(() => profile?.numeric_columns || [], [profile]);
  const profileDateColumns = useMemo(() => profile?.datetime_columns || [], [profile]);
  const profileCategoricalColumns = useMemo(() => profile?.categorical_columns || [], [profile]);

  const unique = (items) => Array.from(new Set((items || []).filter((v) => typeof v === "string" && v.trim())));

  const selectableXFields = useMemo(() => {
    if (form.chart_type === "scatter") return unique([...numericChartColumns, ...profileNumericColumns]);
    if (form.chart_type === "kpi") return [];
    return unique([
      ...profileDateColumns,
      ...profileCategoricalColumns,
      ...chartDataColumns,
      ...(columns || []),
    ]);
  }, [form.chart_type, chartDataColumns, numericChartColumns, profileDateColumns, profileCategoricalColumns, profileNumericColumns, columns]);

  const selectableYFields = useMemo(
    () => unique([...(profileNumericColumns || []), ...numericChartColumns]),
    [profileNumericColumns, numericChartColumns]
  );
  const selectableSecondaryYFields = useMemo(
    () => selectableYFields.filter((field) => field !== form.y_field),
    [selectableYFields, form.y_field]
  );
  const needsSecondaryY = form.chart_type === "dual_axis_combo" || form.chart_type === "grouped_bar" || form.chart_type === "line_compare";
  const supportsTrendLine = form.chart_type === "line" || form.chart_type === "bar" || form.chart_type === "scatter";
  const supportsColorControl = form.chart_type !== "pie";
  const supportsPatternControl = form.chart_type !== "pie";

  useEffect(() => {
    setSummaryData(null);
    setShowSummary(false);
    setSummaryError("");
  }, [widget.id, widget.x_field, widget.y_field, widget.chart_type, periodData, comparisonData]);

  const save = async () => {
    setSaveError("");
    const hasX = (field) => selectableXFields.includes(field);
    const hasY = (field) => selectableYFields.includes(field);

    if (form.chart_type === "kpi") {
      if (!form.y_field || !hasY(form.y_field)) {
        setSaveError("Select a valid numeric field for KPI.");
        return;
      }
    } else {
      if (!form.x_field || !hasX(form.x_field)) {
        setSaveError("Select a valid X field available in chart data.");
        return;
      }
      if (!form.y_field || !hasY(form.y_field)) {
        setSaveError("Select a valid numeric Y field available in chart data.");
        return;
      }
    }

    if (needsSecondaryY) {
      if (!form.secondary_y_field || !selectableSecondaryYFields.includes(form.secondary_y_field)) {
        setSaveError("Select a valid secondary numeric field.");
        return;
      }
    }

    try {
      await updateWidget(widget.id, {
        title: form.title,
        chart_type: form.chart_type,
        x_field: form.x_field || null,
        y_field: form.y_field || null,
        color: form.color,
        pattern: form.pattern,
        config: {
          ...(widget.config || {}),
          show_trend_line: supportsTrendLine ? form.show_trend_line : false,
          ...(needsSecondaryY ? { secondary_y_field: form.secondary_y_field } : {}),
          ...(form.chart_type === "dual_axis_combo" ? { data_source: "time_series" } : {}),
          ...(form.chart_type === "grouped_bar" ? { data_source: "category_profit" } : {}),
          ...(form.chart_type === "horizontal_bar" ? { data_source: "sku_sales_top10" } : {}),
          ...(form.chart_type === "horizontal_bar" ? { top_n: 10, sort_desc: true } : {}),
        },
      });
      setEditing(false);
      onUpdated();
    } catch (err) {
      if (err.response?.status === 404) {
        onUpdated();
      } else {
        const msg = err.response?.data?.detail || err.message || "Failed to update widget";
        setSaveError(msg);
        console.error("Widget update error:", err);
      }
    }
  };

  const remove = async () => {
    const ok = window.confirm(`Delete widget \"${widget.title}\"?`);
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteWidget(widget.id);
      onUpdated();
    } catch (err) {
      if (err.response?.status === 404) {
        onUpdated();
      }
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
      const result = await getWidgetSummary(widget.id, periodData, comparisonData);
      setSummaryData(result);
      setShowSummary(true);
    } catch {
      setSummaryError("Failed to generate summary.");
    } finally {
      setSummaryLoading(false);
    }
  };

  if (summaryError) {
    return null;
  }

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

      {editing && (
        <div className="widget-config">
          <input
            id={`widget-${widget.id}-title`}
            name="title"
            autocomplete="off"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <select
            id={`widget-${widget.id}-chart-type`}
            name="chart_type"
            autocomplete="off"
            value={form.chart_type}
            onChange={(e) => {
              const nextType = e.target.value;
              const nextSupportsTrend = nextType === "line" || nextType === "bar" || nextType === "scatter";
              setForm({
                ...form,
                chart_type: nextType,
                secondary_y_field:
                  nextType === "dual_axis_combo" || nextType === "grouped_bar" || nextType === "line_compare"
                    ? form.secondary_y_field
                    : "",
                show_trend_line: nextSupportsTrend ? form.show_trend_line : false,
              });
            }}
          >
            {CHART_TYPES.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
          <select
            id={`widget-${widget.id}-x-field`}
            name="x_field"
            autocomplete="off"
            value={form.x_field}
            onChange={(e) => setForm({ ...form, x_field: e.target.value })}
            disabled={form.chart_type === "kpi"}
          >
            <option value="">No x field</option>
            {selectableXFields.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            id={`widget-${widget.id}-y-field`}
            name="y_field"
            autocomplete="off"
            value={form.y_field}
            onChange={(e) => setForm({ ...form, y_field: e.target.value })}
          >
            <option value="">No y field</option>
            {selectableYFields.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {needsSecondaryY && (
            <select
              id={`widget-${widget.id}-secondary-y-field`}
              name="secondary_y_field"
              autocomplete="off"
              value={form.secondary_y_field}
              onChange={(e) => setForm({ ...form, secondary_y_field: e.target.value })}
            >
              <option value="">No secondary y field</option>
              {selectableSecondaryYFields.map((c) => (
                <option key={`${c}-secondary`} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          {supportsColorControl && (
            <label htmlFor={`widget-${widget.id}-color`}>
              Color
              <input
                id={`widget-${widget.id}-color`}
                name="color"
                type="color"
                autocomplete="off"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
            </label>
          )}
          {supportsPatternControl && (
            <select
              id={`widget-${widget.id}-pattern`}
              name="pattern"
              autocomplete="off"
              value={form.pattern}
              onChange={(e) => setForm({ ...form, pattern: e.target.value })}
            >
              {PATTERNS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}
          {supportsTrendLine && (
            <label htmlFor={`widget-${widget.id}-trend-line`} className="trend-line-toggle">
              <input
                id={`widget-${widget.id}-trend-line`}
                name="show_trend_line"
                type="checkbox"
                autocomplete="off"
                checked={form.show_trend_line}
                onChange={(e) => setForm({ ...form, show_trend_line: e.target.checked })}
              />
              <span>Show trend line</span>
            </label>
          )}
          <button onClick={save}>Save Widget</button>
        </div>
      )}

      <div className="widget-comparison-grid">
        <div>
          <p className="muted">Current: {currentPeriodLabel}</p>
          <Suspense fallback={<p className="muted">Loading chart...</p>}>
            <ChartRenderer
              widget={widget}
              data={periodData}
              onDataPointClick={(row, meta) =>
                onDataPointClick?.(widget, row, periodData, currentPeriodLabel, meta)
              }
            />
          </Suspense>
        </div>
        <div>
          <p className="muted">Compare: {comparisonPeriodLabel}</p>
          <Suspense fallback={<p className="muted">Loading chart...</p>}>
            <ChartRenderer
              widget={widget}
              data={comparisonData}
              onDataPointClick={(row, meta) =>
                onDataPointClick?.(widget, row, comparisonData, comparisonPeriodLabel, meta)
              }
            />
          </Suspense>
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
              Deterministic summaries now vary by widget fields and include comparison-period delta.
            </p>
          )}
        </div>
      )}
    </article>
  );
}
