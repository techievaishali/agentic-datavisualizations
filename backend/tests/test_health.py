from datetime import datetime


def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "timestamp" in body


def test_health_response_content_type_is_json(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")


def test_health_timestamp_is_iso_format(client):
    response = client.get("/health")
    assert response.status_code == 200
    ts = response.json()["timestamp"]
    parsed = datetime.fromisoformat(ts)
    assert parsed.tzinfo is not None


def test_health_post_not_allowed(client):
    response = client.post("/health")
    assert response.status_code == 405


def test_health_has_only_expected_keys(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert set(response.json().keys()) == {"status", "timestamp"}
