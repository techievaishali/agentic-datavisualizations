from uuid import uuid4

import pytest


def _register_and_login(client):
    email = f"swagger_{uuid4().hex[:10]}@example.com"
    password = "StrongPass123"

    register_response = client.post(
        "/api/auth/register",
        json={"email": email, "full_name": "Swagger Tester", "password": password},
    )
    assert register_response.status_code == 200

    login_response = client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _upload_dataset(client, headers, dataset_name="Swagger Dataset"):
    csv_content = (
        "order_date,revenue,category,profit,customer_id\n"
        "2024-01-01,100,A,20,C1\n"
        "2024-01-02,150,B,30,C2\n"
        "2024-01-03,120,A,25,C1\n"
    )
    files = {"file": ("swagger_sales.csv", csv_content, "text/csv")}

    response = client.post(
        "/api/datasets/upload",
        data={"dataset_name": dataset_name},
        files=files,
        headers=headers,
    )
    assert response.status_code == 200
    return response.json()


def _create_report(client, headers, dataset_id):
    response = client.post(
        "/api/reports/generate",
        json={"dataset_id": dataset_id, "period": "monthly"},
        headers=headers,
    )
    assert response.status_code == 200
    return response.json()


def _create_widget(client, headers, report_id):
    response = client.post(
        "/api/widgets",
        json={
            "report_id": report_id,
            "title": "Swagger Revenue Widget",
            "chart_type": "bar",
            "x_field": "category",
            "y_field": "revenue",
            "color": "#1f77b4",
            "pattern": "solid",
            "position": 1,
            "config": {},
        },
        headers=headers,
    )
    assert response.status_code == 200
    return response.json()


@pytest.fixture
def api_context(client):
    headers = _register_and_login(client)
    dataset = _upload_dataset(client, headers)
    report = _create_report(client, headers, dataset["id"])
    widget = _create_widget(client, headers, report["id"])

    return {
        "headers": headers,
        "dataset": dataset,
        "report": report,
        "widget": widget,
    }


def test_swagger_node_health_get(client):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "timestamp" in body


def test_swagger_node_auth_register_post(client):
    payload = {
        "email": f"register_{uuid4().hex[:10]}@example.com",
        "full_name": "Register Test",
        "password": "StrongPass123",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 200
    assert response.json()["email"] == payload["email"]


def test_swagger_node_auth_login_post(client):
    email = f"login_{uuid4().hex[:10]}@example.com"
    password = "StrongPass123"
    client.post("/api/auth/register", json={"email": email, "full_name": "Login Test", "password": password})

    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    assert "access_token" in response.json()


def test_swagger_node_auth_refresh_post(api_context, client):
    response = client.post("/api/auth/refresh", headers=api_context["headers"])
    assert response.status_code == 200
    assert "access_token" in response.json()


def test_swagger_node_auth_me_get(api_context, client):
    response = client.get("/api/auth/me", headers=api_context["headers"])
    assert response.status_code == 200
    assert "email" in response.json()


def test_swagger_node_datasets_upload_post(api_context, client):
    second = _upload_dataset(client, api_context["headers"], dataset_name="Swagger Dataset 2")
    assert second["name"] == "Swagger Dataset 2"


def test_swagger_node_datasets_ingest_sql_post_validation(api_context, client):
    response = client.post("/api/datasets/ingest-sql", json={}, headers=api_context["headers"])
    assert response.status_code == 422


def test_swagger_node_datasets_list_get(api_context, client):
    response = client.get("/api/datasets", headers=api_context["headers"])
    assert response.status_code == 200
    assert any(item["id"] == api_context["dataset"]["id"] for item in response.json())


def test_swagger_node_datasets_get_by_id(api_context, client):
    dataset_id = api_context["dataset"]["id"]
    response = client.get(f"/api/datasets/{dataset_id}", headers=api_context["headers"])
    assert response.status_code == 200
    assert response.json()["id"] == dataset_id


def test_swagger_node_datasets_records_get(api_context, client):
    dataset_id = api_context["dataset"]["id"]
    response = client.get(
        f"/api/datasets/{dataset_id}/records",
        params={"field": "category", "value": "A", "period": "monthly", "limit": 5},
        headers=api_context["headers"],
    )
    assert response.status_code == 200
    body = response.json()
    assert body["field"] == "category"
    assert "records" in body


def test_swagger_node_datasets_delete_by_id(api_context, client):
    dataset = _upload_dataset(client, api_context["headers"], dataset_name="Delete Me")
    dataset_id = dataset["id"]

    delete_response = client.delete(f"/api/datasets/{dataset_id}", headers=api_context["headers"])
    assert delete_response.status_code == 200

    get_response = client.get(f"/api/datasets/{dataset_id}", headers=api_context["headers"])
    assert get_response.status_code == 404


def test_swagger_node_reports_generate_post(api_context, client):
    response = client.post(
        "/api/reports/generate",
        json={"dataset_id": api_context["dataset"]["id"], "period": "monthly"},
        headers=api_context["headers"],
    )
    assert response.status_code == 200
    assert response.json()["dataset_id"] == api_context["dataset"]["id"]


def test_swagger_node_reports_get_by_id(api_context, client):
    report_id = api_context["report"]["id"]
    response = client.get(f"/api/reports/{report_id}", headers=api_context["headers"])
    assert response.status_code == 200
    assert response.json()["id"] == report_id


def test_swagger_node_reports_list_get(api_context, client):
    response = client.get(
        "/api/reports",
        params={"dataset_id": api_context["dataset"]["id"]},
        headers=api_context["headers"],
    )
    assert response.status_code == 200
    assert any(item["id"] == api_context["report"]["id"] for item in response.json())


def test_swagger_node_reports_kpis_post(api_context, client):
    report_id = api_context["report"]["id"]
    payload = {
        "period_data": [
            {"revenue": 100.0, "purchase_count": 2, "customer_count": 2, "new_customers": 1},
            {"revenue": 120.0, "purchase_count": 3, "customer_count": 2, "new_customers": 1},
        ]
    }
    response = client.post(f"/api/reports/{report_id}/kpis", json=payload, headers=api_context["headers"])
    assert response.status_code == 200
    assert "cards" in response.json()


def test_swagger_node_reports_business_insights_get(api_context, client):
    report_id = api_context["report"]["id"]
    response = client.get(f"/api/reports/{report_id}/business-insights", headers=api_context["headers"])
    assert response.status_code == 200
    assert response.json()["report_id"] == report_id


def test_swagger_node_widgets_create_post_and_list_get(api_context, client):
    report_id = api_context["report"]["id"]
    created = _create_widget(client, api_context["headers"], report_id)

    list_response = client.get(
        "/api/widgets",
        params={"report_id": report_id},
        headers=api_context["headers"],
    )
    assert list_response.status_code == 200
    widget_ids = [item["id"] for item in list_response.json()]
    assert created["id"] in widget_ids


def test_swagger_node_widgets_update_put(api_context, client):
    widget_id = api_context["widget"]["id"]
    response = client.put(
        f"/api/widgets/{widget_id}",
        json={"title": "Updated Swagger Widget", "color": "#22c55e"},
        headers=api_context["headers"],
    )
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Updated Swagger Widget"


def test_swagger_node_widgets_summary_post(api_context, client):
    widget_id = api_context["widget"]["id"]
    response = client.post(
        f"/api/widgets/{widget_id}/summary",
        json={"period_data": [{"revenue": 100.0}, {"revenue": 180.0}]},
        headers=api_context["headers"],
    )
    assert response.status_code == 200
    assert "text" in response.json()


def test_swagger_node_widgets_delete(api_context, client):
    extra_widget = _create_widget(client, api_context["headers"], api_context["report"]["id"])
    widget_id = extra_widget["id"]

    delete_response = client.delete(f"/api/widgets/{widget_id}", headers=api_context["headers"])
    assert delete_response.status_code == 200

    update_response = client.put(
        f"/api/widgets/{widget_id}",
        json={"title": "Should not exist"},
        headers=api_context["headers"],
    )
    assert update_response.status_code == 404


def test_swagger_node_dashboard_get(api_context, client):
    dataset_id = api_context["dataset"]["id"]
    response = client.get(f"/api/dashboard/{dataset_id}", headers=api_context["headers"])
    assert response.status_code == 200
    body = response.json()
    assert body["dataset"]["id"] == dataset_id
    assert isinstance(body["reports"], list)
    assert isinstance(body["widgets"], list)
