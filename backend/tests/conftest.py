from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.main import app
from app.models import Dataset, Report, User, Widget


TEST_DB_PATH = Path("./test_agentic_viz.db")
TEST_DB_URL = f"sqlite:///{TEST_DB_PATH}"


@pytest.fixture(scope="session")
def test_engine():
    engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    if TEST_DB_PATH.exists():
        try:
            TEST_DB_PATH.unlink()
        except PermissionError:
            # Windows can keep a transient file handle after teardown.
            pass


@pytest.fixture(scope="function")
def db_session(test_engine):
    TestingSessionLocal = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()

    cleanup_session = TestingSessionLocal()
    try:
        for table in reversed(Base.metadata.sorted_tables):
            cleanup_session.execute(table.delete())
        cleanup_session.commit()
    finally:
        cleanup_session.close()


@pytest.fixture(scope="function")
def client(test_engine, db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture(scope="function")
def auth_context(client, db_session):
    email = f"tester_{uuid4().hex[:10]}@example.com"
    password = "StrongPass123"
    payload = {"email": email, "full_name": "Test User", "password": password}

    reg_response = client.post("/api/auth/register", json=payload)
    assert reg_response.status_code == 200

    login_response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]

    user = db_session.query(User).filter(User.email == email).first()
    assert user is not None

    return {
        "user": user,
        "headers": {"Authorization": f"Bearer {token}"},
        "email": email,
        "password": password,
    }


@pytest.fixture(scope="function")
def sample_curated_csv(tmp_path):
    csv_path = tmp_path / "sample_curated.csv"
    csv_path.write_text(
        "order_date,revenue,category,quantity\n"
        "2024-01-01,120.5,A,2\n"
        "2024-01-15,250.0,B,5\n"
        "2024-02-10,90.0,A,1\n",
        encoding="utf-8",
    )
    return str(csv_path)


@pytest.fixture(scope="function")
def sample_dataset(db_session, auth_context, sample_curated_csv):
    dataset = Dataset(
        name="Sample Dataset",
        source_type="csv",
        raw_path="/tmp/raw.csv",
        curated_path=sample_curated_csv,
        profile={
            "row_count": 3,
            "column_count": 4,
            "columns": ["order_date", "revenue", "category", "quantity"],
            "numeric_columns": ["revenue", "quantity"],
            "datetime_columns": ["order_date"],
            "categorical_columns": ["category"],
            "null_ratio": {"order_date": 0.0, "revenue": 0.0, "category": 0.0, "quantity": 0.0},
        },
        quality={"completeness": 1.0, "uniqueness": 1.0, "consistency": 1.0, "score": 1.0},
        owner_id=auth_context["user"].id,
    )
    db_session.add(dataset)
    db_session.commit()
    db_session.refresh(dataset)
    return dataset


@pytest.fixture(scope="function")
def sample_report(db_session, sample_dataset):
    report = Report(
        dataset_id=sample_dataset.id,
        title="Sample Dataset - monthly AI Report",
        period="monthly",
        report_spec={"suggestions": [], "aggregations": {}, "ai_summary": {}},
    )
    db_session.add(report)
    db_session.commit()
    db_session.refresh(report)
    return report


@pytest.fixture(scope="function")
def sample_widget(db_session, sample_report):
    widget = Widget(
        report_id=sample_report.id,
        title="Revenue KPI",
        chart_type="kpi",
        x_field=None,
        y_field="revenue",
        color="#1f77b4",
        pattern="solid",
        position=0,
        config={},
    )
    db_session.add(widget)
    db_session.commit()
    db_session.refresh(widget)
    return widget