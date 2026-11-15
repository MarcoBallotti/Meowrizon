"""Frazioni dei dischi ed eventi: casi analitici, occultatori sovrapposti, lacune, troncamenti."""

import math

import numpy as np
import pytest

from app.services.engine.scenario_stage import _remaining, occulters, sun_cause
from app.services.events.intervals import (
    DATA_GAP,
    REQUEST_END,
    REQUEST_START,
    TRANSITION,
    UNKNOWN,
    classify,
    find_segments,
    known_fraction,
    scan_times,
    true_intervals,
)
from app.services.visibility.discs import disc_fractions

RHO = 0.266  # raggio angolare del Sole visto dalla Luna, gradi
TOLERANCE = 0.005  # config/analysis.tolerances.json: fractions.analytic_cases_max_abs_error


def flat(level=0.0):
    return lambda azimuth: np.full(np.shape(azimuth), level)


def segment_fraction_above(distance, radius):
    """Frazione di un disco sopra una retta orizzontale a quota `distance` dal centro."""
    d = max(-radius, min(radius, distance))
    cap = radius**2 * math.acos(d / radius) - d * math.sqrt(radius**2 - d**2)
    return cap / (math.pi * radius**2)


def lens_fraction(separation, r1, r2):
    """Frazione del disco di raggio r1 coperta da un disco di raggio r2 a distanza data."""
    if separation >= r1 + r2:
        return 0.0
    if separation <= abs(r2 - r1):
        return min(1.0, (r2 / r1) ** 2)
    a = r1**2 * math.acos((separation**2 + r1**2 - r2**2) / (2 * separation * r1))
    b = r2**2 * math.acos((separation**2 + r2**2 - r1**2) / (2 * separation * r2))
    c = 0.5 * math.sqrt(
        (-separation + r1 + r2) * (separation + r1 - r2) * (separation - r1 + r2)
        * (separation + r1 + r2)
    )  # fmt: skip
    return (a + b - c) / (math.pi * r1**2)


# --- Dischi ------------------------------------------------------------------------------------


@pytest.mark.parametrize("elevation", [1.0, 0.2, 0.1, 0.0, -0.1, -0.2, -1.0])
def test_flat_horizon_matches_the_circular_segment(elevation):
    result = disc_fractions(flat(), 100.0, elevation, RHO)
    expected = segment_fraction_above(-elevation, RHO)
    assert result.f_terrain[0] == pytest.approx(expected, abs=TOLERANCE)
    assert result.f_visible[0] == result.f_terrain[0] and result.occulter_cover[0] == 0.0


def test_null_partial_and_total_terrain_occultation():
    result = disc_fractions(flat(), [10.0, 10.0, 10.0], [5.0, 0.0, -5.0], [RHO, RHO, RHO])
    assert result.f_terrain[0] == 1.0 and result.f_terrain[2] == 0.0
    assert result.f_terrain[1] == pytest.approx(0.5, abs=1e-9)
    # Il centro sull'orizzonte vale metà disco solo con orizzonte uniforme.
    tilted = disc_fractions(lambda az: (np.asarray(az) - 10.0) * 2.0, 10.0, 0.0, RHO)
    assert tilted.f_terrain[0] == pytest.approx(0.5, abs=1e-9)
    raised = disc_fractions(lambda az: np.abs(np.asarray(az) - 10.0) * 2.0, 10.0, 0.0, RHO)
    assert raised.f_terrain[0] < 0.4


def test_irregular_profile_uses_the_whole_disc_not_the_centre():
    # Parete a sinistra del centro: metà disco nascosta anche se il centro è ben sopra il suolo.
    wall = lambda az: np.where(np.asarray(az) < 50.0, 10.0, -10.0)  # noqa: E731
    result = disc_fractions(wall, 50.0, 3.0, RHO, strips=128)
    assert result.f_terrain[0] == pytest.approx(0.5, abs=TOLERANCE)
    # Una fenditura stretta lascia visibile solo una striscia del disco.
    slit = lambda az: np.where(np.abs(np.asarray(az) - 50.0) < 0.05, -10.0, 10.0)  # noqa: E731
    narrow = disc_fractions(slit, 50.0, 3.0, RHO, strips=256)
    expected = 2 * lens_strip(0.05, RHO)
    assert narrow.f_terrain[0] == pytest.approx(expected, abs=0.02)


def lens_strip(half_width, radius):
    """Frazione del disco con |x| < half_width, a metà (un lato)."""
    x = half_width
    area = x * math.sqrt(radius**2 - x**2) + radius**2 * math.asin(x / radius)
    return area / (math.pi * radius**2)


def test_azimuth_offsets_scale_with_elevation():
    wall = lambda az: np.where(np.asarray(az) < 50.0, 89.0, -89.0)  # noqa: E731
    # A 60° di elevazione il disco copre il doppio in azimut: il centro spostato di 0,266°
    # in azimut è solo a metà raggio dalla parete.
    shifted = disc_fractions(wall, 50.0 + RHO, 60.0, RHO, strips=256)
    assert shifted.f_terrain[0] == pytest.approx(1 - segment_fraction_above(RHO / 2, RHO), abs=0.01)


@pytest.mark.parametrize("separation", [0.0, 0.3, 0.8, 1.0, 1.15, 1.3])
def test_earth_occultation_matches_the_two_circle_overlap(separation):
    earth_radius = 0.95
    result = disc_fractions(
        flat(-50.0), 200.0, 4.0, RHO, occulter=(200.0, 4.0 - separation, earth_radius), strips=256
    )
    expected = lens_fraction(separation, RHO, earth_radius)
    assert result.f_terrain[0] == 1.0
    assert result.occulter_cover[0] == pytest.approx(expected, abs=TOLERANCE)
    assert result.f_visible[0] == pytest.approx(1.0 - expected, abs=TOLERANCE)


def test_eclipse_from_the_side_uses_true_angular_separation():
    earth_radius, elevation = 0.95, 8.0
    offset_az = 1.0 / math.cos(math.radians(elevation))  # un grado di cielo, non di azimut
    result = disc_fractions(
        flat(-50.0), 200.0, elevation, RHO,
        occulter=(200.0 + offset_az, elevation, earth_radius), strips=256,
    )  # fmt: skip
    assert result.occulter_cover[0] == pytest.approx(
        lens_fraction(1.0, RHO, earth_radius), abs=TOLERANCE
    )


def test_overlapping_occulters_are_a_union_not_a_product():
    # Il terreno nasconde la metà inferiore; la Terra nasconde una parte della stessa metà.
    earth = (30.0, -0.95, 0.95)  # lembo superiore tangente al centro del Sole
    result = disc_fractions(flat(0.0), 30.0, 0.0, RHO, occulter=earth, strips=256)
    assert result.f_terrain[0] == pytest.approx(0.5, abs=1e-9)
    assert result.occulter_cover[0] > 0.3
    assert result.f_visible[0] == pytest.approx(0.5, abs=TOLERANCE)
    product = result.f_terrain[0] * (1.0 - result.occulter_cover[0])
    assert product < result.f_visible[0] - 0.1

    # Terra sopra, terreno sotto: le due occultazioni si sommano.
    above = (30.0, 0.95 + 0.1, 0.95)
    both = disc_fractions(flat(-0.1), 30.0, 0.0, RHO, occulter=above, strips=256)
    # Il lembo inferiore della Terra è un arco: si toglie la lente fra i due cerchi.
    visible = segment_fraction_above(-0.1, RHO) - lens_fraction(1.05, RHO, 0.95)
    assert both.f_visible[0] == pytest.approx(visible, abs=TOLERANCE)


def test_total_eclipse_is_dark_with_separate_cause():
    result = disc_fractions(flat(-50.0), 10.0, 5.0, RHO, occulter=(10.0, 5.0, 0.95))
    assert result.f_terrain[0] == 1.0 and result.occulter_cover[0] == 1.0
    assert result.f_visible[0] == 0.0
    assert sun_cause(1.0, 1.0, 0.5, True, 1e-9) == "earth_eclipse"
    assert sun_cause(0.0, 0.0, 0.5, True, 1e-9) == "terrain"
    assert sun_cause(0.0, 1.0, 0.5, True, 1e-9) == "terrain_and_earth_each_sufficient"
    assert sun_cause(0.7, 0.4, 0.5, False, 1e-9) == "terrain_and_earth_combined"
    assert sun_cause(float("nan"), 0.0, 0.5, False, 1e-9) is None
    assert occulters(1.0, 1.0, 1e-9) == "none"
    assert occulters(0.8, 0.5, 1e-9) == "terrain+earth_eclipse"
    assert occulters(float("nan"), 0.5, 1e-9) is None


def test_unknown_horizon_or_ephemeris_gives_unknown_not_zero():
    partial = lambda az: np.where(np.asarray(az) < 50.0, np.nan, 0.0)  # noqa: E731
    result = disc_fractions(partial, [50.0, 60.0], [1.0, 1.0], [RHO, RHO])
    assert np.isnan(result.f_terrain[0]) and np.isnan(result.f_visible[0])
    assert result.f_terrain[1] == 1.0
    missing_earth = disc_fractions(flat(), 60.0, 1.0, RHO, occulter=(np.nan, np.nan, np.nan))
    assert missing_earth.f_terrain[0] == 1.0 and np.isnan(missing_earth.f_visible[0])
    missing_sun = disc_fractions(flat(), np.nan, np.nan, np.nan)
    assert np.isnan(missing_sun.f_terrain[0])


def test_fractions_converge_with_more_strips():
    wall = lambda az: 0.2 * np.sin(np.radians(np.asarray(az)) * 400.0)  # noqa: E731
    coarse = disc_fractions(wall, 20.0, 0.05, RHO, occulter=(20.3, 0.4, 0.95), strips=64)
    fine = disc_fractions(wall, 20.0, 0.05, RHO, occulter=(20.3, 0.4, 0.95), strips=512)
    assert abs(coarse.f_visible[0] - fine.f_visible[0]) < 0.01
    assert abs(coarse.f_terrain[0] - fine.f_terrain[0]) < 0.01


# --- Eventi ------------------------------------------------------------------------------------

HOUR = 3600_000


def test_crossings_are_refined_and_boundaries_are_not_events():
    # Vera fra 1 h 23 min 20 s e 5 h 10 min 7 s; finestra di 8 ore.
    start_true, end_true = 5_000_000, 18_607_000
    margin = lambda t: np.where(  # noqa: E731
        (np.asarray(t) >= start_true) & (np.asarray(t) < end_true), 0.3, -0.3
    )
    segments = find_segments(margin, 0, 8 * HOUR, 60.0, 1.0)
    assert [s.state for s in segments] == [0, 1, 0]
    inside = true_intervals(segments)[0]
    assert abs(inside.start_ms - start_true) <= 1000 and abs(inside.end_ms - end_true) <= 1000
    assert inside.start_kind == TRANSITION and inside.end_kind == TRANSITION
    assert inside.total_duration_s == pytest.approx((end_true - start_true) / 1000, abs=2.0)
    assert segments[0].start_kind == REQUEST_START and segments[-1].end_kind == REQUEST_END
    assert segments[0].truncated_left and not segments[0].truncated_right


def test_interval_truncated_on_both_sides_has_only_a_lower_bound():
    segments = find_segments(lambda t: np.full(np.shape(t), 0.2), 0, 6 * HOUR, 60.0, 1.0)
    assert len(segments) == 1
    only = segments[0]
    assert only.truncated_left and only.truncated_right
    assert only.total_duration_s is None and only.observed_duration_s == 6 * 3600
    remaining = _remaining(segments)
    assert remaining.value_s is None and remaining.lower_bound_s == 6 * 3600
    assert remaining.reason == "end_not_observed_within_request"


def test_short_event_between_equal_samples_is_found():
    # Scende sotto soglia per 20 s fra due campioni a 60 s che sono entrambi sopra soglia.
    def margin(t):
        t = np.asarray(t, dtype=float) / 1000.0
        return 0.03 - 0.06 * np.exp(-(((t - 1830.0) / 12.0) ** 2))

    samples = classify(margin(scan_times(0, HOUR, 60.0)), True)
    assert (samples == 1).all()  # la sola griglia non vede l'evento
    segments = find_segments(margin, 0, HOUR, 60.0, 1.0)
    assert [s.state for s in segments] == [1, 0, 1]
    short = segments[1]
    assert 15.0 < short.observed_duration_s < 25.0 and short.total_duration_s is not None
    assert abs((short.start_ms + short.end_ms) / 2000.0 - 1830.0) < 2.0
    # Lontano dalla soglia non si spreca la ricerca e non si inventano eventi.
    far = find_segments(lambda t: margin(t) + 0.2, 0, HOUR, 60.0, 1.0)
    assert [s.state for s in far] == [1]


def test_probe_mask_finds_a_brief_glimpse_in_darkness():
    def margin(t):  # buio (g = eps) tranne uno spiraglio di 15 s
        t = np.asarray(t, dtype=float) / 1000.0
        return np.where(np.abs(t - 1235.0) < 7.5, -0.02, 1e-9)

    times = scan_times(0, HOUR, 60.0)
    blind = find_segments(margin, 0, HOUR, 60.0, 1.0, probe_mask=np.zeros(times.size - 1, bool))
    assert [s.state for s in blind] == [1]
    found = find_segments(margin, 0, HOUR, 60.0, 1.0, probe_mask=np.ones(times.size - 1, bool))
    assert [s.state for s in found] == [1, 0, 1]
    assert 12.0 < found[1].observed_duration_s < 18.0


def test_data_gap_interrupts_continuity_and_is_not_bridged():
    def margin(t):
        t = np.asarray(t, dtype=float)
        return np.where((t > 2 * HOUR) & (t < 3 * HOUR), np.nan, 0.4)

    segments = find_segments(margin, 0, 5 * HOUR, 60.0, 1.0)
    assert [s.state for s in segments] == [1, UNKNOWN, 1]
    first, gap, last = segments
    assert first.end_kind == DATA_GAP and last.start_kind == DATA_GAP
    assert first.total_duration_s is None and last.total_duration_s is None
    assert first.end_ms == 2 * HOUR and last.start_ms == 3 * HOUR
    assert known_fraction(segments) == pytest.approx(0.8)
    assert len(true_intervals(segments)) == 2  # due intervalli distinti, non uno unito


def test_state_at_t_false_is_zero_and_unknown_is_null():
    late = lambda t: np.where(np.asarray(t) >= 2 * HOUR, 0.4, -0.4)  # noqa: E731
    false_at_t = _remaining(find_segments(late, 0, 4 * HOUR, 60.0, 1.0))
    assert false_at_t.value_s == 0.0 and false_at_t.status == "ok"
    assert false_at_t.reason == "condition_false_at_t"

    unknown_first = lambda t: np.where(np.asarray(t) < HOUR, np.nan, 0.4)  # noqa: E731
    unknown = _remaining(find_segments(unknown_first, 0, 4 * HOUR, 60.0, 1.0))
    assert unknown.value_s is None and unknown.lower_bound_s is None
    assert unknown.status == "unknown" and unknown.reason == "state_unknown_at_t"

    early = lambda t: np.where(np.asarray(t) < 2 * HOUR + 30_500, 0.4, -0.4)  # noqa: E731
    observed = _remaining(find_segments(early, 0, 4 * HOUR, 60.0, 1.0), "terrain")
    assert observed.value_s == pytest.approx(7230.5, abs=1.0) and observed.cause == "terrain"

    then_gap = lambda t: np.where(np.asarray(t) < 2 * HOUR, 0.4, np.nan)  # noqa: E731
    gap = _remaining(find_segments(then_gap, 0, 4 * HOUR, 60.0, 1.0))
    assert gap.value_s is None and gap.reason == "end_not_observed_within_available_data"
    assert gap.lower_bound_s == pytest.approx(7200.0, abs=60.0)


def test_threshold_equality_follows_the_definition():
    # C3 è frazione >= 0,5: l'uguaglianza è visibile. "Sotto C3" è frazione < 0,5.
    assert list(classify([0.0, -1e-12, np.nan], True)) == [1, 0, UNKNOWN]
    assert list(classify([0.0, 1e-12, np.nan], False)) == [0, 1, UNKNOWN]


def test_scan_grid_keeps_the_exact_window_end():
    times = scan_times(1234, 1234 + 150_500, 60.0)
    assert times[0] == 1234 and times[-1] == 1234 + 150_500 and times.size == 4
