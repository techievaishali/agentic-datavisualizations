from fastapi.testclient import TestClient

from app.db import Base, engine
from app.main import app


Base.metadata.create_all(bind=engine)
client = TestClient(app)


def test_register_and_login_flow():
    reg_payload = {
        "email": "demo_user@example.com",
        "full_name": "Demo User",
        "password": "StrongPass123",
    }

    reg_response = client.post("/api/auth/register", json=reg_payload)
    assert reg_response.status_code in [200, 400]

    login_response = client.post(
        "/api/auth/login",
        json={"email": "demo_user@example.com", "password": "StrongPass123"},
    )
    assert login_response.status_code == 200
    assert "access_token" in login_response.json()
