"""Verifica che il container raggiunga l'API di Horizons. Eseguire con: pytest -m network"""

import httpx
import pytest

from app.core.config import get_settings


@pytest.mark.network
def test_horizons_moon_table_reachable():
    settings = get_settings()
    # Stessa richiesta della tabella globale del README: Luna vista dal geocentro.
    params = {
        "format": "text",
        "COMMAND": "'301'",
        "CENTER": "'500@399'",
        "EPHEM_TYPE": "'OBSERVER'",
        "START_TIME": "'2027-01-01 00:00'",
        "STOP_TIME": "'2027-01-01 02:00'",
        "STEP_SIZE": "'1 h'",
        "QUANTITIES": "'14,15,20'",
        "CSV_FORMAT": "'YES'",
    }

    response = httpx.get(settings.horizons_api_url, params=params, timeout=settings.http_timeout_s)

    assert response.status_code == 200
    # Horizons risponde 200 anche agli errori di input: il controllo vero è sui marcatori dei dati.
    assert "$$SOE" in response.text
    assert "$$EOE" in response.text
