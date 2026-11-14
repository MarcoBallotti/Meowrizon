from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok():
    response = client.get("/api/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "data_dir_writable" in body


def test_everything_is_under_api_prefix():
    # Contratto con il frontend: base URL /api (backend/API_CONTRACT.md, 3.1)
    assert client.get("/api/openapi.json").status_code == 200
    assert client.get("/api/docs").status_code == 200
    assert client.get("/health").status_code == 404
