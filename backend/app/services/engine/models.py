"""Modello interno versionato della richiesta e del risultato dell'engine puntuale V1.

È indipendente dai DTO del client. Regole comuni:
- tempi in UTC ISO 8601 con millisecondi; durate in secondi; angoli in gradi; quote in metri;
- coordinate planetocentriche Mean Earth sulla sfera di 1 737 400 m, longitudine Est;
- una misura V1 non valutabile vale `null` con `status` e `reason`; mai NaN, Infinity o un
  falso zero. Le metriche V2 non compaiono nello schema: le capacità V1 sono elencate.
"""

from datetime import UTC, datetime, timedelta
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

SCHEMA_VERSION = "1.0.0"
ALGORITHM_VERSION = "meowrizon-engine-v1.0.0"
REQUEST_SCHEMA = "meowrizon.analysis.request/1"
RESULT_SCHEMA = "meowrizon.analysis.result/1"
OBSERVER_HEIGHT_M = 2.0
_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)

CAPABILITIES = [
    "point_elevation",
    "slope_100m_circular_support",
    "terrain_horizon_profile",
    "topocentric_sun_earth_positions",
    "disc_fractions_fSunTerrain_fSun_fEarth",
    "earth_occultation_of_sun",
    "windows_sun_c3_earth_c3_joint_below_c3_dark",
    "direct_comparison_points_and_dates",
]
NOT_IN_V1 = [
    "regional_grids_and_areas",
    "annual_illumination_p50",
    "automatic_date_scan",
    "global_score_or_ranking",
    "thermal_power_radio_models",
]

Status = Literal["ok", "unknown", "approximate"]


def to_iso(time_ms: int) -> str:
    moment = _EPOCH + timedelta(milliseconds=int(time_ms))
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"


def to_ms(moment: datetime) -> int:
    delta = moment - _EPOCH
    return (delta.days * 86400 + delta.seconds) * 1000 + delta.microseconds // 1000


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


# --- Richiesta ---------------------------------------------------------------------------------


class PointRequest(Model):
    id: str = Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")
    region: str
    lat_deg: float = Field(ge=-90.0, le=90.0)
    lon_east_deg: float = Field(ge=-180.0, le=360.0)
    selection: str | None = None  # come è stato scelto il punto


class TierRequest(Model):
    product: str
    outer_radius_m: float = Field(gt=0)
    radial_step_m: float = Field(gt=0)


class NumericConfig(Model):
    """Scelte numeriche del progetto: configurazione iniziale, non precisioni garantite."""

    azimuth_step_deg: float = Field(default=0.125, gt=0, le=5)
    min_distance_m: float = Field(default=2.5, ge=0)
    # Passo radiale = min(passo della fascia, radial_relative_step * distanza).
    radial_relative_step: float = Field(default=0.0005, ge=0, le=0.05)
    slope_diameter_m: float = Field(default=100.0, gt=0)
    slope_min_pixels: int = Field(default=16, ge=3)
    disc_strips: int = Field(default=64, ge=8)
    ephemeris_step_s: int = Field(default=3600, ge=60)
    scan_step_s: float = Field(default=60.0, gt=0)
    event_tolerance_s: float = Field(default=1.0, gt=0)
    c3_threshold: float = Field(default=0.5, gt=0, lt=1)
    zero_fraction_epsilon: float = Field(default=1e-9, ge=0, lt=1e-3)
    probe_margin: float = Field(default=0.05, ge=0, lt=0.5)
    probe_subdivisions: int = Field(default=12, ge=1)
    max_gap_factor: float = Field(default=1.5, ge=1)

    @field_validator("ephemeris_step_s")
    @classmethod
    def _whole_minutes(cls, value: int) -> int:
        if value % 60:
            raise ValueError("ephemeris_step_s deve essere un multiplo di 60 s")
        return value


class AnalysisRequest(Model):
    request_schema: Literal["meowrizon.analysis.request/1"] = Field(
        default=REQUEST_SCHEMA, alias="schema"
    )
    description: str | None = None
    points: list[PointRequest] = Field(min_length=1, max_length=3)
    epochs_utc: list[datetime] = Field(min_length=1)
    duration_s: float = Field(gt=0)
    observer_height_m: float = OBSERVER_HEIGHT_M
    terrain: dict[str, list[TierRequest]]  # fasce di terreno per regione, dalla più fine
    numeric: NumericConfig = NumericConfig()

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, populate_by_name=True)

    @field_validator("epochs_utc")
    @classmethod
    def _utc(cls, values: list[datetime]) -> list[datetime]:
        out = []
        for value in values:
            if value.tzinfo is None or value.utcoffset() != timedelta(0):
                raise ValueError("Ogni T deve essere un istante UTC esplicito (suffisso Z)")
            out.append(value.astimezone(UTC))
        if len({to_ms(v) for v in out}) != len(out):
            raise ValueError("Istanti T ripetuti")
        return out

    @model_validator(mode="after")
    def _consistent(self):
        if self.observer_height_m != OBSERVER_HEIGHT_M:
            raise ValueError("V1 supporta soltanto l'osservatore a 2 m sopra il DEM")
        ids = [p.id for p in self.points]
        if len(set(ids)) != len(ids):
            raise ValueError("ID dei punti ripetuti")
        for point in self.points:
            tiers = self.terrain.get(point.region)
            if not tiers:
                raise ValueError(f"Nessuna configurazione del terreno per '{point.region}'")
            radii = [t.outer_radius_m for t in tiers]
            if radii != sorted(radii) or len(set(radii)) != len(radii):
                raise ValueError("Le fasce di terreno devono avere raggi crescenti")
        if round(self.duration_s * 1000) < 1000:
            raise ValueError("Durata troppo breve")
        return self


# --- Risultato ---------------------------------------------------------------------------------


class Measure(Model):
    value: float | None
    unit: str
    status: Status
    reason: str | None = None


class SourceRecord(Model):
    name: str
    provider: str
    role: str
    url: str
    params: dict | None = None
    sha256: str
    bytes: int
    fetched_at_utc: str | None
    stored_as: str
    details: dict | None = None


class SlopeResult(Model):
    value_deg: float | None
    status: Status
    reason: str | None
    band: int | None  # 1..4
    band_label: str | None
    support: str
    diameter_m: float
    dem_product: str | None
    dem_pixel_m: float | None
    n_pixels: int
    valid_fraction: float | None
    rms_residual_m: float | None
    numeric_sensitivity_deg: float | None  # variazione spostando/variando il supporto
    band_stable_under_sensitivity: bool | None
    lola_count_product: str | None
    support_fraction_with_lola_shots: float | None  # pixel del supporto misurati, non interpolati
    dem_uncertainty: str


class HorizonResult(Model):
    azimuth_start_deg: float
    azimuth_step_deg: float
    convention: str
    elevation_deg: list[float | None]
    complete: list[bool]
    distance_m: list[float | None]
    directions: int
    directions_complete: int
    status: Status
    reason: str | None


class TierUsed(Model):
    product: str
    family: str
    pixel_m: float
    inner_radius_m: float
    outer_radius_m: float
    radial_step_m: float
    window_m: list[float]
    valid_fraction: float
    tiles: int


class PointResult(Model):
    id: str
    region: str
    lat_deg: float
    lon_east_deg: float
    x_m: float
    y_m: float
    map_scale: float
    selection: str | None
    elevation: Measure
    elevation_product: str | None
    observer_height_m: float
    observer_radius_m: float | None
    horizons_site_alt_km: float | None
    tiers: list[TierUsed]
    tier_seams: list[dict]
    slope: SlopeResult
    horizon: HorizonResult | None
    terrain_cache_key: str | None
    status: Status
    reason: str | None


class BodySeries(Model):
    azimuth_deg: list[float | None]
    elevation_deg: list[float | None]
    horizon_deg: list[float | None]
    margin_deg: list[float | None]
    angular_radius_deg: list[float | None]
    range_km: list[float | None]
    fraction_above_terrain: list[float | None]
    fraction_visible: list[float | None]


class Series(Model):
    step_s: int
    utc: list[str]
    elapsed_s: list[float]
    sun: BodySeries
    earth: BodySeries
    sun_earth_separation_deg: list[float | None]
    sun_fraction_covered_by_earth: list[float | None]
    sun_state: list[Literal["c3", "reduced", "dark"] | None]
    earth_c3: list[bool | None]


class Interval(Model):
    start_utc: str
    end_utc: str
    start_elapsed_s: float
    end_elapsed_s: float
    start_kind: Literal["observed_transition", "request_start", "data_gap"]
    end_kind: Literal["observed_transition", "request_end", "data_gap"]
    truncated_left: bool
    truncated_right: bool
    observed_duration_s: float
    total_duration_s: float | None
    duration_lower_bound_s: float
    cause_at_start: str | None = None
    cause_at_end: str | None = None
    peak_sun_fraction_covered_by_earth: float | None = None
    # Quanto è netta una transizione osservata: ritmi bassi indicano un passaggio radente,
    # il cui istante è sensibile a piccoli errori dell'orizzonte.
    rate_metric: str | None = None
    start_rate_per_hour: float | None = None
    end_rate_per_hour: float | None = None


class Remaining(Model):
    """Tempo residuo da T della finestra attiva. 0 se a T la condizione è nota falsa."""

    value_s: float | None
    lower_bound_s: float | None
    status: Status
    reason: str | None
    end_kind: str | None
    cause: str | None = None


class StateAtT(Model):
    utc: str
    sun_azimuth_deg: float | None
    sun_elevation_deg: float | None
    sun_horizon_deg: float | None
    sun_margin_deg: float | None
    sun_angular_radius_deg: float | None
    f_sun_terrain: float | None
    f_sun: float | None
    sun_fraction_covered_by_earth: float | None
    sun_state: Literal["c3", "reduced", "dark"] | None
    sun_c3: bool | None
    sun_occultation_cause: str | None
    earth_azimuth_deg: float | None
    earth_elevation_deg: float | None
    earth_horizon_deg: float | None
    earth_margin_deg: float | None
    earth_angular_radius_deg: float | None
    f_earth: float | None
    earth_c3: bool | None
    joint_c3: bool | None
    remaining_sun_c3: Remaining
    remaining_earth_c3: Remaining
    remaining_joint_c3: Remaining
    unknown_reasons: list[str]


class Windows(Model):
    sun_c3: list[Interval]
    earth_c3: list[Interval]
    joint_c3: list[Interval]
    below_c3: list[Interval]
    dark: list[Interval]
    earth_over_sun_disc: list[Interval]
    unknown: list[Interval]


class ScenarioResult(Model):
    point_id: str
    t_utc: str
    window: str
    duration_s: float
    status: Status
    reason: str | None
    state_at_t: StateAtT | None
    windows: Windows | None
    first_dark: Interval | None
    coverage: dict[str, float]
    totals_observed_s: dict[str, float]
    series: Series | None
    ephemeris: dict
    series_cache_key: str | None
    notes: list[str]


class Comparison(Model):
    kind: Literal["same_point_across_dates", "same_date_across_points"]
    key: str
    rows: list[dict]
    note: str


class AnalysisResult(Model):
    result_schema: Literal["meowrizon.analysis.result/1"] = Field(
        default=RESULT_SCHEMA, alias="schema"
    )
    schema_version: str
    algorithm_version: str
    request: dict
    conventions: dict
    capabilities: list[str]
    not_in_v1: list[str]
    points: list[PointResult]
    scenarios: list[ScenarioResult]
    comparisons: list[Comparison]
    sources: list[SourceRecord]
    limitations: list[str]

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, populate_by_name=True)
