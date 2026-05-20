const METRIC_COLUMNS = [
  { key: "amountSpend", label: "Amount Spend", type: "currency" },
  { key: "clicks", label: "Number of Clicks", type: "number" },
  { key: "totalUsers", label: "Total Users", type: "number" },
  { key: "newUsers", label: "New Users", type: "number" },
  { key: "revenue", label: "Revenue", type: "currency" },
  { key: "orders", label: "Orders", type: "number" },
  { key: "newMetric", label: "New", type: "number" },
  { key: "costPerOrder", label: "Cost per Order", type: "currency" },
  { key: "conversionRate", label: "Conversion Rate", type: "percent" },
  { key: "avgOrderValue", label: "Avg Order Value", type: "currency" },
  { key: "revenuePerUser", label: "Revenue per User", type: "currency" },
  { key: "returningUserRate", label: "Returning User Rate", type: "percent" },
  { key: "customerAcquisitionCost", label: "Customer Acquisition Cost", type: "currency" },
  { key: "grossMargin", label: "Gross margin", type: "currency" },
  { key: "netProfit", label: "Net profit", type: "currency" },
  { key: "refundRate", label: "Refund rate", type: "percent" },
  { key: "cartAbandonmentRate", label: "Cart abandonment rate", type: "percent" },
  { key: "promotionRoi", label: "Promotion ROI", type: "percent" },
];

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function findFieldByKeywords(keys, keywordGroups) {
  const normalized = keys.map((key) => ({ key, normalized: normalizeKey(key) }));
  for (const group of keywordGroups) {
    const wanted = group.map((token) => normalizeKey(token));
    const match = normalized.find((item) => wanted.some((token) => item.normalized.includes(token)));
    if (match) return match.key;
  }
  return null;
}

function getWeekStartMonday(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = copy.getDate() - day + (day === 0 ? -6 : 1);
  copy.setDate(diff);
  return copy;
}

function formatMetric(value, type) {
  const numeric = toNumber(value);
  if (type === "currency") {
    return `$${numeric.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
  if (type === "percent") {
    return `${numeric.toFixed(2)}%`;
  }
  return numeric.toLocaleString();
}

function aggregateWeekly(rows, dateField) {
  if (!rows?.length) return [];
  const sample = rows[0] || {};
  const keys = Object.keys(sample);

  const mapped = {
    amountSpend: findFieldByKeywords(keys, [["amount_spend"], ["spend"], ["ad_spend"], ["marketing_cost"], ["cost"]]),
    clicks: findFieldByKeywords(keys, [["clicks"], ["click"], ["visits"], ["sessions"]]),
    totalUsers: findFieldByKeywords(keys, [["total_users"], ["users"], ["customers"], ["audience"]]),
    newUsers: findFieldByKeywords(keys, [["new_users"], ["newcustomers"], ["signups"], ["registrations"]]),
    revenue: findFieldByKeywords(keys, [["revenue"], ["sales"], ["gmv"], ["turnover"]]),
    orders: findFieldByKeywords(keys, [["orders"], ["order_count"], ["transactions"], ["purchases"]]),
    newMetric: findFieldByKeywords(keys, [["new_orders"], ["new_sales"], ["new_users"], ["new"]]),
    cost: findFieldByKeywords(keys, [["cost"], ["ad_spend"], ["marketing_cost"], ["expense"]]),
    grossMargin: findFieldByKeywords(keys, [["gross_margin"], ["grossmargin"]]),
    netProfit: findFieldByKeywords(keys, [["net_profit"], ["profit"], ["margin"]]),
    refundRate: findFieldByKeywords(keys, [["refund_rate"], ["refundrate"]]),
    cartAbandonmentRate: findFieldByKeywords(keys, [["cart_abandonment_rate"], ["abandonment_rate"], ["cart_abandonment"]]),
    promotionRoi: findFieldByKeywords(keys, [["promotion_roi"], ["roi"], ["return_on_ad_spend"], ["roas"]]),
  };

  const grouped = new Map();
  rows.forEach((row, index) => {
    const weekDate = dateField ? getWeekStartMonday(row[dateField]) : null;
    const weekStart = weekDate ? weekDate.toISOString().slice(0, 10) : `Week-${Math.floor(index / 7) + 1}`;
    if (!grouped.has(weekStart)) {
      grouped.set(weekStart, {
        weekStart,
        sortValue: weekDate ? weekDate.getTime() : index,
        amountSpend: 0,
        clicks: 0,
        totalUsers: 0,
        newUsers: 0,
        revenue: 0,
        orders: 0,
        newMetric: 0,
        cost: 0,
        grossMarginDirect: 0,
        netProfitDirect: 0,
        refundRateDirect: 0,
        cartAbandonmentRateDirect: 0,
        promotionRoiDirect: 0,
        directCount: 0,
      });
    }

    const bucket = grouped.get(weekStart);
    bucket.amountSpend += toNumber(row[mapped.amountSpend]);
    bucket.clicks += toNumber(row[mapped.clicks]);
    bucket.totalUsers += toNumber(row[mapped.totalUsers]);
    bucket.newUsers += toNumber(row[mapped.newUsers]);
    bucket.revenue += toNumber(row[mapped.revenue]);
    bucket.orders += toNumber(row[mapped.orders]);
    bucket.newMetric += toNumber(row[mapped.newMetric]);
    bucket.cost += toNumber(row[mapped.cost]);

    if (mapped.grossMargin) bucket.grossMarginDirect += toNumber(row[mapped.grossMargin]);
    if (mapped.netProfit) bucket.netProfitDirect += toNumber(row[mapped.netProfit]);
    if (mapped.refundRate) bucket.refundRateDirect += toNumber(row[mapped.refundRate]);
    if (mapped.cartAbandonmentRate) bucket.cartAbandonmentRateDirect += toNumber(row[mapped.cartAbandonmentRate]);
    if (mapped.promotionRoi) bucket.promotionRoiDirect += toNumber(row[mapped.promotionRoi]);
    bucket.directCount += 1;
  });

  return [...grouped.values()]
    .sort((a, b) => b.sortValue - a.sortValue)
    .map((item) => {
      const costBasis = item.cost || item.amountSpend;
      const grossMargin = mapped.grossMargin ? item.grossMarginDirect : item.revenue - costBasis;
      const netProfit = mapped.netProfit ? item.netProfitDirect : grossMargin;
      const refundRate = mapped.refundRate
        ? item.refundRateDirect / Math.max(1, item.directCount)
        : (item.orders > 0 ? (item.newMetric / item.orders) * 100 : 0);
      const cartAbandonmentRate = mapped.cartAbandonmentRate
        ? item.cartAbandonmentRateDirect / Math.max(1, item.directCount)
        : (item.clicks > 0 ? ((item.clicks - item.orders) / item.clicks) * 100 : 0);
      const promotionRoi = mapped.promotionRoi
        ? item.promotionRoiDirect / Math.max(1, item.directCount)
        : (item.amountSpend > 0 ? ((item.revenue - item.amountSpend) / item.amountSpend) * 100 : 0);

      return {
        weekStart: item.weekStart,
        amountSpend: item.amountSpend,
        clicks: item.clicks,
        totalUsers: item.totalUsers,
        newUsers: item.newUsers,
        revenue: item.revenue,
        orders: item.orders,
        newMetric: item.newMetric,
        costPerOrder: item.orders > 0 ? costBasis / item.orders : 0,
        conversionRate: item.clicks > 0 ? (item.orders / item.clicks) * 100 : 0,
        avgOrderValue: item.orders > 0 ? item.revenue / item.orders : 0,
        revenuePerUser: item.totalUsers > 0 ? item.revenue / item.totalUsers : 0,
        returningUserRate: item.totalUsers > 0 ? ((item.totalUsers - item.newUsers) / item.totalUsers) * 100 : 0,
        customerAcquisitionCost: item.newUsers > 0 ? item.amountSpend / item.newUsers : 0,
        grossMargin,
        netProfit,
        refundRate,
        cartAbandonmentRate,
        promotionRoi,
      };
    });
}

export default function WeeklyAggregatedMetricsTable({ rows, dateField }) {
  const weeklyRows = aggregateWeekly(rows, dateField);

  if (!weeklyRows.length) {
    return <p className="muted">Not enough data to compute weekly metrics yet.</p>;
  }

  return (
    <>
      <div className="drilldown-table-wrap">
        <table className="drilldown-table weekly-metrics-flat-table">
          <thead>
            <tr>
              <th>Date</th>
              {METRIC_COLUMNS.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeklyRows.map((row) => (
              <tr key={row.weekStart}>
                <td>{row.weekStart}</td>
                {METRIC_COLUMNS.map((column) => (
                  <td key={`${row.weekStart}-${column.key}`}>{formatMetric(row[column.key], column.type)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
