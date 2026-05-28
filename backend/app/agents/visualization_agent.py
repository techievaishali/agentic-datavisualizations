from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import pandas as pd


@dataclass
class ChartSuggestion:
    title: str
    chart_type: str
    x_field: str | None
    y_field: str | None
    confidence: float
    reason: str
    config: dict | None = None


class VisualizationAgent:
    @staticmethod
    def _pick_by_keywords(cols: list[str], keywords: tuple[str, ...]) -> str | None:
        for key in keywords:
            match = next((c for c in cols if key in c.lower()), None)
            if match:
                return match
        return None

    @staticmethod
    def _pick_preferred_metric(numeric: list[str]) -> str | None:
        if not numeric:
            return None
        keywords = ("revenue", "sales", "amount", "profit", "total", "quantity", "count")
        for key in keywords:
            match = next((col for col in numeric if key in col.lower()), None)
            if match:
                return match
        return numeric[0]

    @staticmethod
    def _pick_preferred_category(df: pd.DataFrame, categorical: Iterable[str]) -> str | None:
        for col in categorical:
            unique = int(df[col].nunique(dropna=True))
            if 2 <= unique <= 20:
                return col
        return next(iter(categorical), None)

    @staticmethod
    def _pick_business_dimension(df: pd.DataFrame, categorical: list[str]) -> str | None:
        preferred = (
            "category",
            "product_name",
            "product",
            "sku",
            "item",
            "segment",
            "region",
            "channel",
        )
        for token in preferred:
            match = next((c for c in categorical if token in c.lower()), None)
            if not match:
                continue
            cardinality = int(df[match].nunique(dropna=True))
            if 2 <= cardinality <= 40:
                return match
        return VisualizationAgent._pick_preferred_category(df, categorical)

    @staticmethod
    def _pick_sku_dimension(df: pd.DataFrame, categorical: list[str]) -> str | None:
        preferred = (
            "sku",
            "product_id",
            "product_name",
            "item",
            "product",
        )
        for token in preferred:
            match = next((c for c in categorical if token in c.lower()), None)
            if not match:
                continue
            cardinality = int(df[match].nunique(dropna=True))
            if cardinality >= 2:
                return match
        return None

    @staticmethod
    def _add_if_unique(
        collector: list[ChartSuggestion],
        seen: set[tuple[str, str | None, str | None]],
        suggestion: ChartSuggestion,
    ) -> None:
        key = (suggestion.chart_type, suggestion.x_field, suggestion.y_field)
        if key not in seen:
            seen.add(key)
            collector.append(suggestion)

    def suggest(self, df: pd.DataFrame, profile: dict) -> list[dict]:
        numeric = profile.get("numeric_columns", [])
        dates = profile.get("datetime_columns", [])
        cats = profile.get("categorical_columns", [])

        if not numeric:
            numeric = [col for col in df.columns if pd.api.types.is_numeric_dtype(df[col])]

        if not cats:
            datetime_cols = set(dates)
            cats = [col for col in df.columns if col not in numeric and col not in datetime_cols]
        suggestions: list[ChartSuggestion] = []
        seen: set[tuple[str, str | None, str | None]] = set()

        metric = self._pick_preferred_metric(numeric)
        date_col = dates[0] if dates else None
        category_col = self._pick_preferred_category(df, cats)
        business_dim = self._pick_business_dimension(df, cats)
        sku_dim = self._pick_sku_dimension(df, cats)

        revenue_metric = self._pick_by_keywords(
            numeric,
            ("gross_revenue", "revenue", "sales", "gmv", "amount", "income", "gross"),
        )
        demand_metric = self._pick_by_keywords(
            numeric,
            ("units_sold", "units", "quantity", "qty", "orders", "demand", "volume"),
        )
        net_profit_metric = self._pick_by_keywords(numeric, ("net_profit", "profit", "margin"))
        gross_revenue_metric = self._pick_by_keywords(
            numeric,
            ("gross_revenue", "revenue", "sales", "gmv", "amount"),
        )
        sales_metric = self._pick_by_keywords(numeric, ("sales", "revenue", "amount", "gmv", "orders"))

        if date_col and revenue_metric and demand_metric and revenue_metric != demand_metric:
            self._add_if_unique(
                suggestions,
                seen,
                ChartSuggestion(
                    title="Revenue vs Demand Over Time",
                    chart_type="dual_axis_combo",
                    x_field=date_col,
                    y_field=revenue_metric,
                    confidence=0.97,
                    reason="Dual-axis view compares monetary performance against demand trend for stakeholder health tracking",
                    config={
                        "secondary_y_field": demand_metric,
                        "left_axis_label": "Total Revenue ($)",
                        "right_axis_label": "Demand Volume (Units Sold)",
                        "left_series_type": "line",
                        "right_series_type": "bar",
                        "data_source": "time_series",
                    },
                ),
            )

        if business_dim and net_profit_metric and gross_revenue_metric and net_profit_metric != gross_revenue_metric:
            self._add_if_unique(
                suggestions,
                seen,
                ChartSuggestion(
                    title=f"Net Profit vs Gross Revenue by {business_dim}",
                    chart_type="grouped_bar",
                    x_field=business_dim,
                    y_field=gross_revenue_metric,
                    confidence=0.95,
                    reason="Grouped comparison reveals margin quality across categories or items",
                    config={
                        "secondary_y_field": net_profit_metric,
                        "data_source": "category_profit",
                    },
                ),
            )

        if sku_dim and sales_metric:
            self._add_if_unique(
                suggestions,
                seen,
                ChartSuggestion(
                    title="Sales Per Item (Top 10 SKUs)",
                    chart_type="horizontal_bar",
                    x_field=sku_dim,
                    y_field=sales_metric,
                    confidence=0.93,
                    reason="Top-SKU ranking establishes baseline demand concentration for analysts",
                    config={
                        "top_n": 10,
                        "sort_desc": True,
                        "data_source": "sku_sales_top10",
                    },
                ),
            )

        if date_col and metric and df[date_col].notna().sum() >= 4:
            self._add_if_unique(
                suggestions,
                seen,
                ChartSuggestion(
                    title=f"{metric} trend over time",
                    chart_type="line",
                    x_field=date_col,
                    y_field=metric,
                    confidence=0.94,
                    reason="Time series view is suitable for datetime plus metric",
                    config=None,
                )
            )

        if category_col and metric:
            cardinality = int(df[category_col].nunique(dropna=True))
            self._add_if_unique(
                suggestions,
                seen,
                ChartSuggestion(
                    title=f"{metric} by {category_col}",
                    chart_type="bar",
                    x_field=category_col,
                    y_field=metric,
                    confidence=0.9 if cardinality <= 20 else 0.78,
                    reason="Category comparison supports ranking and segment analysis",
                    config=None,
                )
            )

            if 2 <= cardinality <= 8:
                self._add_if_unique(
                    suggestions,
                    seen,
                    ChartSuggestion(
                        title=f"Share of {metric} by {category_col}",
                        chart_type="pie",
                        x_field=category_col,
                        y_field=metric,
                        confidence=0.86,
                        reason="Limited categories are suitable for composition view",
                        config=None,
                    ),
                )

        ordered_metrics = [metric] + [n for n in numeric if n != metric] if metric else numeric
        for n in ordered_metrics[:3]:
            self._add_if_unique(
                suggestions,
                seen,
                ChartSuggestion(
                    title=f"Total {n}",
                    chart_type="kpi",
                    x_field=None,
                    y_field=n,
                    confidence=0.85,
                    reason="Single metric KPI provides quick headline insight",
                    config=None,
                )
            )

        numeric_for_scatter = [n for n in numeric if df[n].nunique(dropna=True) > 2]
        if len(numeric_for_scatter) >= 2:
            self._add_if_unique(
                suggestions,
                seen,
                ChartSuggestion(
                    title=f"{numeric_for_scatter[0]} vs {numeric_for_scatter[1]}",
                    chart_type="scatter",
                    x_field=numeric_for_scatter[0],
                    y_field=numeric_for_scatter[1],
                    confidence=0.82,
                    reason="Two independent numeric fields support relationship exploration",
                    config=None,
                )
            )

        ordered = sorted(suggestions, key=lambda s: s.confidence, reverse=True)
        return [s.__dict__ for s in ordered[:8]]


def build_period_aggregations(df: pd.DataFrame, date_col: str, value_cols: list[str] | str) -> dict:
    work = df.copy()
    work[date_col] = pd.to_datetime(work[date_col], errors="coerce", utc=True)
    work = work.dropna(subset=[date_col])

    if isinstance(value_cols, str):
        candidate_cols = [value_cols]
    else:
        candidate_cols = list(value_cols or [])

    metric_cols = [col for col in candidate_cols if col in work.columns and col != date_col]
    if not metric_cols:
        return {
            "daily": [],
            "biweekly": [],
            "monthly": [],
            "quarterly": [],
            "half_yearly": [],
            "yearly": [],
        }

    for col in metric_cols:
        work[col] = pd.to_numeric(work[col], errors="coerce")

    lowered = {col.lower(): col for col in work.columns}

    def pick_col(tokens: tuple[str, ...]) -> str | None:
        for token in tokens:
            for col in work.columns:
                if token in col.lower():
                    return col
        return None

    order_col = pick_col(("orderid", "order_id", "order"))
    user_col = pick_col(("customerid", "customer_id", "user_id", "userid", "customer", "user"))
    revenue_col = pick_col(("totalamount", "gross_revenue", "revenue", "sales", "gmv", "amount"))
    spend_col = pick_col(("discount", "cost", "expense", "spend"))
    profit_col = pick_col(("netamount", "net_profit", "profit", "margin"))
    status_col = pick_col(("status",))

    def to_json_ready(records: list[dict]) -> list[dict]:
        fixed = []
        for row in records:
            updated = {}
            for key, value in row.items():
                if isinstance(value, pd.Timestamp):
                    updated[key] = value.strftime("%Y-%m-%d")
                else:
                    updated[key] = value
            fixed.append(updated)
        return fixed

    def aggregate_period(freq: str, tail_count: int) -> list[dict]:
        grouped = work.resample(freq, on=date_col)

        frame = grouped[metric_cols].sum().reset_index()
        frame["total_orders"] = grouped[order_col].count().values if order_col else grouped.size().values
        frame["total_users"] = grouped[user_col].nunique().values if user_col else frame["total_orders"]

        if revenue_col and revenue_col in work.columns:
            frame["total_revenue"] = grouped[revenue_col].sum().values
        else:
            frame["total_revenue"] = 0

        if spend_col and spend_col in work.columns:
            frame["total_spend"] = grouped[spend_col].sum().values
        else:
            frame["total_spend"] = 0

        if profit_col and profit_col in work.columns:
            frame["total_profit"] = grouped[profit_col].sum().values
        else:
            frame["total_profit"] = frame["total_revenue"] - frame["total_spend"]

        if status_col and status_col in work.columns:
            status_series = work[status_col].astype(str).str.lower()
            refund_mask = status_series.str.contains("cancel|refund|return", na=False)
            refund_counts = work.assign(_refund=refund_mask).resample(freq, on=date_col)["_refund"].sum().values
            frame["refund_count"] = refund_counts
        else:
            frame["refund_count"] = 0

        safe_spend = frame["total_spend"].replace(0, pd.NA)
        frame["roi"] = (frame["total_profit"] / safe_spend) * 100

        frame = frame.tail(tail_count).reset_index(drop=True)
        return to_json_ready(frame.to_dict("records"))

    result = {
        "daily": aggregate_period("D", 30),
        "biweekly": aggregate_period("2W", 12),
        "monthly": aggregate_period("ME", 12),
        "quarterly": aggregate_period("QE", 8),
        "half_yearly": aggregate_period("2QE", 6),
        "yearly": aggregate_period("YE", 5),
    }
    return result
