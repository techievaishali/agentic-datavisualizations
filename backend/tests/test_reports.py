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
