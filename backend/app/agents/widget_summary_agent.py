from __future__ import annotations

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate

from app.core.config import settings


class WidgetSummaryAgent:
    """
    LangChain-powered per-widget AI summary agent.
    Uses Gemini (Google free tier) or Ollama (local LLM) when configured.
    Falls back to deterministic summary when no LLM provider is set.
    """

    def __init__(self) -> None:
        self.provider = (settings.llm_provider or "none").strip().lower()
        self.model = settings.llm_model
        self.temperature = settings.llm_temperature

    @staticmethod
    def _deterministic_summary(
        title: str,
        chart_type: str,
        x_field: str | None,
        y_field: str | None,
        rows: list[dict],
    ) -> str:
        if not rows:
            return (
                f"Widget '{title}' has no data records for the selected period.\n"
                "Summary mode: deterministic fallback (no LLM configured or no data)."
            )

        lines = [f"Widget: {title} ({chart_type} chart)"]

        if y_field:
            values = [r.get(y_field) for r in rows if isinstance(r.get(y_field), (int, float))]
            if values:
                total = sum(values)
                avg = total / len(values)
                max_val = max(values)
                min_val = min(values)
                lines.append(f"- Total {y_field}: {total:,.2f}")
                lines.append(f"- Average {y_field}: {avg:,.2f}")
                lines.append(f"- Highest value: {max_val:,.2f} | Lowest value: {min_val:,.2f}")

        if x_field and y_field:
            top_rows = sorted(
                [r for r in rows if isinstance(r.get(y_field), (int, float))],
                key=lambda r: r[y_field],
                reverse=True,
            )[:3]
            if top_rows:
                top_labels = ", ".join(
                    str(r.get(x_field, "?")) for r in top_rows
                )
                lines.append(f"- Top {x_field} entries: {top_labels}")

        lines.append(f"- Data contains {len(rows)} records for the selected period.")
        lines.append("Summary mode: deterministic fallback (no LLM configured or available).")
        return "\n".join(lines)

    def _build_chain(self):
        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "You are a data analyst assistant. Analyze the provided chart data and generate "
                    "4-5 precise bullet-point insights. Use specific numbers from the data. "
                    "Focus on key values, trends, comparisons, and one actionable recommendation. "
                    "Be concise and avoid repeating the chart title.",
                ),
                (
                    "human",
                    "Chart title: {title}\n"
                    "Chart type: {chart_type}\n"
                    "X axis field: {x_field}\n"
                    "Y axis field: {y_field}\n"
                    "Data rows (sample): {rows}\n\n"
                    "Return plain text bullet points only. No headers.",
                ),
            ]
        )

        if self.provider == "google" and settings.google_api_key:
            try:
                from langchain_google_genai import ChatGoogleGenerativeAI
            except ImportError:
                return None, "langchain-google-genai not installed"

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
                return None, "langchain-ollama not installed"

            llm = ChatOllama(
                model=self.model,
                base_url=settings.ollama_base_url,
                temperature=self.temperature,
            )
            return prompt | llm | StrOutputParser(), "llm"

        return None, "provider not configured"

    def summarize(
        self,
        title: str,
        chart_type: str,
        x_field: str | None,
        y_field: str | None,
        period_data: list[dict],
    ) -> dict:
        rows = period_data[:12]
        fallback_text = self._deterministic_summary(
            title=title,
            chart_type=chart_type,
            x_field=x_field,
            y_field=y_field,
            rows=rows,
        )

        chain, status = self._build_chain()
        if chain is None:
            return {
                "text": fallback_text,
                "mode": "fallback",
                "provider": "deterministic",
                "model": "rules",
                "status": status,
            }

        try:
            result = chain.invoke(
                {
                    "title": title,
                    "chart_type": chart_type,
                    "x_field": x_field or "none",
                    "y_field": y_field or "none",
                    "rows": rows,
                }
            )
            if not result or not result.strip():
                raise ValueError("Empty response from LLM")

            return {
                "text": result.strip(),
                "mode": "llm",
                "provider": self.provider,
                "model": self.model,
                "status": "ok",
            }
        except Exception as exc:
            return {
                "text": fallback_text,
                "mode": "fallback",
                "provider": "deterministic",
                "model": "rules",
                "status": f"llm_failed: {exc.__class__.__name__}",
            }
