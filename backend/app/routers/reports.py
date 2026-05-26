from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.agents.audit_agent import AuditAgent
from app.agents.kpi_recommendation_agent import KpiRecommendationAgent
from app.agents.report_orchestrator import ReportOrchestrator
from app.db import get_db
from app.deps import get_current_user
from app.models import Dataset, Report, User
from app.schemas import ReportCreate, ReportKpiRequest, ReportKpiResponse, ReportOut

router = APIRouter(prefix="/reports", tags=["reports"])
orchestrator = ReportOrchestrator()
_kpi_agent = KpiRecommendationAgent()


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


@router.post("/{report_id}/kpis", response_model=ReportKpiResponse)
def get_report_kpis(
    report_id: int,
    payload: ReportKpiRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    report = (
        db.query(Report)
        .join(Dataset, Dataset.id == Report.dataset_id)
        .filter(Report.id == report_id, Dataset.owner_id == user.id)
        .first()
    )
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    result = _kpi_agent.build_kpis(payload.period_data)
    AuditAgent.log(
        db,
        "report.kpis",
        "report",
        user.id,
        str(report.id),
        details={"mode": result.get("mode", "unknown"), "card_count": len(result.get("cards", []))},
    )
    return result


@router.get("/{report_id}/business-insights")
def get_business_insights(report_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = (
        db.query(Report)
        .join(Dataset, Dataset.id == Report.dataset_id)
        .filter(Report.id == report_id, Dataset.owner_id == user.id)
        .first()
    )
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    dataset = report.dataset
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    spec = orchestrator.create_report_spec(dataset.curated_path, dataset.profile, report.period)
    return {
        "report_id": report.id,
        "dataset_id": dataset.id,
        "period": report.period,
        "report_spec": spec,
    }
