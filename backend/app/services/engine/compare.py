"""Confronto diretto: stessi punti a date diverse e punti diversi alla stessa data.

Sono affiancamenti di valori dello stesso punto e della stessa finestra. Non c'è punteggio,
ordinamento né vincitore; i massimi di punti diversi non vengono combinati.
"""

from app.services.engine.models import Comparison, PointResult, ScenarioResult

NOTE = (
    "Valori affiancati nell'ordine della richiesta, senza punteggio né classifica. Ogni riga "
    "appartiene a un solo punto e a una sola finestra [T, T+durata); un bordo di finestra non "
    "è un evento fisico."
)


def _row(point: PointResult, scenario: ScenarioResult) -> dict:
    row = {
        "point_id": point.id,
        "region": point.region,
        "t_utc": scenario.t_utc,
        "duration_s": scenario.duration_s,
        "status": scenario.status,
        "slope_deg": point.slope.value_deg,
        "slope_band": point.slope.band_label,
    }
    state = scenario.state_at_t
    if state is None:
        return row | {"reason": scenario.reason}
    dark = scenario.first_dark
    row |= {
        "sun_elevation_deg": state.sun_elevation_deg,
        "sun_margin_deg": state.sun_margin_deg,
        "f_sun_terrain": state.f_sun_terrain,
        "f_sun": state.f_sun,
        "sun_state": state.sun_state,
        "earth_elevation_deg": state.earth_elevation_deg,
        "earth_margin_deg": state.earth_margin_deg,
        "f_earth": state.f_earth,
        "earth_c3": state.earth_c3,
        "joint_c3": state.joint_c3,
        "remaining_sun_c3_s": state.remaining_sun_c3.value_s,
        "remaining_sun_c3_lower_bound_s": state.remaining_sun_c3.lower_bound_s,
        "remaining_earth_c3_s": state.remaining_earth_c3.value_s,
        "remaining_earth_c3_lower_bound_s": state.remaining_earth_c3.lower_bound_s,
        "remaining_joint_c3_s": state.remaining_joint_c3.value_s,
        "remaining_joint_c3_lower_bound_s": state.remaining_joint_c3.lower_bound_s,
        "first_dark_start_elapsed_s": dark.start_elapsed_s if dark else None,
        "first_dark_observed_duration_s": dark.observed_duration_s if dark else None,
        "first_dark_total_duration_s": dark.total_duration_s if dark else None,
        "first_dark_truncated": (dark.truncated_left or dark.truncated_right) if dark else None,
        "observed_in_window_s": scenario.totals_observed_s,
        "coverage": scenario.coverage,
    }
    return row


def build_comparisons(
    points: list[PointResult], scenarios: list[ScenarioResult], epochs: list[str]
) -> list[Comparison]:
    by_id = {point.id: point for point in points}
    comparisons = []
    for point in points:
        rows = [_row(point, s) for s in scenarios if s.point_id == point.id]
        comparisons.append(
            Comparison(kind="same_point_across_dates", key=point.id, rows=rows, note=NOTE)
        )
    for epoch in epochs:
        rows = [_row(by_id[s.point_id], s) for s in scenarios if s.t_utc == epoch]
        comparisons.append(
            Comparison(kind="same_date_across_points", key=epoch, rows=rows, note=NOTE)
        )
    return comparisons
