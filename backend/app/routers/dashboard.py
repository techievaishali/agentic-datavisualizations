from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Dataset, Report, User, Widget
from app.schemas import DashboardResponse

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/{dataset_id}", response_model=DashboardResponse)
def get_dashboard(dataset_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.owner_id == user.id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    reports = db.query(Report).filter(Report.dataset_id == dataset_id).order_by(Report.id.desc()).all()
    report_ids = [r.id for r in reports]
    widgets = db.query(Widget).filter(Widget.report_id.in_(report_ids)).order_by(Widget.position.asc()).all() if report_ids else []

    return DashboardResponse(dataset=dataset, reports=reports, widgets=widgets)
