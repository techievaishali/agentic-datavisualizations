import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import {
  createWidget,
  getDatasetRecords,
  getBusinessInsights,
  generateReport,
  getCurrentUser,
  getReportKpis,
  listDatasets,
  listReports,
  listWidgets,
  uploadDataset,
  refreshToken,
  clearAuth,
  updateActivityTime,
  isUserIdle,
  autoRefreshTokenIfActive,
} from "./api";
import AuthPanel from "./components/AuthPanel";
import UploadZone from "./components/UploadZone";
import WeeklyAggregatedMetricsTable from "./components/WeeklyAggregatedMetricsTable";
import WidgetCard from "./components/WidgetCard";

const PERIODS = ["daily", "biweekly", "monthly", "quarterly", "half_yearly", "yearly"];
const WIDGET_TYPES = ["line", "line_compare", "bar", "scatter", "pie", "kpi", "dual_axis_combo", "grouped_bar", "stacked_bar", "horizontal_bar"];
const EMPTY_REPORT_SPEC = Object.freeze({});
const EMPTY_ROWS = Object.freeze([]);
const ChartRenderer = lazy(() => import("./components/ChartRenderer"));

const CHARTS_REQUIRING_XY = new Set(["line", "line_compare", "bar", "scatter", "pie", "dual_axis_combo", "grouped_bar", "stacked_bar", "horizontal_bar"]);

const KPI_TITLE_FIELD_HINTS = [
  {
    titleHints: ["amount_spend", "amount spend", "spend"],
    fieldHints: ["amount_spend", "spend", "ad_spend", "marketing_spend", "cost"],
  },
  {
    titleHints: ["revenue", "sales", "gmv"],
    fieldHints: ["revenue", "sales", "gmv", "income", "gross"],
  },
];

const isPresent = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return Number.isFinite(value);
  return true;
};

const resolveKpiFieldFromTitle = (title, availableKeys = []) => {
  const loweredTitle = String(title || "").toLowerCase();
  const normalizedKeys = availableKeys.map((key) => String(key || ""));

  for (const hint of KPI_TITLE_FIELD_HINTS) {
    const isMatch = hint.titleHints.some((token) => loweredTitle.includes(token));
    if (!isMatch) continue;

    for (const preferred of hint.fieldHints) {
      const exact = normalizedKeys.find((key) => key.toLowerCase() === preferred);
      if (exact) return exact;
      const partial = normalizedKeys.find((key) => key.toLowerCase().includes(preferred));
      if (partial) return partial;
    }
  }

  return null;
};

const toTitleCase = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());

const formatValue = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
};

const buildWidgetTitle = (widget) => {
  const chartType = String(widget?.chart_type || "").toLowerCase();
  const x = widget?.x_field;
  const y = widget?.y_field;

  if (chartType === "kpi" && y) return `Total ${toTitleCase(y)}`;
  if (chartType === "line" && x && y) return `${toTitleCase(y)} Trend Over ${toTitleCase(x)}`;
  if (chartType === "line_compare" && x && y) return `${toTitleCase(y)} and comparison trend over ${toTitleCase(x)}`;
  if (chartType === "bar" && x && y) return `${toTitleCase(y)} by ${toTitleCase(x)}`;
  if (chartType === "pie" && x && y) return `Share of ${toTitleCase(y)} by ${toTitleCase(x)}`;
  if (chartType === "scatter" && x && y) return `${toTitleCase(y)} vs ${toTitleCase(x)}`;
  if (chartType === "dual_axis_combo" && x && y) return `${toTitleCase(y)} vs Demand Over ${toTitleCase(x)}`;
  if (chartType === "grouped_bar" && x && y) return `${toTitleCase(y)} vs Net Profit by ${toTitleCase(x)}`;
  if (chartType === "stacked_bar" && x && y) return `${toTitleCase(y)} mix by ${toTitleCase(x)}`;
  if (chartType === "horizontal_bar" && x && y) return `${toTitleCase(y)} Top Items by ${toTitleCase(x)}`;

  if (y) return `${toTitleCase(y)} Widget`;
  if (x) return `${toTitleCase(x)} Widget`;
  return widget?.title || "Widget";
};

const inferBusinessChartFields = (rows, { requireTwoNumeric = false } = {}) => {
  const sample = Array.isArray(rows) && rows.length ? rows[0] || {} : {};
  const keys = Object.keys(sample);
  const numericKeys = keys.filter((key) => Number.isFinite(Number(sample[key])));
  const xField = keys.find((key) => key.toLowerCase().includes("date")) || keys.find((key) => !numericKeys.includes(key)) || keys[0] || null;
  const yField = numericKeys[0] || keys[1] || keys[0] || null;
  const secondaryYField = numericKeys.find((key) => key !== yField) || null;

  if (requireTwoNumeric && !secondaryYField) return { xField, yField: null, secondaryYField: null };
  return { xField, yField, secondaryYField };
};

const isDateLikeField = (field) => /date|time|day|month|year|week/i.test(String(field || ""));
const getNumericKeys = (rows = []) => {
  if (!Array.isArray(rows) || !rows.length) return [];
  const keys = Object.keys(rows[0] || {});
  return keys.filter((key) => rows.some((row) => Number.isFinite(Number(row?.[key]))));
};

const pickKeyByTokens = (keys = [], tokens = []) => {
  const lowered = keys.map((key) => String(key || "").toLowerCase());
  for (const token of tokens) {
    const idx = lowered.findIndex((key) => key.includes(token));
    if (idx >= 0) return keys[idx];
  }
  return null;
};

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
  const [showAddWidgetForm, setShowAddWidgetForm] = useState(false);
  const [addWidgetSaving, setAddWidgetSaving] = useState(false);
  const [addWidgetError, setAddWidgetError] = useState("");
  const [businessInsightsSpec, setBusinessInsightsSpec] = useState(null);
  const [businessInsightsLoading, setBusinessInsightsLoading] = useState(false);
  const [addWidgetForm, setAddWidgetForm] = useState({
    title: "",
    chart_type: "bar",
    x_field: "",
    y_field: "",
    secondary_y_field: "",
    color: "#1f3557",
    pattern: "solid",
    show_trend_line: false,
  });
  const dashboardRef = useRef(null);
  const widgetsOnlyRef = useRef(null);

  const selectedDataset = datasets.find((d) => d.id === selectedDatasetId);
  const reportSpec = selectedReport?.report_spec ?? EMPTY_REPORT_SPEC;
  const businessReportSpec = businessInsightsSpec?.report_spec ?? reportSpec;
  const overviewDateField = useMemo(() => {
    const rows = reportSpec?.aggregations?.[period] ?? EMPTY_ROWS;
    const sample = rows[0] || {};
    return (
      Object.keys(sample).find((key) => key.toLowerCase().includes("date")) ||
      selectedDataset?.profile?.datetime_columns?.[0] ||
      null
    );
  }, [reportSpec, period, selectedDataset]);
  const hasGeneratedDashboard = Boolean(selectedReport && reports.length);
  const userStoragePrefix = currentUser?.email ? `agentic:${currentUser.email}` : null;
  const selectedDatasetStorageKey = userStoragePrefix ? `${userStoragePrefix}:selectedDatasetId` : null;
  const selectedReportStorageKey = userStoragePrefix ? `${userStoragePrefix}:selectedReportId` : null;

  const periodData = useMemo(() => {
    const records = reportSpec?.aggregations?.[period] ?? EMPTY_ROWS;
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
    const records = reportSpec?.aggregations?.[comparePeriod] ?? EMPTY_ROWS;
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

  const analysisViews = useMemo(() => reportSpec?.analysis_views || {}, [reportSpec]);

  const businessAnalysisViews = useMemo(() => businessReportSpec?.analysis_views || {}, [businessReportSpec]);
  const businessPeriodRows = useMemo(
    () => businessReportSpec?.aggregations?.[period] || periodData,
    [businessReportSpec, period, periodData]
  );
  const businessCompareRows = useMemo(
    () => businessReportSpec?.aggregations?.[comparePeriod] || comparePeriodData,
    [businessReportSpec, comparePeriod, comparePeriodData]
  );

  const businessInsightCards = useMemo(() => {
    const cards = [];

    const timeRows = businessPeriodRows.length ? businessPeriodRows : businessCompareRows;
    const timeNumeric = getNumericKeys(timeRows);
    const timeKeys = Object.keys(timeRows[0] || {});
    const timeDateField = timeKeys.find((key) => isDateLikeField(key));
    const timeRevenueField = pickKeyByTokens(timeNumeric, ["total_revenue", "revenue", "sales", "gmv", "amount"]) || timeNumeric[0];
    const timeProfitField = pickKeyByTokens(timeNumeric, ["total_profit", "profit", "margin", "net"])
      || timeNumeric.find((key) => key !== timeRevenueField)
      || null;
    if (timeRows.length && timeDateField && timeRevenueField && timeProfitField && timeRevenueField !== timeProfitField) {
      cards.push({
        key: "revenue-profit-trend",
        title: "Revenue and Profit Trend Over Time",
        chart: {
          title: "Revenue and Profit Trend Over Time",
          chart_type: "line_compare",
          x_field: timeDateField,
          y_field: timeRevenueField,
          color: "#1f3557",
          config: {
            secondary_y_field: timeProfitField,
            data_source: "time_series",
          },
        },
        data: timeRows,
      });
    }

    const categoryRows = Array.isArray(businessAnalysisViews.category_profit) ? businessAnalysisViews.category_profit : [];
    const categoryFields = inferBusinessChartFields(categoryRows, { requireTwoNumeric: true });
    if (categoryRows.length && categoryFields.xField && categoryFields.yField && categoryFields.secondaryYField) {
      cards.push({
        key: "category-profit",
        title: "Profitability by Category",
        chart: {
          title: "Profitability by Category",
          chart_type: "grouped_bar",
          x_field: categoryFields.xField,
          y_field: categoryFields.yField,
          color: "#c76d4a",
          config: {
            secondary_y_field: categoryFields.secondaryYField,
            data_source: "category_profit",
          },
        },
        data: categoryRows,
      });
    }

    const channelRows = Array.isArray(businessAnalysisViews.channel_marketing_efficiency)
      ? businessAnalysisViews.channel_marketing_efficiency
      : [];
    if (channelRows.length) {
      const channelNumeric = getNumericKeys(channelRows);
      const channelDim = Object.keys(channelRows[0] || {}).find((key) => !channelNumeric.includes(key));
      const roiField = pickKeyByTokens(channelNumeric, ["roi_pct", "roi", "roas", "efficiency"]) || channelNumeric[0];
      const compareField = pickKeyByTokens(channelNumeric, ["total_revenue", "revenue", "sales", "profit", "orders_count"])
        || channelNumeric.find((key) => key !== roiField)
        || null;
      if (channelDim && roiField && compareField && roiField !== compareField) {
        cards.push({
          key: "marketing-efficiency",
          title: "Marketing Efficiency by Channel",
          chart: {
            title: "Marketing Efficiency by Channel",
            chart_type: "grouped_bar",
            x_field: channelDim,
            y_field: roiField,
            color: "#c76d4a",
            config: {
              secondary_y_field: compareField,
              data_source: "channel_marketing_efficiency",
            },
          },
          data: channelRows,
        });
      }
    }

    const segmentRows = Array.isArray(businessAnalysisViews.segment_channel_mix)
      ? businessAnalysisViews.segment_channel_mix
      : [];
    if (segmentRows.length) {
      const segmentNumeric = getNumericKeys(segmentRows);
      const segmentDim = pickKeyByTokens(Object.keys(segmentRows[0] || {}), ["segment", "customer_segment", "cohort"])
        || Object.keys(segmentRows[0] || {}).find((key) => !segmentNumeric.includes(key));
      if (segmentDim && segmentNumeric.length >= 2) {
        cards.push({
          key: "segment-channel-mix",
          title: "Customer Mix by Segment and Channel",
          chart: {
            title: "Customer Mix by Segment and Channel",
            chart_type: "stacked_bar",
            x_field: segmentDim,
            y_field: segmentNumeric[0],
            color: "#1f3557",
            config: {
              stack_fields: segmentNumeric,
              data_source: "segment_channel_mix",
            },
          },
          data: segmentRows,
        });
      }
    }

    const geoRows = Array.isArray(businessAnalysisViews.geography_performance)
      ? businessAnalysisViews.geography_performance
      : [];
    const geoFields = inferBusinessChartFields(geoRows, { requireTwoNumeric: true });
    if (geoRows.length && geoFields.xField && geoFields.yField && geoFields.secondaryYField) {
      cards.push({
        key: "geography-performance",
        title: "Geography Performance",
        chart: {
          title: "Geography Performance",
          chart_type: "grouped_bar",
          x_field: geoFields.xField,
          y_field: geoFields.yField,
          color: "#3f8f72",
          config: {
            secondary_y_field: geoFields.secondaryYField,
            data_source: "geography_performance",
          },
        },
        data: geoRows,
      });
    }

    const paymentRows = Array.isArray(businessAnalysisViews.payment_method_share)
      ? businessAnalysisViews.payment_method_share
      : [];
    const paymentFields = inferBusinessChartFields(paymentRows);
    if (paymentRows.length && paymentFields.xField && paymentFields.yField) {
      cards.push({
        key: "payment-share",
        title: "Payment Method Share",
        chart: {
          title: "Payment Method Share",
          chart_type: "pie",
          x_field: paymentFields.xField,
          y_field: paymentFields.yField,
          color: "#5f8df0",
          config: {
            data_source: "payment_method_share",
          },
        },
        data: paymentRows,
      });
    }

    return cards;
  }, [businessPeriodRows, businessCompareRows, businessAnalysisViews]);

  const statisticalInsightCards = useMemo(() => {
    const cards = [];
    const usedSignatures = new Set(
      businessInsightCards.map((card) =>
        [card.chart?.chart_type, card.chart?.x_field, card.chart?.y_field, card.chart?.config?.secondary_y_field || ""].join("|")
      )
    );

    const dataSources = [
      { key: "period", label: `${toTitleCase(period)} aggregation`, rows: businessPeriodRows },
      { key: "compare", label: `${toTitleCase(comparePeriod)} aggregation`, rows: businessCompareRows },
      ...Object.entries(businessAnalysisViews || {}).map(([key, rows]) => ({ key, label: toTitleCase(key), rows })),
    ].filter((source) => Array.isArray(source.rows) && source.rows.length);

    const addCard = (source, chart) => {
      const signature = [chart.chart_type, chart.x_field, chart.y_field, chart.config?.secondary_y_field || ""].join("|");
      if (usedSignatures.has(signature)) return;
      usedSignatures.add(signature);
      cards.push({
        key: `stat-${source.key}-${cards.length + 1}`,
        title: chart.title,
        chart,
        data: source.rows,
        inferred: true,
      });
    };

    dataSources.forEach((source) => {
      const sample = source.rows[0] || {};
      const keys = Object.keys(sample);
      if (!keys.length) return;

      const numericKeys = keys.filter((key) =>
        source.rows.some((row) => Number.isFinite(Number(row?.[key])))
      );
      const dateField = keys.find((key) => isDateLikeField(key));
      const dimensionField = dateField || keys.find((key) => !numericKeys.includes(key));

      if (dateField && numericKeys.length >= 2) {
        addCard(source, {
          title: `Inferred trend: ${toTitleCase(numericKeys[0])} vs ${toTitleCase(numericKeys[1])}`,
          chart_type: "dual_axis_combo",
          x_field: dateField,
          y_field: numericKeys[0],
          color: "#1f3557",
          config: { secondary_y_field: numericKeys[1], data_source: source.key },
        });
        return;
      }

      if (dimensionField && numericKeys.length >= 2) {
        addCard(source, {
          title: `Inferred comparison: ${toTitleCase(numericKeys[0])} vs ${toTitleCase(numericKeys[1])}`,
          chart_type: "grouped_bar",
          x_field: dimensionField,
          y_field: numericKeys[0],
          color: "#c76d4a",
          config: { secondary_y_field: numericKeys[1], data_source: source.key },
        });
        return;
      }

      if (dimensionField && numericKeys.length >= 1) {
        addCard(source, {
          title: `Inferred ranking: ${toTitleCase(numericKeys[0])} by ${toTitleCase(dimensionField)}`,
          chart_type: "horizontal_bar",
          x_field: dimensionField,
          y_field: numericKeys[0],
          color: "#5f8df0",
          config: { top_n: 10, sort_desc: true, data_source: source.key },
        });
      }
    });

    return cards.slice(0, 6);
  }, [businessInsightCards, businessPeriodRows, businessCompareRows, businessAnalysisViews, period, comparePeriod]);

  const allBusinessInsightCards = useMemo(
    () => [...businessInsightCards, ...statisticalInsightCards],
    [businessInsightCards, statisticalInsightCards]
  );

  const businessInsightSummary = useMemo(() => {
    const bullets = [];
    if (!allBusinessInsightCards.length) return bullets;

    const firstCard = allBusinessInsightCards[0];
    const firstRows = firstCard?.data || [];
    if (firstRows.length) {
      const xField = firstCard.chart?.x_field;
      const yField = firstCard.chart?.y_field;
      if (xField && yField) {
        const sorted = [...firstRows]
          .filter((row) => Number.isFinite(Number(row?.[yField])))
          .sort((a, b) => Number(b?.[yField] || 0) - Number(a?.[yField] || 0));
        if (sorted[0]) {
          bullets.push(`Highest contributor: ${String(sorted[0][xField] ?? "N/A")} (${yField}: ${formatValue(sorted[0][yField])})`);
        }
      }
    }

    const trendCard = allBusinessInsightCards.find((card) => isDateLikeField(card.chart?.x_field));
    if (trendCard?.data?.length >= 2) {
      const yField = trendCard.chart?.y_field;
      const values = trendCard.data
        .map((row) => Number(row?.[yField]))
        .filter((v) => Number.isFinite(v));
      if (values.length >= 2) {
        const delta = values[values.length - 1] - values[0];
        bullets.push(`Strongest trend: ${delta >= 0 ? "upward" : "downward"} ${toTitleCase(yField)} (${formatValue(delta)}) over selected period.`);

        let maxDrop = 0;
        for (let i = 1; i < values.length; i += 1) {
          maxDrop = Math.min(maxDrop, values[i] - values[i - 1]);
        }
        if (maxDrop < 0) {
          bullets.push(`Biggest drop observed: ${formatValue(maxDrop)} in ${toTitleCase(yField)} between consecutive periods.`);
        }
      }
    }

    const segmentCard = allBusinessInsightCards.find((card) => /segment/i.test(String(card.chart?.x_field || "")));
    if (segmentCard?.data?.length) {
      const xField = segmentCard.chart?.x_field;
      const yField = segmentCard.chart?.y_field;
      const top = [...segmentCard.data]
        .filter((row) => Number.isFinite(Number(row?.[yField])))
        .sort((a, b) => Number(b?.[yField] || 0) - Number(a?.[yField] || 0))[0];
      if (top) bullets.push(`Top contributing segment: ${String(top[xField] ?? "N/A")} (${formatValue(top[yField])}).`);
    }

    const geoCard = allBusinessInsightCards.find((card) => /(channel|region|country)/i.test(String(card.chart?.x_field || "")));
    if (geoCard?.data?.length) {
      const xField = geoCard.chart?.x_field;
      const yField = geoCard.chart?.y_field;
      const best = [...geoCard.data]
        .filter((row) => Number.isFinite(Number(row?.[yField])))
        .sort((a, b) => Number(b?.[yField] || 0) - Number(a?.[yField] || 0))[0];
      if (best) bullets.push(`Best performing ${toTitleCase(xField)}: ${String(best[xField] ?? "N/A")} (${formatValue(best[yField])}).`);
    }

    return bullets.slice(0, 5);
  }, [allBusinessInsightCards]);

  const aiInsightSummaryLines = useMemo(() => {
    const summaryText = String(
      businessReportSpec?.ai_summary?.text || reportSpec?.ai_summary?.text || ""
    ).trim();

    if (summaryText) {
      return summaryText
        .split(/\r?\n/)
        .map((line) => line.replace(/^[-*\u2022]\s*/, "").trim())
        .filter(Boolean)
        .slice(0, 6);
    }

    return businessInsightSummary;
  }, [businessReportSpec, reportSpec, businessInsightSummary]);

  const widgetDataById = useMemo(() => {
    const resolveRows = (widget, compare = false) => {
      const source = widget?.config?.data_source;
      if (source && source !== "time_series") {
        const rows = analysisViews[source];
        if (Array.isArray(rows)) return rows;
      }
      return compare ? comparePeriodData : periodData;
    };

    const map = new Map();
    widgets.forEach((widget) => {
      map.set(widget.id, {
        current: resolveRows(widget, false),
        compare: resolveRows(widget, true),
      });
    });
    return map;
  }, [widgets, analysisViews, periodData, comparePeriodData]);

  const availableWidgetFields = useMemo(() => {
    const profileCols = selectedDataset?.profile?.columns || [];
    const periodCols = periodData.length ? Object.keys(periodData[0] || {}) : [];
    const compareCols = comparePeriodData.length ? Object.keys(comparePeriodData[0] || {}) : [];
    const analysisCols = Object.values(analysisViews || {})
      .filter((rows) => Array.isArray(rows) && rows.length)
      .flatMap((rows) => Object.keys(rows[0] || {}));
    return new Set([...profileCols, ...periodCols, ...compareCols, ...analysisCols]);
  }, [selectedDataset, periodData, comparePeriodData, analysisViews]);

  const normalizedWidgets = useMemo(() => {
    const available = Array.from(availableWidgetFields);
    return widgets.map((widget) => {
      let nextWidget = widget;

      if (widget?.chart_type === "kpi") {
        const resolved = resolveKpiFieldFromTitle(widget.title, available);
        if (resolved && resolved !== widget.y_field) {
          nextWidget = { ...nextWidget, y_field: resolved };
        }
      }

      const title = buildWidgetTitle(nextWidget);
      if (title && title !== nextWidget.title) {
        nextWidget = { ...nextWidget, title };
      }

      return nextWidget;
    });
  }, [widgets, availableWidgetFields]);

  const visibleWidgets = useMemo(() => {
    const widgetHasRequiredFields = (widget) => {
      if (!isPresent(widget?.title) || !isPresent(widget?.chart_type)) return false;

      const needsXY = CHARTS_REQUIRING_XY.has(widget.chart_type);
      const needsYOnly = widget.chart_type === "kpi";

      if (needsXY) {
        if (!isPresent(widget.x_field) || !isPresent(widget.y_field)) return false;
        if (!availableWidgetFields.has(widget.x_field) || !availableWidgetFields.has(widget.y_field)) return false;
      }

      if (needsYOnly) {
        if (!isPresent(widget.y_field)) return false;
        if (!availableWidgetFields.has(widget.y_field)) return false;
      }

      if (widget.chart_type === "dual_axis_combo" || widget.chart_type === "grouped_bar" || widget.chart_type === "line_compare") {
        const secondaryField = widget?.config?.secondary_y_field;
        if (!isPresent(secondaryField) || !availableWidgetFields.has(secondaryField)) return false;
      }

      return true;
    };

    const widgetHasData = (widget) => {
      const source = widget?.config?.data_source;
      const sourceRows = source && source !== "time_series" && Array.isArray(analysisViews[source]) ? analysisViews[source] : null;
      const hasRows = (rows) => {
        if (!Array.isArray(rows) || !rows.length) return false;

        const mappedDataExists = rows.some((row) => {
          if (!row || typeof row !== "object") return false;
          const yOk = !isPresent(widget.y_field) || isPresent(row[widget.y_field]);
          const xOk = !isPresent(widget.x_field) || isPresent(row[widget.x_field]);
          return xOk && yOk;
        });

        if (mappedDataExists) return true;

        // Keep widget visible when selected fields are valid dataset/report fields,
        // even if a specific aggregation view doesn't include mapped values yet.
        const knownX = !isPresent(widget.x_field) || availableWidgetFields.has(widget.x_field);
        const knownY = !isPresent(widget.y_field) || availableWidgetFields.has(widget.y_field);
        return knownX && knownY;
      };

      if (sourceRows) {
        return hasRows(sourceRows);
      }

      return hasRows(periodData) || hasRows(comparePeriodData);
    };

    return normalizedWidgets.filter((widget) => widgetHasRequiredFields(widget) && widgetHasData(widget));
  }, [normalizedWidgets, availableWidgetFields, periodData, comparePeriodData, analysisViews]);

  const selectedWidgets = useMemo(
    () => visibleWidgets.filter((w) => selectedWidgetIds.includes(w.id)),
    [visibleWidgets, selectedWidgetIds]
  );

  const availableWidgetFieldList = useMemo(() => Array.from(availableWidgetFields), [availableWidgetFields]);
  const profileNumericFields = useMemo(() => selectedDataset?.profile?.numeric_columns || [], [selectedDataset]);
  const profileDateFields = useMemo(() => selectedDataset?.profile?.datetime_columns || [], [selectedDataset]);
  const profileCategoricalFields = useMemo(() => selectedDataset?.profile?.categorical_columns || [], [selectedDataset]);
  const uniqueFields = (items) => Array.from(new Set((items || []).filter((v) => typeof v === "string" && v.trim())));

  const chartDataFieldList = useMemo(() => {
    const keys = new Set();
    [...periodData, ...comparePeriodData].forEach((row) => {
      if (!row || typeof row !== "object") return;
      Object.keys(row).forEach((key) => keys.add(key));
    });
    return Array.from(keys);
  }, [periodData, comparePeriodData]);

  const numericWidgetFields = useMemo(() => {
    const rows = [...periodData, ...comparePeriodData];
    return chartDataFieldList.filter((field) =>
      rows.some((row) => Number.isFinite(Number(row?.[field])))
    );
  }, [chartDataFieldList, periodData, comparePeriodData]);

  const addFormSupportsTrend =
    addWidgetForm.chart_type === "line" || addWidgetForm.chart_type === "bar" || addWidgetForm.chart_type === "scatter";
  const addFormSupportsX = addWidgetForm.chart_type !== "kpi";
  const addFormNeedsSecondary = addWidgetForm.chart_type === "dual_axis_combo" || addWidgetForm.chart_type === "grouped_bar" || addWidgetForm.chart_type === "line_compare";
  const addFormXFieldOptions = addWidgetForm.chart_type === "scatter"
    ? uniqueFields([...numericWidgetFields, ...profileNumericFields])
    : uniqueFields([...profileDateFields, ...profileCategoricalFields, ...chartDataFieldList, ...availableWidgetFieldList]);
  const addFormYFieldOptions = uniqueFields([...numericWidgetFields, ...profileNumericFields]);
  const addFormSecondaryYOptions = addFormYFieldOptions.filter((field) => field !== addWidgetForm.y_field);

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
    // Try to refresh token on app startup if user was previously logged in
    if (authorized) {
      refreshToken()
        .then((success) => {
          if (!success) {
            // Token refresh failed, clear auth
            clearAuth();
            setAuthorized(false);
          }
        })
        .catch(() => {
          clearAuth();
          setAuthorized(false);
        });
    }
  }, []);

  useEffect(() => {
    // Set up activity tracking listeners when authorized
    if (!authorized) return;

    const handleActivity = () => {
      updateActivityTime();
    };

    // Track user interactions
    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("keypress", handleActivity);
    window.addEventListener("click", handleActivity);
    window.addEventListener("scroll", handleActivity);
    window.addEventListener("touchstart", handleActivity);

    return () => {
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("keypress", handleActivity);
      window.removeEventListener("click", handleActivity);
      window.removeEventListener("scroll", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
    };
  }, [authorized]);

  useEffect(() => {
    // Check for idle timeout every 1 minute
    if (!authorized) return;

    const idleCheckInterval = setInterval(() => {
      if (isUserIdle()) {
        // User is idle, logout
        clearAuth();
        setAuthorized(false);
        setError("Session expired due to inactivity");
      }
    }, 60 * 1000); // Check every minute

    return () => clearInterval(idleCheckInterval);
  }, [authorized]);

  useEffect(() => {
    // Auto-refresh token every 10 minutes if user is active
    if (!authorized) return;

    const tokenRefreshInterval = setInterval(() => {
      autoRefreshTokenIfActive().catch(() => {
        // Token refresh failed, logout
        clearAuth();
        setAuthorized(false);
      });
    }, 10 * 60 * 1000); // Refresh token every 10 minutes

    return () => clearInterval(tokenRefreshInterval);
  }, [authorized]);

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
    refresh().catch((err) => {
      const detail = err?.response?.data?.detail;
      setError(detail ? `Failed to fetch datasets: ${detail}` : "Failed to fetch datasets.");
    });
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
        const selected = rep[0];
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
    if (!selectedReport?.id) {
      setBusinessInsightsSpec(null);
      return;
    }

    let cancelled = false;
    setBusinessInsightsLoading(true);
    getBusinessInsights(selectedReport.id)
      .then((result) => {
        if (!cancelled) setBusinessInsightsSpec(result);
      })
      .catch(() => {
        if (!cancelled) setBusinessInsightsSpec(null);
      })
      .finally(() => {
        if (!cancelled) setBusinessInsightsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedReport?.id]);

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
    const currentIds = visibleWidgets.map((w) => w.id);
    if (!currentIds.length) {
      setSelectedWidgetIds([]);
      return;
    }

    setSelectedWidgetIds((prev) => {
      if (!prev.length) return currentIds;
      const kept = prev.filter((id) => currentIds.includes(id));
      return kept.length ? kept : currentIds;
    });
  }, [visibleWidgets]);

  useEffect(() => {
    if (activeTab !== "overview") {
      return;
    }

    const reportId = selectedReport?.id;
    if (!reportId || !periodData.length) {
      setKpiCards((prev) => (prev.length ? [] : prev));
      setKpiMeta((prev) => (prev ? null : prev));
      setKpiLoading(false);
      return;
    }

    let cancelled = false;
    setKpiLoading(true);
    getReportKpis(reportId, periodData)
      .then((result) => {
        if (cancelled) return;
        setKpiCards(result?.cards || []);
        setKpiMeta(result || null);
      })
      .catch(() => {
        if (cancelled) return;
        setKpiCards((prev) => (prev.length ? [] : prev));
        setKpiMeta((prev) => (prev ? null : prev));
      })
      .finally(() => {
        if (!cancelled) setKpiLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, selectedReport?.id, periodData]);

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
      const usedKpiYFields = new Set();

      for (let i = 0; i < suggestions.length; i += 1) {
        const s = suggestions[i];
        if (!s?.chart_type) continue;

        let chartType = s.chart_type;
        let xField = s.x_field;
        let yField = s.y_field;
        const widgetConfig = { ...(s.config || {}) };

        const usesAnalysisView = Boolean(widgetConfig.data_source && widgetConfig.data_source !== "time_series");

        if (chartType !== "kpi") {
          if (!xField || (!usesAnalysisView && !availableKeys.includes(xField))) {
            xField = preferredX;
          }
          if (!yField || (!usesAnalysisView && !availableKeys.includes(yField))) {
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
          const titleResolved = resolveKpiFieldFromTitle(s.title, availableKeys);
          if (titleResolved) {
            yField = titleResolved;
          }

          if (!yField || !availableKeys.includes(yField)) {
            const nextFreeMetric = numericKeys.find((key) => !usedKpiYFields.has(key));
            yField = nextFreeMetric || preferredY;
          }

          if (yField) {
            usedKpiYFields.add(yField);
          }
        }

        if (chartType === "dual_axis_combo" || chartType === "grouped_bar" || chartType === "line_compare") {
          const secondary = widgetConfig.secondary_y_field;
          if (!secondary || (!usesAnalysisView && !availableKeys.includes(secondary))) {
            const fallbackSecondary = numericKeys.find((key) => key !== yField) || null;
            widgetConfig.secondary_y_field = fallbackSecondary;
          }
          if (!widgetConfig.secondary_y_field) continue;
        }

        if (chartType === "horizontal_bar") {
          if (!widgetConfig.top_n) widgetConfig.top_n = 10;
          if (typeof widgetConfig.sort_desc !== "boolean") widgetConfig.sort_desc = true;
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
          config: { ...widgetConfig, reason: s.reason, confidence: s.confidence },
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

  const handleAddWidget = async () => {
    if (!selectedReport?.id) {
      setAddWidgetError("Select a report before adding a widget.");
      return;
    }

    const chartType = addWidgetForm.chart_type;
    const requiresXY = chartType !== "kpi";

    if (requiresXY) {
      if (!addWidgetForm.x_field || !addFormXFieldOptions.includes(addWidgetForm.x_field)) {
        setAddWidgetError("Select a valid X field.");
        return;
      }
      if (!addWidgetForm.y_field || !addFormYFieldOptions.includes(addWidgetForm.y_field)) {
        setAddWidgetError("Select a valid numeric Y field.");
        return;
      }
    } else if (!addWidgetForm.y_field || !addFormYFieldOptions.includes(addWidgetForm.y_field)) {
      setAddWidgetError("Select a valid numeric Y field for KPI.");
      return;
    }

    if (addFormNeedsSecondary) {
      if (!addWidgetForm.secondary_y_field || !addFormSecondaryYOptions.includes(addWidgetForm.secondary_y_field)) {
        setAddWidgetError("Select a valid secondary numeric field.");
        return;
      }
    }

    setAddWidgetError("");
    setAddWidgetSaving(true);
    try {
      const payload = {
        report_id: selectedReport.id,
        title: addWidgetForm.title?.trim() || buildWidgetTitle(addWidgetForm),
        chart_type: chartType,
        x_field: requiresXY ? addWidgetForm.x_field : null,
        y_field: addWidgetForm.y_field,
        color: addWidgetForm.color,
        pattern: addWidgetForm.pattern,
        position: widgets.length,
        config: {
          show_trend_line: addFormSupportsTrend ? Boolean(addWidgetForm.show_trend_line) : false,
          ...(addFormNeedsSecondary ? { secondary_y_field: addWidgetForm.secondary_y_field } : {}),
          ...(chartType === "dual_axis_combo" ? { data_source: "time_series" } : {}),
          ...(chartType === "line_compare" ? { data_source: "time_series" } : {}),
          ...(chartType === "grouped_bar" ? { data_source: "category_profit" } : {}),
          ...(chartType === "horizontal_bar" ? { data_source: "sku_sales_top10" } : {}),
          ...(chartType === "horizontal_bar" ? { top_n: 10, sort_desc: true } : {}),
        },
      };
      await createWidget(payload);
      await refreshWidgets();
      setShowAddWidgetForm(false);
      setAddWidgetForm({
        title: "",
        chart_type: "bar",
        x_field: "",
        y_field: "",
        secondary_y_field: "",
        color: "#1f3557",
        pattern: "solid",
        show_trend_line: false,
      });
    } catch (e) {
      setAddWidgetError(e?.response?.data?.detail || "Failed to add widget.");
    } finally {
      setAddWidgetSaving(false);
    }
  };

  const exportElementToPdf = async (element, title, filename) => {
    if (!element || !selectedDataset) return;
    setBusy(true);
    setError("");
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
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
    const allIds = visibleWidgets.map((w) => w.id);
    if (selectedWidgetIds.length === allIds.length) {
      setSelectedWidgetIds([]);
    } else {
      setSelectedWidgetIds(allIds);
    }
  };

  const allWidgetsSelected = visibleWidgets.length > 0 && selectedWidgetIds.length === visibleWidgets.length;

  const handleChartPointClick = async (widget, row, sourceData, sourcePeriodLabel, clickMeta) => {
    const drilldownDatasetId = selectedReport?.dataset_id ?? selectedDatasetId;
    if (!row || !widget || !drilldownDatasetId) return;
    const xField = widget.x_field;
    const selectedXValue = xField ? row[xField] : null;
    if (selectedXValue === null || selectedXValue === undefined || selectedXValue === "") return;

    setDrillDownLoading(true);
    setError("");
    try {
      const result = await getDatasetRecords(drilldownDatasetId, {
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
      const status = e?.response?.status;
      if (status !== 404) {
        setError(e?.response?.data?.detail || "Unable to load drill-down records.");
      }
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
    const ranked = [...visibleWidgets].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const chartWidgets = ranked.filter((w) => w.chart_type !== "kpi");
    return (chartWidgets.length ? chartWidgets : ranked).slice(0, 3);
  }, [visibleWidgets]);

  const computedOverviewKpis = useMemo(() => {
    if (!periodData.length) return [];

    const toNumber = (value) => {
      if (typeof value === "number") return Number.isFinite(value) ? value : null;
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const normalized = trimmed
          .replace(/^\((.*)\)$/, "-$1")
          .replaceAll(",", "")
          .replace(/[^0-9.-]/g, "");
        const cleaned = normalized.replace(/(?!^)-/g, "");
        if (!cleaned) return null;
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };

    const sample = periodData[0] || {};
    const numericCols = Object.keys(sample).filter((key) =>
      periodData.some((row) => toNumber(row[key]) !== null)
    );

    const pickCol = (keywords) =>
      keywords.map((k) => k.toLowerCase()).reduce((found, key) => {
        if (found) return found;
        return numericCols.find((c) => c.toLowerCase().includes(key)) || null;
      }, null);

    const sumCol = (col) => {
      if (!col) return 0;
      return periodData.reduce((total, row) => {
        const value = toNumber(row[col]);
        return total + (value ?? 0);
      }, 0);
    };

    const fmt = (value, pct = false) => (pct ? `${value.toFixed(2)}%` : value.toLocaleString(undefined, { maximumFractionDigits: 2 }));

    const revenueCol =
      pickCol(["revenue", "sales", "amount", "total", "gmv", "value", "subtotal", "net", "gross", "income", "price"]) ||
      numericCols.find((col) => !/[\s_-]?id$/i.test(col) && !/count|qty|quantity/i.test(col)) ||
      null;
    const purchasesCol = pickCol(["purchase", "order", "qty", "quantity", "count"]);
    const purchasersCol = pickCol(["purchaser", "customer", "user", "buyer"]);
    const firstTimeCol = pickCol(["first", "new", "initial"]);

    const revenue = sumCol(revenueCol);
    let purchases = sumCol(purchasesCol);
    let purchasers = sumCol(purchasersCol);
    let firstTime = sumCol(firstTimeCol);

    if (purchasers <= 0) purchasers = purchases > 0 ? purchases : periodData.length;
    if (purchases <= 0) purchases = Math.max(purchasers * 1.2, periodData.length);
    if (firstTime <= 0) firstTime = Math.max(0, Math.min(purchasers, purchases > 0 ? purchases * 0.2 : 0));
    if (firstTime <= 0) firstTime = Math.max(1, purchasers * 0.1);

    const purchaserRate = purchases > 0 ? (purchasers / purchases) * 100 : 0;
    const avgRevenuePerUser = purchasers > 0 ? revenue / purchasers : 0;

    return [
      { key: "purchase_revenue", label: "Purchase revenue", value: fmt(revenue) },
      { key: "ecommerce_purchases", label: "Ecommerce purchases", value: fmt(purchases) },
      { key: "purchaser_rate", label: "Purchaser rate", value: fmt(purchaserRate, true) },
      { key: "first_time_purchasers", label: "First time purchasers", value: fmt(firstTime) },
      { key: "total_purchasers", label: "Total purchasers", value: fmt(purchasers) },
      { key: "avg_purchase_revenue_per_user", label: "Avg purchase revenue per user", value: fmt(avgRevenuePerUser) },
    ];
  }, [periodData]);

  const overviewKpiCards = useMemo(() => {
    const apiCards = Array.isArray(kpiCards) ? kpiCards : [];
    if (!computedOverviewKpis.length) {
      const seen = new Set();
      return apiCards.filter((card) => {
        const key = card?.key || String(card?.label || "").toLowerCase().replace(/\s+/g, "_");
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    const apiByKey = new Map(
      apiCards.map((card) => [card?.key || String(card?.label || "").toLowerCase().replace(/\s+/g, "_"), card])
    );

    const parseCardValue = (value) => {
      if (typeof value === "number") return Number.isFinite(value) ? value : null;
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const normalized = trimmed
          .replace(/^\((.*)\)$/, "-$1")
          .replaceAll(",", "")
          .replace(/[^0-9.-]/g, "");
        const cleaned = normalized.replace(/(?!^)-/g, "");
        if (!cleaned) return null;
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };

    const merged = computedOverviewKpis.map((fallbackCard) => {
      const fromApi = apiByKey.get(fallbackCard.key);
      if (!fromApi || !fromApi.value) return fallbackCard;
      const apiNum = parseCardValue(fromApi.value);
      const fallbackNum = parseCardValue(fallbackCard.value);
      if (apiNum !== null && fallbackNum !== null && apiNum === 0 && fallbackNum > 0) {
        return fallbackCard;
      }
      return fromApi;
    });

    const knownKeys = new Set(merged.map((card) => card.key));
    const extras = apiCards.filter((card) => card?.key && !knownKeys.has(card.key));

    const deduped = [];
    const seenCardIds = new Set();
    for (const card of [...merged, ...extras]) {
      const normalizedKey = card?.key || String(card?.label || "").toLowerCase().replace(/\s+/g, "_");
      const normalizedLabel = String(card?.label || "").trim().toLowerCase();
      const dedupeId = normalizedKey || normalizedLabel;
      if (!dedupeId || seenCardIds.has(dedupeId)) continue;
      seenCardIds.add(dedupeId);
      deduped.push(card);
    }

    return deduped;
  }, [kpiCards, computedOverviewKpis]);

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
      <main className="app-shell login-shell">
        <section className="login-unified-panel">
          <div className="login-layout">
            <article className="login-brand-panel">
              <div className="login-brand-copy">
                <h1>Agentic AI Data Visualization</h1>
                <p className="login-subtitle">Make business data readable in minutes.</p>
              </div>
              <div className="login-image-frame" role="img" aria-label="Analytics dashboard preview" />
            </article>

            <section className="login-auth-panel-wrap">
              <AuthPanel
                onLoggedIn={() => {
                  setError("");
                  setAuthorized(true);
                }}
                onRegistered={(message) => setWelcomeMessage(message)}
              />
            </section>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="hero-top-row">
        <header className="hero">
          <h2 className="hero-title">Agentic AI Data Visualization</h2>
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
              clearAuth();
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
          <button className={activeTab === "business_insights" ? "tab-button active" : "tab-button"} disabled={!hasGeneratedDashboard} onClick={() => setActiveTab("business_insights")}>Business Insights</button>
        </div>

        {activeTab === "upload" && (
          <section className="grid two-col upload-tab-panel">
            <UploadZone
              onUpload={handleUpload}
              onGenerateReport={createAutoReport}
              generateReportDisabled={!selectedDatasetId || busy}
            />
            {selectedDataset && (
              <section className="card empty-dashboard-state">
                <h3>{`Data Quality - ${selectedDataset.name}`}</h3>
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
              </section>
            )}
          </section>
        )}

        {activeTab === "overview" && (
          <section className="card overview-tab">
            <section className="kpi-strip-card">
              {kpiLoading ? (
                <p className="muted">Loading KPI cards...</p>
              ) : overviewKpiCards.length ? (
                <div className="kpi-strip-grid">
                  {overviewKpiCards.map((card) => (
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
                        <Suspense fallback={<p className="muted">Loading chart...</p>}>
                          <ChartRenderer widget={widget} data={widgetDataById.get(widget.id)?.current || periodData} />
                        </Suspense>
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
                  <label htmlFor="overview-start-date" className="overview-filter-compact-field">
                    <span>Start</span>
                    <input
                      id="overview-start-date"
                      name="start_date"
                      type="date"
                      autocomplete="off"
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
                  <label htmlFor="overview-end-date" className="overview-filter-compact-field">
                    <span>End</span>
                    <input
                      id="overview-end-date"
                      name="end_date"
                      type="date"
                      autocomplete="off"
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

                  <label htmlFor="reporting-period">
                    Reporting period
                    <select id="reporting-period" name="period" autocomplete="off" value={period} onChange={(e) => setPeriod(e.target.value)}>
                      {PERIODS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label htmlFor="compare-period">
                    Compare with
                    <select id="compare-period" name="compare_period" autocomplete="off" value={comparePeriod} onChange={(e) => setComparePeriod(e.target.value)}>
                      {PERIODS.filter((p) => p !== period).map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

              </section>

              <section className="card ai-insight-panel anomaly-compact-panel">
                <h3>Anomaly Detection</h3>
                {overviewDateBounds && (
                  <div className="analytics-date-group anomaly-date-group">
                    <label className="analytics-date-control analytics-date-start">
                      <input
                        aria-label="Start date"
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
                      <input
                        aria-label="End date"
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
                {overviewAnomalies.length ? (
                  <ul className="ai-insight-list anomaly-compact-list">
                    {overviewAnomalies.slice(0, 8).map((item) => (
                      <li key={`anom-compact-${item.index}`}>
                        {`${item.row?.[overviewDateField] ?? "No date"} | `}
                        {`${overviewAnomalyField} ${formatValue(item.value)} | `}
                        {`${item.zScore >= 0 ? "+" : ""}${item.zScore.toFixed(2)}\u03c3 | `}
                        {getAnomalySeverity(item.zScore)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No significant anomalies in the current filtered period.</p>
                )}
              </section>
            </div>

            <section className="card">
              <h3>Dynamic Widgets</h3>
              <div className="selection-toolbar">
                <p className="muted selection-toolbar-text">
                  Widgets are generated by the visualization agent. You can customize chart type, colors, patterns,
                  and fields.
                </p>
                <div className="selection-actions">
                  <button
                    className="ghost"
                    type="button"
                    disabled={!selectedReport || !availableWidgetFieldList.length || addWidgetSaving}
                    onClick={() => {
                      setAddWidgetError("");
                      setShowAddWidgetForm((prev) => !prev);
                    }}
                  >
                    {showAddWidgetForm ? "Cancel Add Widget" : "Add Widget"}
                  </button>
                  <button className="ghost" type="button" onClick={toggleAllWidgets}>
                    {allWidgetsSelected ? "Deselect All" : "Select All"}
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
              {showAddWidgetForm && (
                <div className="add-widget-panel">
                  <input
                    id="add-widget-title"
                    name="title"
                    placeholder="Widget title (optional)"
                    autoComplete="off"
                    value={addWidgetForm.title}
                    onChange={(e) => setAddWidgetForm((prev) => ({ ...prev, title: e.target.value }))}
                  />
                  <select
                    id="add-widget-chart-type"
                    name="chart_type"
                    autoComplete="off"
                    value={addWidgetForm.chart_type}
                    onChange={(e) => {
                      const nextType = e.target.value;
                      const nextSupportsTrend = nextType === "line" || nextType === "bar" || nextType === "scatter";
                      const nextSupportsX = nextType !== "kpi";
                      setAddWidgetForm((prev) => ({
                        ...prev,
                        chart_type: nextType,
                        x_field: nextSupportsX ? prev.x_field : "",
                        secondary_y_field:
                          nextType === "dual_axis_combo" || nextType === "grouped_bar" || nextType === "line_compare"
                            ? prev.secondary_y_field
                            : "",
                        show_trend_line: nextSupportsTrend ? prev.show_trend_line : false,
                      }));
                    }}
                  >
                    {WIDGET_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  <select
                    id="add-widget-x-field"
                    name="x_field"
                    autoComplete="off"
                    value={addWidgetForm.x_field}
                    disabled={!addFormSupportsX}
                    onChange={(e) => setAddWidgetForm((prev) => ({ ...prev, x_field: e.target.value }))}
                  >
                    <option value="">{addFormSupportsX ? "Select x field" : "No x field for KPI"}</option>
                    {addFormXFieldOptions.map((field) => (
                      <option key={`add-x-${field}`} value={field}>
                        {field}
                      </option>
                    ))}
                  </select>
                  <select
                    id="add-widget-y-field"
                    name="y_field"
                    autoComplete="off"
                    value={addWidgetForm.y_field}
                    onChange={(e) => setAddWidgetForm((prev) => ({ ...prev, y_field: e.target.value }))}
                  >
                    <option value="">Select numeric y field</option>
                    {addFormYFieldOptions.map((field) => (
                      <option key={`add-y-${field}`} value={field}>
                        {field}
                      </option>
                    ))}
                  </select>
                  {addFormNeedsSecondary && (
                    <select
                      id="add-widget-secondary-y-field"
                      name="secondary_y_field"
                      autoComplete="off"
                      value={addWidgetForm.secondary_y_field}
                      onChange={(e) => setAddWidgetForm((prev) => ({ ...prev, secondary_y_field: e.target.value }))}
                    >
                      <option value="">Select secondary numeric field</option>
                      {addFormSecondaryYOptions.map((field) => (
                        <option key={`add-secondary-y-${field}`} value={field}>
                          {field}
                        </option>
                      ))}
                    </select>
                  )}
                  {addWidgetError && <p className="error">{addWidgetError}</p>}
                  <button type="button" onClick={handleAddWidget} disabled={addWidgetSaving}>
                    {addWidgetSaving ? "Adding..." : "Create Widget"}
                  </button>
                </div>
              )}
              <div className="widget-grid">
                {visibleWidgets.map((w) => (
                  <WidgetCard
                    key={w.id}
                    widget={w}
                    periodData={widgetDataById.get(w.id)?.current || periodData}
                    comparisonData={widgetDataById.get(w.id)?.compare || comparePeriodData}
                    currentPeriodLabel={period}
                    comparisonPeriodLabel={comparePeriod}
                    columns={selectedDataset?.profile?.columns || []}
                    profile={selectedDataset?.profile || {}}
                    onUpdated={refreshWidgets}
                    isSelected={selectedWidgetIds.includes(w.id)}
                    onToggleSelect={toggleWidgetSelection}
                    onDataPointClick={handleChartPointClick}
                  />
                ))}
              </div>
              {!visibleWidgets.length && <p className="muted">No valid widgets available for this report yet.</p>}
            </section>


          </>
        )}

        {activeTab === "business_insights" && (
          <section className="card business-insights-tab">
            <div className="business-insights-head">
              <div>
                <h3>Business Insights</h3>
              </div>
            </div>

            {!!businessInsightSummary.length && (
              <section className="business-insight-summary-compact" aria-label="AI Insight Summary">
                <h4>AI Insight Summary</h4>
                <ul className="business-insight-strip" title="AI Insight Summary">
                  {businessInsightSummary.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>
            )}

            <div className="business-insights-grid">
              {businessInsightsLoading ? (
                <p className="muted">Loading business insights...</p>
              ) : allBusinessInsightCards.length ? (
                allBusinessInsightCards.map((card) => (
                  <article className="business-insight-card" key={card.key}>
                    <h4>{card.title}</h4>
                    {card.inferred && <p className="muted">Statistically inferred from available columns</p>}
                    <Suspense fallback={<p className="muted">Loading chart...</p>}>
                      <ChartRenderer
                        widget={card.chart}
                        data={card.data}
                        onDataPointClick={(row, clickMeta) =>
                          handleChartPointClick(card.chart, row, card.data, period, clickMeta)
                        }
                      />
                    </Suspense>
                  </article>
                ))
              ) : (
                <p className="muted">No insights could be inferred for the current dataset. Regenerate the report and ensure at least one numeric column and one date/category-like column are available.</p>
              )}
            </div>
          </section>
        )}
      </section>

      <section className="pdf-capture-surface" ref={widgetsOnlyRef}>
        <h3>Selected Report Widgets</h3>
        <p>Dataset: {selectedDataset?.name || "N/A"}</p>
        <div className="widget-grid">
          {selectedWidgets.map((w) => (
            <article key={`export-${w.id}`} className="card export-widget-card">
              <h4>{w.title}</h4>
              <Suspense fallback={<p className="muted">Loading chart...</p>}>
                <ChartRenderer widget={w} data={widgetDataById.get(w.id)?.current || periodData} />
              </Suspense>
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
