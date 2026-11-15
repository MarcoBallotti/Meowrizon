"""Serie locali, frazioni dei dischi, finestre ed eventi per un punto e un istante T."""

import json
import math

import numpy as np

from app.services.engine.acquisition import AcquisitionError, SourceFetcher
from app.services.engine.cache import JsonCache, key_of
from app.services.engine.models import (
    ALGORITHM_VERSION,
    BodySeries,
    Interval,
    NumericConfig,
    PointResult,
    Remaining,
    ScenarioResult,
    Series,
    StateAtT,
    Windows,
    to_iso,
)
from app.services.engine.terrain_stage import clean
from app.services.ephemerides import horizons_topo
from app.services.ephemerides.interpolation import BodyTrack, separation_deg
from app.services.events.intervals import (
    TRANSITION,
    UNKNOWN,
    Segment,
    find_segments,
    known_fraction,
    scan_times,
)
from app.services.terrain.horizon import HorizonProfile
from app.services.visibility.discs import disc_fractions

CHUNK = 20000
# Sotto questi ritmi una transizione è "radente": 0,6 frazioni/h equivale a 0,01 del disco al
# minuto; 0,3 °/h equivale a 0,005° al minuto fra lembo solare e profilo del terreno.
SLOW_RATE_PER_HOUR = {"fraction/h": 0.6, "deg/h": 0.3}


def make_evaluator(profile: HorizonProfile, sun: BodyTrack, earth: BodyTrack, strips: int):
    """Funzione tempi (ms) -> grandezze geometriche e frazioni, con NaN dove non valutabili."""

    def evaluate_block(times_ms):
        s, e = sun.evaluate(times_ms), earth.evaluate(times_ms)
        sun_disc = disc_fractions(
            profile.at,
            s["azimuth_deg"],
            s["elevation_deg"],
            s["radius_deg"],
            occulter=(e["azimuth_deg"], e["elevation_deg"], e["radius_deg"]),
            strips=strips,
        )
        earth_disc = disc_fractions(
            profile.at, e["azimuth_deg"], e["elevation_deg"], e["radius_deg"], strips=strips
        )
        return {
            "sun_az": s["azimuth_deg"],
            "sun_el": s["elevation_deg"],
            "sun_radius": s["radius_deg"],
            "sun_range": s["range_km"],
            "sun_h": profile.at(s["azimuth_deg"]),
            "earth_az": e["azimuth_deg"],
            "earth_el": e["elevation_deg"],
            "earth_radius": e["radius_deg"],
            "earth_range": e["range_km"],
            "earth_h": profile.at(e["azimuth_deg"]),
            "f_sun_terrain": sun_disc.f_terrain,
            "f_sun": sun_disc.f_visible,
            "cover": sun_disc.occulter_cover,
            "sun_clearance": sun_disc.clearance_deg,
            "f_earth": earth_disc.f_visible,
            "separation": separation_deg(
                s["azimuth_deg"], s["elevation_deg"], e["azimuth_deg"], e["elevation_deg"]
            ),
        }

    def evaluate(times_ms):
        times_ms = np.atleast_1d(np.asarray(times_ms, dtype=np.int64))
        if times_ms.size <= CHUNK:
            return evaluate_block(times_ms)
        blocks = [evaluate_block(times_ms[i : i + CHUNK]) for i in range(0, times_ms.size, CHUNK)]
        return {name: np.concatenate([b[name] for b in blocks]) for name in blocks[0]}

    return evaluate


def sun_cause(f_terrain, cover, limit: float, complete_dark: bool, eps: float) -> str | None:
    """Quale occultazione basta, da sola, a portare il Sole sotto il limite considerato."""
    if not (math.isfinite(f_terrain) and math.isfinite(cover)):
        return None
    if complete_dark:
        terrain, earth = f_terrain <= eps, cover >= 1.0 - eps
    else:
        terrain, earth = f_terrain < limit, (1.0 - cover) < limit
    if terrain and earth:
        return "terrain_and_earth_each_sufficient"
    if terrain:
        return "terrain"
    if earth:
        return "earth_eclipse"
    return "terrain_and_earth_combined"


def occulters(f_terrain, f_sun, eps: float) -> str | None:
    """Occultazioni in atto a un istante, anche quando il Sole resta sopra C3."""
    if not (math.isfinite(f_terrain) and math.isfinite(f_sun)):
        return None
    active = []
    if f_terrain < 1.0 - eps:
        active.append("terrain")
    if f_terrain - f_sun > eps:
        active.append("earth_eclipse")
    return "+".join(active) if active else "none"


def _value(array, index=0):
    value = float(np.asarray(array)[index])
    return value if math.isfinite(value) else None


def _to_interval(segment: Segment, t_ms: int, **extra) -> Interval:
    return Interval(
        start_utc=to_iso(segment.start_ms),
        end_utc=to_iso(segment.end_ms),
        start_elapsed_s=(segment.start_ms - t_ms) / 1000.0,
        end_elapsed_s=(segment.end_ms - t_ms) / 1000.0,
        start_kind=segment.start_kind,
        end_kind=segment.end_kind,
        truncated_left=segment.truncated_left,
        truncated_right=segment.truncated_right,
        observed_duration_s=segment.observed_duration_s,
        total_duration_s=segment.total_duration_s,
        duration_lower_bound_s=segment.observed_duration_s,
        **extra,
    )


def _remaining(segments: list[Segment], cause: str | None = None) -> Remaining:
    first = segments[0]
    if first.state == UNKNOWN:
        return Remaining(
            value_s=None, lower_bound_s=None, status="unknown",
            reason="state_unknown_at_t", end_kind=None,
        )  # fmt: skip
    if first.state == 0:
        return Remaining(
            value_s=0.0, lower_bound_s=0.0, status="ok",
            reason="condition_false_at_t", end_kind=None,
        )  # fmt: skip
    if first.end_kind == TRANSITION:
        return Remaining(
            value_s=first.observed_duration_s, lower_bound_s=first.observed_duration_s,
            status="ok", reason=None, end_kind=first.end_kind, cause=cause,
        )  # fmt: skip
    return Remaining(
        value_s=None,
        lower_bound_s=first.observed_duration_s,
        status="unknown",
        reason="end_not_observed_within_"
        + ("request" if first.end_kind == "request_end" else "available_data"),
        end_kind=first.end_kind,
    )


def failed_scenario(point_id, t_ms, duration_s, reason, ephemeris=None) -> ScenarioResult:
    return ScenarioResult(
        point_id=point_id, t_utc=to_iso(t_ms), window="[T, T+duration)", duration_s=duration_s,
        status="unknown", reason=reason, state_at_t=None, windows=None, first_dark=None,
        coverage={}, totals_observed_s={}, series=None, ephemeris=ephemeris or {},
        series_cache_key=None, notes=[],
    )  # fmt: skip


def load_tracks(
    point: PointResult,
    t_ms: int,
    duration_ms: int,
    numeric: NumericConfig,
    fetcher: SourceFetcher,
    horizons_url: str,
    offset_ms: int = 0,
    with_tables: bool = False,
):
    """Effemeridi topocentriche dei due corpi per la finestra, con controlli e provenienza."""
    step_ms = numeric.ephemeris_step_s * 1000
    start = t_ms + offset_ms
    stop = start + math.ceil(duration_ms / step_ms) * step_ms
    tracks, info, tables = {}, {}, {}
    for body in ("sun", "earth"):
        entry = horizons_topo.build_entry(
            horizons_url,
            body,
            point.lon_east_deg,
            point.lat_deg,
            point.horizons_site_alt_km,
            start,
            stop,
            numeric.ephemeris_step_s,
        )
        path, sha = fetcher.get(
            entry,
            "topocentric_ephemeris",
            {
                "body": body,
                "point": point.id,
                "site_alt_km": point.horizons_site_alt_km,
                "parser_version": horizons_topo.PARSER_VERSION,
                "quantities": horizons_topo.QUANTITIES,
            },
        )
        table = horizons_topo.parse(json.loads(path.read_text(encoding="utf-8")), entry)
        horizons_topo.check_grid(table, start, stop, numeric.ephemeris_step_s)
        track = BodyTrack(table, numeric.ephemeris_step_s, numeric.max_gap_factor)
        tracks[body] = track
        tables[body] = table
        info[body] = {
            "sha256": sha,
            "samples": int(table.times_ms.size),
            "missing_samples": track.missing_samples,
            "coverage_start_utc": to_iso(int(table.times_ms[0])),
            "coverage_end_utc": to_iso(int(table.times_ms[-1])),
            "step_s": numeric.ephemeris_step_s,
            "header": table.header,
        }
    if with_tables:
        return tracks, info, tables
    return tracks, info


def compute_scenario(
    point: PointResult,
    profile: HorizonProfile,
    t_ms: int,
    duration_s: float,
    numeric: NumericConfig,
    tracks: dict,
    ephemeris: dict,
    key: str | None,
) -> ScenarioResult:
    duration_ms = int(round(duration_s * 1000))
    stop_ms = t_ms + duration_ms
    step_ms = numeric.ephemeris_step_s * 1000
    thr, eps = numeric.c3_threshold, numeric.zero_fraction_epsilon
    evaluate = make_evaluator(profile, tracks["sun"], tracks["earth"], numeric.disc_strips)

    # Serie ai tempi dei campioni Horizons, dentro [T, T+durata]; il primo è esattamente T.
    sample_ms = np.arange(t_ms, stop_ms + 1, step_ms, dtype=np.int64)
    s = evaluate(sample_ms)

    def state_of(f):
        if not math.isfinite(f):
            return None
        return "c3" if f >= thr else ("dark" if f <= eps else "reduced")

    series = Series(
        step_s=numeric.ephemeris_step_s,
        utc=[to_iso(t) for t in sample_ms],
        elapsed_s=[(int(t) - t_ms) / 1000.0 for t in sample_ms],
        sun=BodySeries(
            azimuth_deg=clean(s["sun_az"]),
            elevation_deg=clean(s["sun_el"]),
            horizon_deg=clean(s["sun_h"]),
            margin_deg=clean(s["sun_el"] - s["sun_h"]),
            angular_radius_deg=clean(s["sun_radius"]),
            range_km=clean(s["sun_range"]),
            fraction_above_terrain=clean(s["f_sun_terrain"]),
            fraction_visible=clean(s["f_sun"]),
        ),
        earth=BodySeries(
            azimuth_deg=clean(s["earth_az"]),
            elevation_deg=clean(s["earth_el"]),
            horizon_deg=clean(s["earth_h"]),
            margin_deg=clean(s["earth_el"] - s["earth_h"]),
            angular_radius_deg=clean(s["earth_radius"]),
            range_km=clean(s["earth_range"]),
            fraction_above_terrain=clean(s["f_earth"]),
            fraction_visible=clean(s["f_earth"]),
        ),
        sun_earth_separation_deg=clean(s["separation"]),
        sun_fraction_covered_by_earth=clean(s["cover"]),
        sun_state=[state_of(float(f)) for f in s["f_sun"]],
        earth_c3=[bool(f >= thr) if math.isfinite(f) else None for f in s["f_earth"]],
    )

    # Scansione fitta per gli eventi: stessi dati, tempi interpolati.
    scan_ms = scan_times(t_ms, stop_ms, numeric.scan_step_s)
    v = evaluate(scan_ms)
    with np.errstate(invalid="ignore"):
        margins = {
            "sun_c3": (lambda d: d["f_sun"] - thr, True),
            "earth_c3": (lambda d: d["f_earth"] - thr, True),
            "joint_c3": (lambda d: np.minimum(d["f_sun"] - thr, d["f_earth"] - thr), True),
            "below_c3": (lambda d: thr - d["f_sun"], False),
            "dark": (lambda d: eps - d["f_sun"], True),
            "earth_over_sun_disc": (lambda d: d["cover"] - eps, False),
        }
        # Per il buio il margine non misura la distanza dalla soglia: si cercano spiragli
        # brevi solo dove il lembo solare è vicino al profilo o l'eclissi è quasi totale.
        near_dark = (np.abs(v["sun_clearance"]) < numeric.probe_margin) | (v["cover"] > 0.9)
    segments: dict[str, list[Segment]] = {}
    for name, (function, inclusive) in margins.items():
        with np.errstate(invalid="ignore"):
            scanned = function(v)
        segments[name] = find_segments(
            lambda times, fn=function: fn(evaluate(times)),
            t_ms,
            stop_ms,
            numeric.scan_step_s,
            numeric.event_tolerance_s,
            inclusive=inclusive,
            probe_margin=numeric.probe_margin,
            probe_subdivisions=numeric.probe_subdivisions,
            scan=(scan_ms, scanned),
            probe_mask=(near_dark[:-1] | near_dark[1:]) if name == "dark" else None,
        )

    delta = max(1, int(round(numeric.event_tolerance_s * 1000)))

    def cause_at(time_ms: int, complete_dark: bool) -> str | None:
        d = evaluate(np.array([min(max(time_ms, t_ms), stop_ms)]))
        return sun_cause(
            float(d["f_sun_terrain"][0]), float(d["cover"][0]), thr, complete_dark, eps
        )

    # Grandezza che attraversa la soglia in ogni finestra, per stimare quanto è netta la
    # transizione: frazione del disco, oppure distanza del lembo solare dal profilo (buio).
    rate_metrics = {
        "sun_c3": ("f_sun", "fraction/h"),
        "below_c3": ("f_sun", "fraction/h"),
        "earth_c3": ("f_earth", "fraction/h"),
        "joint_c3": ("joint", "fraction/h"),
        "dark": ("sun_clearance", "deg/h"),
        "earth_over_sun_disc": ("cover", "fraction/h"),
    }
    slow_transitions = []

    def rate_at(name: str, time_ms: int) -> float | None:
        metric = rate_metrics[name][0]
        span = np.array([max(time_ms - 30_000, t_ms), min(time_ms + 30_000, stop_ms)])
        d = evaluate(span)
        values = np.minimum(d["f_sun"], d["f_earth"]) if metric == "joint" else d[metric]
        hours = (span[1] - span[0]) / 3_600_000.0
        if hours <= 0 or not np.isfinite(values).all():
            return None
        rate = abs(float(values[1] - values[0])) / hours
        limit = SLOW_RATE_PER_HOUR[rate_metrics[name][1]]
        if rate < limit:
            slow_transitions.append((name, to_iso(time_ms), rate, rate_metrics[name][1]))
        return rate

    def intervals(name: str) -> list[Interval]:
        out = []
        for segment in segments[name]:
            if segment.state != 1:
                continue
            metric, unit = rate_metrics[name]
            extra = {"rate_metric": f"|d({metric})/dt| in {unit}"}
            if segment.start_kind == TRANSITION:
                extra["start_rate_per_hour"] = rate_at(name, segment.start_ms)
            if segment.end_kind == TRANSITION:
                extra["end_rate_per_hour"] = rate_at(name, segment.end_ms)
            if name in ("below_c3", "dark"):
                dark = name == "dark"
                extra["cause_at_start"] = cause_at(segment.start_ms + delta, dark)
                extra["cause_at_end"] = cause_at(segment.end_ms - delta, dark)
            elif name in ("sun_c3", "joint_c3") and segment.end_kind == TRANSITION:
                extra["cause_at_end"] = cause_at(segment.end_ms + delta, False)
            elif name == "earth_over_sun_disc":
                inside = (scan_ms >= segment.start_ms) & (scan_ms <= segment.end_ms)
                peak = np.nanmax(v["cover"][inside]) if inside.any() else np.nan
                middle = evaluate(np.array([(segment.start_ms + segment.end_ms) // 2]))["cover"]
                peak = np.nanmax([peak, float(middle[0])])
                extra["peak_sun_fraction_covered_by_earth"] = (
                    float(peak) if math.isfinite(peak) else None
                )
            out.append(_to_interval(segment, t_ms, **extra))
        return out

    windows = Windows(
        sun_c3=intervals("sun_c3"),
        earth_c3=intervals("earth_c3"),
        joint_c3=intervals("joint_c3"),
        below_c3=intervals("below_c3"),
        dark=intervals("dark"),
        earth_over_sun_disc=intervals("earth_over_sun_disc"),
        unknown=[_to_interval(g, t_ms) for g in segments["joint_c3"] if g.state == UNKNOWN],
    )

    f_sun, f_terrain, f_earth = _value(s["f_sun"]), _value(s["f_sun_terrain"]), _value(s["f_earth"])
    cover = _value(s["cover"])
    reasons = []
    if _value(s["sun_az"]) is None:
        reasons.append("sun_ephemeris_missing_at_t")
    elif _value(s["sun_h"]) is None or f_terrain is None:
        reasons.append("horizon_unknown_toward_sun")
    if _value(s["earth_az"]) is None:
        reasons.append("earth_ephemeris_missing_at_t")
    elif f_earth is None:
        reasons.append("horizon_unknown_toward_earth")
    sun_c3 = None if f_sun is None else f_sun >= thr
    earth_c3 = None if f_earth is None else f_earth >= thr
    first_sun = segments["sun_c3"][0]
    state = StateAtT(
        utc=to_iso(t_ms),
        sun_azimuth_deg=_value(s["sun_az"]),
        sun_elevation_deg=_value(s["sun_el"]),
        sun_horizon_deg=_value(s["sun_h"]),
        sun_margin_deg=_value(s["sun_el"] - s["sun_h"]),
        sun_angular_radius_deg=_value(s["sun_radius"]),
        f_sun_terrain=f_terrain,
        f_sun=f_sun,
        sun_fraction_covered_by_earth=cover,
        sun_state=state_of(f_sun if f_sun is not None else float("nan")),
        sun_c3=sun_c3,
        sun_occultation_cause=occulters(
            f_terrain if f_terrain is not None else float("nan"),
            f_sun if f_sun is not None else float("nan"),
            eps,
        ),
        earth_azimuth_deg=_value(s["earth_az"]),
        earth_elevation_deg=_value(s["earth_el"]),
        earth_horizon_deg=_value(s["earth_h"]),
        earth_margin_deg=_value(s["earth_el"] - s["earth_h"]),
        earth_angular_radius_deg=_value(s["earth_radius"]),
        f_earth=f_earth,
        earth_c3=earth_c3,
        joint_c3=None if sun_c3 is None or earth_c3 is None else (sun_c3 and earth_c3),
        remaining_sun_c3=_remaining(
            segments["sun_c3"],
            cause_at(first_sun.end_ms + delta, False)
            if first_sun.state == 1 and first_sun.end_kind == TRANSITION
            else None,
        ),
        remaining_earth_c3=_remaining(segments["earth_c3"]),
        remaining_joint_c3=_remaining(segments["joint_c3"]),
        unknown_reasons=reasons,
    )

    coverage = {name: known_fraction(segments[name]) for name in ("sun_c3", "earth_c3", "joint_c3")}
    totals = {
        name: sum(g.observed_duration_s for g in segments[name] if g.state == 1)
        for name in ("sun_c3", "earth_c3", "joint_c3", "below_c3", "dark", "earth_over_sun_disc")
    }
    notes = []
    if slow_transitions:
        listed = "; ".join(
            f"{name} {utc} ({rate:.3g} {unit})" for name, utc, rate, unit in slow_transitions[:12]
        )
        notes.append(
            f"{len(slow_transitions)} transizioni radenti: la grandezza che attraversa la soglia "
            "varia lentamente, quindi l'istante è sensibile a piccoli errori dell'orizzonte e va "
            f"considerato approssimato. {listed}"
        )
    if duration_ms % step_ms:
        notes.append(
            "La durata non è multipla del passo delle effemeridi: l'ultimo campione della serie "
            "precede la fine della finestra; gli eventi usano tutta la finestra."
        )
    complete = all(c >= 1.0 for c in coverage.values())
    return ScenarioResult(
        point_id=point.id,
        t_utc=to_iso(t_ms),
        window="[T, T+duration)",
        duration_s=duration_s,
        status="ok" if complete else "approximate",
        reason=None if complete else "parte della finestra non è valutabile (vedi windows.unknown)",
        state_at_t=state,
        windows=windows,
        first_dark=windows.dark[0] if windows.dark else None,
        coverage=coverage,
        totals_observed_s=totals,
        series=series,
        ephemeris=ephemeris,
        series_cache_key=key,
        notes=notes,
    )


def run_scenario(
    point: PointResult,
    profile: HorizonProfile | None,
    t_ms: int,
    duration_s: float,
    numeric: NumericConfig,
    fetcher: SourceFetcher,
    horizons_url: str,
    cache: JsonCache,
) -> tuple[ScenarioResult, bool]:
    """Restituisce (scenario, True se preso dalla cache)."""
    if profile is None or point.horizons_site_alt_km is None:
        return failed_scenario(
            point.id, t_ms, duration_s, f"terreno non disponibile: {point.reason}"
        ), False
    duration_ms = int(round(duration_s * 1000))
    try:
        tracks, ephemeris = load_tracks(point, t_ms, duration_ms, numeric, fetcher, horizons_url)
    except (AcquisitionError, horizons_topo.HorizonsError) as exc:
        reason = f"effemeridi non disponibili: {exc}"
        return failed_scenario(point.id, t_ms, duration_s, reason), False
    inputs = {
        "algorithm": ALGORITHM_VERSION,
        "stage": "series",
        "terrain_key": point.terrain_cache_key,
        "t_ms": int(t_ms),
        "duration_ms": duration_ms,
        "numeric": numeric.model_dump(),
        "parser": horizons_topo.PARSER_VERSION,
        "ephemeris": {body: ephemeris[body]["sha256"] for body in ("sun", "earth")},
    }
    key = key_of(inputs)
    stored = cache.get(key)
    if stored is not None:
        scenario = ScenarioResult.model_validate(stored)
        return scenario.model_copy(update={"point_id": point.id}), True
    scenario = compute_scenario(point, profile, t_ms, duration_s, numeric, tracks, ephemeris, key)
    cache.put(key, inputs, scenario.model_dump(mode="json"))
    return scenario, False
