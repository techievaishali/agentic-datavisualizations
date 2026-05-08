import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  createWidget,
  generateReport,
  getDashboard,
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
  const [datasets, setDatasets] = useState([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState(null);
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [widgets, setWidgets] = useState([]);
  const [selectedWidgetIds, setSelectedWidgetIds] = useState([]);
  const [period, setPeriod] = useState("monthly");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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

  const handleUpload = async (datasetName, file) => {
    setBusy(true);
    setError("");
    try {
      const ds = await uploadDataset(datasetName, file);
      await refresh();
      setSelectedDatasetId(ds.id);
      await createAutoReportForDataset(ds.id, false);
    } catch (e) {
      setError(e?.response?.data?.detail || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const createAutoReportForDataset = async (datasetId, manageBusy = true) => {
    if (!datasetId) return;
    if (manageBusy) {
      setBusy(true);
    }
    try {
      const report = await generateReport(datasetId, period);
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
      const rep = await listReports(datasetId);
      setReports(rep);
    } catch (e) {
      setError(e?.response?.data?.detail || "Report generation failed");
    } finally {
      if (manageBusy) {
        setBusy(false);
      }
    }
  };

  const createAutoReport = async () => {
    await createAutoReportForDataset(selectedDatasetId, true);
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

  const selectAllWidgets = () => {
    setSelectedWidgetIds(widgets.map((w) => w.id));
  };

  const clearWidgetSelection = () => {
    setSelectedWidgetIds([]);
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
      <header className="hero card">
        <h1 className="hero-title">Agentic E-commerce Dashboard</h1>
        <p className="hero-subtitle">
          Upload data once. Ingestion, cleansing, AI visualization suggestions, and dynamic reporting run
          automatically.
        </p>
      </header>

      <section className="grid two-col">
        <UploadZone onUpload={handleUpload} />
        {/* Temporary: hide Dataset and Report Controls panel */}
        {/*
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

          <div className="actions">
            <button disabled={!selectedDatasetId || busy} onClick={createAutoReport}>
              Auto Generate Report + Widgets
            </button>
            <button className="ghost" disabled={!selectedDatasetId || busy} onClick={loadDashboard}>
              Refresh Dashboard State
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
            <button
              className="ghost"
              onClick={() => {
                localStorage.removeItem("token");
                setAuthorized(false);
              }}
            >
              Logout
            </button>
          </div>
        </section>
        */}
      </section>

      {error && <p className="error">{error}</p>}

      <section className="dashboard-export-region" ref={dashboardRef}>
        <section className="card">
          <h3>Dynamic Widgets</h3>
          <p>
            Widgets are generated by the visualization agent. You can customize chart type, colors, patterns,
            and fields.
          </p>
          {/* Temporary: hide selection summary and quick selection controls */}
          {/*
          <div className="selection-toolbar">
            <p className="muted">Selected for PDF export: {selectedWidgetIds.length}</p>
            <div className="selection-actions">
              <button className="ghost" type="button" onClick={selectAllWidgets}>
                Select All
              </button>
              <button className="ghost" type="button" onClick={clearWidgetSelection}>
                Clear
              </button>
            </div>
          </div>
          */}
          <div className="widget-grid">
            {widgets.map((w) => (
              <WidgetCard
                key={w.id}
                widget={w}
                periodData={periodData}
                columns={selectedDataset?.profile?.columns || []}
                onUpdated={refreshWidgets}
                isSelected={selectedWidgetIds.includes(w.id)}
                onToggleSelect={toggleWidgetSelection}
              />
            ))}
          </div>
          {!widgets.length && <p className="muted">No widgets available for this report yet.</p>}
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
    </main>
  );
}
