from __future__ import annotations

import pandas as pd

from app.agents.report_summary_agent import ReportSummaryAgent
from app.agents.visualization_agent import VisualizationAgent, build_period_aggregations


class ReportOrchestrator:
    def __init__(self):
        self.viz = VisualizationAgent()
        self.summary = ReportSummaryAgent()

    @staticmethod
    def _fallback_period_aggregations(df: pd.DataFrame, profile: dict) -> dict:
        numeric = profile.get("numeric_columns", [])
        categorical = profile.get("categorical_columns", [])
        if not numeric:
            return {}

        value_col = numeric[0]
        if categorical:
            category_col = categorical[0]
            grouped = (
                df[[category_col, value_col]]
                .dropna(subset=[category_col])
                .groupby(category_col, as_index=False)[value_col]
                .sum()
                .sort_values(value_col, ascending=False)
                .head(20)
            )
            records = grouped.to_dict("records")
        else:
            subset = df[[value_col]].copy().dropna().head(30)
            subset.insert(0, "row_index", range(1, len(subset) + 1))
            records = subset.to_dict("records")

        return {
            "daily": records,
            "biweekly": records,
            "monthly": records,
            "quarterly": records,
            "half_yearly": records,
            "yearly": records,
        }

    @staticmethod
    def _pick_col(cols: list[str], keywords: tuple[str, ...]) -> str | None:
        lowered = [c.lower() for c in cols]
        for key in keywords:
            for idx, col in enumerate(lowered):
                if key in col:
                    return cols[idx]
        return None

    @staticmethod
    def _build_analysis_views(df: pd.DataFrame, profile: dict) -> dict:
        numeric = profile.get("numeric_columns", [])
        categorical = profile.get("categorical_columns", [])

        if not numeric:
            numeric = [col for col in df.columns if pd.api.types.is_numeric_dtype(df[col])]

        if not categorical:
            datetime_cols = set(profile.get("datetime_columns", []))
            categorical = [col for col in df.columns if col not in numeric and col not in datetime_cols]

        views: dict[str, list[dict]] = {}
        if not numeric and not categorical:
            return views

        cols = list(df.columns)

        def pick_col(candidates: list[str], keywords: tuple[str, ...]) -> str | None:
            return ReportOrchestrator._pick_col(candidates, keywords)

        def coerce_group_sum(dim_col: str, metric_col: str, top_n: int = 20) -> pd.DataFrame:
            frame = df[[dim_col, metric_col]].copy().dropna(subset=[dim_col])
            frame[metric_col] = pd.to_numeric(frame[metric_col], errors="coerce")
            grouped = (
                frame.groupby(dim_col, as_index=False)[metric_col]
                .sum()
                .sort_values(metric_col, ascending=False)
                .head(top_n)
            )
            return grouped

        category_dim = pick_col(categorical, ("category", "subcategory", "department", "brand", "product_type", "product", "item", "sku"))
        channel_dim = pick_col(categorical, ("channel", "source", "campaign", "medium", "platform", "channel_group"))
        segment_dim = pick_col(categorical, ("segment", "customer_segment", "cohort", "persona", "audience", "device_category", "user_type"))
        geo_dim = pick_col(categorical, ("region", "country", "city", "state", "market", "territory"))
        payment_dim = pick_col(categorical, ("payment_method", "payment", "method", "card", "wallet", "upi"))
        sku_dim = pick_col(categorical, ("sku", "product_id", "product_name", "item", "product"))

        # Fallback dimensions for mixed-schema files where canonical names are absent.
        if not channel_dim:
            channel_dim = payment_dim or pick_col(categorical, ("orderstatus", "status", "device_category", "source_type"))
        if not segment_dim:
            segment_dim = pick_col(categorical, ("device_category", "customer_type", "orderstatus", "status", "category", "item"))
        if segment_dim and channel_dim and segment_dim == channel_dim:
            segment_dim = next((c for c in categorical if c != channel_dim), None)

        revenue_col = pick_col(numeric, ("total_revenue", "gross_revenue", "revenue", "sales", "amount", "gmv")) or (numeric[0] if numeric else None)
        profit_col = pick_col(numeric, ("net_profit", "profit", "margin", "netamount")) or (numeric[1] if len(numeric) > 1 else None)
        spend_col = pick_col(numeric, ("ad_spend", "marketing_spend", "spend", "cost", "expense", "discount"))
        roi_col = pick_col(numeric, ("roi", "roas", "return_on_ad_spend"))
        sales_col = pick_col(numeric, ("sales", "revenue", "amount", "gmv", "orders")) or revenue_col
        customer_col = pick_col(cols, ("customerid", "customer_id", "user_id", "userid", "customer", "user"))

        if category_dim and revenue_col and revenue_col in df.columns:
            if profit_col and profit_col in df.columns and profit_col != revenue_col:
                frame = df[[category_dim, revenue_col, profit_col]].copy().dropna(subset=[category_dim])
                frame[revenue_col] = pd.to_numeric(frame[revenue_col], errors="coerce")
                frame[profit_col] = pd.to_numeric(frame[profit_col], errors="coerce")
                category_profit = (
                    frame.groupby(category_dim, as_index=False)[[revenue_col, profit_col]]
                    .sum()
                    .sort_values(revenue_col, ascending=False)
                    .head(20)
                )
            else:
                category_profit = coerce_group_sum(category_dim, revenue_col, top_n=20)
                category_profit["record_count"] = (
                    df[[category_dim]]
                    .dropna(subset=[category_dim])
                    .groupby(category_dim)
                    .size()
                    .reindex(category_profit[category_dim])
                    .fillna(0)
                    .astype(int)
                    .values
                )
            views["category_profit"] = category_profit.to_dict("records")

        if channel_dim and channel_dim in df.columns:
            base_cols = [channel_dim]
            for metric in [revenue_col, spend_col, profit_col, roi_col]:
                if metric and metric in df.columns and metric not in base_cols:
                    base_cols.append(metric)
            channel_frame = df[base_cols].copy().dropna(subset=[channel_dim])
            for metric in [revenue_col, spend_col, profit_col, roi_col]:
                if metric and metric in channel_frame.columns:
                    channel_frame[metric] = pd.to_numeric(channel_frame[metric], errors="coerce")

            grouped = channel_frame.groupby(channel_dim, as_index=False).sum(numeric_only=True)
            grouped["orders_count"] = channel_frame.groupby(channel_dim).size().reindex(grouped[channel_dim]).values

            if "roi_pct" not in grouped.columns:
                if spend_col and spend_col in grouped.columns and revenue_col and revenue_col in grouped.columns:
                    safe_spend = grouped[spend_col].replace(0, pd.NA)
                    if profit_col and profit_col in grouped.columns:
                        grouped["roi_pct"] = (grouped[profit_col] / safe_spend) * 100
                    else:
                        grouped["roi_pct"] = ((grouped[revenue_col] - grouped[spend_col]) / safe_spend) * 100
                    grouped["roi_pct"] = grouped["roi_pct"].fillna(0)
                elif roi_col and roi_col in grouped.columns:
                    grouped["roi_pct"] = grouped[roi_col]
                elif revenue_col and revenue_col in grouped.columns and profit_col and profit_col in grouped.columns:
                    safe_revenue = grouped[revenue_col].replace(0, pd.NA)
                    grouped["roi_pct"] = (grouped[profit_col] / safe_revenue) * 100
                    grouped["roi_pct"] = grouped["roi_pct"].fillna(0)
                else:
                    grouped["roi_pct"] = grouped["orders_count"]

            grouped = grouped.sort_values("roi_pct", ascending=False).head(20)
            views["channel_marketing_efficiency"] = grouped.to_dict("records")

        if segment_dim and channel_dim and segment_dim in df.columns and channel_dim in df.columns:
            mix_frame = df[[segment_dim, channel_dim] + ([customer_col] if customer_col else [])].copy().dropna(subset=[segment_dim, channel_dim])
            if customer_col and customer_col in mix_frame.columns:
                pivot = pd.pivot_table(
                    mix_frame,
                    index=segment_dim,
                    columns=channel_dim,
                    values=customer_col,
                    aggfunc=pd.Series.nunique,
                    fill_value=0,
                )
            else:
                pivot = pd.pivot_table(
                    mix_frame,
                    index=segment_dim,
                    columns=channel_dim,
                    aggfunc="size",
                    fill_value=0,
                )
            pivot = pivot.reset_index()
            channel_totals = pivot.drop(columns=[segment_dim], errors="ignore").sum(axis=0).sort_values(ascending=False)
            top_channels = [col for col in channel_totals.index[:6]]
            keep_cols = [segment_dim] + top_channels
            pivot = pivot[keep_cols]
            views["segment_channel_mix"] = pivot.to_dict("records")

        if geo_dim and geo_dim in df.columns:
            chosen_primary = revenue_col if revenue_col and revenue_col in df.columns else None
            chosen_secondary = profit_col if profit_col and profit_col in df.columns and profit_col != chosen_primary else None
            if chosen_primary and chosen_secondary:
                frame = df[[geo_dim, chosen_primary, chosen_secondary]].copy().dropna(subset=[geo_dim])
                frame[chosen_primary] = pd.to_numeric(frame[chosen_primary], errors="coerce")
                frame[chosen_secondary] = pd.to_numeric(frame[chosen_secondary], errors="coerce")
                geo_perf = (
                    frame.groupby(geo_dim, as_index=False)[[chosen_primary, chosen_secondary]]
                    .sum()
                    .sort_values(chosen_primary, ascending=False)
                    .head(20)
                )
                views["geography_performance"] = geo_perf.to_dict("records")
            elif chosen_primary:
                geo_perf = coerce_group_sum(geo_dim, chosen_primary, top_n=20)
                geo_perf["record_count"] = (
                    df[[geo_dim]]
                    .dropna(subset=[geo_dim])
                    .groupby(geo_dim)
                    .size()
                    .reindex(geo_perf[geo_dim])
                    .fillna(0)
                    .astype(int)
                    .values
                )
                views["geography_performance"] = geo_perf.to_dict("records")

        if payment_dim and payment_dim in df.columns:
            if revenue_col and revenue_col in df.columns:
                payment_share = coerce_group_sum(payment_dim, revenue_col, top_n=10)
            else:
                payment_share = (
                    df[[payment_dim]]
                    .dropna(subset=[payment_dim])
                    .assign(record_count=1)
                    .groupby(payment_dim, as_index=False)["record_count"]
                    .sum()
                    .sort_values("record_count", ascending=False)
                    .head(10)
                )
            views["payment_method_share"] = payment_share.to_dict("records")

        if sku_dim and sales_col and all(col in df.columns for col in [sku_dim, sales_col]):
            sku_sales = coerce_group_sum(sku_dim, sales_col, top_n=10)
            views["sku_sales_top10"] = sku_sales.to_dict("records")

        if not views and categorical and numeric:
            fallback_dim = pick_col(categorical, ("category", "segment", "product", "item", "region", "channel"))
            fallback_metric = revenue_col or numeric[0]
            if fallback_dim and fallback_metric:
                fallback = coerce_group_sum(fallback_dim, fallback_metric, top_n=20)
                views["category_profit"] = fallback.to_dict("records")

        return views

    @staticmethod
    def _augment_business_metric_suggestions(suggestions: list[dict], periods: dict, period: str) -> list[dict]:
        if not periods:
            return suggestions

        rows = periods.get(period) or next((v for v in periods.values() if v), [])
        if not rows:
            return suggestions

        available_keys = set(rows[0].keys())
        wanted = [
            ("Total Orders", "total_orders"),
            ("ROI", "roi"),
        ]

        existing = {item.get("y_field") for item in suggestions}
        augmented = list(suggestions)
        for title, field in wanted:
            if field in available_keys and field not in existing:
                augmented.append(
                    {
                        "title": title,
                        "chart_type": "kpi",
                        "x_field": None,
                        "y_field": field,
                        "confidence": 0.84,
                        "reason": "Derived business KPI from period aggregation",
                        "config": None,
                    }
                )

        return sorted(augmented, key=lambda s: float(s.get("confidence", 0.0)), reverse=True)

    def create_report_spec(self, curated_path: str, profile: dict, period: str) -> dict:
        df = pd.read_csv(curated_path)
        suggestions = self.viz.suggest(df=df, profile=profile)

        periods = {}
        dates = profile.get("datetime_columns", [])
        nums = profile.get("numeric_columns", [])
        if dates and nums:
            periods = build_period_aggregations(df, dates[0], nums)
        elif nums:
            periods = self._fallback_period_aggregations(df, profile)

        suggestions = self._augment_business_metric_suggestions(suggestions, periods, period)

        analysis_views = self._build_analysis_views(df, profile)

        ai_summary = self.summary.summarize(
            profile=profile,
            suggestions=suggestions,
            aggregations=periods,
            period=period,
        )

        return {
            "selected_period": period,
            "suggestions": suggestions,
            "aggregations": periods,
            "analysis_views": analysis_views,
            "ai_summary": ai_summary,
            "theme_defaults": {
                "primary": "#1f77b4",
                "secondary": "#ff7f0e",
                "pattern": "solid",
            },
        }
