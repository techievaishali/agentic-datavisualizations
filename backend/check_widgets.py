from app.db import SessionLocal
from app.models import Widget, Report, Dataset, User

db = SessionLocal()
widgets = db.query(Widget).all()
print(f"Total widgets: {len(widgets)}")

for w in widgets[:10]:
    report = db.query(Report).filter(Report.id == w.report_id).first()
    if report:
        dataset = db.query(Dataset).filter(Dataset.id == report.dataset_id).first()
        user = db.query(User).filter(User.id == dataset.owner_id).first() if dataset else None
        owner_email = user.email if user else "N/A"
        print(f"Widget {w.id}: report_id={w.report_id}, dataset_id={report.dataset_id}, owner={owner_email}")
    else:
        print(f"Widget {w.id}: ORPHANED (report {w.report_id} missing!)")

db.close()
