"""Orchestrazione dell'engine puntuale V1: richiesta -> terreno -> serie -> confronto.

Si usa da Python senza avviare FastAPI:

    from app.services.engine.orchestrator import load_request, run_analysis
    result, report = run_analysis(load_request("config/analysis.demo.json"))
"""

import hashlib
import json
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from shapely.geometry import Point as ShapelyPoint

from app.core.config import Settings as CoreSettings
from app.core.config import get_settings
from app.core.moon import lonlat_to_stereo
from app.services.engine.acquisition import SourceFetcher, load_regions
from app.services.engine.cache import JsonCache, key_of
from app.services.engine.compare import build_comparisons
from app.services.engine.models import (
    ALGORITHM_VERSION,
    CAPABILITIES,
    NOT_IN_V1,
    SCHEMA_VERSION,
    AnalysisRequest,
    AnalysisResult,
    SourceRecord,
    to_iso,
    to_ms,
)
from app.services.engine.scenario_stage import run_scenario
from app.services.engine.terrain_stage import compute_point_terrain
from app.settings import Settings, inside_backend


class RequestError(ValueError):
    """La richiesta non è valida per V1: non si corregge in silenzio."""


@dataclass(frozen=True)
class EnginePaths:
    root: Path
    lock: Path

    @classmethod
    def default(cls, settings: Settings | None = None, root=None) -> "EnginePaths":
        settings = settings or Settings()
        root = inside_backend(root or "data/analysis", root=settings.root)
        return cls(root=root, lock=settings.collection_lock)

    @property
    def raw(self) -> Path:
        return self.root / "raw"

    @property
    def terrain_cache(self) -> Path:
        return self.root / "cache" / "terrain"

    @property
    def series_cache(self) -> Path:
        return self.root / "cache" / "series"

    @property
    def runs(self) -> Path:
        return self.root / "runs"


@dataclass
class RunReport:
    offline: bool
    timings_s: dict = field(default_factory=dict)
    downloads: int = 0
    source_cache_hits: int = 0
    terrain_cache_hits: int = 0
    terrain_computed: int = 0
    series_cache_hits: int = 0
    series_computed: int = 0


CONVENTIONS = {
    "coordinates": "planetocentriche, Mean Earth/polar axis, sfera 1737400 m, longitudine Est",
    "time": "UTC; T non viene arrotondato; elapsed_s è il tempo trascorso da T",
    "window": "[T, T+duration): la fine della finestra non è un evento fisico",
    "azimuth": "da nord verso est, gradi",
    "elevation": "centro del disco rispetto all'orizzontale locale (verticale radiale)",
    "margin": "elevazione del centro meno orizzonte del terreno nello stesso azimut",
    "observer": "2 m sopra il DEM, scelta del team",
    "ephemerides": (
        "JPL Horizons topocentrico (coord@301), geometria apparente senza rifrazione; "
        "interpolazione cubica dei versori fra i campioni"
    ),
    "f_sun_terrain": "frazione del disco solare non nascosta dal terreno",
    "f_sun": "frazione del disco solare non nascosta né dal terreno né dalla Terra (unione)",
    "f_earth": "frazione del disco terrestre non nascosta dal terreno, indipendente dalla fase",
    "c3": "visibile se frazione >= c3_threshold (0,5): scelta del team, non soglia NASA",
    "sun_states": "c3: f_sun >= 0,5; reduced: 0 < f_sun < 0,5; dark: f_sun = 0",
    "zero_fraction": "f <= zero_fraction_epsilon è trattato come 0: tolleranza numerica",
    "earth_model": (
        "disco opaco circolare con il raggio angolare equatoriale di Horizons; nessuna luce "
        "rifratta o diffusa dall'atmosfera terrestre; schiacciamento polare non modellato"
    ),
    "slope_bands": "[0,5), [5,10), [10,15), >=15 gradi: descrittive, nessun filtro",
    "unknown": "misura non valutabile = null con status e reason; mai un falso zero",
}

LIMITATIONS = [
    "Misure geometriche e topografiche: nessuna potenza, temperatura, autonomia o qualità radio.",
    "I punti non rappresentano statisticamente la regione e non sono siti certificati.",
    "L'incertezza del DEM non è quantificata; accuratezza numerica e incertezza del terreno "
    "sono distinte (vedi docs/validazione-engine-v1.md).",
    "Fonte NASA dei dati non implica validazione o approvazione NASA dei risultati.",
    "Gli eventi sono cercati solo nella finestra richiesta: un intervallo troncato dà un limite "
    "inferiore, non una durata totale.",
    "Gli istanti delle transizioni radenti (ritmo basso in start/end_rate_per_hour, elencate "
    "nelle note dello scenario) sono approssimati: piccoli errori dell'orizzonte li spostano di "
    "minuti. La tolleranza della bisezione è numerica, non la precisione fisica dell'evento.",
    "Validazione V1 incompleta: il riscontro con le ortofoto LROC datate è stato eseguito ma "
    "non ha raggiunto il criterio di accordo fissato in anticipo (docs/validazione-engine-v1.md).",
]


def load_request(path) -> AnalysisRequest:
    return AnalysisRequest.model_validate_json(Path(path).read_text(encoding="utf-8"))


def request_dump(request: AnalysisRequest) -> dict:
    data = request.model_dump(mode="json", by_alias=True)
    data["epochs_utc"] = [to_iso(to_ms(epoch)) for epoch in request.epochs_utc]
    return data


def validate_points(request: AnalysisRequest, regions: dict) -> None:
    for point in request.points:
        if abs(point.lat_deg) >= 90.0:
            raise RequestError(
                f"Punto '{point.id}': al polo esatto azimut e nord locale non sono definiti; "
                "la coordinata non viene spostata"
            )
        region = regions.get(point.region)
        if region is None:
            raise RequestError(
                f"Punto '{point.id}': regione '{point.region}' non supportata in V1 "
                f"(supportate: {', '.join(sorted(regions))})"
            )
        x, y = lonlat_to_stereo(point.lon_east_deg, point.lat_deg)
        if not region.polygon_m.covers(ShapelyPoint(x, y)):
            raise RequestError(
                f"Punto '{point.id}' ({point.lat_deg}, {point.lon_east_deg}) fuori dal poligono "
                f"della regione '{point.region}'"
            )


def run_analysis(
    request: AnalysisRequest,
    *,
    offline: bool = False,
    paths: EnginePaths | None = None,
    core: CoreSettings | None = None,
    settings: Settings | None = None,
) -> tuple[AnalysisResult, RunReport]:
    settings = settings or Settings()
    core = core or get_settings()
    paths = paths or EnginePaths.default(settings)
    report = RunReport(offline=offline)
    terrain_cache = JsonCache(paths.terrain_cache)
    series_cache = JsonCache(paths.series_cache)
    started = time.perf_counter()

    with SourceFetcher(paths.raw, settings.user_agent, paths.lock, offline) as fetcher:
        validate_points(request, load_regions(core, fetcher))
        report.timings_s["regions"] = time.perf_counter() - started

        points, profiles = [], {}
        mark = time.perf_counter()
        for point_request in request.points:
            point, profile, cached = compute_point_terrain(
                point_request,
                request.terrain[point_request.region],
                request.numeric,
                request.observer_height_m,
                fetcher,
                core.moontrek_base_url,
                terrain_cache,
            )
            points.append(point)
            profiles[point.id] = profile
            report.terrain_cache_hits += cached
            report.terrain_computed += not cached
        report.timings_s["terrain"] = time.perf_counter() - mark

        scenarios = []
        mark = time.perf_counter()
        for point in points:
            for epoch in request.epochs_utc:
                scenario, cached = run_scenario(
                    point,
                    profiles[point.id],
                    to_ms(epoch),
                    request.duration_s,
                    request.numeric,
                    fetcher,
                    core.horizons_api_url,
                    series_cache,
                )
                scenarios.append(scenario)
                report.series_cache_hits += cached
                report.series_computed += not cached
        report.timings_s["series"] = time.perf_counter() - mark
        report.downloads = fetcher.downloads
        report.source_cache_hits = fetcher.cache_hits
        sources = [SourceRecord.model_validate(record) for record in fetcher.sorted_records()]

    result = AnalysisResult(
        schema_version=SCHEMA_VERSION,
        algorithm_version=ALGORITHM_VERSION,
        request=request_dump(request),
        conventions=CONVENTIONS,
        capabilities=CAPABILITIES,
        not_in_v1=NOT_IN_V1,
        points=points,
        scenarios=scenarios,
        comparisons=build_comparisons(
            points, scenarios, [to_iso(to_ms(epoch)) for epoch in request.epochs_utc]
        ),
        sources=sources,
        limitations=LIMITATIONS,
    )
    report.timings_s["total"] = time.perf_counter() - started
    return result, report


def result_json(result: AnalysisResult) -> str:
    """JSON deterministico: stessi input e stesse versioni danno gli stessi byte."""
    data = result.model_dump(mode="json", by_alias=True)
    return json.dumps(data, ensure_ascii=False, indent=1, allow_nan=False) + "\n"


def write_outputs(result: AnalysisResult, report: RunReport, paths: EnginePaths) -> dict:
    """Scrive result.json e manifest.json in runs/<chiave della richiesta>/."""
    text = result_json(result)
    run_key = key_of({"request": result.request, "algorithm": result.algorithm_version})[:16]
    folder = paths.runs / run_key
    folder.mkdir(parents=True, exist_ok=True)
    result_path = folder / "result.json"
    temporary = result_path.with_suffix(".json.tmp")
    temporary.write_text(text, encoding="utf-8")
    temporary.replace(result_path)
    statuses = {}
    for scenario in result.scenarios:
        statuses[scenario.status] = statuses.get(scenario.status, 0) + 1
    manifest = {
        "schema": "meowrizon.analysis.manifest/1",
        "schema_version": result.schema_version,
        "algorithm_version": result.algorithm_version,
        "written_at_utc": datetime.now(UTC).isoformat(timespec="seconds"),
        "mode": "offline" if report.offline else "online",
        "result_file": result_path.name,
        "result_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        "request": result.request,
        "capabilities": result.capabilities,
        "not_in_v1": result.not_in_v1,
        "scenario_status_counts": statuses,
        "run": {
            "timings_s": {name: round(value, 3) for name, value in report.timings_s.items()},
            "source_downloads": report.downloads,
            "source_cache_hits": report.source_cache_hits,
            "terrain_cache_hits": report.terrain_cache_hits,
            "terrain_computed": report.terrain_computed,
            "series_cache_hits": report.series_cache_hits,
            "series_computed": report.series_computed,
        },
        "sources": [source.model_dump(mode="json") for source in result.sources],
        "limitations": result.limitations,
    }
    manifest_path = folder / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    return {"result": result_path, "manifest": manifest_path, "folder": folder}
