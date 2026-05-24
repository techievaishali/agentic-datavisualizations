from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pandas as pd
from sqlalchemy import create_engine


class IngestionAgent:
    def __init__(self, raw_dir: str, curated_dir: str):
        self.raw_dir = Path(raw_dir)
        self.curated_dir = Path(curated_dir)
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self.curated_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _looks_like_datetime_column(column_name: str) -> bool:
        name = column_name.lower()
        return any(
            token in name
            for token in (
                "date",
                "time",
                "timestamp",
                "datetime",
                "created",
                "updated",
                "month",
                "year",
                "dob",
            )
        )

    @staticmethod
    def _snake_case(name: str) -> str:
        cleaned = re.sub(r"[^a-zA-Z0-9]+", "_", name).strip("_")
        return cleaned.lower()

    def _massage(self, df: pd.DataFrame) -> pd.DataFrame:
        result = df.copy()
        result.columns = [self._snake_case(c) for c in result.columns]

        for col in result.columns:
            if result[col].dtype == "object":
                result[col] = result[col].astype(str).str.strip()
                if self._looks_like_datetime_column(col):
                    parsed_date = pd.to_datetime(result[col], errors="coerce", utc=True)
                else:
                    parsed_date = pd.Series([pd.NaT] * len(result), index=result.index)

                if parsed_date.notna().mean() > 0.75:
                    result[col] = parsed_date
                    continue

                parsed_num = pd.to_numeric(result[col], errors="coerce")
                if parsed_num.notna().mean() > 0.80:
                    result[col] = parsed_num

        result = result.drop_duplicates()
        result = result.replace({"": None, "nan": None, "None": None})
        return result

    def _profile(self, df: pd.DataFrame) -> dict[str, Any]:
        numeric_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
        datetime_cols = [c for c in df.columns if pd.api.types.is_datetime64_any_dtype(df[c])]
        categorical_cols = [c for c in df.columns if c not in numeric_cols + datetime_cols]
        return {
            "row_count": int(df.shape[0]),
            "column_count": int(df.shape[1]),
            "columns": df.columns.tolist(),
            "numeric_columns": numeric_cols,
            "datetime_columns": datetime_cols,
            "categorical_columns": categorical_cols,
            "null_ratio": {c: float(df[c].isna().mean()) for c in df.columns},
        }

    def _quality(self, df: pd.DataFrame) -> dict[str, Any]:
        total_cells = max(df.shape[0] * max(df.shape[1], 1), 1)
        missing_cells = int(df.isna().sum().sum())
        completeness = 1 - (missing_cells / total_cells)
        uniqueness = 1 - (df.duplicated().mean() if len(df) else 0)
        consistency = 1 - min(float(df.isna().mean().mean()), 1.0)
        score = (completeness * 0.5) + (uniqueness * 0.3) + (consistency * 0.2)
        return {
            "completeness": round(float(completeness), 4),
            "uniqueness": round(float(uniqueness), 4),
            "consistency": round(float(consistency), 4),
            "score": round(float(score), 4),
        }

    def process_file(self, source_path: str, source_type: str, dataset_name: str) -> dict[str, Any]:
        source = Path(source_path)
        if source_type == "csv":
            df = pd.read_csv(source)
        elif source_type == "excel":
            df = pd.read_excel(source)
        elif source_type == "xml":
            df = pd.read_xml(source)
        else:
            raise ValueError("Unsupported source type")

        cleaned = self._massage(df)
        curated_path = self.curated_dir / f"{dataset_name}_curated.csv"
        cleaned.to_csv(curated_path, index=False)

        return {
            "curated_path": str(curated_path),
            "profile": self._profile(cleaned),
            "quality": self._quality(cleaned),
        }

    def process_sql(self, sql_connection: str, query: str, dataset_name: str) -> dict[str, Any]:
        engine = create_engine(sql_connection)
        df = pd.read_sql_query(query, engine)
        cleaned = self._massage(df)
        curated_path = self.curated_dir / f"{dataset_name}_curated.csv"
        cleaned.to_csv(curated_path, index=False)
        return {
            "curated_path": str(curated_path),
            "profile": self._profile(cleaned),
            "quality": self._quality(cleaned),
        }
