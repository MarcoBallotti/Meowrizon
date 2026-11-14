from pathlib import Path

from app.core.config import DEFAULT_HORIZONS_API_URL, load_settings


def test_defaults(monkeypatch):
    monkeypatch.delenv("HORIZONS_API_URL", raising=False)
    monkeypatch.delenv("HTTP_TIMEOUT_S", raising=False)

    settings = load_settings()

    assert settings.horizons_api_url == DEFAULT_HORIZONS_API_URL
    assert settings.http_timeout_s == 60


def test_values_from_environment(monkeypatch, tmp_path):
    monkeypatch.setenv("MEOWRIZON_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("HTTP_TIMEOUT_S", "15")
    monkeypatch.setenv("CORS_ORIGINS", " http://a.test , http://b.test ,")

    settings = load_settings()

    assert settings.data_dir == Path(tmp_path)
    assert settings.http_timeout_s == 15
    assert settings.cors_origins == ("http://a.test", "http://b.test")
