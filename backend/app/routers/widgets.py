from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.agents.audit_agent import AuditAgent
from app.agents.widget_summary_agent import WidgetSummaryAgent
from app.db import get_db
from app.deps import get_current_user
from app.models import Dataset, Report, User, Widget
from app.schemas import WidgetCreate, WidgetOut, WidgetSummaryRequest, WidgetSummaryResponse, WidgetUpdate

_widget_summary_agent = WidgetSummaryAgent()

router = APIRouter(prefix="/widgets", tags=["widgets"])


@router.post("", response_model=WidgetOut)
def create_widget(payload: WidgetCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = (
        db.query(Report)
        .join(Dataset, Dataset.id == Report.dataset_id)
        .filter(Report.id == payload.report_id, Dataset.owner_id == user.id)
        .first()
    )
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    widget = Widget(**payload.model_dump())
    db.add(widget)
    db.commit()
    db.refresh(widget)
    AuditAgent.log(db, "widget.create", "widget", user.id, str(widget.id))
    return widget


@router.get("", response_model=list[WidgetOut])
def list_widgets(report_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = (
        db.query(Report)
        .join(Dataset, Dataset.id == Report.dataset_id)
        .filter(Report.id == report_id, Dataset.owner_id == user.id)
        .first()
    )
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return db.query(Widget).filter(Widget.report_id == report_id).order_by(Widget.position.asc()).all()


@router.put("/{widget_id}", response_model=WidgetOut)
def update_widget(widget_id: int, payload: WidgetUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    widget = (
        db.query(Widget)
        .join(Report, Report.id == Widget.report_id)
        .join(Dataset, Dataset.id == Report.dataset_id)
        .filter(Widget.id == widget_id, Dataset.owner_id == user.id)
        .first()
    )
    if not widget:
        raise HTTPException(status_code=404, detail="Widget not found")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(widget, field, value)

    db.commit()
    db.refresh(widget)
    AuditAgent.log(db, "widget.update", "widget", user.id, str(widget.id), risk_score=0.1)
    return widget


@router.post("/{widget_id}/summary", response_model=WidgetSummaryResponse)
def get_widget_summary(
    widget_id: int,
    payload: WidgetSummaryRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    widget = (
        db.query(Widget)
        .join(Report, Report.id == Widget.report_id)
        .join(Dataset, Dataset.id == Report.dataset_id)
        .filter(Widget.id == widget_id, Dataset.owner_id == user.id)
        .first()
    )
    if not widget:
        raise HTTPException(status_code=404, detail="Widget not found")

    result = _widget_summary_agent.summarize(
        title=widget.title,
        chart_type=widget.chart_type,
        x_field=widget.x_field,
        y_field=widget.y_field,
        period_data=payload.period_data,
        comparison_period_data=payload.comparison_period_data,
    )
    AuditAgent.log(db, "widget.summary", "widget", user.id, str(widget_id))
    return result


@router.delete("/{widget_id}")
def delete_widget(widget_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    widget = (
        db.query(Widget)
        .join(Report, Report.id == Widget.report_id)
        .join(Dataset, Dataset.id == Report.dataset_id)
        .filter(Widget.id == widget_id, Dataset.owner_id == user.id)
        .first()
    )
    if not widget:
        raise HTTPException(status_code=404, detail="Widget not found")

    db.delete(widget)
    db.commit()
    AuditAgent.log(db, "widget.delete", "widget", user.id, str(widget_id), risk_score=0.2)
    return {"message": "Widget deleted"}
