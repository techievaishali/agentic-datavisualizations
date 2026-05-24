from pathlib import Path


def test_upload_csv_dataset_success(client, auth_context):
    csv_content = "order_date,revenue,category\n2024-01-01,100,A\n2024-01-02,180,B\n"
    files = {"file": ("sales.csv", csv_content, "text/csv")}

    response = client.post(
        "/api/datasets/upload",
        data={"dataset_name": "Sales Data"},
        files=files,
        headers=auth_context["headers"],
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Sales Data"
    assert body["source_type"] == "csv"
    assert "numeric_columns" in body["profile"]


def test_upload_csv_does_not_misclassify_categorical_text_as_datetime(client, auth_context):
    csv_content = "channel_group,revenue,purchases\norganic,100,2\npaid,180,3\n"
    files = {"file": ("marketing.csv", csv_content, "text/csv")}

    response = client.post(
        "/api/datasets/upload",
        data={"dataset_name": "Marketing Data"},
        files=files,
        headers=auth_context["headers"],
    )

    assert response.status_code == 200
    body = response.json()
    assert body["profile"]["datetime_columns"] == []
    assert "channel_group" in body["profile"]["categorical_columns"]


def test_upload_rejects_unsupported_file_type(client, auth_context):
    files = {"file": ("payload.exe", "not-a-dataset", "application/octet-stream")}

    response = client.post(
        "/api/datasets/upload",
        data={"dataset_name": "Bad Data"},
        files=files,
        headers=auth_context["headers"],
    )

    assert response.status_code == 400
    assert "Supported formats" in response.json()["detail"]


def test_list_datasets_returns_user_items(client, auth_context, sample_dataset):
    response = client.get("/api/datasets", headers=auth_context["headers"])

    assert response.status_code == 200
    datasets = response.json()
    assert len(datasets) >= 1
    assert any(item["id"] == sample_dataset.id for item in datasets)


def test_get_dataset_returns_single_item(client, auth_context, sample_dataset):
    response = client.get(f"/api/datasets/{sample_dataset.id}", headers=auth_context["headers"])

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == sample_dataset.id
    assert body["name"] == sample_dataset.name


def test_delete_dataset_removes_record(client, auth_context, sample_dataset):
    response = client.delete(f"/api/datasets/{sample_dataset.id}", headers=auth_context["headers"])
    assert response.status_code == 200
    assert response.json()["message"] == "Dataset deleted"

    fetch = client.get(f"/api/datasets/{sample_dataset.id}", headers=auth_context["headers"])
    assert fetch.status_code == 404
