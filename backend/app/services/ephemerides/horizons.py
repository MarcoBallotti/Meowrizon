"""Site-specific Horizons observations and geometric orbit vectors, cached on disk."""

import csv
import hashlib
import json
from datetime import UTC, datetime

import numpy as np
import requests
from filelock import FileLock

from app.services.normalization import utc_ms
from app.services.storage import _write_json
from app.services.terrain.engine import TerrainError

URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
AU_KM = 149597870.7


def calendar(ms):
    return datetime.fromtimestamp(ms / 1000, UTC).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]


def request(root, parameters):
    params = {k: f"'{v}'" for k, v in parameters.items()}
    params["format"] = "json"
    key = hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()
    directory = root / "data/ephemerides"
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{key}.json"
    # Share the acquisition lock with the existing collector (one JPL request at a time).
    with FileLock(str(root / "data/.collection.lock"), timeout=180):
        if path.exists():
            record = json.loads(path.read_text())
            digest = hashlib.sha256(record["response"]["result"].encode()).hexdigest()
            if digest != record["sha256"]:
                raise TerrainError("Cached Horizons response checksum failed.")
            return record
        response = requests.get(URL, params=params, timeout=(15, 120))
        response.raise_for_status()
        data = response.json()
        if data.get("error") or "$$SOE" not in data.get("result", ""):
            raise TerrainError(f"Horizons rejected the request: {data.get('error', 'no table')}")
        record = {
            "url": URL, "parameters": parameters, "response": data,
            "retrievedUtc": datetime.now(UTC).isoformat(),
            "sha256": hashlib.sha256(data["result"].encode()).hexdigest(),
        }
        _write_json(path, record)
        return record


def table(record):
    header, rest = record["response"]["result"].split("$$SOE", 1)
    rows = list(csv.reader(line for line in rest.split("$$EOE")[0].splitlines() if line.strip()))
    rows = [[v.strip() for v in row] for row in rows]
    if not rows:
        raise TerrainError("Horizons returned an empty table.")
    return header, rows


def common(start, stop, minutes):
    return {
        "OBJ_DATA": "NO", "MAKE_EPHEM": "YES", "START_TIME": calendar(start),
        "STOP_TIME": calendar(stop), "STEP_SIZE": f"{minutes} m", "CSV_FORMAT": "YES",
        "TIME_TYPE": "UT", "TIME_DIGITS": "FRACSEC", "CAL_FORMAT": "CAL",
    }


def observe(root, profile, body, start, stop, minutes):
    observer = profile["observer"]
    site = observer["site"]
    altitude = (observer["surfaceHeightM"] + observer["heightAboveSurfaceM"]) / 1000
    params = {
        **common(start, stop, minutes), "COMMAND": "10" if body == "sun" else "399",
        "EPHEM_TYPE": "OBSERVER", "CENTER": "coord@301", "COORD_TYPE": "GEODETIC",
        "SITE_COORD": f"{site['lonEastDeg']:.9f},{site['latDeg']:.9f},{altitude:.9f}",
        "QUANTITIES": "4,10,13,20", "ANG_FORMAT": "DEG", "APPARENT": "AIRLESS",
        "EXTRA_PREC": "YES", "SKIP_DAYLT": "NO", "ELEV_CUT": "-90",
    }
    record = request(root, params)
    header, rows = table(record)
    if "MEAN_ME" not in header and "MOON_ME" not in header:
        raise TerrainError("Horizons did not report the expected lunar Mean Earth frame.")
    times = np.array([utc_ms(row[0]) for row in rows], dtype=float)
    # EXTRA_PREC changes column labels, but not the requested ordered quantities.
    values = np.array([[float(v) for v in row[3:8]] for row in rows])
    if values.shape != (len(times), 5) or not np.all(np.isfinite(values)):
        raise TerrainError("Horizons observer data is incomplete or non-numeric.")
    if np.any(np.diff(times) <= 0) or times[0] > start or times[-1] < stop - 1:
        raise TerrainError("Horizons did not cover the requested time interval.")
    if np.any(np.diff(times) > minutes * 60000 + 1):
        raise TerrainError("Horizons observer series contains a time gap.")
    data = {
        "times": times, "az": values[:, 0], "el": values[:, 1],
        "lit": values[:, 2] / 100, "radius": values[:, 3] / 7200,
        "distance": values[:, 4] * AU_KM,
    }
    provenance = {k: record[k] for k in ("url", "parameters", "retrievedUtc", "sha256")}
    provenance["header"] = header
    return data, provenance


def interpolate(data, times):
    output = {"times": np.asarray(times)}
    for key in ("az", "el", "lit", "radius", "distance"):
        values = np.unwrap(np.deg2rad(data[key])) if key == "az" else data[key]
        values = np.interp(times, data["times"], values)
        output[key] = np.rad2deg(values) % 360 if key == "az" else values
    return output


def orbit(root, start, stop):
    # Shared across sites. Ecliptic J2000 geometric Earth-centred vectors for the diagram.
    start = int(start // 86400000) * 86400000 - 15 * 86400000
    stop = int(np.ceil(stop / 86400000)) * 86400000 + 15 * 86400000
    result = {"frame": "J2000 ecliptic", "units": "km", "source": "NASA/JPL Horizons"}
    sources = []
    for name, command in (("sunKm", "10"), ("moonKm", "301")):
        record = request(root, {
            **common(start, stop, 360), "COMMAND": command, "CENTER": "500@399",
            "EPHEM_TYPE": "VECTORS", "REF_SYSTEM": "ICRF", "REF_PLANE": "ECLIPTIC",
            "VEC_CORR": "NONE", "VEC_TABLE": "1", "OUT_UNITS": "KM-S",
        })
        _, rows = table(record)
        times = [utc_ms(r[1]) for r in rows]
        if "timesMs" in result and times != result["timesMs"]:
            raise TerrainError("Orbit vector timestamps do not match.")
        result["timesMs"] = times
        vectors = np.asarray([[float(v) for v in row[2:5]] for row in rows])
        if vectors.shape != (len(times), 3) or not np.all(np.isfinite(vectors)):
            raise TerrainError("Invalid orbit vector response.")
        result[name] = vectors.tolist()
        sources.append({k: record[k] for k in ("url", "parameters", "sha256")})
    result["sources"] = sources
    return result
