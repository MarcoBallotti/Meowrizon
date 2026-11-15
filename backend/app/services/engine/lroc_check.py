"""Riscontro osservativo: luce/ombra prevista contro un'ortofoto LROC NAC datata.

Fonte: prodotti NAC_DTM dell'archivio NASA PDS LROC (volume LRO-L-LROC-5-RDR-V1.0), ortofoto
a 4 m/px in stereografica polare sud, con istante di acquisizione nell'etichetta PDS3.

Regole fissate prima di guardare i risultati:
- previsione: frazione del disco solare sopra il terreno (fSunTerrain) a quota suolo (0 m),
  all'istante medio dell'immagine; "ombra" se 0, "luce" se >= 0,5, altrimenti "parziale";
- osservazione: "luce" se I/F supera la soglia di Otsu calcolata sul logaritmo dei valori
  campionati dell'immagine stessa (la soglia non usa la previsione);
- metrica principale: accordo sui campioni con previsione non parziale. Le altre varianti
  (soglia dimezzata/raddoppiata, esclusione dei bordi d'ombra) sono riportate a fianco.

La direzione del Sole è chiesta a Horizons in un punto d'ancoraggio e portata agli altri
campioni come vettore fisso nel riferimento lunare: è verificata con una seconda query.
"""

import hashlib
import json
import math
import re
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import requests
from shapely.geometry import Point as ShapelyPoint

from app.core.moon import lonlat_to_stereo, stereo_to_lonlat
from app.services.engine.models import PointResult, to_iso, to_ms
from app.services.engine.scenario_stage import load_tracks
from app.services.engine.terrain_stage import load_raster, plan_tiers, radial_tiers
from app.services.ephemerides.interpolation import separation_deg
from app.services.terrain import moontrek_dem as dem
from app.services.terrain.horizon import horizon_elevations
from app.services.terrain.slope import circular_support, stereographic_scale
from app.services.visibility.discs import disc_fractions

PDS_BASE = "https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/NAC_DTM"
DEFAULT_IMAGES = (
    ("MALAPERT02", "NAC_DTM_MALAPERT02_M139906018_4M"),
    ("MALAPERT02", "NAC_DTM_MALAPERT02_M139912793_4M"),
    ("MALAPERT02", "NAC_DTM_MALAPERT02_M139919591_4M"),
    ("MALAPERT03", "NAC_DTM_MALAPERT03_M141080135_4M"),
    ("MALAPERT03", "NAC_DTM_MALAPERT03_M141086909_4M"),
    ("MALAPERT03", "NAC_DTM_MALAPERT03_M141093708_4M"),
)
REGION = "malapert-massif"
SURFACE_HEIGHT_M = 0.0


def download_once(url: str, folder: Path, name: str, user_agent: str, max_mb: int = 64):
    """Scarica una volta il file e ne registra provenienza e SHA-256; poi riusa la copia."""
    folder.mkdir(parents=True, exist_ok=True)
    path, meta_path = folder / name, folder / f"{name}.metadata.json"
    if path.is_file() and meta_path.is_file():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        if hashlib.sha256(path.read_bytes()).hexdigest() == meta.get("sha256"):
            return path, meta
    with requests.get(
        url, headers={"User-Agent": user_agent}, timeout=(10, 120), stream=True
    ) as response:
        response.raise_for_status()
        chunks, size = [], 0
        for chunk in response.iter_content(chunk_size=1 << 16):
            size += len(chunk)
            if size > max_mb * 1024 * 1024:
                raise ValueError(f"{name}: oltre {max_mb} MiB")
            chunks.append(chunk)
        content = b"".join(chunks)
        meta = {
            "requested_url": url,
            "final_url": response.url,
            "sha256": hashlib.sha256(content).hexdigest(),
            "bytes": len(content),
            "last_modified": response.headers.get("Last-Modified"),
            "fetched_at_utc": datetime.now(UTC).isoformat(timespec="seconds"),
        }
    path.write_bytes(content)
    meta_path.write_text(json.dumps(meta, indent=1) + "\n", encoding="utf-8")
    return path, meta


def _label_value(label: str, key: str) -> str:
    match = re.search(rf"^\s*{re.escape(key)}\s*=\s*(.+?)\s*$", label, flags=re.MULTILINE)
    if match is None:
        raise ValueError(f"Etichetta PDS senza {key}")
    return match[1]


def read_ortho(path: Path) -> dict:
    """Legge un'ortofoto PDS3 con etichetta allegata: I/F, georeferenziazione e tempi."""
    raw = path.read_bytes()
    head = raw[:20000].decode("latin-1")
    record = int(_label_value(head, "RECORD_BYTES"))
    label = raw[: int(_label_value(head, "LABEL_RECORDS")) * record].decode("latin-1")
    number = lambda key: float(_label_value(label, key).split()[0])  # noqa: E731
    lines, samples = int(number("LINES")), int(number("LINE_SAMPLES"))
    if _label_value(label, "SAMPLE_TYPE") != "LSB_UNSIGNED_INTEGER" or number("SAMPLE_BITS") != 16:
        raise ValueError("Formato dei pixel inatteso")
    projection = _label_value(label, "MAP_PROJECTION_TYPE").strip('"')
    if projection != "POLAR STEREOGRAPHIC" or number("CENTER_LATITUDE") != -90.0:
        raise ValueError(f"Proiezione inattesa: {projection}")
    if number("CENTER_LONGITUDE") != 0.0 or abs(number("A_AXIS_RADIUS") - 1737.4) > 1e-9:
        raise ValueError("Meridiano centrale o raggio di riferimento inattesi")
    start = (int(_label_value(label, "^IMAGE")) - 1) * record
    dn = np.frombuffer(raw, dtype="<u2", count=lines * samples, offset=start).reshape(
        lines, samples
    )
    valid = (dn > 2) & (dn < 65534)  # esclusi NULL e saturazioni dichiarate nell'etichetta
    reflectance = np.where(valid, dn * number("SCALING_FACTOR") + number("OFFSET"), np.nan)
    parse = lambda key: to_ms(  # noqa: E731
        datetime.fromisoformat(_label_value(label, key)).replace(tzinfo=UTC)
    )
    return {
        "product_id": _label_value(label, "PRODUCT_ID"),
        "product_version": _label_value(label, "PRODUCT_VERSION_ID").strip('"'),
        "start_ms": parse("START_TIME"),
        "stop_ms": parse("STOP_TIME"),
        "scale_m": number("MAP_SCALE"),
        # Scostamento dal centro del primo pixel all'origine della proiezione (il polo).
        "sample_offset": number("SAMPLE_PROJECTION_OFFSET"),
        "line_offset": number("LINE_PROJECTION_OFFSET"),
        "label_lat_range": [number("MINIMUM_LATITUDE"), number("MAXIMUM_LATITUDE")],
        "reflectance": reflectance,
    }


def pixel_xy(image: dict, line, sample):
    """Centro del pixel (indici da 0) in metri stereografici."""
    x = (np.asarray(sample, dtype=float) - image["sample_offset"]) * image["scale_m"]
    y = (image["line_offset"] - np.asarray(line, dtype=float)) * image["scale_m"]
    return x, y


def otsu_threshold(values: np.ndarray, bins: int = 256) -> float:
    histogram, edges = np.histogram(values, bins=bins)
    centres = (edges[:-1] + edges[1:]) / 2.0
    weight = histogram.cumsum()
    total = weight[-1]
    mean = (histogram * centres).cumsum()
    with np.errstate(invalid="ignore", divide="ignore"):
        between = (mean[-1] * weight - mean * total) ** 2 / (weight * (total - weight))
    return float(centres[int(np.nanargmax(between[:-1]))])


def _enu(lat_deg, lon_deg):
    lat, lon = np.radians(lat_deg), np.radians(lon_deg)
    east = np.stack([-np.sin(lon), np.cos(lon), np.zeros_like(lon)], axis=-1)
    north = np.stack([-np.sin(lat) * np.cos(lon), -np.sin(lat) * np.sin(lon), np.cos(lat)], axis=-1)
    up = np.stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)], axis=-1)
    return east, north, up


def to_moon_fixed(lat_deg, lon_deg, azimuth_deg, elevation_deg) -> np.ndarray:
    east, north, up = _enu(np.asarray(lat_deg, float), np.asarray(lon_deg, float))
    az, el = math.radians(azimuth_deg), math.radians(elevation_deg)
    return (
        math.cos(el) * math.sin(az) * east + math.cos(el) * math.cos(az) * north
        + math.sin(el) * up
    )  # fmt: skip


def from_moon_fixed(direction, lat_deg, lon_deg):
    east, north, up = _enu(np.asarray(lat_deg, float), np.asarray(lon_deg, float))
    e, n, u = (np.sum(direction * basis, axis=-1) for basis in (east, north, up))
    return np.degrees(np.arctan2(e, n)) % 360.0, np.degrees(np.arcsin(np.clip(u, -1, 1)))


def _cos_incidence(raster, x, y, lat_deg, sun_az_deg, sun_el_deg, diameter_m=40.0) -> float:
    """Coseno dell'angolo fra il Sole e la normale al piano locale (supporto di 40 m)."""
    scale = stereographic_scale(float(lat_deg))
    support = circular_support(raster, float(x), float(y), scale, diameter_m)
    good = np.isfinite(support.values)
    if not support.inside_raster or good.sum() < 12:
        return float("nan")
    design = np.column_stack([support.dx_m[good], support.dy_m[good], np.ones(good.sum())])
    (a, b, _), *_ = np.linalg.lstsq(design, support.values[good], rcond=None)
    normal = np.array([-a, -b, 1.0]) / math.sqrt(a * a + b * b + 1.0)
    # Sul piano della mappa il nord locale punta lontano dal polo, l'est è ruotato di 90°.
    r = math.hypot(x, y)
    north, east = np.array([x / r, y / r]), np.array([y / r, -x / r])
    az, el = math.radians(sun_az_deg), math.radians(sun_el_deg)
    horizontal = math.cos(el) * (math.sin(az) * east + math.cos(az) * north)
    return float(normal[0] * horizontal[0] + normal[1] * horizontal[1] + normal[2] * math.sin(el))


def _rank(values: np.ndarray) -> np.ndarray:
    order = np.argsort(values)
    ranks = np.empty(values.size)
    ranks[order] = np.arange(values.size)
    return ranks


def _post_hoc(observed, lit, shadow, cos_incidence, threshold) -> dict:
    """Analisi aggiunte DOPO aver visto l'esito della regola principale: non lo sostituiscono.

    Servono a capire lo scarto: i campioni previsti in luce ma scuri sono pendii a incidenza
    radente o sono ombre che l'engine non prevede?
    """
    usable = lit & np.isfinite(cos_incidence)
    out = {"note": "analisi successiva all'esito, non pre-registrata", "lit_samples": 0}
    if usable.sum() >= 20:
        obs, cos = observed[usable], cos_incidence[usable]
        dark = obs <= threshold
        out |= {
            "lit_samples": int(usable.sum()),
            "spearman_i_over_f_vs_cos_incidence": float(np.corrcoef(_rank(obs), _rank(cos))[0, 1]),
            "median_cos_incidence_lit_and_bright": float(np.median(cos[~dark]))
            if (~dark).any()
            else None,
            "median_cos_incidence_lit_but_dark": float(np.median(cos[dark]))
            if dark.any()
            else None,
            "lit_but_dark_with_cos_incidence_below_0.05": float((cos[dark] < 0.05).mean())
            if dark.any()
            else None,
        }
    decided = lit | shadow
    if shadow.any() and lit.any():
        # Livello d'ombra dai soli pixel previsti in ombra: usa la previsione, quindi non è
        # indipendente. Riportato solo come descrizione del contrasto osservato.
        level = float(np.sqrt(np.median(observed[shadow]) * np.median(observed[lit])))
        out["contrast_level_i_over_f"] = level
        out["agreement_at_contrast_level"] = float(
            ((observed[decided] > level) == lit[decided]).mean()
        )
        out["median_i_over_f_ratio_lit_to_shadow"] = float(
            np.median(observed[lit]) / np.median(observed[shadow])
        )
    return out


def _site(point_id, lat, lon, ground) -> PointResult:
    """Sito minimo per interrogare Horizons a quota suolo."""
    return PointResult.model_construct(
        id=point_id, lat_deg=lat, lon_east_deg=lon % 360.0,
        horizons_site_alt_km=(ground + SURFACE_HEIGHT_M) / 1000.0,
    )  # fmt: skip


def check_image(
    site: str,
    product: str,
    request,
    polygon,
    fetcher,
    core,
    settings,
    paths,
    tolerance: dict,
    stride_m: float = 150.0,
) -> dict:
    numeric = request.numeric
    url = f"{PDS_BASE}/{site}/{product}.IMG"
    path, provenance = download_once(url, paths.raw / "lroc", f"{product}.IMG", settings.user_agent)
    image = read_ortho(path)
    lines, samples = image["reflectance"].shape
    epoch_ms = (image["start_ms"] + image["stop_ms"]) // 2

    # Griglia regolare di campioni dentro l'immagine e dentro il poligono della regione.
    step = max(1, int(round(stride_m / image["scale_m"])))
    half = 2  # media su 5x5 pixel (20 m) attorno al campione
    grid_l = np.arange(half, lines - half, step)
    grid_s = np.arange(half, samples - half, step)
    ss, ll = np.meshgrid(grid_s, grid_l)
    x, y = pixel_xy(image, ll, ss)
    inside = np.array(
        [polygon.covers(ShapelyPoint(a, b)) for a, b in zip(x.ravel(), y.ravel(), strict=True)]
    ).reshape(x.shape)
    observed = np.full(x.shape, np.nan)
    for r, c in zip(*np.nonzero(inside), strict=True):
        block = image["reflectance"][
            ll[r, c] - half : ll[r, c] + half + 1, ss[r, c] - half : ss[r, c] + half + 1
        ]
        if np.isfinite(block).all():
            observed[r, c] = block.mean()
    use = np.isfinite(observed)
    if use.sum() < 50:
        return {"product": product, "status": "not_evaluable",
                "reason": "meno di 50 campioni validi dentro la regione", "pass": None}  # fmt: skip
    rows = np.flatnonzero(use.any(axis=1))
    cols = np.flatnonzero(use.any(axis=0))
    window = np.s_[rows[0] : rows[-1] + 1, cols[0] : cols[-1] + 1]
    x, y, observed, use = x[window], y[window], observed[window], use[window]

    lon, lat = np.vectorize(stereo_to_lonlat)(x, y)
    centre_lon, centre_lat = stereo_to_lonlat(float(x[use].mean()), float(y[use].mean()))
    reach = float(np.hypot(x[use] - x[use].mean(), y[use] - y[use].mean()).max())
    plans = plan_tiers(
        centre_lat, centre_lon, request.terrain[REGION], numeric.min_distance_m, fetcher,
        core.moontrek_base_url, margin_m=reach + 500.0,
    )  # fmt: skip
    stack = dem.TerrainStack([load_raster(p.product, p.bbox, p.tiles) for p in plans])
    tiers = radial_tiers(plans)

    # Direzione del Sole all'istante dell'immagine: ancoraggio al centro, verifica in un angolo.
    def sun_at(point_id, a_lat, a_lon):
        ground = float(stack.sample(*lonlat_to_stereo(a_lon, a_lat)))
        _, _, tables = load_tracks(
            _site(point_id, a_lat, a_lon, ground), epoch_ms, 3600_000, numeric, fetcher,
            core.horizons_api_url, 0, True,
        )  # fmt: skip
        sun = tables["sun"]
        if sun.times_ms[0] != epoch_ms:
            raise ValueError("Horizons non ha restituito l'istante dell'immagine")
        return sun.azimuth_deg[0], sun.elevation_deg[0], sun.angular_diameter_deg[0] / 2.0

    anchor = sun_at("lroc-anchor", centre_lat, centre_lon)
    fixed = to_moon_fixed(centre_lat, centre_lon, anchor[0], anchor[1])
    far = np.unravel_index(
        np.argmax(np.where(use, np.hypot(x - x[use].mean(), y - y[use].mean()), -1)), x.shape
    )
    check = sun_at("lroc-check", float(lat[far]), float(lon[far]))
    carried = from_moon_fixed(fixed, float(lat[far]), float(lon[far]))
    transfer_error = float(separation_deg(carried[0], carried[1], check[0], check[1]))

    sun_az, sun_el = from_moon_fixed(fixed, lat, lon)
    offsets = np.arange(-0.4, 0.4001, 0.05)  # il disco solare è largo circa 0,54°
    fraction = np.full(x.shape, np.nan)
    cos_incidence = np.full(x.shape, np.nan)
    for r, c in zip(*np.nonzero(use), strict=True):
        cos_incidence[r, c] = _cos_incidence(
            stack.rasters[0], x[r, c], y[r, c], lat[r, c], sun_az[r, c], sun_el[r, c]
        )
        azimuths = sun_az[r, c] + offsets
        elevation, complete, _, _, _ = horizon_elevations(
            stack, float(lat[r, c]), float(lon[r, c]), SURFACE_HEIGHT_M, azimuths, tiers,
            numeric.radial_relative_step,
        )  # fmt: skip
        if not complete.all():
            continue
        horizon_at = lambda a, az=azimuths, el=elevation: np.interp(a, az, el)  # noqa: E731
        fraction[r, c] = disc_fractions(
            horizon_at, sun_az[r, c], sun_el[r, c], anchor[2], strips=numeric.disc_strips
        ).f_terrain[0]

    known = use & np.isfinite(fraction)
    shadow, lit = known & (fraction == 0.0), known & (fraction >= 0.5)
    partial = known & ~shadow & ~lit
    decided = shadow | lit
    threshold = 10 ** otsu_threshold(np.log10(observed[known]))

    def agreement(mask, level):
        if mask.sum() == 0:
            return None
        return float(((observed[mask] > level) == lit[mask]).mean())

    # Campioni lontani da un bordo d'ombra previsto: gli 8 vicini hanno la stessa classe.
    label = np.where(lit, 1, np.where(shadow, 0, -1))
    padded = np.pad(label, 1, constant_values=-2)
    interior = decided.copy()
    for dr in (-1, 0, 1):
        for dc in (-1, 0, 1):
            neighbour = padded[1 + dr : 1 + dr + label.shape[0], 1 + dc : 1 + dc + label.shape[1]]
            interior &= (neighbour == label) | (neighbour == -2)
    bright = observed > threshold
    primary = agreement(decided, threshold)
    folder = paths.root / "validation"
    folder.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        folder / f"lroc_{product}.npz", x_m=x, y_m=y, observed_i_over_f=observed,
        predicted_f_sun_terrain=fraction, sun_azimuth_deg=sun_az, sun_elevation_deg=sun_el,
        predicted_cos_incidence=cos_incidence,
    )  # fmt: skip
    return {
        "product": product,
        "status": "evaluated",
        "source": {
            "archive": "NASA PDS, LRO-L-LROC-5-RDR-V1.0, volume LROLRC_2001 (LROC NAC DTM)",
            "producer": "Arizona State University, LROC team",
            "product_version": image["product_version"],
            **provenance,
        },
        "image_start_utc": to_iso(image["start_ms"]),
        "image_stop_utc": to_iso(image["stop_ms"]),
        "epoch_used_utc": to_iso(epoch_ms),
        "image_pixel_m": image["scale_m"],
        "observation_footprint_m": image["scale_m"] * (2 * half + 1),
        "sample_stride_m": step * image["scale_m"],
        "predicted_height_m": SURFACE_HEIGHT_M,
        "engine_v1_height_m": request.observer_height_m,
        "dem_tiers": [p.product.label for p in plans],
        "region": REGION,
        "sample_centre": {"lat_deg": centre_lat, "lon_east_deg": centre_lon % 360.0},
        "sample_extent_m": {
            "x": [float(x[use].min()), float(x[use].max())],
            "y": [float(y[use].min()), float(y[use].max())],
        },
        "sun": {
            "anchor_azimuth_deg": float(anchor[0]),
            "anchor_elevation_deg": float(anchor[1]),
            "angular_radius_deg": float(anchor[2]),
            "elevation_range_deg": [float(np.nanmin(sun_el[use])), float(np.nanmax(sun_el[use]))],
            "moon_fixed_transfer_error_deg": transfer_error,
            "transfer_distance_m": float(np.hypot(x[far] - x[use].mean(), y[far] - y[use].mean())),
        },
        "samples": {
            "valid_observation": int(use.sum()),
            "with_prediction": int(known.sum()),
            "predicted_shadow": int(shadow.sum()),
            "predicted_lit": int(lit.sum()),
            "predicted_partial": int(partial.sum()),
            "interior": int(interior.sum()),
        },
        "threshold_rule": "Otsu su log10(I/F) dei campioni dell'immagine",
        "i_over_f_threshold": threshold,
        "i_over_f_median": {
            "predicted_shadow": float(np.median(observed[shadow])) if shadow.any() else None,
            "predicted_lit": float(np.median(observed[lit])) if lit.any() else None,
            "predicted_partial": float(np.median(observed[partial])) if partial.any() else None,
        },
        "confusion": {
            "predicted_lit_observed_bright": int((lit & bright).sum()),
            "predicted_lit_observed_dark": int((lit & ~bright).sum()),
            "predicted_shadow_observed_bright": int((shadow & bright).sum()),
            "predicted_shadow_observed_dark": int((shadow & ~bright).sum()),
            "predicted_partial_observed_bright": int((partial & bright).sum()),
            "predicted_partial_observed_dark": int((partial & ~bright).sum()),
        },
        "post_hoc": _post_hoc(observed, lit, shadow, cos_incidence, threshold),
        "agreement": {
            "primary_non_partial": primary,
            "interior_only": agreement(interior, threshold),
            "threshold_halved": agreement(decided, threshold / 2.0),
            "threshold_doubled": agreement(decided, threshold * 2.0),
        },
        "tolerance_min_agreement": tolerance["min_agreement_fraction"],
        "pass": None if primary is None else bool(primary >= tolerance["min_agreement_fraction"]),
    }
