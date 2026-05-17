from numbers import Number

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.agents.audit_agent import AuditAgent
from app.agents.report_orchestrator import ReportOrchestrator
from app.db import get_db
from app.deps import get_current_user
from app.models import Dataset, Report, User
from app.schemas import ReportCreate, ReportOut

router = APIRouter(prefix="/reports", tags=["reports"])
orchestrator = ReportOrchestrator()


def _pick_primary_metric(period_data: list[dict]) -> str | None:
    if not period_data:
        return None

    preferred = ("revenue", "sales", "amount", "profit", "total", "quantity", "count")
    numeric_keys = [key for key in period_data[0] if isinstance(period_data[0].get(key), Number)]
    for key in preferred:
        match = next((item for item in numeric_keys if key in item.lower()), None)
        if match:
            return match
    return numeric_keys[0] if numeric_keys else None


def _build_kpi_cards(period_data: list[dict]) -> list[dict]:
    if not period_data:
        return []

    metric = _pick_primary_metric(period_data)
    numeric_rows = [row for row in period_data if metric and isinstance(row.get(metric), Number)]
    if not metric or not numeric_rows:
        return []

    values = [float(row[metric]) for row in numeric_rows]
    total_value = sum(values)
    average_value = total_value / len(values)
    latest_value = values[-1]
    previous_value = values[-2] if len(values) > 1 else None
    delta_pct = None
    if previous_value not in (None, 0):
        delta_pct = round(((latest_value - previous_value) / previous_value) * 100, 2)

    return [
        {"label": f"Total {metric.replace('_', ' ').title()}", "value": round(total_value, 2)},
        {"label": f"Average {metric.replace('_', ' ').title()}", "value": round(average_value, 2)},
        {
            "label": f"Latest {metric.replace('_', ' ').title()}",
            "value": round(latest_value, 2),
            "delta": delta_pct,
        },
    ]


@router.post("/generate", response_model=ReportOut)
def generate_report(payload: ReportCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    dataset = db.query(Dataset).filter(Dataset.id == payload.dataset_id, Dataset.owner_id == user.id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    spec = orchestrator.create_report_spec(dataset.curated_path, dataset.profile, payload.period)
    report = Report(
        dataset_id=dataset.id,
        title=f"{dataset.name} - {payload.period} AI Report",
        period=payload.period,
        report_spec=spec,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    AuditAgent.log(db, "report.generate", "report", user.id, str(report.id), details={"period": payload.period})
    return report


@router.get("/{report_id}", response_model=ReportOut)
def get_report(report_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = (
        db.query(Report)
        .join(Dataset, Dataset.id == Report.dataset_id)
        .filter(Report.id == report_id, Dataset.owner_id == user.id)
        .first()
    )
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@router.get("", response_model=list[ReportOut])
def list_reports(dataset_id: int | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = db.query(Report).join(Dataset, Dataset.id == Report.dataset_id).filter(Dataset.owner_id == user.id)
    if dataset_id:
        query = query.filter(Report.dataset_id == dataset_id)
    return query.order_by(Report.id.desc()).all()


@router.post("/{report_id}/kpis")
def report_kpis(report_id: int, payload: dict, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = (
        db.query(Report)
        .join(Dataset, Dataset.id == Report.dataset_id)
        .filter(Report.id == report_id, Dataset.owner_id == user.id)
        .first()
    )
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    period_data = payload.get("period_data") or []
    cards = _build_kpi_cards(period_data)
    status_value = "ok" if cards else "mapping_fallback"
    if not cards:
        cards = [{"label": "No KPI data available", "value": 0}]

    return {"status": status_value, "cards": cards}
