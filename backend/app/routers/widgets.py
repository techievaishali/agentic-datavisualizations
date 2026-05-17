from numbers import Number

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.agents.audit_agent import AuditAgent
from app.db import get_db
from app.deps import get_current_user
from app.models import Dataset, Report, User, Widget
from app.schemas import WidgetCreate, WidgetOut, WidgetUpdate

router = APIRouter(prefix="/widgets", tags=["widgets"])


def _build_summary_text(widget: Widget, period_data: list[dict]) -> str:
    metric = widget.y_field or next(
        (
            key
            for row in period_data
            for key, value in row.items()
            if isinstance(value, Number)
        ),
        None,
    )
    if not metric:
        return f"{widget.title} has no numeric data available for summary."

    values = [float(row[metric]) for row in period_data if isinstance(row.get(metric), Number)]
    if not values:
        return f"{widget.title} has no numeric data available for summary."

    total_value = round(sum(values), 2)
    average_value = round(total_value / len(values), 2)
    return f"{widget.title} shows {metric.replace('_', ' ')} totaling {total_value} with an average of {average_value} across {len(values)} periods."


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


@router.post("/{widget_id}/summary")
def widget_summary(widget_id: int, payload: dict, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    widget = (
        db.query(Widget)
        .join(Report, Report.id == Widget.report_id)
        .join(Dataset, Dataset.id == Report.dataset_id)
        .filter(Widget.id == widget_id, Dataset.owner_id == user.id)
        .first()
    )
    if not widget:
        raise HTTPException(status_code=404, detail="Widget not found")

    period_data = payload.get("period_data") or []
    return {
        "status": "provider not configured",
        "text": _build_summary_text(widget, period_data),
    }
