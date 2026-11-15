"""Parser Horizons topocentrico e interpolazione: unità, tempi, errori, angoli circolari."""

import copy
import json
from pathlib import Path

import numpy as np
import pytest

from app.services.ephemerides import horizons_topo as ht
from app.services.ephemerides.interpolation import (
    BodyTrack,
    angles_to_unit,
    separation_deg,
    unit_to_angles,
)
from app.services.normalization import utc_ms

FIXTURES = Path(__file__).parent / "fixtures"
START = utc_ms("2026-12-01T00:00:00Z")
STOP = utc_ms("2026-12-01T06:00:00Z")
URL = "https://ssd.jpl.nasa.gov/api/horizons.api"


def entry(body="sun"):
    return ht.build_entry(URL, body, 295.371562, -88.229978, 1.5, START, STOP, 3600)


def response(body="sun"):
    return json.loads((FIXTURES / f"horizons_topo_{body}.json").read_text())


def edited(body="sun", **replacements):
    data = copy.deepcopy(response(body))
    for old, new in replacements.values():
        assert old in data["result"], old
        data["result"] = data["result"].replace(old, new)
    return data


def test_request_uses_topocentric_lunar_site_and_exact_time():
    params = entry()["params"]
    assert params["COMMAND"] == "'10'" and entry("earth")["params"]["COMMAND"] == "'399'"
    assert params["CENTER"] == "'coord@301'" and params["COORD_TYPE"] == "'GEODETIC'"
    assert params["SITE_COORD"] == "'295.371562,-88.229978,1.500000'"
    assert params["QUANTITIES"] == "'4,13,20'" and params["APPARENT"] == "'AIRLESS'"
    # T non viene arrotondato: i millisecondi restano nella richiesta.
    assert ht.format_time(START + 1234) == "2026-12-01 00:00:01.234"
    odd = ht.build_entry(URL, "sun", 0, -89, 0.1, START + 1234, STOP, 3600)
    assert odd["params"]["START_TIME"] == "'2026-12-01 00:00:01.234'"


def test_request_rejects_bad_steps_and_bodies():
    with pytest.raises(ht.HorizonsError):
        ht.build_entry(URL, "sun", 0, -89, 0, START, STOP, 90)
    with pytest.raises(ht.HorizonsError):
        ht.build_entry(URL, "moon", 0, -89, 0, START, STOP, 3600)
    with pytest.raises(ht.HorizonsError):
        ht.build_entry(URL, "sun", 0, -89, 0, STOP, START, 3600)


def test_real_responses_units_times_and_header():
    sun = ht.parse(response("sun"), entry("sun"))
    earth = ht.parse(response("earth"), entry("earth"))
    ht.check_grid(sun, START, STOP, 3600)
    assert sun.times_ms[0] == START and sun.times_ms[-1] == STOP and sun.times_ms.size == 7
    assert sun.azimuth_deg[0] == pytest.approx(344.673258)
    assert sun.elevation_deg[0] == pytest.approx(3.177291)
    # Arcosecondi -> gradi; distanza già in km perché richiesta con RANGE_UNITS='KM'.
    assert sun.angular_diameter_deg[0] == pytest.approx(1945.049 / 3600)
    assert sun.range_km[0] == pytest.approx(1.4755304577e8)
    assert earth.range_km[0] == pytest.approx(3.7654476475e5)
    assert earth.angular_diameter_deg[0] == pytest.approx(6988.003 / 3600)
    assert sun.header["center_frame"] == "MEAN_ME"
    assert sun.header["center_radii_km"] == [1737.4, 1737.4, 1737.4]
    assert sun.header["target_radii_km"][0] == 695700.0
    assert sun.header["site_alt_km"] == 1.5 and sun.header["time_scale"] == "UTC"


def test_range_in_au_is_converted_with_the_header_constant():
    data = edited(units=("Units: KM and KM/S", "Units: AU and KM/S"))
    table = ht.parse(data, entry())
    assert table.range_km[0] == pytest.approx(1.4755304577e8 * 149597870.700)


def test_service_error_with_http_200_is_rejected():
    error = {"error": "Geodetic latitude not in the range", "result": "\nGeodetic latitude\n"}
    with pytest.raises(ht.HorizonsError, match="Errore di Horizons"):
        ht.parse(error, entry())
    with pytest.raises(ht.HorizonsError, match="SOE"):
        ht.parse({"result": "No ephemeris for target"}, entry())
    with pytest.raises(ht.HorizonsError):
        ht.parse(["not", "an", "object"], entry())


@pytest.mark.parametrize(
    "change",
    [
        ("MEAN_ME (high precision)", "IAU_MOON (high precision)"),
        ("radii    : 1737.4, 1737.4, 1737.4 km", "radii    : 1738.1, 1738.1, 1736.0 km"),
        ("Atmos refraction: NO (AIRLESS)", "Atmos refraction: YES (Earth refraction model)"),
        ("Center geodetic : 295.371562", "Center geodetic : 295.471562"),
        ("Target body name: Sun (10)", "Target body name: Mars (499)"),
        ("Azi_(a-app)", "Azi_(r-app)"),
        ("Ang-diam,", "Ang-xxxx,"),
        ("0000 UT ", "0000 TDB"),
    ],
)  # fmt: skip
def test_unexpected_headers_are_rejected(change):
    with pytest.raises(ht.HorizonsError):
        ht.parse(edited(change=change), entry())


def test_missing_values_stay_unknown_and_gaps_are_detected():
    data = edited(value=("344.166042,     3.172853", "      n.a.,         n.a."))
    table = ht.parse(data, entry())
    assert np.isnan(table.azimuth_deg[1]) and np.isnan(table.elevation_deg[1])
    assert np.isfinite(table.azimuth_deg[0])
    track = BodyTrack(table, 3600)
    assert track.missing_samples == 1
    assert track.segments_ms == [(START, START), (START + 7200_000, STOP)]
    values = track.evaluate([START, START + 1800_000, START + 3600_000, START + 9000_000])
    assert list(values["valid"]) == [True, False, False, True]

    lines = data["result"].split("\n")
    dropped = "\n".join(line for line in lines if "2026-Dec-01 03:00:00.000" not in line)
    with pytest.raises(ht.HorizonsError, match="Copertura"):
        ht.check_grid(ht.parse({"result": dropped}, entry()), START, STOP, 3600)


def test_out_of_range_angles_and_unordered_times_are_rejected():
    with pytest.raises(ht.HorizonsError, match="limiti fisici"):
        ht.parse(edited(a=("     3.177291", "    93.177291")), entry())
    swapped = edited(a=("2026-Dec-01 01:00:00.000", "2026-Dec-01 00:00:00.000"))
    with pytest.raises(ht.HorizonsError, match="crescenti"):
        ht.parse(swapped, entry())


def synthetic_table(azimuth, elevation, step_s=3600):
    n = len(azimuth)
    return ht.TopocentricTable(
        body="sun",
        times_ms=np.arange(n, dtype=np.int64) * step_s * 1000,
        azimuth_deg=np.asarray(azimuth, dtype=float),
        elevation_deg=np.asarray(elevation, dtype=float),
        angular_diameter_deg=np.full(n, 0.54),
        range_km=np.full(n, 1.5e8),
        range_rate_km_s=np.zeros(n),
    )


def test_interpolation_crosses_north_without_jumping():
    azimuth = (357.0 + 0.5 * np.arange(13)) % 360.0  # 357° ... 3°, passa per 0°
    track = BodyTrack(synthetic_table(azimuth, np.full(13, 2.0)), 3600)
    middle = track.evaluate(np.arange(12) * 3600_000 + 1800_000)
    expected = (357.25 + 0.5 * np.arange(12)) % 360.0
    difference = (middle["azimuth_deg"] - expected + 180.0) % 360.0 - 180.0
    assert np.abs(difference).max() < 1e-6
    assert np.abs(middle["elevation_deg"] - 2.0).max() < 1e-6


def test_interpolation_matches_a_smooth_motion_at_excluded_instants():
    hours = np.arange(49)
    truth_az = lambda h: (120.0 + 0.51 * h) % 360.0  # noqa: E731
    truth_el = lambda h: 1.5 * np.sin(2 * np.pi * h / 700.0)  # noqa: E731
    track = BodyTrack(synthetic_table(truth_az(hours), truth_el(hours)), 3600)
    between = hours[:-1] + 0.37
    values = track.evaluate(between * 3600_000)
    assert np.abs(values["azimuth_deg"] - truth_az(between)).max() < 1e-5
    assert np.abs(values["elevation_deg"] - truth_el(between)).max() < 1e-5
    assert np.allclose(values["radius_deg"], 0.27)


def test_series_does_not_extrapolate():
    track = BodyTrack(synthetic_table([10, 11, 12], [1, 1, 1]), 3600)
    values = track.evaluate([-1, 0, 7200_000, 7200_001])
    assert list(values["valid"]) == [False, True, True, False]
    assert np.isnan(values["azimuth_deg"][0])


def test_unit_vectors_and_small_separations():
    az, el = np.array([0.0, 90.0, 359.9]), np.array([0.0, 45.0, -5.0])
    back_az, back_el = unit_to_angles(angles_to_unit(az, el))
    assert np.allclose(back_az, az) and np.allclose(back_el, el)
    assert separation_deg(10.0, 0.0, 10.001, 0.0) == pytest.approx(0.001, rel=1e-6)
    assert separation_deg(359.9, 0.0, 0.1, 0.0) == pytest.approx(0.2, rel=1e-9)
    assert separation_deg(40.0, 3.0, 40.0, 3.0) == pytest.approx(0.0, abs=1e-12)
