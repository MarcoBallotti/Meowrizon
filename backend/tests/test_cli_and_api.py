from fastapi.testclient import TestClient

from app.cli import main
from app.core.manifest import save_download
from app.main import app
from app.services.regions import moontrek

client = TestClient(app)


def _register_download(data_dir, content):
    save_download(
        data_dir / "sources",
        moontrek.SOURCE_NAME,
        "https://example.test/layer",
        {},
        moontrek.RAW_FILENAME,
        content,
    )


def test_api_before_init_returns_503(data_env):
    assert client.get("/api/regions").status_code == 503
    assert client.get("/api/sites").status_code == 503


def test_init_offline_then_api(data_env, moontrek_bytes, capsys):
    _register_download(data_env, moontrek_bytes)

    assert main(["init-regions", "--offline"]) == 0
    assert "malapert-massif" in capsys.readouterr().out

    all_regions = client.get("/api/regions").json()
    assert len(all_regions["features"]) == 13
    assert all_regions["meowrizon"]["source"]["sha256"]
    active = client.get("/api/regions", params={"active": "true"}).json()
    assert {f["id"] for f in active["features"]} == {"de-gerlache-rim-2", "malapert-massif"}
    sites = client.get("/api/sites").json()["features"]
    assert len(sites) == 9
    polar = {f["id"]: f["properties"] for f in sites if f["properties"]["in_sector"]}
    assert set(polar) == {"griffin-1", "blue-moon-mk1-pathfinder"}
    assert polar["blue-moon-mk1-pathfinder"]["region"] == "connecting-ridge"


def test_offline_without_download_fails(data_env, capsys):
    assert main(["init-regions", "--offline"]) == 1
    assert "non è nel registro" in capsys.readouterr().err


def test_modified_download_is_detected(data_env, moontrek_bytes, capsys):
    _register_download(data_env, moontrek_bytes)
    (data_env / "sources" / moontrek.RAW_FILENAME).write_bytes(moontrek_bytes + b" ")

    assert main(["init-regions", "--offline"]) == 1
    assert "SHA-256" in capsys.readouterr().err
