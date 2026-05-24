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
    def _to_float(value):
        if isinstance(value, bool):
            return None
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            cleaned = value.replace(",", "").replace("$", "").replace("%", "").strip()
            if not cleaned:
                return None
            try:
                return float(cleaned)
            except ValueError:
                return None
        return None

    @staticmethod
    def _deterministic_summary(
        title: str,
        chart_type: str,
        x_field: str | None,
        y_field: str | None,
        rows: list[dict],
        comparison_rows: list[dict],
    ) -> str:
        if not rows:
            return (
                f"Widget '{title}' has no data records for the selected period.\n"
                "Summary mode: deterministic fallback (no LLM configured or no data)."
            )

        lines = [f"Widget: {title} ({chart_type} chart)"]

        if y_field:
            values = [WidgetSummaryAgent._to_float(r.get(y_field)) for r in rows]
            values = [v for v in values if v is not None]
            if values:
                total = sum(values)
                avg = total / len(values)
                max_val = max(values)
                min_val = min(values)
                lines.append(f"- Total {y_field}: {total:,.2f}")
                lines.append(f"- Average {y_field}: {avg:,.2f}")
                lines.append(f"- Highest value: {max_val:,.2f} | Lowest value: {min_val:,.2f}")

                if comparison_rows:
                    compare_values = [WidgetSummaryAgent._to_float(r.get(y_field)) for r in comparison_rows]
                    compare_values = [v for v in compare_values if v is not None]
                    if compare_values:
                        compare_total = sum(compare_values)
                        delta = total - compare_total
                        delta_pct = (delta / compare_total * 100.0) if compare_total else 0.0
                        direction = "up" if delta >= 0 else "down"
                        lines.append(
                            f"- Versus comparison period: {direction} by {abs(delta):,.2f} ({abs(delta_pct):.2f}%)."
                        )

        if x_field and y_field:
            top_rows = sorted(
                [r for r in rows if WidgetSummaryAgent._to_float(r.get(y_field)) is not None],
                key=lambda r: WidgetSummaryAgent._to_float(r.get(y_field)) or 0,
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
                    "You are a senior data analyst. Generate a SHORT chart narrative. "
                    "Return exactly 3 bullet points, each 1 sentence, each under 18 words. "
                    "Use concrete numbers from the data and include one period-vs-comparison delta when possible. "
                    "No headers, no markdown emphasis, no extra text.",
                ),
                (
                    "human",
                    "Chart title: {title}\n"
                    "Chart type: {chart_type}\n"
                    "X axis field: {x_field}\n"
                    "Y axis field: {y_field}\n"
                    "Current period rows (sample): {rows}\n"
                    "Comparison period rows (sample): {comparison_rows}\n\n"
                    "Return plain text bullet points only.",
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

    @staticmethod
    def _compact_lines(text: str, max_lines: int = 3, max_chars_per_line: int = 120) -> str:
        if not text:
            return ""
        raw_lines = [line.strip() for line in text.splitlines() if line.strip()]
        if not raw_lines:
            return ""

        cleaned: list[str] = []
        for line in raw_lines:
            if not line.startswith("-"):
                line = f"- {line.lstrip('- ').strip()}"
            if len(line) > max_chars_per_line:
                line = f"{line[:max_chars_per_line - 3].rstrip()}..."
            cleaned.append(line)

        return "\n".join(cleaned[:max_lines])

    def summarize(
        self,
        title: str,
        chart_type: str,
        x_field: str | None,
        y_field: str | None,
        period_data: list[dict],
        comparison_period_data: list[dict] | None = None,
    ) -> dict:
        rows = (period_data or [])[:12]
        comparison_rows = (comparison_period_data or [])[:12]
        fallback_text = self._deterministic_summary(
            title=title,
            chart_type=chart_type,
            x_field=x_field,
            y_field=y_field,
            rows=rows,
            comparison_rows=comparison_rows,
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
                    "comparison_rows": comparison_rows,
                }
            )
            if not result or not result.strip():
                raise ValueError("Empty response from LLM")

            compact_result = self._compact_lines(result.strip())
            if not compact_result:
                raise ValueError("Unusable response from LLM")

            return {
                "text": compact_result,
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
