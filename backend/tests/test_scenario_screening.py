"""The ranking cutoff avoids work and never becomes a fabricated full evaluation."""

from unittest.mock import Mock

import numpy as np
import pytest

from app.services.ephemerides import scenario as sc

MINUTE = 60000


@pytest.fixture
def setup(monkeypatch, tmp_path):
    start, stop = 0, 100 * MINUTE
    times = np.arange(start, stop + 1, 10 * MINUTE, dtype=float)

    def body(az, el, radius, distance):
        return {
            "times": times,
            "az": np.full(len(times), az, dtype=float),
            "el": np.full(len(times), el, dtype=float),
            "radius": np.full(len(times), radius),
            "distance": np.full(len(times), distance),
            "lit": np.ones(len(times)),
        }

    bodies = {"sun": body(0, 5, 0.266, 150e6), "earth": body(180, 5, 0.95, 384000)}
    observe = Mock(side_effect=lambda root, profile, name, *args: (bodies[name], {"sha256": name}))
    monkeypatch.setattr(sc.hz, "observe", observe)
    fractions = Mock(wraps=sc.vis.fractions)
    monkeypatch.setattr(sc.vis, "fractions", fractions)
    orbit, calendar = Mock(), Mock()
    monkeypatch.setattr(sc.hz, "orbit", orbit)
    monkeypatch.setattr(sc, "eclipse_calendar", calendar)
    terrain = {
        "id": "terrain",
        "profile": {"azimuthDeg": [0, 90, 180, 270], "elevationDeg": [0, 0, 0, 0]},
    }
    parameters = {
        "startUtc": "1970-01-01T00:00:00Z",
        "stopUtc": "1970-01-01T01:40:00Z",
        "stepMinutes": 10,
        "includeContext": False,
        "minSunFraction": 0.45,
    }
    return tmp_path, terrain, parameters, bodies, observe, fractions, orbit, calendar


def calculate(setup):
    root, terrain, parameters, *_ = setup
    return sc.calculate(root, parameters, terrain, lambda *args: None)


def test_dark_site_skips_earth_requests_and_all_remaining_work(setup):
    _, _, _, bodies, observe, fractions, orbit, calendar = setup
    bodies["sun"]["el"][:] = -5
    result = calculate(setup)
    assert result["skipped"] is True and result["sunFractionUpperBound"] == 0
    assert result["minSunFraction"] == 0.45 and result["terrainAnalysisId"] == "terrain"
    assert result["startMs"] == 0 and result["stopMs"] == 100 * MINUTE
    assert [call.args[2] for call in observe.call_args_list] == ["sun"]
    fractions.assert_called_once()
    orbit.assert_not_called()
    calendar.assert_not_called()
    assert "earth" not in result and "intervals" not in result


def test_optimistic_sunlight_bound_skips_a_clearly_ineligible_site(setup):
    _, _, _, bodies, observe, *_ = setup
    bodies["sun"]["el"][:] = np.where(bodies["sun"]["times"] < 30 * MINUTE, 5, -5)
    result = calculate(setup)
    assert result["skipped"] is True
    assert result["sunFractionUpperBound"] == pytest.approx(0.3)
    assert observe.call_count == 1


@pytest.mark.parametrize("fraction, skipped", [(0.4499, True), (0.45, False), (0.4501, False)])
def test_exact_cutoff_keeps_equality_and_does_not_compute_earth_for_rejection(
    setup, monkeypatch, fraction, skipped
):
    real_intervals = sc.vis.intervals
    calls = []

    def intervals(times, values, *args, **kwargs):
        calls.append(True)
        if len(calls) == 1:
            return [
                {
                    "startMs": 0,
                    "endMs": fraction * 100 * MINUTE,
                    "startTruncated": True,
                    "endTruncated": False,
                }
            ]
        return real_intervals(times, values, *args, **kwargs)

    monkeypatch.setattr(sc.vis, "intervals", intervals)
    result = calculate(setup)
    assert result.get("skipped", False) is skipped
    assert setup[4].call_count == 2  # A borderline/eligible Sun screen needs Earth for eclipses.
    assert setup[5].call_count == (1 if skipped else 2)
    if skipped:
        assert result["sunFractionUpperBound"] == pytest.approx(fraction)
        assert len(calls) == 1  # No Earth, shared, or eclipse interval work.
    else:
        assert "earth" in result and "both" in result["intervals"]


def test_eclipse_can_reject_before_earth_visibility_is_calculated(setup):
    _, _, _, bodies, _, fractions, *_ = setup
    bodies["earth"]["az"][:] = 0
    result = calculate(setup)
    assert result["skipped"] is True and result["sunFractionUpperBound"] == 0
    assert len(fractions.call_args_list) == 2
    assert all(call.args[1]["distance"][0] == 150e6 for call in fractions.call_args_list)


@pytest.mark.parametrize("earth_azimuth", [180, 1.1])
def test_screened_survivor_matches_the_full_evaluation(setup, earth_azimuth):
    setup[3]["earth"]["az"][:] = earth_azimuth
    screened = calculate(setup)
    setup[2].pop("minSunFraction")
    full = calculate(setup)
    for key in ("sun", "earth", "intervals", "solarOccultedFraction", "timesMs"):
        assert screened[key] == full[key]
    setup[6].assert_not_called()
    setup[7].assert_not_called()


def test_screen_at_threshold_continues_to_refined_evaluation(setup):
    setup[2]["minSunFraction"] = 0.3
    bodies = setup[3]
    bodies["sun"]["el"][:] = np.where(bodies["sun"]["times"] < 30 * MINUTE, 5, -5)
    result = calculate(setup)
    assert result["skipped"] is True
    assert result["sunFractionUpperBound"] < 0.3
    assert setup[4].call_count == 2  # The optimistic bound equals .3; refinement is required.


def test_normal_scenario_and_disabled_filter_still_evaluate_dark_sites(setup):
    setup[3]["sun"]["el"][:] = -5
    for threshold in (None, 0):
        if threshold is None:
            setup[2].pop("minSunFraction", None)
        else:
            setup[2]["minSunFraction"] = threshold
        result = calculate(setup)
        assert "skipped" not in result and result["intervals"]["sun"] == []
        assert "earth" in result


def test_full_measurements_are_reused_across_filters_and_context(setup):
    _, _, parameters, bodies, observe, fractions, orbit, calendar = setup
    bodies["sun"]["el"][:] = -5
    parameters["minSunFraction"] = 0
    full = calculate(setup)
    calls = (observe.call_count, fractions.call_count)
    parameters["minSunFraction"] = 0.9
    screened = calculate(setup)
    assert screened["skipped"] and screened["sunFractionUpperBound"] == 0
    assert (observe.call_count, fractions.call_count) == calls
    parameters.pop("minSunFraction")
    parameters["includeContext"] = True
    orbit.return_value = {"source": "fixture"}
    calendar.return_value = {"events": []}
    enriched = calculate(setup)
    assert enriched["id"] == full["id"]
    assert enriched["sun"] == full["sun"]
    assert enriched["orbit"] == {"source": "fixture"}
    assert (observe.call_count, fractions.call_count) == calls
    calculate(setup)
    orbit.assert_called_once()
    calendar.assert_called_once()
    parameters["includeContext"] = False
    assert "orbit" not in calculate(setup)


def test_same_horizon_reuses_measurements_across_terrain_receipts(setup):
    root, terrain, parameters, _, observe, fractions, *_ = setup
    original = calculate(setup)
    calls = (observe.call_count, fractions.call_count)
    other = {**terrain, "id": "terrain-with-local-assessment", "localTerrain": {"status": "ok"}}
    result = sc.calculate(
        root, {**parameters, "terrainAnalysisId": other["id"]}, other, lambda *args: None
    )
    assert result["terrainAnalysisId"] == other["id"]
    assert result["id"] == original["id"]
    assert result["sun"] == original["sun"]
    assert (observe.call_count, fractions.call_count) == calls
