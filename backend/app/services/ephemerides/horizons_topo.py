"""Effemeridi topocentriche di Sole e Terra da JPL Horizons per un osservatore sulla Luna.

V1 usa richieste dirette `CENTER='coord@301'`: azimut/elevazione apparenti senza rifrazione
(quantità 4), diametro angolare (13) e distanza (20). Il parser legge le colonne per nome e
controlla le intestazioni: un HTTP 200 non basta a dire che la risposta è valida.
"""

import csv
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

import numpy as np

from app.services.normalization import PreparationError, utc_ms

PARSER_VERSION = "horizons-topo-1"
BODIES = {"sun": "10", "earth": "399"}
EXPECTED_CENTER_FRAME = "MEAN_ME"
EXPECTED_CENTER_RADIUS_KM = 1737.4
QUANTITIES = "4,13,20"
REQUIRED_COLUMNS = ("Azi_(a-app)", "Elev_(a-app)", "Ang-diam", "delta", "deldot")
_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)


class HorizonsError(ValueError):
    """La risposta di Horizons non è utilizzabile come effemeride topocentrica V1."""


def format_time(time_ms: int) -> str:
    """Millisecondi UTC -> 'AAAA-MM-GG HH:MM:SS.mmm', senza arrotondare l'istante."""
    moment = _EPOCH + timedelta(milliseconds=int(time_ms))
    return moment.strftime("%Y-%m-%d %H:%M:%S.") + f"{moment.microsecond // 1000:03d}"


def build_entry(
    url: str,
    body: str,
    lon_east_deg: float,
    lat_deg: float,
    alt_km: float,
    start_ms: int,
    stop_ms: int,
    step_s: int,
) -> dict:
    """Richiesta per `Collector.fetch`. La quota è in km rispetto alla sfera di Horizons."""
    if body not in BODIES:
        raise HorizonsError(f"Corpo non supportato: {body}")
    if step_s <= 0 or step_s % 60:
        raise HorizonsError("Il passo Horizons deve essere un multiplo positivo di 60 s")
    if stop_ms <= start_ms:
        raise HorizonsError("Intervallo Horizons vuoto")
    params = {
        "format": "json",
        "COMMAND": f"'{BODIES[body]}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon_east_deg % 360.0:.6f},{lat_deg:.6f},{alt_km:.6f}'",
        "START_TIME": f"'{format_time(start_ms)}'",
        "STOP_TIME": f"'{format_time(stop_ms)}'",
        "STEP_SIZE": f"'{step_s // 60} m'",
        "QUANTITIES": f"'{QUANTITIES}'",
        "CSV_FORMAT": "'YES'",
        "ANG_FORMAT": "'DEG'",
        "APPARENT": "'AIRLESS'",
        "TIME_DIGITS": "'FRACSEC'",
        "RANGE_UNITS": "'KM'",
        "CAL_FORMAT": "'CAL'",
    }
    return {
        "name": f"engine-horizons-{body}",
        "provider": "horizons",
        "format": "json",
        "url": url,
        "params": params,
    }


@dataclass
class TopocentricTable:
    body: str
    times_ms: np.ndarray
    azimuth_deg: np.ndarray
    elevation_deg: np.ndarray
    angular_diameter_deg: np.ndarray
    range_km: np.ndarray
    range_rate_km_s: np.ndarray
    header: dict = field(default_factory=dict)


def _csv(line: str) -> list[str]:
    values = [value.strip() for value in next(csv.reader([line]))]
    if values and values[-1] == "":
        values.pop()
    return values


def _search(pattern: str, text: str, what: str) -> re.Match:
    match = re.search(pattern, text)
    if match is None:
        raise HorizonsError(f"Intestazione Horizons senza {what}")
    return match


def _number(text: str) -> float:
    text = text.strip()
    if text in {"", "n.a.", "N/A"}:
        return float("nan")
    value = float(text)
    return value if np.isfinite(value) else float("nan")


def parse(data: dict, entry: dict) -> TopocentricTable:
    """Controlla intestazioni e unità, poi legge i campioni. I valori assenti restano NaN."""
    if not isinstance(data, dict):
        raise HorizonsError("Horizons non ha restituito un oggetto JSON")
    if data.get("error"):
        raise HorizonsError(f"Errore di Horizons: {str(data['error'])[:300]}")
    text = data.get("result")
    if not isinstance(text, str) or "$$SOE" not in text or "$$EOE" not in text:
        raise HorizonsError("Risposta Horizons senza tabella ($$SOE/$$EOE)")
    header, rest = text.split("$$SOE", 1)
    table, footer = rest.split("$$EOE", 1)
    params = {key: str(value).strip("'") for key, value in entry["params"].items()}
    code = params["COMMAND"]
    body = next((name for name, value in BODIES.items() if value == code), None)
    if body is None:
        raise HorizonsError(f"COMMAND non supportato: {code}")

    target = _search(r"Target body name:\s*(.+?)\s*\{source:\s*([^}]+)\}", header, "corpo")
    if f"({code})" not in target[1]:
        raise HorizonsError(f"Corpo inatteso nella risposta: {target[1]}")
    _search(r"Center body name:\s*Moon \(301\)", header, "centro lunare")
    site = _search(
        r"Center geodetic\s*:\s*([-+\d.Ee]+),\s*([-+\d.Ee]+),\s*([-+\d.Ee]+)", header, "sito"
    )
    asked = [float(v) for v in params["SITE_COORD"].split(",")]
    got = [float(site[i]) for i in (1, 2, 3)]
    if (
        abs((got[0] - asked[0] + 180.0) % 360.0 - 180.0) > 1e-5
        or abs(got[1] - asked[1]) > 1e-5
        or abs(got[2] - asked[2]) > 1e-5
    ):
        raise HorizonsError(f"Sito restituito {got} diverso da quello richiesto {asked}")
    frame = _search(r"Center pole/equ\s*:\s*(\S+)", header, "frame del centro")[1]
    if frame != EXPECTED_CENTER_FRAME:
        raise HorizonsError(f"Frame lunare inatteso: {frame}")
    radii = _search(
        r"Center radii\s*:\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*km", header, "raggi del centro"
    )
    if any(abs(float(radii[i]) - EXPECTED_CENTER_RADIUS_KM) > 1e-6 for i in (1, 2, 3)):
        raise HorizonsError(f"Raggi lunari inattesi: {radii[0]}")
    target_radii = _search(
        r"Target radii\s*:\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*km", header, "raggi del corpo"
    )
    if not re.search(r"Atmos refraction:\s*NO \(AIRLESS\)", header):
        raise HorizonsError("La risposta non è in geometria apparente senza rifrazione")
    if not re.search(r"Start time\s*:.*\bUT\b", header):
        raise HorizonsError("Scala temporale diversa da UT/UTC")

    candidates = [line for line in header.splitlines() if "Date__(UT)__" in line and "," in line]
    if not candidates:
        raise HorizonsError("Manca l'intestazione delle colonne")
    columns = _csv(candidates[-1])
    if not columns[0].startswith("Date__(UT)__"):
        raise HorizonsError("La prima colonna non è il tempo UT")
    missing = [name for name in REQUIRED_COLUMNS if name not in columns]
    if missing:
        raise HorizonsError(f"Colonne mancanti: {', '.join(missing)}")
    index = {name: columns.index(name) for name in REQUIRED_COLUMNS}
    units = _search(r"Units:\s*(AU|KM) and KM/S", footer, "unità della distanza")[1]
    au_km = float(_search(r"1 au=\s*([\d.]+)\s*km", header, "conversione au")[1])
    range_scale = au_km if units == "AU" else 1.0
    if "'Ang-diam,' =" not in footer or "Units: ARCSECONDS" not in footer:
        raise HorizonsError("Unità del diametro angolare non dichiarate in arcosecondi")

    times, az, el, diam, rng, rate = [], [], [], [], [], []
    for line in table.splitlines():
        if not line.strip():
            continue
        values = _csv(line)
        if len(values) != len(columns):
            raise HorizonsError("Riga Horizons con numero di colonne inatteso")
        try:
            times.append(utc_ms(values[0]))
        except (PreparationError, ValueError) as exc:
            raise HorizonsError(f"Tempo Horizons non interpretabile: {values[0]}") from exc
        az.append(_number(values[index["Azi_(a-app)"]]))
        el.append(_number(values[index["Elev_(a-app)"]]))
        diam.append(_number(values[index["Ang-diam"]]) / 3600.0)
        rng.append(_number(values[index["delta"]]) * range_scale)
        rate.append(_number(values[index["deldot"]]))
    if not times:
        raise HorizonsError("Tabella Horizons vuota")
    times_ms = np.asarray(times, dtype=np.int64)
    if np.any(np.diff(times_ms) <= 0):
        raise HorizonsError("Tempi Horizons non strettamente crescenti")
    az_arr, el_arr = np.asarray(az), np.asarray(el)
    with np.errstate(invalid="ignore"):
        if np.any((az_arr < 0) | (az_arr >= 360.0)) or np.any(np.abs(el_arr) > 90.0):
            raise HorizonsError("Angoli Horizons fuori dai limiti fisici")
    return TopocentricTable(
        body=body,
        times_ms=times_ms,
        azimuth_deg=az_arr,
        elevation_deg=el_arr,
        angular_diameter_deg=np.asarray(diam),
        range_km=np.asarray(rng),
        range_rate_km_s=np.asarray(rate),
        header={
            "parser_version": PARSER_VERSION,
            "target": target[1],
            "ephemeris": target[2].strip(),
            "center_frame": frame,
            "center_radii_km": [float(radii[i]) for i in (1, 2, 3)],
            "target_radii_km": [float(target_radii[i]) for i in (1, 2, 3)],
            "site_lon_east_deg": got[0],
            "site_lat_deg": got[1],
            "site_alt_km": got[2],
            "refraction": "AIRLESS",
            "time_scale": "UTC",
            "angles": "apparent azimuth/elevation, azimuth clockwise from north",
            "range_units_source": units,
            "angular_diameter": "equatorial, arcsec in source",
            "signature": data.get("signature"),
        },
    )


def expected_times(start_ms: int, stop_ms: int, step_s: int) -> np.ndarray:
    return np.arange(start_ms, stop_ms + 1, step_s * 1000, dtype=np.int64)


def check_grid(table: TopocentricTable, start_ms: int, stop_ms: int, step_s: int) -> None:
    """La risposta deve contenere esattamente gli istanti richiesti."""
    wanted = expected_times(start_ms, stop_ms, step_s)
    if table.times_ms.shape != wanted.shape or np.any(table.times_ms != wanted):
        raise HorizonsError(
            f"Copertura Horizons diversa dalla richiesta: {table.times_ms.size} campioni "
            f"invece di {wanted.size}"
        )
