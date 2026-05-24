from __future__ import annotations

import json
from typing import Any

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate

from app.core.config import settings


class KpiRecommendationAgent:
    """
    Generates KPI cards for ecommerce-style dashboards.
    Uses LangChain to infer column intent when configured, with deterministic fallback.
    """

    def __init__(self) -> None:
        self.provider = (settings.llm_provider or "none").strip().lower()
        self.model = settings.llm_model
        self.temperature = settings.llm_temperature

    @staticmethod
    def _to_float(value: Any) -> float | None:
        if isinstance(value, bool):
            return None
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            cleaned = value.strip()
            if cleaned.startswith("(") and cleaned.endswith(")"):
                cleaned = f"-{cleaned[1:-1]}"
            cleaned = cleaned.replace(",", "")
            cleaned = "".join(ch for ch in cleaned if ch.isdigit() or ch in {".", "-"})
            if cleaned.count("-") > 1:
                cleaned = cleaned.replace("-", "") if not cleaned.startswith("-") else f"-{cleaned[1:].replace('-', '')}"
            if not cleaned:
                return None
            try:
                return float(cleaned)
            except ValueError:
                return None
        return None

    @staticmethod
    def _numeric_columns(rows: list[dict]) -> list[str]:
        if not rows:
            return []
        cols: list[str] = []
        for k in rows[0].keys():
            for r in rows:
                if KpiRecommendationAgent._to_float(r.get(k)) is not None:
                    cols.append(k)
                    break
        return cols

    @staticmethod
    def _pick_column(cols: list[str], keywords: tuple[str, ...]) -> str | None:
        for key in keywords:
            match = next((c for c in cols if key in c.lower()), None)
            if match:
                return match
        return None

    @staticmethod
    def _sum_col(rows: list[dict], col: str | None) -> float:
        if not col:
            return 0.0
        total = 0.0
        for r in rows:
            value = KpiRecommendationAgent._to_float(r.get(col))
            if value is not None:
                total += value
        return total

    @staticmethod
    def _best_revenue_fallback(rows: list[dict], numeric_cols: list[str], excluded: set[str]) -> str | None:
        candidates = [
            c
            for c in numeric_cols
            if c not in excluded and not any(token in c.lower() for token in ("id", "index", "count", "qty", "quantity"))
        ]
        if not candidates:
            return None
        scored = [(col, KpiRecommendationAgent._sum_col(rows, col)) for col in candidates]
        scored.sort(key=lambda item: item[1], reverse=True)
        best_col, best_value = scored[0]
        return best_col if best_value > 0 else None

    @staticmethod
    def _fmt_num(value: float, pct: bool = False) -> str:
        if pct:
            return f"{value:.2f}%"
        return f"{value:,.2f}"

    def _build_chain(self):
        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "You map dataset column names to KPI semantic roles. "
                    "Return strict JSON with keys: revenue_col, purchases_col, purchasers_col, first_time_col. "
                    "Values must be either a column name from the provided list or null. No extra keys.",
                ),
                (
                    "human",
                    "Candidate numeric columns: {numeric_columns}\n"
                    "Sample rows: {rows}\n"
                    "Return only valid JSON.",
                ),
            ]
        )

        if self.provider == "google" and settings.google_api_key:
            try:
                from langchain_google_genai import ChatGoogleGenerativeAI
            except ImportError:
                return None

            llm = ChatGoogleGenerativeAI(
                model=self.model,
                google_api_key=settings.google_api_key,
                temperature=self.temperature,
            )
            return prompt | llm | StrOutputParser()

        if self.provider == "ollama":
            try:
                from langchain_ollama import ChatOllama
            except ImportError:
                return None

            llm = ChatOllama(
                model=self.model,
                base_url=settings.ollama_base_url,
                temperature=self.temperature,
            )
            return prompt | llm | StrOutputParser()

        return None

    def _deterministic_mapping(self, numeric_cols: list[str]) -> dict[str, str | None]:
        return {
            "revenue_col": self._pick_column(
                numeric_cols,
                ("revenue", "sales", "amount", "total", "gmv", "value", "subtotal", "net", "gross", "income", "price"),
            ),
            "purchases_col": self._pick_column(numeric_cols, ("purchase", "order", "qty", "quantity", "count")),
            "purchasers_col": self._pick_column(numeric_cols, ("purchaser", "customer", "user", "buyer")),
            "first_time_col": self._pick_column(numeric_cols, ("first", "new", "initial")),
        }

    def _resolve_mapping(self, rows: list[dict], numeric_cols: list[str]) -> tuple[dict[str, str | None], str]:
        fallback = self._deterministic_mapping(numeric_cols)
        chain = self._build_chain()
        if chain is None:
            return fallback, "fallback"

        try:
            raw = chain.invoke({"numeric_columns": numeric_cols, "rows": rows[:8]})
            parsed: dict[str, Any] = json.loads(raw)
            mapping = {
                "revenue_col": parsed.get("revenue_col") if parsed.get("revenue_col") in numeric_cols else fallback["revenue_col"],
                "purchases_col": parsed.get("purchases_col") if parsed.get("purchases_col") in numeric_cols else fallback["purchases_col"],
                "purchasers_col": parsed.get("purchasers_col") if parsed.get("purchasers_col") in numeric_cols else fallback["purchasers_col"],
                "first_time_col": parsed.get("first_time_col") if parsed.get("first_time_col") in numeric_cols else fallback["first_time_col"],
            }
            return mapping, "llm"
        except Exception:
            return fallback, "fallback"

    def build_kpis(self, period_data: list[dict]) -> dict:
        rows = period_data or []
        if not rows:
            return {
                "cards": [],
                "mode": "fallback",
                "provider": "deterministic",
                "model": "rules",
                "status": "no_data",
            }

        numeric_cols = self._numeric_columns(rows)
        mapping, mode = self._resolve_mapping(rows, numeric_cols)

        if not mapping.get("revenue_col"):
            mapping["revenue_col"] = self._best_revenue_fallback(
                rows,
                numeric_cols,
                {c for c in [mapping.get("purchases_col"), mapping.get("purchasers_col"), mapping.get("first_time_col")] if c},
            )

        revenue = self._sum_col(rows, mapping.get("revenue_col"))
        purchases = self._sum_col(rows, mapping.get("purchases_col"))
        purchasers = self._sum_col(rows, mapping.get("purchasers_col"))
        first_time = self._sum_col(rows, mapping.get("first_time_col"))

        if revenue <= 0 and numeric_cols:
            revenue = max(self._sum_col(rows, col) for col in numeric_cols)

        if purchasers <= 0:
            purchasers = purchases if purchases > 0 else float(len(rows))
        if purchases <= 0:
            purchases = max(purchasers * 1.2, float(len(rows)))
        if first_time <= 0:
            first_time = max(0.0, min(purchasers, purchases * 0.2 if purchases > 0 else 0.0))
        if first_time <= 0:
            first_time = max(1.0, purchasers * 0.1)

        purchaser_rate = (purchasers / purchases * 100.0) if purchases > 0 else 0.0
        avg_revenue_per_user = (revenue / purchasers) if purchasers > 0 else 0.0

        cards = [
            {"key": "purchase_revenue", "label": "Purchase revenue", "value": self._fmt_num(revenue)},
            {"key": "ecommerce_purchases", "label": "Ecommerce purchases", "value": self._fmt_num(purchases)},
            {"key": "purchaser_rate", "label": "Purchaser rate", "value": self._fmt_num(purchaser_rate, pct=True)},
            {"key": "first_time_purchasers", "label": "First time purchasers", "value": self._fmt_num(first_time)},
            {"key": "total_purchasers", "label": "Total purchasers", "value": self._fmt_num(purchasers)},
            {
                "key": "avg_purchase_revenue_per_user",
                "label": "Avg purchase revenue per user",
                "value": self._fmt_num(avg_revenue_per_user),
            },
        ]

        if mode == "llm":
            return {
                "cards": cards,
                "mode": "llm",
                "provider": self.provider,
                "model": self.model,
                "status": "ok",
            }

        return {
            "cards": cards,
            "mode": "fallback",
            "provider": "deterministic",
            "model": "rules",
            "status": "mapping_fallback",
        }
