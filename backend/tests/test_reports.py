from pathlib import Path

import pandas as pd

from app.agents.report_orchestrator import ReportOrchestrator
from app.models import Dataset, Report


def test_generate_report_success(client, auth_context, sample_dataset):
    response = client.post(
        "/api/reports/generate",
        json={"dataset_id": sample_dataset.id, "period": "monthly"},
        headers=auth_context["headers"],
    )

    assert response.status_code == 200
    body = response.json()
    assert body["dataset_id"] == sample_dataset.id
    assert body["period"] == "monthly"
    assert "suggestions" in body["report_spec"]
    assert "aggregations" in body["report_spec"]


def test_generate_report_dataset_not_found(client, auth_context):
    response = client.post(
        "/api/reports/generate",
        json={"dataset_id": 999999, "period": "monthly"},
        headers=auth_context["headers"],
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Dataset not found"


def test_get_report_by_id_success(client, auth_context, sample_report):
    response = client.get(f"/api/reports/{sample_report.id}", headers=auth_context["headers"])

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == sample_report.id
    assert body["dataset_id"] == sample_report.dataset_id


def test_list_reports_with_filter(client, auth_context, sample_report):
    response = client.get(
        f"/api/reports?dataset_id={sample_report.dataset_id}",
        headers=auth_context["headers"],
    )

    assert response.status_code == 200
    reports = response.json()
    assert len(reports) >= 1
    assert all(item["dataset_id"] == sample_report.dataset_id for item in reports)


def test_report_kpis_returns_cards(client, auth_context, sample_report):
    period_data = [
        {"revenue": 200.0, "purchase_count": 4, "customer_count": 3, "new_customers": 1},
        {"revenue": 150.0, "purchase_count": 2, "customer_count": 2, "new_customers": 1},
    ]
    response = client.post(
        f"/api/reports/{sample_report.id}/kpis",
        json={"period_data": period_data},
        headers=auth_context["headers"],
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] in {"ok", "mapping_fallback"}
    assert len(body["cards"]) > 0


def test_report_spec_includes_business_period_metrics(tmp_path):
    csv_path = tmp_path / "orders.csv"
    csv_path.write_text(
        "orderdate,orderid,customerid,totalamount,discount,netamount,orderstatus\n"
        "2025-01-01,A1,C1,100,10,90,Delivered\n"
        "2025-01-02,A2,C2,200,20,180,Cancelled\n"
        "2025-02-01,A3,C1,150,5,145,Pending\n"
        "2025-02-03,A4,C3,50,0,50,Returned\n",
        encoding="utf-8",
    )

    profile = {
        "numeric_columns": ["totalamount", "discount", "netamount"],
        "datetime_columns": ["orderdate"],
        "categorical_columns": ["orderstatus"],
    }

    spec = ReportOrchestrator().create_report_spec(str(csv_path), profile, "monthly")
    monthly = spec["aggregations"]["monthly"]

    assert monthly
    first_row = monthly[0]
    assert first_row["total_orders"] == 2
    assert first_row["total_users"] == 2
    assert first_row["total_revenue"] == 300
    assert first_row["total_spend"] == 30
    assert first_row["total_profit"] == 270
    assert first_row["refund_count"] == 1
    assert "roi" in first_row
    assert any(item["y_field"] == "total_orders" for item in spec["suggestions"])
    assert any(item["y_field"] == "roi" for item in spec["suggestions"])


def test_business_insights_endpoint_returns_category_profit(client, auth_context, db_session, tmp_path):
    csv_path = tmp_path / "business.csv"
    csv_path.write_text(
        "order_date,category,revenue,profit\n"
        "2025-01-01,A,100,30\n"
        "2025-01-02,B,250,80\n"
        "2025-01-03,A,150,45\n",
        encoding="utf-8",
    )

    dataset = Dataset(
        name="Business Dataset",
        source_type="csv",
        raw_path=str(csv_path),
        curated_path=str(csv_path),
        profile={
            "row_count": 3,
            "column_count": 4,
            "columns": ["order_date", "category", "revenue", "profit"],
            "numeric_columns": ["revenue", "profit"],
            "datetime_columns": ["order_date"],
            "categorical_columns": ["category"],
            "null_ratio": {"order_date": 0.0, "category": 0.0, "revenue": 0.0, "profit": 0.0},
        },
        quality={"completeness": 1.0, "uniqueness": 1.0, "consistency": 1.0, "score": 1.0},
        owner_id=auth_context["user"].id,
    )
    db_session.add(dataset)
    db_session.commit()
    db_session.refresh(dataset)

    report = Report(
        dataset_id=dataset.id,
        title="Business Dataset - monthly AI Report",
        period="monthly",
        report_spec={},
    )
    db_session.add(report)
    db_session.commit()
    db_session.refresh(report)

    response = client.get(f"/api/reports/{report.id}/business-insights", headers=auth_context["headers"])

    assert response.status_code == 200
    body = response.json()
    assert body["report_id"] == report.id
    assert body["report_spec"]["analysis_views"]["category_profit"]


def test_business_insights_endpoint_handles_generic_numeric_fields(client, auth_context, db_session, tmp_path):
    csv_path = tmp_path / "generic_business.csv"
    csv_path.write_text(
        "order_date,category,amount\n"
        "2025-01-01,A,100\n"
        "2025-01-02,B,250\n"
        "2025-01-03,A,150\n",
        encoding="utf-8",
    )

    dataset = Dataset(
        name="Generic Business Dataset",
        source_type="csv",
        raw_path=str(csv_path),
        curated_path=str(csv_path),
        profile={
            "row_count": 3,
            "column_count": 3,
            "columns": ["order_date", "category", "amount"],
            "numeric_columns": ["amount"],
            "datetime_columns": ["order_date"],
            "categorical_columns": ["category"],
            "null_ratio": {"order_date": 0.0, "category": 0.0, "amount": 0.0},
        },
        quality={"completeness": 1.0, "uniqueness": 1.0, "consistency": 1.0, "score": 1.0},
        owner_id=auth_context["user"].id,
    )
    db_session.add(dataset)
    db_session.commit()
    db_session.refresh(dataset)

    report = Report(
        dataset_id=dataset.id,
        title="Generic Business Dataset - monthly AI Report",
        period="monthly",
        report_spec={},
    )
    db_session.add(report)
    db_session.commit()
    db_session.refresh(report)

    response = client.get(f"/api/reports/{report.id}/business-insights", headers=auth_context["headers"])

    assert response.status_code == 200
    body = response.json()
    category_profit = body["report_spec"]["analysis_views"].get("category_profit")
    assert category_profit
    assert any("amount" in row for row in category_profit)


def test_report_spec_builds_requested_business_views(tmp_path):
    csv_path = tmp_path / "business_views.csv"
    csv_path.write_text(
        "order_date,category,channel,customer_segment,region,payment_method,revenue,profit,ad_spend,customer_id\n"
        "2025-01-01,Electronics,Search,Enterprise,North,Card,200,60,50,C1\n"
        "2025-01-02,Fashion,Social,SMB,South,UPI,150,45,40,C2\n"
        "2025-01-03,Electronics,Search,SMB,North,Card,300,90,70,C3\n"
        "2025-01-04,Home,Email,Enterprise,West,Wallet,120,20,30,C4\n",
        encoding="utf-8",
    )

    profile = {
        "numeric_columns": ["revenue", "profit", "ad_spend"],
        "datetime_columns": ["order_date"],
        "categorical_columns": ["category", "channel", "customer_segment", "region", "payment_method", "customer_id"],
    }

    spec = ReportOrchestrator().create_report_spec(str(csv_path), profile, "monthly")
    views = spec.get("analysis_views", {})

    assert views.get("category_profit")
    assert views.get("channel_marketing_efficiency")
    assert views.get("segment_channel_mix")
    assert views.get("geography_performance")
    assert views.get("payment_method_share")
