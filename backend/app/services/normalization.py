"""Adapters for the collected examples, not a general ephemeris/frame converter."""

import csv
import math
import re
from datetime import UTC, datetime


class PreparationError(ValueError):
    """A source cannot be safely represented by the supported storage schema."""


def number(value, *, nullable=False):
    if nullable and (value is None or str(value).strip() in {"", "n.a.", "N/A"}):
        return None
    result = float(value)
    if not math.isfinite(result):
        raise PreparationError("Non-finite numeric value")
    return result


def utc_ms(text):
    """Modern UTC only. Preserve original labels separately, including precision."""
    value = text.strip().removeprefix("A.D. ").removesuffix(" UTC").strip()
    months = {
        m: f"{i:02}"
        for i, m in enumerate(
            ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"), 1
        )
    }
    value = re.sub(r"-(\w{3})-", lambda match: "-" + months[match[1]] + "-", value)
    date = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if date.tzinfo is None:
        date = date.replace(tzinfo=UTC)
    if date.utcoffset().total_seconds() != 0 or date.year < 1962:
        raise PreparationError("Only modern UTC calendar timestamps are supported")
    delta = date - datetime(1970, 1, 1, tzinfo=UTC)
    return (delta.days * 86400 + delta.seconds) * 1000 + delta.microseconds // 1000


def _csv(line):
    try:
        values = [value.strip() for value in next(csv.reader([line]))]
    except csv.Error as exc:
        raise PreparationError("Invalid Horizons CSV") from exc
    if values and values[-1] == "":
        values.pop()
    return values


def _ordered(rows):
    if not rows or any(a["time_ms"] >= b["time_ms"] for a, b in zip(rows, rows[1:], strict=False)):
        raise PreparationError("Expected a nonempty, strictly increasing time series")
    return rows


def horizons(data, request):
    text = data["result"]
    header, table = text.split("$$SOE", 1)
    table, _ = table.split("$$EOE", 1)
    params = {k: str(v).strip("'") for k, v in request["params"].items()}
    if params.get("CSV_FORMAT", "NO").upper() != "YES":
        raise PreparationError("Horizons preparation requires CSV_FORMAT=YES")
    candidates = [line for line in header.splitlines() if "Date" in line and "," in line]
    if not candidates:
        raise PreparationError("Missing Horizons CSV column header")
    columns = _csv(candidates[-1])
    kind = params.get("EPHEM_TYPE", "OBSERVER").upper()
    if kind == "OBSERVER":
        if not columns[0].startswith("Date__(UT)__") or columns[1:] != [
            "",
            "",
            "Azi_(a-app)",
            "Elev_(a-app)",
            "delta",
            "deldot",
        ]:
            raise PreparationError(
                "Supported observer table: UTC az/el and range (QUANTITIES=4,20)"
            )
        output_kind = "observer"
        units = {
            "azimuth_deg": "deg",
            "elevation_deg": "deg",
            "range_au": "au",
            "range_rate_km_s": "km/s",
        }
    elif kind == "VECTORS":
        if columns != ["JDUT", "Calendar Date (UT )", "X", "Y", "Z", "VX", "VY", "VZ"]:
            raise PreparationError("Supported vector table: TIME_TYPE=UT, VEC_TABLE=2")
        if not re.search(r"Output units\s*:\s*KM-S\s", header):
            raise PreparationError("Vector units must be KM-S")
        output_kind = "vectors"
        units = {"position": "km", "velocity": "km/s", "jd_ut": "day"}
    else:
        raise PreparationError(f"Unsupported Horizons ephemeris type: {kind}")

    rows = []
    for line in table.splitlines():
        if not line.strip():
            continue
        values = _csv(line)
        if len(values) != len(columns):
            raise PreparationError("Unexpected Horizons row width")
        if output_kind == "observer":
            row = {
                "time_ms": utc_ms(values[0]),
                "source_time": values[0],
                "azimuth_deg": number(values[3], nullable=True),
                "elevation_deg": number(values[4], nullable=True),
                "range_au": number(values[5], nullable=True),
                "range_rate_km_s": number(values[6], nullable=True),
                "solar_flag": values[1],
                "event_flag": values[2],
            }
            if (
                row["azimuth_deg"] is not None
                and not 0 <= row["azimuth_deg"] < 360
                or row["elevation_deg"] is not None
                and not -90 <= row["elevation_deg"] <= 90
                or row["range_au"] is not None
                and row["range_au"] < 0
            ):
                raise PreparationError("Observer angles/range are outside their physical bounds")
        else:
            row = {
                "time_ms": utc_ms(values[1]),
                "source_time": values[1],
                "jd_ut": number(values[0]),
            }
            row.update(
                zip(
                    ("x_km", "y_km", "z_km", "vx_km_s", "vy_km_s", "vz_km_s"),
                    map(number, values[2:]),
                    strict=False,
                )
            )
        rows.append(row)
    context = {
        "provider": "horizons",
        "signature": data.get("signature"),
        "time_scale": "UTC",
        "units": units,
        "parameters": params,
        "source_header": header,
        "notes": [
            "Horizons UT is UTC for these modern dates; future leap seconds are unknown.",
            "No frame, origin, observer-height or apparent/geometric conversion performed.",
        ],
    }
    return output_kind, context, _ordered(rows)


def webgeocalc(data, request):
    calculation = request["calculation"]
    if (
        calculation.get("timeSystem") != "UTC"
        or calculation.get("calculationType") != "STATE_VECTOR"
        or calculation.get("stateRepresentation") != "RECTANGULAR"
    ):
        raise PreparationError("WebGeocalc preparation requires rectangular UTC state vectors")
    columns = data["columns"]
    ids = [column["outputID"] for column in columns]
    if len(set(ids)) != len(ids):
        raise PreparationError("Duplicate WebGeocalc columns")
    expected = {
        "X": "km",
        "Y": "km",
        "Z": "km",
        "D_X_DT": "km/s",
        "D_Y_DT": "km/s",
        "D_Z_DT": "km/s",
    }
    units = {column["outputID"]: column["units"] for column in columns}
    if "DATE" not in ids or any(units.get(key) != value for key, value in expected.items()):
        raise PreparationError("Missing or incompatible WebGeocalc vector columns/units")
    rows = []
    for values in data["rows"]:
        if len(values) != len(ids):
            raise PreparationError("Unexpected WebGeocalc row width")
        source = dict(zip(ids, values, strict=True))
        if not source["DATE"].endswith(" UTC"):
            raise PreparationError("WebGeocalc timestamp is not labeled UTC")
        row = {"time_ms": utc_ms(source["DATE"]), "source_time": source["DATE"], "jd_ut": None}
        row.update(
            {
                name: number(source[column])
                for name, column in zip(
                    ("x_km", "y_km", "z_km", "vx_km_s", "vy_km_s", "vz_km_s"), expected, strict=True
                )
            }
        )
        rows.append(row)
    context = {
        "provider": "webgeocalc",
        "time_scale": "UTC",
        "calculation": calculation,
        "columns": columns,
        "calculation_id": data.get("calculationId"),
        "notes": ["Archived spacecraft states, not a newly optimized flight."],
    }
    return "vectors", context, _ordered(rows)
