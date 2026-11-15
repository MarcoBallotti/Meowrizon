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


class UnavailableJob(BaseModel):
    """Only terminal failures are supported until a real engine is installed."""

    id: str
    status: Literal["failed"]
    error: ScientificError


@router.post("/terrain-analyses", status_code=202, response_model=UnavailableJob)
def submit_terrain(body: TerrainAnalysisRequest, request: Request):
    """Accept the client input and persist an explicit engine-unavailable job.

    No DEM is currently registered for scientific computation. The small acquisition
    sample does not cover the requested horizon. Poll the returned id for the same
    terminal error; no provider downloads are triggered by a UI request.
    """
    return request.app.state.scientific_jobs.submit("terrain", body.model_dump())


@router.post("/scenario-evaluations", status_code=202, response_model=UnavailableJob)
def submit_scenario(body: ScenarioEvaluationRequest, request: Request):
    """Persist the requested period without manufacturing a completed scenario.

    No completed terrain results or validated scenario adapter are available yet.
    A failed job does not provide a terrain result id for subsequent calculation.
    """
    return request.app.state.scientific_jobs.submit("scenario", body.model_dump())


def _job(request, kind, job_id):
    try:
        return request.app.state.scientific_jobs.get(kind, job_id)
    except KeyError as exc:
        raise HTTPException(404, "Scientific job not found") from exc


@router.get("/terrain-analyses/{jobId}", response_model=UnavailableJob)
def terrain_job(jobId: str, request: Request):
    return _job(request, "terrain", jobId)


@router.get("/scenario-evaluations/{jobId}", response_model=UnavailableJob)
def scenario_job(jobId: str, request: Request):
    return _job(request, "scenario", jobId)
