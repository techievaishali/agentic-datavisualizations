from sqlalchemy.orm import Session

from app.models import AuditLog


class AuditAgent:
    @staticmethod
    def log(
        db: Session,
        action: str,
        resource_type: str,
        user_id: int | None = None,
        resource_id: str | None = None,
        details: dict | None = None,
        risk_score: float = 0.0,
    ) -> None:
        entry = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details or {},
            risk_score=risk_score,
        )
        db.add(entry)
        db.commit()
