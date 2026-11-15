"""Real scenario results for the existing horizon, timeline, report and eclipse UI."""

import hashlib
import json

import numpy as np

from app.services.terrain.engine import TerrainError

from . import horizons as hz
from . import visibility as vis

VERSION = "horizons-disc-c3-1"
DAY = 86400000


def track(profile, body, terrain, fraction):
    h = vis.horizon(profile, body["az"])
    return {
        "azimuthDeg": body["az"].tolist(), "elevationDeg": body["el"].tolist(),
        "horizonDeg": h.tolist(), "centerVisible": (body["el"] >= h).tolist(),
        "visibleFraction": fraction.tolist(), "terrainVisibleFraction": terrain.tolist(),
        "angularRadiusDeg": body["radius"].tolist(), "distanceKm": body["distance"].tolist(),
        "illuminatedFraction": body["lit"].tolist(),
    }


def eclipse_calendar(root, profile, start, progress):
    start = int(start // DAY) * DAY - 3*DAY
    stop = start + 731*DAY
    # Six-hour discovery with a generous angular bracket; five-minute contact sampling.
    sun, _ = hz.observe(root, profile, "sun", start, stop, 360)
    earth, _ = hz.observe(root, profile, "earth", start, stop, 360)
    near = np.flatnonzero(vis.separation(sun, earth) < 4)
    groups = np.split(near, np.flatnonzero(np.diff(near) > 1)+1) if len(near) else []
    events = []
    for index, group in enumerate(groups):
        progress(0.75 + 0.15*index/max(1, len(groups)), "Resolving Horizons eclipse contacts")
        lo = max(start, sun["times"][max(0, int(group[0])-1)])
        hi = min(stop, sun["times"][min(len(sun["times"])-1, int(group[-1])+1)])
        ss, _ = hz.observe(root, profile, "sun", lo, hi, 5)
        ee, _ = hz.observe(root, profile, "earth", lo, hi, 5)
        sep = vis.separation(ss, ee)
        contacts = vis.intervals(ss["times"], ss["radius"] + ee["radius"] - sep, 0)
        totals = vis.intervals(ss["times"], ee["radius"] - ss["radius"] - sep, 0)
        for contact in contacts:
            indices = np.flatnonzero(
                (ss["times"] >= contact["startMs"]) & (ss["times"] <= contact["endMs"])
            )
            if not len(indices):
                continue
            i = int(indices[np.argmin(sep[indices])])
            fraction, _, _ = vis.fractions(profile, hz.interpolate(ss, [ss["times"][i]]))
            total = next((t for t in totals if t["startMs"] <= ss["times"][i] <= t["endMs"]), None)
            events.append({
                **contact, "maxMs": float(ss["times"][i]), "kind": "total" if total else "partial",
                "totalStartMs": total["startMs"] if total else None,
                "totalEndMs": total["endMs"] if total else None,
                "magnitude": float(
                    (ss["radius"][i] + ee["radius"][i] - sep[i]) / (2*ss["radius"][i])
                ),
                "visible": bool(fraction[0] >= .5), "sunElevationDeg": float(ss["el"][i]),
                "source": "NASA/JPL Horizons", "maxTimeSamplingMinutes": 5,
            })
    return {"startMs": start, "stopMs": stop, "events": events,
            "source": "NASA/JPL Horizons", "contactSamplingMinutes": 5}


def refine_crossing(profile, body, occulter=None):
    def crossing(lo, hi, before):
        for _ in range(16):
            if hi - lo <= 30000:
                break
            mid = (lo + hi) / 2
            target = hz.interpolate(body, [mid])
            blocker = hz.interpolate(occulter, [mid]) if occulter is not None else None
            _, fraction, _ = vis.fractions(profile, target, blocker)
            if bool(fraction[0] >= .5) == before:
                lo = mid
            else:
                hi = mid
        return (lo + hi) / 2
    return crossing


def skipped_result(terrain, start, stop, minimum, upper_bound):
    return {
        "skipped": True, "origin": "engine", "terrainAnalysisId": terrain["id"],
        "startMs": start, "stopMs": stop, "reason": "sunlight_below_threshold",
        "minSunFraction": minimum, "sunFractionUpperBound": float(upper_bound),
    }


def calculate(root, parameters, terrain, progress):
    start, stop = hz.utc_ms(parameters["startUtc"]), hz.utc_ms(parameters["stopUtc"])
    minutes = min(parameters["stepMinutes"], 10)
    if not 0 < stop-start <= 366*DAY or (stop-start)/60000/minutes > 60000:
        raise TerrainError("Select at most 366 days and 60,000 ephemeris samples.")
    profile = terrain["profile"]
    # Include a sample beyond the endpoint when the requested span is not a step multiple.
    grid_stop = start + int(np.ceil((stop-start)/(minutes*60000)))*minutes*60000
    progress(.1, "Fetching Sun positions from NASA/JPL Horizons")
    sun, sun_source = hz.observe(root, profile, "sun", start, grid_stop, minutes)
    times = np.append(np.arange(start, stop, minutes*60000, dtype=float), float(stop))
    sun = hz.interpolate(sun, times)
    minimum = parameters.get("minSunFraction") or 0
    if minimum > 0:
        progress(.2, "Screening sunlight before evaluating Earth visibility")
        f_st, f_s, obscured = vis.fractions(profile, sun)
        if not np.isfinite(f_st).all():
            raise TerrainError("Sun visibility is incomplete; cannot screen this site.")
        # Earth occultation can only reduce sunlight. Count each sampled interval
        # touching a visible endpoint in full: an optimistic bound on the existing
        # sampled/refined model, so borderline sites proceed to full evaluation.
        # As in that model, brief events between equal samples may be missed.
        visible = f_st >= .5
        upper = np.sum(np.diff(times)[visible[:-1] | visible[1:]]) / (stop - start)
        if upper < minimum:
            progress(.98, "Skipped: sunlight is below the comparison minimum")
            return skipped_result(terrain, start, stop, minimum, upper)

    progress(.25, "Fetching Earth positions from NASA/JPL Horizons")
    earth, earth_source = hz.observe(root, profile, "earth", start, grid_stop, minutes)
    earth = hz.interpolate(earth, times)
    progress(.4, "Calculating visible discs, terrain shadows and eclipses")
    if minimum > 0:
        # Reuse the Sun-only calculation; only overlapping discs need a second
        # quadrature pass to account for Earth occultation.
        overlap = ((vis.separation(sun, earth) < sun["radius"] + earth["radius"])
                   & (earth["distance"] < sun["distance"]))
        if np.any(overlap):
            ss = {key: values[overlap] for key, values in sun.items()}
            ee = {key: values[overlap] for key, values in earth.items()}
            _, f_s[overlap], obscured[overlap] = vis.fractions(profile, ss, ee)
    else:
        f_st, f_s, obscured = vis.fractions(profile, sun, earth)

    sun_i = vis.intervals(times, f_s, refine=refine_crossing(profile, sun, earth))
    sun_fraction = sum(iv["endMs"] - iv["startMs"] for iv in sun_i) / (stop - start)
    if minimum > 0 and sun_fraction < minimum:
        progress(.98, "Skipped: sunlight including eclipses is below the comparison minimum")
        return skipped_result(terrain, start, stop, minimum, sun_fraction)

    progress(.5, "Calculating Earth visibility and shared windows")
    f_et, f_e, _ = vis.fractions(profile, earth)
    earth_i = vis.intervals(times, f_e, refine=refine_crossing(profile, earth))
    eclipse_i = vis.intervals(times, sun["radius"]+earth["radius"]-vis.separation(sun, earth), 0)
    result = {
        "id": hashlib.sha256(json.dumps(
            [VERSION, parameters, sun_source["sha256"], earth_source["sha256"]],
            sort_keys=True,
        ).encode()).hexdigest(),
        "origin": "engine", "terrainAnalysisId": terrain["id"], "timeScale": "UTC",
        "timesMs": times.tolist(), "sun": track(profile, sun, f_st, f_s),
        "earth": track(profile, earth, f_et, f_e),
        "solarOccultedFraction": obscured.tolist(),
        "intervals": {"sun": sun_i, "earth": earth_i,
                      "both": vis.intersect(sun_i, earth_i), "eclipse": eclipse_i},
        "visibilityModel": "disc-fraction-c3", "visibilityThreshold": .5,
        "ephemeris": {"source": "NASA/JPL Horizons", "version": VERSION, "kernels": [],
                      "corrections": ("Horizons apparent topocentric az/el; light-time and "
                                      "aberration; AIRLESS; lunar Mean Earth DE421 frame."),
                      "sources": [sun_source, earth_source]},
        "coverage": {"startMs": start, "stopMs": stop, "stepMinutes": minutes,
                     "eventInterpolationToleranceSeconds": 30, "discSamples": vis.DISC_SAMPLES},
        "approximations": [
            "C3: at least 50% of the apparent disc visible. "
            "Solar visibility includes the union of terrain and Earth occultation.",
            "Opaque circular Earth; no atmospheric transmission or solar limb darkening. "
            "Uniform disc quadrature: 2048 samples.",
            f"Horizons sampled every {minutes} min; crossings refined "
            "on interpolated directions to 30 s. Brief events between samples may be missed.",
            "Intervals touching the data boundary are truncated, not predicted rise/set events. "
            "Terrain resolution limits apply.",
            "Foreground hills and stars are decorative; "
            "only the far skyline is derived from the DEM.",
            "Future UTC assumes the latest known leap seconds. "
            "These outputs do not certify power, communications or landing safety.",
        ],
    }
    if parameters.get("includeContext", True):
        progress(.65, "Loading real Sun–Earth–Moon orbital positions")
        result["orbit"] = hz.orbit(root, start, stop)
        progress(.72, "Searching the next two years for eclipses")
        result["eclipseCalendar"] = eclipse_calendar(root, profile, start, progress)
    progress(.98, "Saving scenario tracks and visibility windows")
    return result
