from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.agents.audit_agent import AuditAgent
from app.agents.ingestion_agent import IngestionAgent
from app.core.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.models import Dataset, User
from app.schemas import DatasetOut, SQLIngestRequest

router = APIRouter(prefix="/datasets", tags=["datasets"])
ingestion_agent = IngestionAgent(raw_dir=settings.raw_data_dir, curated_dir=settings.curated_data_dir)


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
