from uuid import uuid4


def test_register_and_login_flow(client):
    email = f"demo_user_{uuid4().hex[:8]}@example.com"
    reg_payload = {
        "email": email,
        "full_name": "Demo User",
        "password": "StrongPass123",
    }

    reg_response = client.post("/api/auth/register", json=reg_payload)
    assert reg_response.status_code == 200

    login_response = client.post(
        "/api/auth/login",
        json={"email": email, "password": "StrongPass123"},
    )
    assert login_response.status_code == 200
    assert "access_token" in login_response.json()


def test_register_duplicate_email_returns_400(client):
    email = f"duplicate_{uuid4().hex[:8]}@example.com"
    payload = {"email": email, "full_name": "Dup User", "password": "StrongPass123"}

    first = client.post("/api/auth/register", json=payload)
    second = client.post("/api/auth/register", json=payload)

    assert first.status_code == 200
    assert second.status_code == 400
    assert second.json()["detail"] == "Email already registered"


def test_login_invalid_password_returns_401(client):
    email = f"bad_login_{uuid4().hex[:8]}@example.com"
    payload = {"email": email, "full_name": "Bad Login", "password": "StrongPass123"}
    client.post("/api/auth/register", json=payload)

    response = client.post("/api/auth/login", json={"email": email, "password": "WrongPass123"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials"


def test_me_returns_current_user_profile(client):
    email = f"me_{uuid4().hex[:8]}@example.com"
    payload = {"email": email, "full_name": "Profile User", "password": "StrongPass123"}
    client.post("/api/auth/register", json=payload)
    login = client.post("/api/auth/login", json={"email": email, "password": "StrongPass123"})
    token = login.json()["access_token"]

    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == email
    assert body["full_name"] == "Profile User"


def test_me_requires_authentication(client):
    response = client.get("/api/auth/me")
    assert response.status_code == 401
