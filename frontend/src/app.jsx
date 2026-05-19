import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  createWidget,
  getDatasetRecords,
  generateReport,
  getCurrentUser,
  getDashboard,
  getReportKpis,
  listDatasets,
  listReports,
  listWidgets,
  uploadDataset,
} from "./api";
import AuthPanel from "./components/AuthPanel";
import ChartRenderer from "./components/ChartRenderer";
import UploadZone from "./components/UploadZone";
import WidgetCard from "./components/WidgetCard";

const PERIODS = ["daily", "biweekly", "monthly", "quarterly", "half_yearly", "yearly"];

export default function App() {
  const [authorized, setAuthorized] = useState(Boolean(localStorage.getItem("token")));
  const [currentUser, setCurrentUser] = useState(null);
  const [datasets, setDatasets] = useState([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState(null);
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [widgets, setWidgets] = useState([]);
  const [selectedWidgetIds, setSelectedWidgetIds] = useState([]);
  const [period, setPeriod] = useState("monthly");
  const [comparePeriod, setComparePeriod] = useState("quarterly");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drillDown, setDrillDown] = useState(null);
  const [drillDownLoading, setDrillDownLoading] = useState(false);
  const [kpiCards, setKpiCards] = useState([]);
  const [kpiMeta, setKpiMeta] = useState(null);
  const [kpiLoading, setKpiLoading] = useState(false);
  const dashboardRef = useRef(null);
  const widgetsOnlyRef = useRef(null);

  const selectedDataset = datasets.find((d) => d.id === selectedDatasetId);
  const reportSpec = selectedReport?.report_spec || {};
  const selectedWidgets = useMemo(
    () => widgets.filter((w) => selectedWidgetIds.includes(w.id)),
    [widgets, selectedWidgetIds]
  );

  const periodData = useMemo(() => {
    const records = reportSpec?.aggregations?.[period] || [];
    return records.map((r) => {
      const obj = { ...r };
      Object.keys(obj).forEach((k) => {
        if (typeof obj[k] === "string" && obj[k].includes("T")) {
          obj[k] = obj[k].slice(0, 10);
        }
      });
      return obj;
    });
  }, [reportSpec, period]);

  const comparePeriodData = useMemo(() => {
    const records = reportSpec?.aggregations?.[comparePeriod] || [];
    return records.map((r) => {
      const obj = { ...r };
      Object.keys(obj).forEach((k) => {
        if (typeof obj[k] === "string" && obj[k].includes("T")) {
          obj[k] = obj[k].slice(0, 10);
        }
      });
      return obj;
    });
  }, [reportSpec, comparePeriod]);

  const refresh = async () => {
    const ds = await listDatasets();
    setDatasets(ds);
    if (!selectedDatasetId && ds.length) {
      setSelectedDatasetId(ds[0].id);
    }
  };

  useEffect(() => {
    if (!authorized) return;
    refresh().catch(() => setError("Failed to fetch datasets."));
    getCurrentUser().then(setCurrentUser).catch(() => {});
  }, [authorized]);

  useEffect(() => {
    if (!selectedDatasetId) return;
    (async () => {
      const rep = await listReports(selectedDatasetId);
      setReports(rep);
      if (rep.length) {
        setSelectedReport(rep[0]);
        const ws = await listWidgets(rep[0].id);
        setWidgets(ws);
      } else {
        setSelectedReport(null);
        setWidgets([]);
      }
    })().catch(() => setError("Failed to fetch reports/widgets."));
  }, [selectedDatasetId]);

  useEffect(() => {
    if (comparePeriod === period) {
      const fallback = PERIODS.find((p) => p !== period) || period;
      setComparePeriod(fallback);
    }
  }, [period, comparePeriod]);

  useEffect(() => {
    setDrillDown(null);
  }, [selectedReport, period, comparePeriod]);

  useEffect(() => {
    const currentIds = widgets.map((w) => w.id);
    if (!currentIds.length) {
      setSelectedWidgetIds([]);
      return;
    }

    setSelectedWidgetIds((prev) => {
      if (!prev.length) return currentIds;
      const kept = prev.filter((id) => currentIds.includes(id));
      return kept.length ? kept : currentIds;
    });
  }, [widgets]);

  useEffect(() => {
    if (!selectedReport?.id || !periodData.length) {
      setKpiCards([]);
      setKpiMeta(null);
      return;
    }

    let cancelled = false;
    setKpiLoading(true);
    getReportKpis(selectedReport.id, periodData)
      .then((result) => {
        if (cancelled) return;
        setKpiCards(result?.cards || []);
        setKpiMeta(result || null);
      })
      .catch(() => {
        if (cancelled) return;
        setKpiCards([]);
        setKpiMeta(null);
      })
      .finally(() => {
        if (!cancelled) setKpiLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedReport, periodData]);

  const handleUpload = async (datasetName, file) => {
    setBusy(true);
    setError("");
    try {
      const ds = await uploadDataset(datasetName, file);
      await refresh();
      setSelectedDatasetId(ds.id);
    } catch (e) {
      setError(e?.response?.data?.detail || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const createAutoReport = async () => {
    if (!selectedDatasetId) return;
    setBusy(true);
    try {
      const report = await generateReport(selectedDatasetId, period);
      setSelectedReport(report);
      const spec = report.report_spec || {};
      const suggestions = spec.suggestions || [];
      const aggregationEntries = Object.entries(spec.aggregations || {});
      const firstData = aggregationEntries.find(([, rows]) => Array.isArray(rows) && rows.length)?.[1] || [];
      const sampleRow = firstData[0] || {};
      const availableKeys = Object.keys(sampleRow);
      const numericKeys = availableKeys.filter((k) => typeof sampleRow[k] === "number");
      const preferredX =
        availableKeys.find((k) => k.toLowerCase().includes("date")) ||
        availableKeys.find((k) => !numericKeys.includes(k)) ||
        availableKeys[0] ||
        null;
      const preferredY = numericKeys[0] || availableKeys[1] || availableKeys[0] || null;

      for (let i = 0; i < suggestions.length; i += 1) {
        const s = suggestions[i];
        if (!s?.chart_type) continue;

        let chartType = s.chart_type;
        let xField = s.x_field;
        let yField = s.y_field;

        if (chartType !== "kpi") {
          if (!xField || !availableKeys.includes(xField)) {
            xField = preferredX;
          }
          if (!yField || !availableKeys.includes(yField)) {
            yField = preferredY;
          }
        }

        if (chartType === "scatter") {
          if (numericKeys.length >= 2) {
            xField = numericKeys[0];
            yField = numericKeys[1];
          } else {
            chartType = "bar";
            xField = preferredX;
            yField = preferredY;
          }
        }

        if (chartType === "kpi") {
          if (!yField || !availableKeys.includes(yField)) {
            yField = preferredY;
          }
        }

        if ((chartType !== "kpi" && (!xField || !yField)) || (chartType === "kpi" && !yField)) {
          continue;
        }

        await createWidget({
          report_id: report.id,
          title: s.title,
          chart_type: chartType,
          x_field: xField,
          y_field: yField,
          color: "#1f77b4",
          pattern: "solid",
          position: i,
          config: { reason: s.reason, confidence: s.confidence },
        });
      }
      const ws = await listWidgets(report.id);
      setWidgets(ws);
      const rep = await listReports(selectedDatasetId);
      setReports(rep);
    } catch (e) {
      setError(e?.response?.data?.detail || "Report generation failed");
    } finally {
      setBusy(false);
    }
  };

  const refreshWidgets = async () => {
    if (!selectedReport) return;
    const ws = await listWidgets(selectedReport.id);
    setWidgets(ws);
  };

  const loadDashboard = async () => {
    if (!selectedDatasetId) return;
    const data = await getDashboard(selectedDatasetId);
    if (data.reports.length) {
      setSelectedReport(data.reports[0]);
      setWidgets(data.widgets.filter((w) => w.report_id === data.reports[0].id));
    }
  };

  const exportElementToPdf = async (element, title, filename) => {
    if (!element || !selectedDataset) return;
    setBusy(true);
    setError("");
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#f5f7f4",
      });

      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      pdf.setFontSize(16);
      pdf.text(title, 12, 14);
      pdf.setFontSize(11);
      pdf.text(`Dataset: ${selectedDataset.name}`, 12, 22);
      pdf.text(`Report: ${selectedReport?.title || "N/A"}`, 12, 28);
      pdf.text(`Period: ${period}`, 12, 34);
      pdf.text(`Generated: ${new Date().toLocaleString()}`, 12, 40);

      const imgData = canvas.toDataURL("image/png");
      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let remainingHeight = imgHeight;
      let position = 48;

      pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
      remainingHeight -= pageHeight - position - 10;

      while (remainingHeight > 0) {
        pdf.addPage();
        position = 10 - (imgHeight - remainingHeight);
        pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
        remainingHeight -= pageHeight - 20;
      }

      pdf.save(filename);
    } catch {
      setError("Failed to export PDF");
    } finally {
      setBusy(false);
    }
  };

  const exportDashboardPdf = async () => {
    const filename = `${selectedDataset?.name || "dataset"}_${period}_dashboard.pdf`.replace(/\s+/g, "_");
    await exportElementToPdf(dashboardRef.current, "Agentic AI Dashboard Report", filename);
  };

  const exportSelectedWidgetsPdf = async () => {
    if (!selectedWidgets.length) {
      setError("Please select at least one widget to export.");
      return;
    }
    const filename = `${selectedDataset?.name || "dataset"}_${period}_widgets_only.pdf`.replace(
      /\s+/g,
      "_"
    );
    await exportElementToPdf(
      widgetsOnlyRef.current,
      "Selected Report Widgets",
      filename
    );
  };

  const toggleWidgetSelection = (widgetId) => {
    setSelectedWidgetIds((prev) =>
      prev.includes(widgetId) ? prev.filter((id) => id !== widgetId) : [...prev, widgetId]
    );
  };

  const toggleAllWidgets = () => {
    // If all widgets are selected, deselect all. Otherwise, select all.
    const allIds = widgets.map((w) => w.id);
    if (selectedWidgetIds.length === allIds.length) {
      setSelectedWidgetIds([]);
    } else {
      setSelectedWidgetIds(allIds);
    }
  };

  const clearWidgetSelection = () => {
    setSelectedWidgetIds([]);
  };

  const handleChartPointClick = async (widget, row, sourceData, sourcePeriodLabel, clickMeta) => {
    if (!row || !widget || !selectedDatasetId) return;
    const xField = widget.x_field;
    const selectedXValue = xField ? row[xField] : null;
    if (selectedXValue === null || selectedXValue === undefined || selectedXValue === "") return;

    setDrillDownLoading(true);
    setError("");
    try {
      const result = await getDatasetRecords(selectedDatasetId, {
        field: xField,
        value: String(selectedXValue),
        period: sourcePeriodLabel,
        limit: 100,
      });

      setDrillDown({
        widgetTitle: widget.title,
        xField,
        xValue: selectedXValue,
        sourcePeriodLabel,
        totalCount: result.total_count || 0,
        records: result.records || [],
        anchor: {
          x: clickMeta?.clientX ?? window.innerWidth - 460,
          y: clickMeta?.clientY ?? 160,
        },
      });
    } catch (e) {
      setError(e?.response?.data?.detail || "Unable to load drill-down records.");
      setDrillDown({
        widgetTitle: widget.title,
        xField,
        xValue: selectedXValue,
        sourcePeriodLabel,
        totalCount: 0,
        records: [],
        anchor: {
          x: clickMeta?.clientX ?? window.innerWidth - 460,
          y: clickMeta?.clientY ?? 160,
        },
      });
    } finally {
      setDrillDownLoading(false);
    }
  };

  if (!authorized) {
    return (
      <main className="app-shell">
        <h1>Agentic AI Data Visualization</h1>
        <AuthPanel onLoggedIn={() => setAuthorized(true)} />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="session-topbar">
        {currentUser && (
          <span className="current-user-badge">
            Logged in as <strong>{currentUser.full_name || currentUser.email}</strong>
          </span>
        )}
        <button
          className="ghost"
          onClick={() => {
            localStorage.removeItem("token");
            setAuthorized(false);
            setCurrentUser(null);
          }}
        >
          Logout
        </button>
      </div>

      <header className="hero card">
        <h1 className="hero-title">Agentic E-commerce Dashboard</h1>
        <p className="hero-subtitle">
          Upload data once. Ingestion, cleansing, AI visualization suggestions, and dynamic reporting run
          automatically.
        </p>
      </header>

      <section className="grid two-col">
        <UploadZone onUpload={handleUpload} />
        <section className="card">
          <h3>Dataset and Report Controls</h3>
          <label>
            Dataset
            <select
              value={selectedDatasetId || ""}
              onChange={(e) => setSelectedDatasetId(Number(e.target.value))}
            >
              <option value="">Select dataset</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.source_type})
                </option>
              ))}
            </select>
          </label>

          <label>
            Reporting period
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              {PERIODS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label>
            Compare with
            <select value={comparePeriod} onChange={(e) => setComparePeriod(e.target.value)}>
              {PERIODS.filter((p) => p !== period).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <div className="actions">
            <button disabled={!selectedDatasetId || busy} onClick={createAutoReport}>
              Generate reports
            </button>
            <button className="ghost" disabled={!selectedDatasetId || busy} onClick={loadDashboard}>
              Refresh Dashboard State
            </button>
          </div>
        </section>
      </section>

      {error && <p className="error">{error}</p>}

      <section className="dashboard-export-region" ref={dashboardRef}>
        <section className="card kpi-strip-card">
          <div className="kpi-strip-head">
            <h3>KPI Snapshot</h3>
            {kpiMeta && (
              <p className="muted">
                Powered by LangChain · {kpiMeta.provider} · {kpiMeta.model}
              </p>
            )}
          </div>
          {kpiLoading ? (
            <p className="muted">Calculating KPI recommendations...</p>
          ) : kpiCards.length ? (
            <div className="kpi-strip-grid">
              {kpiCards.map((card) => (
                <article className="kpi-mini-card" key={card.key}>
                  <p className="kpi-mini-label">{card.label}</p>
                  <p className="kpi-mini-value">{card.value}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">Generate a report to view KPI snapshot cards.</p>
          )}
        </section>

        <section className="card">
          <h3>Dynamic Widgets</h3>
          <p>
            Widgets are generated by the visualization agent. You can customize chart type, colors, patterns,
            and fields.
          </p>
          <p className="drilldown-hint">Click chart data points to see underlying records.</p>
          <div className="selection-toolbar">
            <p className="muted">Selected for PDF export: {selectedWidgetIds.length}</p>
            <div className="selection-actions">
              <button className="ghost" type="button" onClick={toggleAllWidgets}>
                Select All
              </button>
              <button className="ghost" disabled={!selectedDatasetId || busy} onClick={exportDashboardPdf}>
                Export Dashboard to PDF
              </button>
              <button
                className="ghost"
                disabled={!selectedDatasetId || !selectedWidgetIds.length || busy}
                onClick={exportSelectedWidgetsPdf}
              >
                Export Selected Widgets PDF
              </button>
              <button className="ghost" type="button" onClick={clearWidgetSelection}>
                Clear
              </button>
            </div>
          </div>
          <div className="widget-grid">
            {widgets.map((w) => (
              <WidgetCard
                key={w.id}
                widget={w}
                periodData={periodData}
                comparisonData={comparePeriodData}
                currentPeriodLabel={period}
                comparisonPeriodLabel={comparePeriod}
                columns={selectedDataset?.profile?.columns || []}
                onUpdated={refreshWidgets}
                isSelected={selectedWidgetIds.includes(w.id)}
                onToggleSelect={toggleWidgetSelection}
                onDataPointClick={handleChartPointClick}
              />
            ))}
          </div>
          {!widgets.length && <p className="muted">No widgets available for this report yet.</p>}

          {!drillDown && <p className="muted drilldown-empty-note">Select a widget point, bar, or slice.</p>}
        </section>

        <div className="two-col-bottom">
          <section className="card">
            <h3>Report Insights</h3>
            <p className="muted">
              {selectedReport
                ? selectedReport.title
                : "Generate a report to see AI recommendations and export-ready dashboard content."}
            </p>
            {!!reportSpec?.suggestions?.length && (
              <div className="insight-list">
                {reportSpec.suggestions.slice(0, 6).map((s, i) => (
                  <p key={`${s.title}-${i}`}>
                    <strong>{s.title}:</strong> {s.reason} (confidence {s.confidence})
                  </p>
                ))}
              </div>
            )}
          </section>

          {selectedDataset && (
            <section className="card">
              <h3>Data Quality</h3>
              <p>Completeness: {selectedDataset.quality?.completeness}</p>
              <p>Uniqueness: {selectedDataset.quality?.uniqueness}</p>
              <p>Consistency: {selectedDataset.quality?.consistency}</p>
              <p>Score: {selectedDataset.quality?.score}</p>
            </section>
          )}
        </div>
      </section>

      <section className="pdf-capture-surface" ref={widgetsOnlyRef}>
        <h3>Selected Report Widgets</h3>
        <p>Dataset: {selectedDataset?.name || "N/A"}</p>
        <div className="widget-grid">
          {selectedWidgets.map((w) => (
            <article key={`export-${w.id}`} className="card export-widget-card">
              <h4>{w.title}</h4>
              <ChartRenderer widget={w} data={periodData} />
            </article>
          ))}
        </div>
      </section>

      {drillDown && (
        <aside
          className="drilldown-preview-card"
          style={{
            left: `${Math.min(Math.max((drillDown.anchor?.x ?? 0) + 14, 16), window.innerWidth - 440)}px`,
            top: `${Math.min(Math.max((drillDown.anchor?.y ?? 0) + 14, 90), window.innerHeight - 380)}px`,
          }}
        >
          <div className="drilldown-head">
            <h4>Drill-down Records</h4>
            <button className="ghost" type="button" onClick={() => setDrillDown(null)}>
              Close
            </button>
          </div>
          <p className="muted">
            <strong>{drillDown.widgetTitle}</strong> · {drillDown.sourcePeriodLabel}
            {drillDown.xField ? ` · ${drillDown.xField}: ${drillDown.xValue}` : ""}
          </p>
          {drillDownLoading ? (
            <p className="muted drilldown-empty-note">Loading drill-down records...</p>
          ) : drillDown.records?.length ? (
            <>
              <div className="drilldown-table-wrap">
                <table className="drilldown-table">
                  <thead>
                    <tr>
                      {Object.keys(drillDown.records[0]).map((col) => (
                        <th key={col}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {drillDown.records.slice(0, 12).map((row, idx) => (
                      <tr key={`${idx}-${JSON.stringify(row)}`}>
                        {Object.keys(drillDown.records[0]).map((col) => (
                          <td key={`${idx}-${col}`}>{String(row[col] ?? "")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {drillDown.totalCount > drillDown.records.length && (
                <p className="muted drilldown-empty-note">
                  Showing {drillDown.records.length} of {drillDown.totalCount} rows.
                </p>
              )}
            </>
          ) : (
            <p className="muted drilldown-empty-note">No underlying records found for that chart point.</p>
          )}
        </aside>
      )}
    </main>
  );
}
