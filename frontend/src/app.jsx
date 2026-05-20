import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  createWidget,
  getDatasetRecords,
  generateReport,
  getCurrentUser,
  getReportKpis,
  listDatasets,
  listReports,
  listWidgets,
  uploadDataset,
} from "./api";
import AuthPanel from "./components/AuthPanel";
import ChartRenderer from "./components/ChartRenderer";
import UploadZone from "./components/UploadZone";
import WeeklyAggregatedMetricsTable from "./components/WeeklyAggregatedMetricsTable";
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
  const [activeTab, setActiveTab] = useState("overview");
  const [period, setPeriod] = useState("monthly");
  const [comparePeriod, setComparePeriod] = useState("quarterly");
  const [dateRange, setDateRange] = useState([0, 0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drillDown, setDrillDown] = useState(null);
  const [drillDownLoading, setDrillDownLoading] = useState(false);
  const [kpiCards, setKpiCards] = useState([]);
  const [kpiMeta, setKpiMeta] = useState(null);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const dashboardRef = useRef(null);
  const widgetsOnlyRef = useRef(null);

  const selectedDataset = datasets.find((d) => d.id === selectedDatasetId);
  const reportSpec = selectedReport?.report_spec || {};
  const overviewDateField = useMemo(() => {
    const rows = reportSpec?.aggregations?.[period] || [];
    const sample = rows[0] || {};
    return (
      Object.keys(sample).find((key) => key.toLowerCase().includes("date")) ||
      selectedDataset?.profile?.datetime_columns?.[0] ||
      null
    );
  }, [reportSpec, period, selectedDataset]);
  const selectedWidgets = useMemo(
    () => widgets.filter((w) => selectedWidgetIds.includes(w.id)),
    [widgets, selectedWidgetIds]
  );
  const hasGeneratedDashboard = Boolean(selectedReport && reports.length);
  const userStoragePrefix = currentUser?.email ? `agentic:${currentUser.email}` : null;
  const selectedDatasetStorageKey = userStoragePrefix ? `${userStoragePrefix}:selectedDatasetId` : null;
  const selectedReportStorageKey = userStoragePrefix ? `${userStoragePrefix}:selectedReportId` : null;

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

  const overviewFilteredData = useMemo(() => {
    if (!periodData.length) return [];
    if (!overviewDateField) return periodData;
    const values = periodData
      .map((row) => row[overviewDateField])
      .filter(Boolean)
      .map((value) => new Date(value).getTime())
      .filter((value) => !Number.isNaN(value));
    if (!values.length) return periodData;

    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const [rangeStart, rangeEnd] = dateRange;
    const startTs = minValue + ((maxValue - minValue) * rangeStart) / 100;
    const endTs = minValue + ((maxValue - minValue) * rangeEnd) / 100;

    return periodData.filter((row) => {
      const rowTs = new Date(row[overviewDateField]).getTime();
      return !Number.isNaN(rowTs) && rowTs >= startTs && rowTs <= endTs;
    });
  }, [periodData, overviewDateField, dateRange]);

  const overviewDateBounds = useMemo(() => {
    if (!overviewDateField || !periodData.length) return null;
    const timestamps = periodData
      .map((row) => new Date(row[overviewDateField]).getTime())
      .filter((value) => !Number.isNaN(value))
      .sort((a, b) => a - b);
    if (!timestamps.length) return null;
    return { min: timestamps[0], max: timestamps[timestamps.length - 1] };
  }, [periodData, overviewDateField]);

  const overviewSelectedDates = useMemo(() => {
    if (!overviewDateBounds) return { start: "", end: "" };
    const { min, max } = overviewDateBounds;
    if (min === max) {
      const single = new Date(min).toISOString().slice(0, 10);
      return { start: single, end: single };
    }
    const mapPercentToDate = (percent) => new Date(min + ((max - min) * percent) / 100).toISOString().slice(0, 10);
    return {
      start: mapPercentToDate(dateRange[0]),
      end: mapPercentToDate(dateRange[1]),
    };
  }, [overviewDateBounds, dateRange]);
  const overviewAnomalyField = useMemo(() => {
    if (!overviewFilteredData.length) return null;
    const sample = overviewFilteredData[0] || {};
    return Object.keys(sample).find((key) => typeof sample[key] === "number" && key !== "row_index") || null;
  }, [overviewFilteredData]);

  const overviewEntityField = useMemo(() => {
    if (!overviewFilteredData.length) return null;
    const sample = overviewFilteredData[0] || {};
    const keys = Object.keys(sample);
    return (
      keys.find((key) => /customer|order|product|item|category|region|segment|channel|id/i.test(key)) ||
      keys.find((key) => typeof sample[key] !== "number" && key !== overviewDateField) ||
      null
    );
  }, [overviewFilteredData, overviewDateField]);

  const overviewOrderIdField = useMemo(() => {
    if (!overviewFilteredData.length) return null;
    const sample = overviewFilteredData[0] || {};
    const keys = Object.keys(sample);
    return keys.find((key) => /order[_\s-]?id/i.test(key)) || null;
  }, [overviewFilteredData]);

  const overviewAnomalies = useMemo(() => {
    if (!overviewFilteredData.length || !overviewAnomalyField) return [];
    const values = overviewFilteredData.map((row) => Number(row[overviewAnomalyField])).filter((v) => !Number.isNaN(v));
    if (values.length < 3) return [];
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);
    if (!stdDev) return [];
    return overviewFilteredData
      .map((row, index) => {
        const value = Number(row[overviewAnomalyField]);
        if (Number.isNaN(value)) return null;
        const zScore = (value - mean) / stdDev;
        return { index, row, value, zScore, expected: mean };
      })
      .filter((item) => item && Math.abs(item.zScore) >= 1.5)
      .slice(0, 8);
  }, [overviewFilteredData, overviewAnomalyField]);

  const refresh = async () => {
    setError("");
    const ds = await listDatasets();
    setDatasets(ds);
    if (!ds.length) {
      setSelectedDatasetId(null);
      setReports([]);
      setSelectedReport(null);
      setWidgets([]);
      return;
    }

    const storedDatasetId = selectedDatasetStorageKey ? Number(localStorage.getItem(selectedDatasetStorageKey)) : NaN;
    if (Number.isFinite(storedDatasetId) && ds.some((d) => d.id === storedDatasetId)) {
      setSelectedDatasetId(storedDatasetId);
      return;
    }

    if (!selectedDatasetId || !ds.some((d) => d.id === selectedDatasetId)) {
      setSelectedDatasetId(ds[0].id);
    }
  };

  useEffect(() => {
    if (!authorized) {
      setError("");
      return;
    }
    setError("");
    getCurrentUser().then(setCurrentUser).catch(() => {});
  }, [authorized]);

  useEffect(() => {
    if (!authorized) return;
    refresh().catch(() => setError("Failed to fetch datasets."));
  }, [authorized, selectedDatasetStorageKey]);

  useEffect(() => {
    if (!selectedDatasetId) {
      setReports([]);
      setSelectedReport(null);
      setWidgets([]);
      return;
    }
    (async () => {
      const rep = await listReports(selectedDatasetId);
      setReports(rep);
      if (rep.length) {
        const storedReportId = selectedReportStorageKey ? Number(localStorage.getItem(selectedReportStorageKey)) : NaN;
        const preferred = Number.isFinite(storedReportId) ? rep.find((r) => r.id === storedReportId) : null;
        const selected = preferred || rep[0];
        setSelectedReport(selected);
        const ws = await listWidgets(selected.id);
        setWidgets(ws);
        setError("");
      } else {
        setSelectedReport(null);
        setWidgets([]);
        setError("");
      }
    })().catch(() => setError("Failed to fetch reports/widgets."));
  }, [selectedDatasetId, selectedReportStorageKey]);

  useEffect(() => {
    if (!selectedDatasetStorageKey) return;
    if (!selectedDatasetId) {
      localStorage.removeItem(selectedDatasetStorageKey);
      return;
    }
    localStorage.setItem(selectedDatasetStorageKey, String(selectedDatasetId));
  }, [selectedDatasetId, selectedDatasetStorageKey]);

  useEffect(() => {
    if (!selectedReportStorageKey) return;
    if (!selectedReport?.id) {
      localStorage.removeItem(selectedReportStorageKey);
      return;
    }
    localStorage.setItem(selectedReportStorageKey, String(selectedReport.id));
  }, [selectedReport, selectedReportStorageKey]);

  useEffect(() => {
    if (comparePeriod === period) {
      const fallback = PERIODS.find((p) => p !== period) || period;
      setComparePeriod(fallback);
    }
  }, [period, comparePeriod]);

  useEffect(() => {
    if (!hasGeneratedDashboard) {
      setActiveTab("upload");
    }
  }, [hasGeneratedDashboard]);

  useEffect(() => {
    if (!overviewDateBounds) {
      setDateRange([0, 0]);
      return;
    }
    setDateRange((prev) => {
      if (prev[0] === 0 && prev[1] === 0) return [0, 100];
      return prev;
    });
  }, [overviewDateBounds]);

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
          color: "#1f3557",
          pattern: "solid",
          position: i,
          config: { reason: s.reason, confidence: s.confidence },
        });
      }
      const ws = await listWidgets(report.id);
      setWidgets(ws);
      const rep = await listReports(selectedDatasetId);
      setReports(rep);
      setActiveTab("overview");
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

  const exportElementToPdf = async (element, title, filename) => {
    if (!element || !selectedDataset) return;
    setBusy(true);
    setError("");
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
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

  const overviewMainWidgets = useMemo(() => {
    const ranked = [...widgets].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const chartWidgets = ranked.filter((w) => w.chart_type !== "kpi");
    return (chartWidgets.length ? chartWidgets : ranked).slice(0, 3);
  }, [widgets]);

  const formatValue = (value) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "number") return value.toLocaleString();
    return String(value);
  };

  const getAnomalySeverity = (zScore) => {
    const magnitude = Math.abs(zScore);
    if (magnitude >= 3) return "High";
    if (magnitude >= 2) return "Medium";
    return "Low";
  };

  const toQualityPercent = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "N/A";
    return `${Math.round(numeric * 100)}%`;
  };

  const getQualityLabel = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "Unknown";
    if (numeric >= 0.95) return "Excellent";
    if (numeric >= 0.85) return "Good";
    if (numeric >= 0.7) return "Fair";
    return "Needs attention";
  };

  const toFriendlyInsight = (suggestion) => {
    const title = suggestion?.title || "Insight";
    const reason = String(suggestion?.reason || "").trim();
    const mapped = {
      "Time series view is suitable for datetime plus metric": "Shows how this metric changes over time.",
      "Category comparison supports ranking and segment analysis": "Compares groups so you can quickly spot top and low performers.",
      "Limited categories are suitable for composition view": "Shows each category's share of the total.",
      "Single metric KPI provides quick headline insight": "Shows one key number at a glance.",
      "Two independent numeric fields support relationship exploration": "Shows whether two measures move together.",
    };
    return {
      what: title,
      why: mapped[reason] || (reason ? `${reason.charAt(0).toUpperCase()}${reason.slice(1)}.` : "Helps with faster decisions."),
    };
  };

  if (!authorized) {
    return (
      <main className="app-shell">
        <h1>Agentic AI Data Visualization</h1>
        <AuthPanel
          onLoggedIn={() => {
            setError("");
            setAuthorized(true);
          }}
          onRegistered={(message) => setWelcomeMessage(message)}
        />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="hero-top-row">
        <header className="hero">
          <h1 className="hero-title">Agentic E-commerce Dashboard</h1>
          <p className="hero-subtitle">
            Upload data once. Ingestion, cleansing, AI visualization suggestions, and dynamic reporting run
            automatically.
          </p>
        </header>

        <div className="session-topbar">
          {currentUser && (
            <span className="current-user-badge">
              <span className="current-user-avatar" aria-hidden="true" />
              <span className="current-user-meta">
                <span className="current-user-label">Logged in as</span>
                <strong>{currentUser.full_name || currentUser.email}</strong>
              </span>
            </span>
          )}
          <button
            className="ghost"
            onClick={() => {
              localStorage.removeItem("token");
              setAuthorized(false);
              setCurrentUser(null);
              setDatasets([]);
              setSelectedDatasetId(null);
              setReports([]);
              setSelectedReport(null);
              setWidgets([]);
              setSelectedWidgetIds([]);
              setWelcomeMessage("");
              setError("");
            }}
          >
            Logout
          </button>
          <button
            className="ghost"
            type="button"
            disabled={!hasGeneratedDashboard}
            onClick={() => setActiveTab("upload")}
          >
            Configure Dashboard
          </button>
        </div>
      </section>

      {error && <p className="error">{error}</p>}

      <section className="dashboard-export-region" ref={dashboardRef}>
        <div className="tab-bar">
          <button className={activeTab === "upload" ? "tab-button active" : "tab-button"} onClick={() => setActiveTab("upload")}>Upload</button>
          <button className={activeTab === "overview" ? "tab-button active" : "tab-button"} disabled={!hasGeneratedDashboard} onClick={() => setActiveTab("overview")}>Overview</button>
          <button className={activeTab === "analytics" ? "tab-button active" : "tab-button"} disabled={!hasGeneratedDashboard} onClick={() => setActiveTab("analytics")}>Analytics</button>
        </div>

        {activeTab === "upload" && (
          <section className="grid two-col upload-tab-panel">
            <UploadZone
              onUpload={handleUpload}
              onGenerateReport={createAutoReport}
              generateReportDisabled={!selectedDatasetId || busy}
            />
            <section className="card empty-dashboard-state">
              <h3>{hasGeneratedDashboard ? "Dashboard Setup" : "Dashboard Will Appear After First Report"}</h3>
              <p>
                Upload your dataset file (CSV, Excel .xlsx/.xls, or XML), then click Generate Report to build charts,
                insights, and your personalized dashboard.
              </p>
            </section>
          </section>
        )}

        {activeTab === "overview" && (
          <section className="card overview-tab">
            <section className="kpi-strip-card">
              {kpiLoading ? (
                <p className="muted">Loading KPI cards...</p>
              ) : kpiCards.length ? (
                <div className="kpi-strip-grid">
                  {kpiCards.map((card) => (
                    <article className="kpi-mini-card" key={card.key || card.label}>
                      <p className="kpi-mini-label">{card.label}</p>
                      <p className="kpi-mini-value">{card.value}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted">No KPI cards available for this period.</p>
              )}
            </section>

            <section className="overview-main-block">
              <div className="overview-main-head">
                <h4>Main Charts and Reports</h4>
                <p className="muted">Top visuals from your current report.</p>
              </div>
              <div className="overview-main-grid">
                <div className="overview-main-charts">
                  {overviewMainWidgets.length ? (
                    overviewMainWidgets.map((widget) => (
                      <article className="overview-main-chart-card" key={`overview-main-${widget.id}`}>
                        <div className="overview-main-chart-head">
                          <div className="chart-head-meta">
                            <h5>{widget.title}</h5>
                            <span className="chart-head-tag">{widget.chart_type}</span>
                          </div>
                        </div>
                        <ChartRenderer widget={widget} data={periodData} />
                      </article>
                    ))
                  ) : (
                    <p className="muted">No main charts are available yet.</p>
                  )}
                </div>
              </div>
            </section>

            <div className="overview-controls-row">
              <div className="overview-summary-grid">
                <article className="overview-summary-card">
                  <h4>Visible Rows</h4>
                  <p>{overviewFilteredData.length}</p>
                </article>
                <article className="overview-summary-card">
                  <h4>Anomalies</h4>
                  <p>{overviewAnomalies.length}</p>
                </article>
              </div>

              {overviewDateField && overviewFilteredData.length > 0 && (
                <div className="overview-filter-compact">
                  <label className="overview-filter-compact-field">
                    <span>Start</span>
                    <input
                      type="date"
                      value={overviewSelectedDates.start}
                      onChange={(e) => {
                        if (!overviewDateBounds) return;
                        const { min, max } = overviewDateBounds;
                        const selected = new Date(e.target.value).getTime();
                        if (!Number.isNaN(selected)) {
                          const start = min === max ? 0 : Math.round(((selected - min) / (max - min)) * 100);
                          const clamped = Math.max(0, Math.min(100, start));
                          setDateRange(([_, end]) => [clamped, Math.max(clamped, end)]);
                        }
                      }}
                    />
                  </label>
                  <label className="overview-filter-compact-field">
                    <span>End</span>
                    <input
                      type="date"
                      value={overviewSelectedDates.end}
                      onChange={(e) => {
                        if (!overviewDateBounds) return;
                        const { min, max } = overviewDateBounds;
                        const selected = new Date(e.target.value).getTime();
                        if (!Number.isNaN(selected)) {
                          const end = min === max ? 100 : Math.round(((selected - min) / (max - min)) * 100);
                          const clamped = Math.max(0, Math.min(100, end));
                          setDateRange(([start]) => [Math.min(start, clamped), clamped]);
                        }
                      }}
                    />
                  </label>
                  <div className="overview-filter-compact-slider">
                    <div className="dual-range-slider">
                      <div className="dual-range-track" />
                      <div className="dual-range-fill" style={{ left: `${dateRange[0]}%`, right: `${100 - dateRange[1]}%` }} />
                      <input className="dual-range-thumb dual-range-thumb-start" type="range" min="0" max="100" value={dateRange[0]}
                        onChange={(e) => { const next = Number(e.target.value); setDateRange(([_, end]) => [Math.min(next, end), end]); }} />
                      <input className="dual-range-thumb dual-range-thumb-end" type="range" min="0" max="100" value={dateRange[1]}
                        onChange={(e) => { const next = Number(e.target.value); setDateRange(([start]) => [start, Math.max(start, next)]); }} />
                    </div>
                  </div>
                  <span className="muted overview-filter-compact-hint">Use date filtering to quickly spot anomalies.</span>
                </div>
              )}
            </div>

            <section className="weekly-metrics-section">
              <div className="table-section-head">
                <h4>Weekly Customer and Sales Metrics</h4>
              </div>
              <WeeklyAggregatedMetricsTable rows={overviewFilteredData} dateField={overviewDateField} />
            </section>
          </section>
        )}

        {activeTab === "analytics" && (
          <>
            <div className="analytics-top-row">
              <section className="card analytics-control-panel">
                <div className="analytics-control-head">
                  <div>
                    <h3>Dataset and Report Controls</h3>
                    <p className="muted">Choose the dataset and reporting windows used by widgets, KPIs, and comparisons.</p>
                  </div>
                </div>

                <div className="analytics-control-grid">
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

                  {overviewDateBounds && (
                    <div className="analytics-date-group">
                      <label className="analytics-date-control analytics-date-start">
                        Start date
                        <input
                          type="date"
                          value={overviewSelectedDates.start}
                          onChange={(e) => {
                            if (!overviewDateBounds) return;
                            const { min, max } = overviewDateBounds;
                            const selected = new Date(e.target.value).getTime();
                            if (!Number.isNaN(selected)) {
                              const start = min === max ? 0 : Math.round(((selected - min) / (max - min)) * 100);
                              const clamped = Math.max(0, Math.min(100, start));
                              setDateRange(([_, end]) => [clamped, Math.max(clamped, end)]);
                            }
                          }}
                        />
                      </label>

                      <label className="analytics-date-control analytics-date-end">
                        End date
                        <input
                          type="date"
                          value={overviewSelectedDates.end}
                          onChange={(e) => {
                            if (!overviewDateBounds) return;
                            const { min, max } = overviewDateBounds;
                            const selected = new Date(e.target.value).getTime();
                            if (!Number.isNaN(selected)) {
                              const end = min === max ? 100 : Math.round(((selected - min) / (max - min)) * 100);
                              const clamped = Math.max(0, Math.min(100, end));
                              setDateRange(([start]) => [Math.min(start, clamped), clamped]);
                            }
                          }}
                        />
                      </label>

                      <div className="analytics-slider-compact analytics-slider-below">
                        <span className="analytics-slider-label">Date range</span>
                        <div className="dual-range-slider-compact">
                          <div className="dual-range-track-compact" />
                          <div
                            className="dual-range-fill-compact"
                            style={{ left: `${dateRange[0]}%`, right: `${100 - dateRange[1]}%` }}
                          />
                          <input
                            className="dual-range-thumb-compact dual-range-thumb-start-compact"
                            type="range"
                            min="0"
                            max="100"
                            value={dateRange[0]}
                            onChange={(e) => {
                              const next = Number(e.target.value);
                              setDateRange(([_, end]) => [Math.min(next, end), end]);
                            }}
                          />
                          <input
                            className="dual-range-thumb-compact dual-range-thumb-end-compact"
                            type="range"
                            min="0"
                            max="100"
                            value={dateRange[1]}
                            onChange={(e) => {
                              const next = Number(e.target.value);
                              setDateRange(([start]) => [start, Math.max(start, next)]);
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </section>

              <section className="card data-quality-panel">
                <h3>Data Quality</h3>
                {selectedDataset ? (
                  <div className="dq-metric-grid">
                    <span className="dq-label">Completeness</span>
                    <span className="dq-value">{toQualityPercent(selectedDataset.quality?.completeness)}</span>
                    <span className="dq-tag">{getQualityLabel(selectedDataset.quality?.completeness)}</span>
                    <span className="dq-label">Uniqueness</span>
                    <span className="dq-value">{toQualityPercent(selectedDataset.quality?.uniqueness)}</span>
                    <span className="dq-tag">{getQualityLabel(selectedDataset.quality?.uniqueness)}</span>
                    <span className="dq-label">Consistency</span>
                    <span className="dq-value">{toQualityPercent(selectedDataset.quality?.consistency)}</span>
                    <span className="dq-tag">{getQualityLabel(selectedDataset.quality?.consistency)}</span>
                    <span className="dq-label dq-label--total">Overall Score</span>
                    <span className="dq-value dq-value--total">{toQualityPercent(selectedDataset.quality?.score)}</span>
                    <span className="dq-tag dq-tag--total">{getQualityLabel(selectedDataset.quality?.score)}</span>
                  </div>
                ) : (
                  <p className="muted">Select a dataset to view data quality metrics.</p>
                )}
              </section>
            </div>

            {!!overviewAnomalies.length && (
              <section className="card">
                <div className="anomaly-box">
                  <h4>Anomaly Detection</h4>
                  <p className="muted">Unusual points detected on the current period data.</p>
                  <ul>
                    {overviewAnomalies.map((item) => (
                      <li key={`anom-${item.index}`}>
                        {`${item.row?.[overviewDateField] ?? "No date"} | `}
                        {overviewOrderIdField ? `Order ID: ${formatValue(item.row?.[overviewOrderIdField])} | ` : ""}
                        {overviewEntityField && overviewEntityField !== overviewOrderIdField
                          ? `${overviewEntityField}: ${formatValue(item.row?.[overviewEntityField])} | `
                          : ""}
                        {`${overviewAnomalyField} ${formatValue(item.value)} | `}
                        {`Expected ${formatValue(item.expected)} | `}
                        {`${item.zScore >= 0 ? "+" : ""}${item.zScore.toFixed(2)}σ | `}
                        {getAnomalySeverity(item.zScore)}
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}

            <section className="card">
              <h3>Dynamic Widgets</h3>
              <p>
                Widgets are generated by the visualization agent. You can customize chart type, colors, patterns,
                and fields.
              </p>
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
            </section>


          </>
        )}
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
