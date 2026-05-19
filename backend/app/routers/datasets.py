from pathlib import Path

import pandas as pd
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.agents.audit_agent import AuditAgent
from app.agents.ingestion_agent import IngestionAgent
from app.core.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.models import Dataset, User
from app.schemas import DatasetOut, DrilldownResponse, SQLIngestRequest

router = APIRouter(prefix="/datasets", tags=["datasets"])
ingestion_agent = IngestionAgent(raw_dir=settings.raw_data_dir, curated_dir=settings.curated_data_dir)


def _period_offset(period: str | None) -> pd.DateOffset | pd.Timedelta | None:
    mapping: dict[str, pd.DateOffset | pd.Timedelta] = {
        "daily": pd.Timedelta(days=1),
        "biweekly": pd.Timedelta(days=14),
        "monthly": pd.DateOffset(months=1),
        "quarterly": pd.DateOffset(months=3),
        "half_yearly": pd.DateOffset(months=6),
        "yearly": pd.DateOffset(years=1),
    }
    if not period:
        return None
    return mapping.get(period.lower())


def _period_bucket_mask(series: pd.Series, target: pd.Timestamp, period: str) -> pd.Series:
        if hasattr(series.dt, "tz") and series.dt.tz is not None:
                series = series.dt.tz_localize(None)
        if target.tzinfo is not None:
                target = target.tz_localize(None)

        p = period.lower()
        if p == "daily":
                return series.dt.date == target.date()
        if p == "biweekly":
                lower = target - pd.Timedelta(days=14)
                return (series > lower) & (series <= target)
        if p == "monthly":
                return series.dt.to_period("M") == target.to_period("M")
        if p == "quarterly":
                return series.dt.to_period("Q") == target.to_period("Q")
        if p == "yearly":
                return series.dt.to_period("Y") == target.to_period("Y")
        if p == "half_yearly":
                same_year = series.dt.year == target.year
                target_half = 1 if target.month <= 6 else 2
                series_half = series.dt.month.apply(lambda m: 1 if m <= 6 else 2)
                return same_year & (series_half == target_half)
        return pd.Series([False] * len(series))


@router.get("/{dataset_id}/records", response_model=DrilldownResponse)
def drilldown_records(
    dataset_id: int,
    field: str,
    value: str,
    period: str | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.owner_id == user.id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    curated_path = Path(dataset.curated_path)
    if not curated_path.exists():
        raise HTTPException(status_code=404, detail="Curated dataset file not found")

    df = pd.read_csv(curated_path)
    if field not in df.columns:
        raise HTTPException(status_code=400, detail=f"Field '{field}' not found in dataset")

    profile = dataset.profile or {}
    datetime_columns = set(profile.get("datetime_columns", []))
    mask = pd.Series([False] * len(df))

    if field in datetime_columns:
        series = pd.to_datetime(df[field], errors="coerce", utc=True)
        target = pd.to_datetime(value, errors="coerce", utc=True)
        if pd.isna(target):
            raise HTTPException(status_code=400, detail="Unable to interpret clicked date value")

        valid_series = series.notna()
        if period:
            offset = _period_offset(period)
            if offset is not None:
                lower_bound = target - offset
                mask = valid_series & (series > lower_bound) & (series <= target)

            # Fallback for bucket labels that may not align exactly with raw row timestamps.
            if not bool(mask.any()):
                bucket_mask = _period_bucket_mask(series[valid_series], target, period)
                fallback = pd.Series([False] * len(series))
                fallback.loc[valid_series[valid_series].index] = bucket_mask.values
                mask = fallback

        # Last-resort exact day match if no period is supplied.
        if not period:
            mask = valid_series & (series.dt.date == target.date())
    else:
        normalized = df[field].astype(str).str.strip().str.lower()
        mask = normalized == str(value).strip().lower()
        if not bool(mask.any()):
            mask = normalized.str.contains(str(value).strip().lower(), regex=False, na=False)

    # Final UX fallback: if strict matching still returns no rows, show a contextual sample.
    if not bool(mask.any()):
        if datetime_columns:
            primary_dt = next(iter(datetime_columns))
            if primary_dt in df.columns and period:
                dt_series = pd.to_datetime(df[primary_dt], errors="coerce", utc=True)
                target = pd.to_datetime(value, errors="coerce", utc=True)
                if not pd.isna(target):
                    valid = dt_series.notna()
                    bucket_mask = _period_bucket_mask(dt_series[valid], target, period)
                    fallback = pd.Series([False] * len(dt_series))
                    fallback.loc[valid[valid].index] = bucket_mask.values
                    if bool(fallback.any()):
                        mask = fallback

    if not bool(mask.any()):
        top_n = max(1, min(limit, 30))
        output = df.head(top_n).to_dict("records")
        for row in output:
            for key, item in list(row.items()):
                if isinstance(item, pd.Timestamp):
                    row[key] = item.isoformat()
                elif pd.isna(item):
                    row[key] = None
        return DrilldownResponse(
            field=field,
            value=str(value),
            period=period,
            total_count=len(df),
            records=output,
        )

    records = df.loc[mask].head(max(1, min(limit, 500))).copy()
    output = records.to_dict("records")
    for row in output:
        for key, item in list(row.items()):
            if isinstance(item, pd.Timestamp):
                row[key] = item.isoformat()
            elif pd.isna(item):
                row[key] = None

    return DrilldownResponse(
        field=field,
        value=str(value),
        period=period,
        total_count=int(mask.sum()),
        records=output,
    )


@router.post("/upload", response_model=DatasetOut)
async def upload_dataset(
    dataset_name: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    suffix = Path(file.filename or "").suffix.lower()
    source_type_map = {".csv": "csv", ".xlsx": "excel", ".xls": "excel", ".xml": "xml"}
    if suffix not in source_type_map:
        raise HTTPException(status_code=400, detail="Supported formats: csv, excel, xml")

    inferred_name = Path(file.filename or "dataset").stem or "dataset"
    final_dataset_name = (dataset_name or "").strip() or inferred_name
    safe_name = final_dataset_name.replace(" ", "_").lower()
    raw_path = Path(settings.raw_data_dir) / f"{safe_name}{suffix}"
    raw_path.parent.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    raw_path.write_bytes(content)

    result = ingestion_agent.process_file(str(raw_path), source_type_map[suffix], safe_name)
    dataset = Dataset(
        name=final_dataset_name,
        source_type=source_type_map[suffix],
        raw_path=str(raw_path),
        curated_path=result["curated_path"],
        profile=result["profile"],
        quality=result["quality"],
        owner_id=user.id,
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)

    AuditAgent.log(
        db,
        action="dataset.upload",
        resource_type="dataset",
        resource_id=str(dataset.id),
        user_id=user.id,
        details={"source_type": source_type_map[suffix], "quality": dataset.quality},
    )
    return dataset


@router.post("/ingest-sql", response_model=DatasetOut)
def ingest_sql(
    payload: SQLIngestRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    safe_name = payload.dataset_name.replace(" ", "_").lower()
    result = ingestion_agent.process_sql(payload.sql_connection, payload.query, safe_name)
    dataset = Dataset(
        name=payload.dataset_name,
        source_type="sql",
        raw_path="sql://query",
        curated_path=result["curated_path"],
        profile=result["profile"],
        quality=result["quality"],
        owner_id=user.id,
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    AuditAgent.log(db, "dataset.ingest_sql", "dataset", user.id, str(dataset.id))
    return dataset


@router.get("", response_model=list[DatasetOut])
def list_datasets(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(Dataset).filter(Dataset.owner_id == user.id).order_by(Dataset.id.desc()).all()


@router.get("/{dataset_id}", response_model=DatasetOut)
def get_dataset(dataset_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    item = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.owner_id == user.id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return item


@router.delete("/{dataset_id}")
def delete_dataset(dataset_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    item = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.owner_id == user.id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Dataset not found")
    db.delete(item)
    db.commit()
    AuditAgent.log(db, "dataset.delete", "dataset", user.id, str(dataset_id), risk_score=0.2)
    return {"message": "Dataset deleted"}
