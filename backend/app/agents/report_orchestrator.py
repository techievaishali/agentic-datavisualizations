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

    def create_report_spec(self, curated_path: str, profile: dict, period: str) -> dict:
        df = pd.read_csv(curated_path)
        suggestions = self.viz.suggest(df=df, profile=profile)

        periods = {}
        dates = profile.get("datetime_columns", [])
        nums = profile.get("numeric_columns", [])
        if dates and nums:
            periods = build_period_aggregations(df, dates[0], nums[0])
        elif nums:
            periods = self._fallback_period_aggregations(df, profile)

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
            "ai_summary": ai_summary,
            "theme_defaults": {
                "primary": "#1f77b4",
                "secondary": "#ff7f0e",
                "pattern": "solid",
            },
        }
