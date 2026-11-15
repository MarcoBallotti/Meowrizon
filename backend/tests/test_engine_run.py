"""Engine completo senza rete: cache, determinismo, offline, schema JSON, richieste non valide.

Le fonti sono sostituite da risposte sintetiche nello stesso formato di quelle reali. I casi
sintetici servono soltanto ai test: non sostituiscono mai i dati reali della demo.
"""

import json
import math
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pytest
from pydantic import ValidationError
from support import temporary_directory

from app.cli import main
from app.core.config import get_settings
from app.core.manifest import save_download
from app.services.engine import models
from app.services.engine.acquisition import OfflineDataMissing
from app.services.engine.orchestrator import (
    EnginePaths,
    RequestError,
    result_json,
    run_analysis,
    write_outputs,
)
from app.services.regions import moontrek
from app.services.sources import Collector
from app.services.terrain import moontrek_dem as dem

FIXTURES = Path(__file__).parent / "fixtures"
SCHEMA_FILE = Path(__file__).resolve().parents[1] / "schemas" / "analysis-result-v1.schema.json"
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
T0 = "2026-12-01T00:00:00Z"


class FakeSources:
    """Risposte sintetiche di Moon Trek e Horizons, con conteggio delle richieste."""

    def __init__(self, ground_m=1000.0, fail_body=None):
        self.ground_m = ground_m
        self.fail_body = fail_body
        self.calls = []
        template = json.loads((FIXTURES / "horizons_topo_sun.json").read_text())["result"]
        self.header, rest = template.split("$$SOE", 1)
        self.footer = rest.split("$$EOE", 1)[1]

    def __call__(self, url, *, params=None, body=None, max_mb=128):
        self.calls.append(url)
        details = {"method": "GET", "url": url, "http_status": 200}
        if "horizons" in url:
            return self._horizons(params), details
        if url.endswith("/exportImage"):
            return self._tile(url, params), details
        return self._metadata(url), details

    @staticmethod
    def _product(url):
        return dem.PRODUCTS[re.search(r"/services/([^/]+)/ImageServer", url)[1]]

    def _metadata(self, url):
        p = self._product(url)
        wkt = (
            'PROJCS["Moon2000_spole",SPHEROID["Moon_2000_IAU_IAG",1737400.0,0.0],'
            'PROJECTION["Stereographic_South_Pole"]]'
        )
        meta = {
            "pixelSizeX": p.pixel_m, "pixelSizeY": p.pixel_m, "pixelType": p.pixel_type,
            "bandCount": 1, "noDataValue": None,
            "extent": {"xmin": p.xmin, "ymin": p.ymin, "xmax": p.xmax, "ymax": p.ymax,
                       "spatialReference": {"wkt": wkt}},
        }  # fmt: skip
        return json.dumps(meta).encode()

    def _tile(self, url, params):
        import rasterio
        from rasterio.io import MemoryFile
        from rasterio.transform import from_origin

        p = self._product(url)
        x0, _, _, y1 = (float(v) for v in params["bbox"].split(","))
        width, height = (int(v) for v in params["size"].split(","))
        value = 1.0 if p.family == "lola-count" else self.ground_m
        data = np.full((height, width), value, dtype=np.float32)
        crs = rasterio.crs.CRS.from_proj4(
            "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs"
        )
        with MemoryFile() as memory:
            with memory.open(
                driver="GTiff", width=width, height=height, count=1, dtype="float32", crs=crs,
                transform=from_origin(x0, y1, p.pixel_m, p.pixel_m), compress="deflate",
            ) as target:  # fmt: skip
                target.write(data, 1)
            return memory.read()

    def _horizons(self, params):
        code = params["COMMAND"].strip("'")
        if self.fail_body == code:
            return b'{"error": "Simulated outage", "result": "Simulated outage"}'
        start = datetime.fromisoformat(params["START_TIME"].strip("'")).replace(tzinfo=UTC)
        stop = datetime.fromisoformat(params["STOP_TIME"].strip("'")).replace(tzinfo=UTC)
        step = timedelta(minutes=int(params["STEP_SIZE"].strip("'").split()[0]))
        lon, lat, alt = params["SITE_COORD"].strip("'").split(",")
        header = re.sub(
            r"Center geodetic : [^{]+\{", f"Center geodetic : {lon}, {lat}, {alt}   {{", self.header
        )
        if code == "399":
            header = header.replace("Target body name: Sun (10)", "Target body name: Earth (399)")
        rows, moment = [], start
        origin = datetime(2026, 12, 1, tzinfo=UTC)
        while moment <= stop:
            hours = (moment - origin).total_seconds() / 3600.0
            if code == "10":  # il Sole attraversa l'orizzonte ogni 60 ore
                azimuth = (100.0 + 0.51 * hours) % 360.0
                elevation = 1.0 * math.sin(2 * math.pi * (hours - 15.0) / 120.0)
                diameter, distance = 1945.0, 1.4755e8
            else:  # la Terra resta alta sull'orizzonte
                azimuth, elevation = 10.0 + 0.01 * hours, 4.0 + 0.2 * math.sin(hours / 50.0)
                diameter, distance = 6988.0, 3.7654e5
            stamp = (
                f"{moment.year}-{MONTHS[moment.month - 1]}-{moment.day:02d} "
                f"{moment:%H:%M:%S}.{moment.microsecond // 1000:03d}"
            )
            rows.append(
                f" {stamp},*,i, {azimuth:10.6f}, {elevation:12.6f}, {diameter:9.3f}, "
                f"{distance:17.10E}, {0.05:10.7f},"
            )
            moment += step
        text = header + "$$SOE\n" + "\n".join(rows) + "\n$$EOE" + self.footer
        return json.dumps({"signature": {"source": "synthetic test"}, "result": text}).encode()


def make_request(epochs=(T0,), points=None, **overrides):
    data = {
        "schema": "meowrizon.analysis.request/1",
        "points": points
        or [
            {
                "id": "dgr2",
                "region": "de-gerlache-rim-2",
                "lat_deg": -88.229978,
                "lon_east_deg": 295.371562,
                "selection": "centro del poligono",
            }
        ],  # fmt: skip
        "epochs_utc": list(epochs),
        "duration_s": 5 * 86400,
        "terrain": {
            "de-gerlache-rim-2": [
                {
                    "product": "LRO_LOLA_DEM_SPole875_5mp_v04",
                    "outer_radius_m": 600,
                    "radial_step_m": 5,
                },
                {
                    "product": "LRO_LOLA_DEM_SPole75_30mp_v04",
                    "outer_radius_m": 3000,
                    "radial_step_m": 30,
                },
                {
                    "product": "LRO_LOLA_DEM_SPole45_100mp_v04",
                    "outer_radius_m": 10000,
                    "radial_step_m": 100,
                },
            ],
            "malapert-massif": [
                {
                    "product": "Site23_final_adj_5mpp_surf",
                    "outer_radius_m": 600,
                    "radial_step_m": 5,
                },
                {
                    "product": "LRO_LOLA_DEM_SPole75_30mp_v04",
                    "outer_radius_m": 3000,
                    "radial_step_m": 30,
                },
                {
                    "product": "LRO_LOLA_DEM_SPole45_100mp_v04",
                    "outer_radius_m": 10000,
                    "radial_step_m": 100,
                },
            ],
        },  # fmt: skip
        "numeric": {"azimuth_step_deg": 2.0, "scan_step_s": 300.0},
    }
    data.update(overrides)
    return models.AnalysisRequest.model_validate(data)


MALAPERT = {"id": "malapert", "region": "malapert-massif", "lat_deg": -85.994785,
            "lon_east_deg": 359.764216}  # fmt: skip


@pytest.fixture
def engine(data_env, moontrek_bytes):
    """Poligoni reali registrati come dopo `init-regions`; cartella di analisi temporanea."""
    save_download(
        data_env / "sources", moontrek.SOURCE_NAME, "https://example.test/layer", {},
        moontrek.RAW_FILENAME, moontrek_bytes,
    )  # fmt: skip
    with temporary_directory() as folder:
        root = Path(folder)
        yield EnginePaths(root=root / "analysis", lock=root / "collection.lock")


def run(request, paths, sources=None, offline=False):
    sources = sources or FakeSources()
    with patch.object(Collector, "_request", side_effect=sources):
        result, report = run_analysis(request, offline=offline, paths=paths, core=get_settings())
    return result, report, sources


def test_second_run_uses_cache_and_gives_identical_bytes(engine):
    request = make_request()
    first, report1, sources1 = run(request, engine)
    second, report2, sources2 = run(request, engine)
    assert report1.downloads > 0 and report1.terrain_computed == 1 and report1.series_computed == 1
    assert report2.downloads == 0 and sources2.calls == []
    assert report2.terrain_cache_hits == 1 and report2.series_cache_hits == 1
    assert result_json(first) == result_json(second)
    assert first.scenarios[0].status == "ok" and first.points[0].status == "ok"


def test_new_date_reuses_terrain_and_new_dem_invalidates_it(engine):
    run(make_request(), engine)
    _, report, sources = run(make_request(epochs=(T0, "2026-12-03T06:30:15.250Z")), engine)
    assert report.terrain_cache_hits == 1 and report.terrain_computed == 0
    assert report.series_cache_hits == 1 and report.series_computed == 1
    assert all("horizons" in url for url in sources.calls)  # nessun tassello riscaricato

    # Stesso punto, DEM diverso (altro contenuto, altro hash): terreno e serie ricalcolati.
    other = EnginePaths(root=engine.root.parent / "other", lock=engine.lock)
    for name in ("terrain", "series"):
        (other.root / "cache").mkdir(parents=True, exist_ok=True)
        (engine.root / "cache" / name).rename(other.root / "cache" / name)
    result, report, _ = run(make_request(), other, FakeSources(ground_m=1200.0))
    assert report.terrain_cache_hits == 0 and report.terrain_computed == 1
    assert report.series_cache_hits == 0 and report.series_computed == 1
    assert result.points[0].elevation.value == 1200.0

    # Cambiare il metodo numerico cambia la chiave del terreno.
    changed = make_request(numeric={"azimuth_step_deg": 1.0, "scan_step_s": 300.0})
    _, report, _ = run(changed, other, FakeSources(ground_m=1200.0))
    assert report.terrain_computed == 1 and report.downloads == 0


def test_offline_needs_a_complete_cache(engine):
    request = make_request()
    with pytest.raises(OfflineDataMissing, match="offline"):
        run(request, engine, offline=True)
    online, _, _ = run(request, engine)
    offline, report, sources = run(request, engine, offline=True)
    assert sources.calls == [] and report.downloads == 0
    assert result_json(online) == result_json(offline)
    # Una data non ancora acquisita non viene inventata.
    with pytest.raises(OfflineDataMissing, match="engine-horizons"):
        run(make_request(epochs=("2027-03-01T00:00:00Z",)), engine, offline=True)


def test_corrupted_source_is_not_reused_offline(engine):
    request = make_request()
    run(request, engine)
    tile = next((engine.raw / "engine-dem-lro_lola_dem_spole875_5mp_v04").rglob("response.tif"))
    tile.write_bytes(tile.read_bytes()[:-10])
    for cached in (engine.root / "cache").rglob("*.json"):
        cached.unlink()
    with pytest.raises(OfflineDataMissing):
        run(request, engine, offline=True)


def test_invalid_requests_are_rejected_not_silently_fixed(engine):
    outside = [{"id": "p", "region": "de-gerlache-rim-2", "lat_deg": -85.99, "lon_east_deg": 0.0}]
    with pytest.raises(RequestError, match="fuori dal poligono"):
        run(make_request(points=outside), engine)
    unknown = [{"id": "p", "region": "haworth", "lat_deg": -86.76, "lon_east_deg": 337.2}]
    with pytest.raises(RequestError, match="non supportata"):
        run(make_request(points=unknown, terrain={"haworth": [
            {"product": "LRO_LOLA_DEM_SPole75_30mp_v04", "outer_radius_m": 100,
             "radial_step_m": 30}]}), engine)  # fmt: skip
    for bad in (
        {"observer_height_m": 1.5},
        {"epochs_utc": ["2026-12-01T00:00:00"]},  # senza fuso: non è UTC esplicito
        {"epochs_utc": ["2026-12-01T01:00:00+01:00"]},
        {"epochs_utc": [T0, T0]},
        {"duration_s": 0},
        {"duration_s": -5},
        {"points": [{"id": "Bad ID", "region": "x", "lat_deg": 0, "lon_east_deg": 0}]},
        {"points": [{"id": "p", "region": "de-gerlache-rim-2", "lat_deg": -91,
                     "lon_east_deg": 0}]},
        {"numeric": {"ephemeris_step_s": 90}},
        {"unexpected_field": 1},
    ):  # fmt: skip
        with pytest.raises(ValidationError):
            make_request(**bad)


def test_result_has_v1_content_units_and_explicit_time_references(engine):
    odd = "2026-12-01T03:17:42.500Z"  # T non allineato all'ora: non viene arrotondato
    request = make_request(
        epochs=(T0, odd), points=[make_request().points[0].model_dump(), MALAPERT]
    )
    result, _, _ = run(request, engine)
    assert [p.id for p in result.points] == ["dgr2", "malapert"]
    assert len(result.scenarios) == 4 and {c.kind for c in result.comparisons} == {
        "same_point_across_dates", "same_date_across_points"}  # fmt: skip
    point = result.points[0]
    assert point.elevation.value == 1000.0 and point.observer_height_m == 2.0
    assert point.horizons_site_alt_km == pytest.approx(1.002)
    assert point.slope.value_deg == pytest.approx(0.0, abs=1e-6) and point.slope.band == 1
    assert point.slope.support_fraction_with_lola_shots == 1.0
    assert result.points[1].slope.lola_count_product is None  # non distribuito per il sito 23
    dip = -math.degrees(math.acos(1.0 / (1.0 + 2.0 / (1737400.0 + 1000.0))))
    assert point.horizon.directions == 180 and point.horizon.directions_complete == 180
    assert max(abs(v - dip) for v in point.horizon.elevation_deg) < 2e-3

    scenario = next(s for s in result.scenarios if s.point_id == "dgr2" and s.t_utc == odd)
    assert scenario.series.utc[0] == odd and scenario.series.elapsed_s[0] == 0.0
    assert scenario.series.utc[1] == "2026-12-01T04:17:42.500Z"
    state = scenario.state_at_t
    assert state.sun_margin_deg == pytest.approx(state.sun_elevation_deg - state.sun_horizon_deg)
    assert state.sun_state == "dark" and state.f_sun == 0.0 and state.sun_c3 is False
    assert state.remaining_sun_c3.value_s == 0.0
    assert state.earth_c3 is True and state.f_earth == 1.0
    # La Terra resta visibile per tutta la finestra: fine non osservata, solo limite inferiore.
    assert state.remaining_earth_c3.value_s is None
    assert state.remaining_earth_c3.lower_bound_s == 5 * 86400
    earth = scenario.windows.earth_c3
    assert len(earth) == 1 and earth[0].truncated_left and earth[0].truncated_right
    assert earth[0].total_duration_s is None and earth[0].end_kind == "request_end"
    # Il Sole sintetico attraversa l'orizzonte: alba e tramonto osservati dentro la finestra.
    complete = [w for w in scenario.windows.sun_c3 if w.total_duration_s is not None]
    assert complete and complete[0].start_kind == "observed_transition"
    assert complete[0].cause_at_end == "terrain"
    # Transizione netta: il disco attraversa l'orizzonte in poche ore, non in modo radente.
    assert complete[0].rate_metric == "|d(f_sun)/dt| in fraction/h"
    assert complete[0].start_rate_per_hour > 0.01 and complete[0].end_rate_per_hour > 0.01
    assert earth[0].start_rate_per_hour is None and earth[0].end_rate_per_hour is None
    # Mezzo periodo (60 h) più il tempo fra orizzontale e orizzonte geometrico (-0,087°).
    extra_h = 2 * math.asin(-dip / 1.0) * 120.0 / (2 * math.pi)
    assert complete[0].total_duration_s == pytest.approx((60 + extra_h) * 3600, abs=300)
    dark = scenario.first_dark
    assert dark.truncated_left and dark.start_kind == "request_start"
    assert dark.total_duration_s is None and dark.cause_at_start == "terrain"
    assert scenario.coverage == {"sun_c3": 1.0, "earth_c3": 1.0, "joint_c3": 1.0}
    roles = {source.role for source in result.sources}
    assert roles >= {"region_polygons", "dem_tile", "topocentric_ephemeris",
                     "dem_service_metadata", "lola_shot_count_tile"}  # fmt: skip
    assert all(len(source.sha256) == 64 for source in result.sources)


def test_json_is_valid_versioned_and_matches_the_published_schema(engine):
    result, report, _ = run(make_request(), engine)
    text = result_json(result)

    def forbidden(name):
        raise AssertionError(f"valore non JSON: {name}")

    data = json.loads(text, parse_constant=forbidden)
    assert data["schema"] == "meowrizon.analysis.result/1"
    assert data["schema_version"] == models.SCHEMA_VERSION
    assert data["algorithm_version"] == models.ALGORITHM_VERSION
    assert models.AnalysisResult.model_validate_json(text) == result
    # Le metriche V2 non sono promesse nello schema: sono dichiarate fuori da V1.
    assert "regional_grids_and_areas" in data["not_in_v1"]
    body = json.dumps({k: v for k, v in data.items() if k != "not_in_v1"}).lower()
    for absent in ("p50", "score", "ranking", "area_km2", "robustness"):
        assert absent not in body
    published = json.loads(SCHEMA_FILE.read_text(encoding="utf-8"))
    assert published == models.AnalysisResult.model_json_schema(by_alias=True), (
        "Schema cambiato: rigenerare backend/schemas/analysis-result-v1.schema.json e "
        "aggiornare SCHEMA_VERSION"
    )
    written = write_outputs(result, report, engine)
    manifest = json.loads(written["manifest"].read_text())
    assert manifest["mode"] == "online" and manifest["result_sha256"]
    assert written["result"].read_text(encoding="utf-8") == text


def test_source_failure_gives_an_explicit_partial_result_that_is_not_cached(engine):
    result, report, _ = run(make_request(), engine, FakeSources(fail_body="399"))
    scenario = result.scenarios[0]
    assert scenario.status == "unknown" and "effemeridi non disponibili" in scenario.reason
    assert scenario.state_at_t is None and scenario.series is None and scenario.windows is None
    assert result.points[0].status == "ok"  # il terreno, indipendente, resta valutato
    row = result.comparisons[0].rows[0]
    assert row["status"] == "unknown" and "f_sun" not in row
    assert list((engine.root / "cache" / "series").glob("*.json")) == []
    recovered, report, _ = run(make_request(), engine)
    assert recovered.scenarios[0].status == "ok" and report.series_computed == 1


def test_cli_analyze_online_then_offline(engine, capsys):
    config = engine.root.parent / "request.json"
    config.write_text(json.dumps(make_request().model_dump(mode="json", by_alias=True)))
    arguments = ["analyze", "--config", str(config), "--output", str(engine.root)]
    assert main(arguments + ["--offline"]) == 2
    assert "Cache insufficiente" in capsys.readouterr().err
    with patch.object(Collector, "_request", side_effect=FakeSources()):
        assert main(arguments) == 0
    output = capsys.readouterr().out
    assert "dgr2" in output and "result.json" in output
    with patch.object(Collector, "_request", side_effect=AssertionError("rete usata offline")):
        assert main(arguments + ["--offline"]) == 0
    results = list((engine.root / "runs").rglob("result.json"))
    assert len(results) == 1 and (results[0].parent / "manifest.json").is_file()

    config.write_text("{}")
    assert main(arguments) == 1
    assert "Richiesta non valida" in capsys.readouterr().err


def test_algorithm_version_invalidates_both_derived_caches(engine):
    from app.services.engine import scenario_stage, terrain_stage

    request = make_request()
    run(request, engine)
    with (
        patch.object(terrain_stage, "ALGORITHM_VERSION", "review-version"),
        patch.object(scenario_stage, "ALGORITHM_VERSION", "review-version"),
    ):
        _, report, sources = run(request, engine)
    assert report.terrain_computed == 1 and report.series_computed == 1
    assert report.downloads == 0 and sources.calls == []
