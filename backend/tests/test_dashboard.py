from app.models import Dataset, Report, Widget


def test_get_dashboard_success(client, auth_context, sample_dataset):
    response = client.get(f"/api/dashboard/{sample_dataset.id}", headers=auth_context["headers"])

    assert response.status_code == 200
    body = response.json()
    assert body["dataset"]["id"] == sample_dataset.id
    assert isinstance(body["reports"], list)
    assert isinstance(body["widgets"], list)


def test_get_dashboard_not_found_for_missing_dataset(client, auth_context):
    response = client.get("/api/dashboard/999999", headers=auth_context["headers"])

    assert response.status_code == 404
    assert response.json()["detail"] == "Dataset not found"


def test_get_dashboard_includes_dataset_reports(client, auth_context, sample_dataset, db_session):
    report = Report(
        dataset_id=sample_dataset.id,
        title="Monthly Report",
        period="monthly",
        report_spec={},
    )
    db_session.add(report)
    db_session.commit()

    response = client.get(f"/api/dashboard/{sample_dataset.id}", headers=auth_context["headers"])

    assert response.status_code == 200
    reports = response.json()["reports"]
    assert len(reports) == 1
    assert reports[0]["title"] == "Monthly Report"


def test_get_dashboard_widgets_are_position_sorted(client, auth_context, sample_dataset, db_session):
    report = Report(dataset_id=sample_dataset.id, title="Sorted Report", period="monthly", report_spec={})
    db_session.add(report)
    db_session.commit()
    db_session.refresh(report)

    db_session.add_all(
        [
            Widget(
                report_id=report.id,
                title="Second",
                chart_type="kpi",
                y_field="revenue",
                position=2,
                color="#1f77b4",
                pattern="solid",
                config={},
            ),
            Widget(
                report_id=report.id,
                title="First",
                chart_type="kpi",
                y_field="quantity",
                position=1,
                color="#ff7f0e",
                pattern="solid",
                config={},
            ),
        ]
    )
    db_session.commit()

    response = client.get(f"/api/dashboard/{sample_dataset.id}", headers=auth_context["headers"])

    assert response.status_code == 200
    widgets = response.json()["widgets"]
    assert len(widgets) == 2
    assert widgets[0]["position"] <= widgets[1]["position"]


def test_get_dashboard_enforces_owner_isolation(client, db_session, auth_context, sample_curated_csv):
    other = client.post(
        "/api/auth/register",
        json={"email": "other_user@example.com", "full_name": "Other User", "password": "StrongPass123"},
    )
    assert other.status_code == 200

    other_login = client.post(
        "/api/auth/login",
        json={"email": "other_user@example.com", "password": "StrongPass123"},
    )
    assert other_login.status_code == 200
    other_headers = {"Authorization": f"Bearer {other_login.json()['access_token']}"}

    owner_dataset = Dataset(
        name="Owner Dataset",
        source_type="csv",
        raw_path="/tmp/raw_owner.csv",
        curated_path=sample_curated_csv,
        profile={
            "row_count": 1,
            "column_count": 1,
            "columns": ["revenue"],
            "numeric_columns": ["revenue"],
            "datetime_columns": [],
            "categorical_columns": [],
            "null_ratio": {"revenue": 0.0},
        },
        quality={"completeness": 1.0, "uniqueness": 1.0, "consistency": 1.0, "score": 1.0},
        owner_id=auth_context["user"].id,
    )
    db_session.add(owner_dataset)
    db_session.commit()
    db_session.refresh(owner_dataset)

    response = client.get(f"/api/dashboard/{owner_dataset.id}", headers=other_headers)

    assert response.status_code == 404
    assert response.json()["detail"] == "Dataset not found"
