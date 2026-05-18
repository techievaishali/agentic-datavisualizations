from __future__ import annotations

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate

from app.core.config import settings


class ReportSummaryAgent:
    def __init__(self):
        self.provider = (settings.llm_provider or "none").strip().lower()
        self.model = settings.llm_model
        self.temperature = settings.llm_temperature

    @staticmethod
    def _select_rows(aggregations: dict, period: str) -> list[dict]:
        selected = aggregations.get(period, []) if isinstance(aggregations, dict) else []
        if selected:
            return selected[:8]

        for _, rows in (aggregations or {}).items():
            if isinstance(rows, list) and rows:
                return rows[:8]
        return []

    @staticmethod
    def _fallback_summary(profile: dict, suggestions: list[dict], rows: list[dict], period: str) -> str:
        row_count = profile.get("row_count", 0)
        column_count = profile.get("column_count", 0)
        numeric_columns = profile.get("numeric_columns", [])
        datetime_columns = profile.get("datetime_columns", [])

        lines = [
            f"Dataset contains {row_count} rows across {column_count} columns.",
            f"Detected {len(numeric_columns)} numeric columns and {len(datetime_columns)} datetime columns.",
        ]

        if suggestions:
            top = suggestions[0]
            title = top.get("title", "a recommended visualization")
            confidence = top.get("confidence", "N/A")
            lines.append(f"Top recommendation is '{title}' with confidence {confidence}.")

        if rows:
            sample = rows[0]
            lines.append(
                f"{period.capitalize()} aggregation is available with {len(rows)} recent records for trend analysis."
            )
            keys = ", ".join(list(sample.keys())[:4])
            lines.append(f"Sample aggregation fields: {keys}.")
        else:
            lines.append("No aggregation records were generated for the selected period.")

        lines.append("Summary mode: deterministic fallback (no LLM configured or available).")
        return "\n".join(lines)

    def _build_chain(self):
        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "You are a data reporting assistant. Produce a concise summary in 4-6 bullet points. "
                    "Focus on trends, notable metrics, and practical actions. Avoid hallucinations.",
                ),
                (
                    "human",
                    "Selected period: {period}\n"
                    "Dataset profile: {profile}\n"
                    "Top chart suggestions: {suggestions}\n"
                    "Sample aggregation rows: {rows}\n"
                    "Return plain text bullets only.",
                ),
            ]
        )

        if self.provider == "google" and settings.google_api_key:
            try:
                from langchain_google_genai import ChatGoogleGenerativeAI
            except ImportError:
                return None, "google provider package is not installed"

            llm = ChatGoogleGenerativeAI(
                model=self.model,
                google_api_key=settings.google_api_key,
                temperature=self.temperature,
            )
            return prompt | llm | StrOutputParser(), "llm"

        if self.provider == "ollama":
            try:
                from langchain_ollama import ChatOllama
            except ImportError:
                return None, "ollama provider package is not installed"

            llm = ChatOllama(
                model=self.model,
                base_url=settings.ollama_base_url,
                temperature=self.temperature,
            )
            return prompt | llm | StrOutputParser(), "llm"

        return None, "provider not configured"

    def summarize(self, profile: dict, suggestions: list[dict], aggregations: dict, period: str) -> dict:
        rows = self._select_rows(aggregations=aggregations, period=period)
        fallback = self._fallback_summary(profile=profile, suggestions=suggestions, rows=rows, period=period)

        chain, status = self._build_chain()
        if chain is None:
            return {
                "text": fallback,
                "mode": "fallback",
                "provider": "deterministic",
                "model": "rules",
                "status": status,
            }

        try:
            response_text = chain.invoke(
                {
                    "period": period,
                    "profile": profile,
                    "suggestions": suggestions[:3],
                    "rows": rows,
                }
            )
            if not response_text or not response_text.strip():
                raise ValueError("Empty LLM summary response")

            return {
                "text": response_text.strip(),
                "mode": "llm",
                "provider": self.provider,
                "model": self.model,
                "status": "ok",
            }
        except Exception as exc:
            return {
                "text": fallback,
                "mode": "fallback",
                "provider": "deterministic",
                "model": "rules",
                "status": f"llm_failed: {exc.__class__.__name__}",
            }
