from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_vite_dev_server_is_allowed():
    response = client.get("/health", headers={"Origin": "http://localhost:5173"})

    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_unknown_origin_is_not_allowed():
    response = client.get("/health", headers={"Origin": "http://example.com"})

    assert "access-control-allow-origin" not in response.headers
