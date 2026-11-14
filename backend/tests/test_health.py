from fastapi.testclient import TestClient

from app.main import app


def test_health_ok():
    response = TestClient(app).get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "data_dir_writable" in body
