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


class VisualizationAgent:
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
        suggestions: list[ChartSuggestion] = []
        seen: set[tuple[str, str | None, str | None]] = set()

        metric = self._pick_preferred_metric(numeric)
        date_col = dates[0] if dates else None
        category_col = self._pick_preferred_category(df, cats)

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
                )
            )

        ordered = sorted(suggestions, key=lambda s: s.confidence, reverse=True)
        return [s.__dict__ for s in ordered[:8]]


def build_period_aggregations(df: pd.DataFrame, date_col: str, value_col: str) -> dict:
    work = df.copy()
    work[date_col] = pd.to_datetime(work[date_col], errors="coerce", utc=True)
    work = work.dropna(subset=[date_col])

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

    result = {
        "daily": to_json_ready(work.resample("D", on=date_col)[value_col].sum().tail(30).reset_index().to_dict("records")),
        "biweekly": to_json_ready(work.resample("2W", on=date_col)[value_col].sum().tail(12).reset_index().to_dict("records")),
        "monthly": to_json_ready(work.resample("M", on=date_col)[value_col].sum().tail(12).reset_index().to_dict("records")),
        "quarterly": to_json_ready(work.resample("Q", on=date_col)[value_col].sum().tail(8).reset_index().to_dict("records")),
        "half_yearly": to_json_ready(work.resample("2Q", on=date_col)[value_col].sum().tail(6).reset_index().to_dict("records")),
        "yearly": to_json_ready(work.resample("Y", on=date_col)[value_col].sum().tail(5).reset_index().to_dict("records")),
    }
    return result
