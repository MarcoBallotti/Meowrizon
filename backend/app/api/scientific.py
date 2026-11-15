"""The existing frontend's scientific transport; no synthetic engine results."""

import math
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

router = APIRouter(tags=["scientific"])
Number = Annotated[float, Field(strict=True, allow_inf_nan=False)]


class ScientificInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SiteCoordinates(ScientificInput):
    latDeg: Annotated[Number, Field(ge=-90, le=90)]
    lonEastDeg: Number

    @field_validator("latDeg")
    @classmethod
    def local_azimuth_defined(cls, value):
        if abs(value) == 90:
            raise ValueError("Local azimuth is undefined at an exact pole")
        return value

    @field_validator("lonEastDeg")
    @classmethod
    def normalize_longitude(cls, value):
        return (value + 180) % 360 - 180


class TerrainConfig(ScientificInput):
    azimuthStepDeg: Annotated[Number, Field(gt=0, le=360)]
    maxDistanceKm: Annotated[Number, Field(gt=0)]

    @field_validator("azimuthStepDeg")
    @classmethod
    def complete_circle(cls, value):
        count = 360 / value
        if not math.isfinite(count) or not math.isclose(
            count, round(count), abs_tol=1e-9, rel_tol=0
        ):
            raise ValueError("azimuthStepDeg must divide 360 into an integer number of samples")
        return value


class TerrainAnalysisRequest(ScientificInput):
    site: SiteCoordinates
    observerHeightM: Annotated[Number, Field(ge=0)]
    config: TerrainConfig


class ScenarioEvaluationRequest(ScientificInput):
    terrainAnalysisId: Annotated[str, Field(strict=True, min_length=1, max_length=128)]
    startUtc: str
    stopUtc: str
    stepMinutes: Annotated[int, Field(strict=True, gt=0)]
    includeContext: Annotated[bool, Field(strict=True)] = True

    @field_validator("startUtc", "stopUtc")
    @classmethod
    def utc_iso(cls, value):
        if not value.endswith("Z") or "T" not in value:
            raise ValueError("Use an ISO 8601 UTC timestamp ending in Z")
        try:
            datetime.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("Invalid ISO 8601 UTC timestamp") from exc
        return value

    @model_validator(mode="after")
    def increasing_range(self):
        if datetime.fromisoformat(self.stopUtc) <= datetime.fromisoformat(self.startUtc):
            raise ValueError("stopUtc must be later than startUtc")
        return self


class ScientificError(BaseModel):
    code: str
    message: str


class ScientificJob(BaseModel):
    id: str
    status: Literal["queued", "running", "completed", "failed"]
    progress: float | None = None
    message: str | None = None
    result: dict | None = None
    error: ScientificError | None = None


def _submit(kind, body, request):
    try:
        return request.app.state.scientific_jobs.submit(kind, body.model_dump())
    except ValueError as exc:
        raise HTTPException(429, str(exc)) from exc


@router.post(
    "/terrain-analyses",
    status_code=202,
    response_model=ScientificJob,
    response_model_exclude_none=True,
)
def submit_terrain(body: TerrainAnalysisRequest, request: Request):
    """Fetch/cache PGDA elevation windows and compute the requested spherical horizon."""
    return _submit("terrain", body, request)


@router.post(
    "/scenario-evaluations",
    status_code=202,
    response_model=ScientificJob,
    response_model_exclude_none=True,
)
def submit_scenario(body: ScenarioEvaluationRequest, request: Request):
    """Horizons tracks, finite-disc visibility, eclipse calendar and orbit vectors."""
    return _submit("scenario", body, request)


def _job(request, kind, job_id):
    try:
        return request.app.state.scientific_jobs.get(kind, job_id)
    except KeyError as exc:
        raise HTTPException(404, "Scientific job not found") from exc


@router.get(
    "/terrain-analyses/{jobId}", response_model=ScientificJob, response_model_exclude_none=True
)
def terrain_job(jobId: str, request: Request):
    return _job(request, "terrain", jobId)


@router.get(
    "/scenario-evaluations/{jobId}", response_model=ScientificJob, response_model_exclude_none=True
)
def scenario_job(jobId: str, request: Request):
    return _job(request, "scenario", jobId)
