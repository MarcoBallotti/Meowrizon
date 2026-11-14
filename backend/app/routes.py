"""Source-data operations; separate from the future scientific scenario contract."""

from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Path, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field

from .services.jobs import QueueFullError
from .services.storage import DataStore

router = APIRouter(prefix="/api/data", tags=["data"])
DatasetId = Annotated[str, Path(pattern=r"^[a-f0-9]{64}$")]


class CollectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    profile: Literal["default", "trajectory"] = "default"
    names: list[str] | None = Field(default=None, min_length=1)
    refresh: bool = False


def _store(request):
    settings = request.app.state.settings
    return DataStore(settings.prepared, settings.raw)


def _dataset(request, dataset_id):
    store = _store(request)
    dataset = next((item for item in store.datasets() if item["id"] == dataset_id), None)
    if dataset is None:
        raise HTTPException(404, "Dataset not found")
    if dataset["status"] != "prepared":
        raise HTTPException(409, "Dataset is not prepared for analysis")
    return store


@router.get("/sources")
def sources(request: Request):
    """Configured upstream requests; only these configurations can be collected."""
    worker = request.app.state.data_jobs
    return {profile: worker.entries(profile) for profile in ("default", "trajectory")}


@router.post("/collect", status_code=202)
def collect(body: CollectRequest, request: Request):
    """Collect selected sources and prepare them in the service's local data folder."""
    try:
        return request.app.state.data_jobs.submit("collect", **body.model_dump())
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except QueueFullError as exc:
        raise HTTPException(429, str(exc)) from exc


@router.post("/prepare", status_code=202)
def prepare(request: Request):
    """Prepare already downloaded files without calling an external API."""
    try:
        return request.app.state.data_jobs.submit("prepare")
    except QueueFullError as exc:
        raise HTTPException(429, str(exc)) from exc


@router.get("/jobs/{job_id}")
def job(job_id: str, request: Request):
    """Persistent job status, progress, results and any errors."""
    try:
        return request.app.state.data_jobs.get(job_id)
    except KeyError as exc:
        raise HTTPException(404, "Job not found") from exc


@router.get("/datasets")
def datasets(request: Request, name: str | None = None):
    """List saved dataset versions and their preparation status."""
    return _store(request).datasets(name)


def _raw_response(request, dataset_id):
    try:
        path, metadata = _store(request).raw_response(dataset_id)
    except (KeyError, FileNotFoundError) as exc:
        raise HTTPException(404, "Saved response not found; collect the source first") from exc
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    media_types = {
        "json": "application/json",
        "tiff": "image/tiff",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "xml": "application/xml",
    }
    return FileResponse(
        path,
        media_type=media_types[metadata["metadata"]["request"]["format"]],
        headers={
            "X-Dataset-Id": dataset_id,
            "X-Source-Name": metadata["name"],
            "ETag": f'"{metadata["sha256"]}"',
        },
    )


@router.get("/datasets/{dataset_id}/raw", response_class=FileResponse)
def raw_dataset(dataset_id: DatasetId, request: Request):
    """Return the unchanged upstream response for one saved dataset version."""
    return _raw_response(request, dataset_id)


@router.get("/sources/{source_name}/data", response_class=FileResponse)
def source_data(source_name: str, request: Request, request_sha256: str | None = None):
    """Return the latest saved response; select a request hash when parameters differ."""
    rows = [
        row
        for row in _store(request).datasets(source_name)
        if row["status"] in {"prepared", "archived"}
        and (request_sha256 is None or row["request_sha256"] == request_sha256)
    ]
    if not rows:
        raise HTTPException(404, "Saved response not found; POST /api/data/collect first")
    if len({row["request_sha256"] for row in rows}) > 1:
        raise HTTPException(
            409, "Multiple parameter sets: provide request_sha256 or use the dataset raw endpoint"
        )
    return _raw_response(request, rows[-1]["id"])


@router.get("/datasets/{dataset_id}/samples")
def samples(
    dataset_id: DatasetId, request: Request, start_ms: int | None = None, stop_ms: int | None = None
):
    """Filter an ephemeris/trajectory by inclusive UTC epoch-millisecond bounds."""
    return _dataset(request, dataset_id).series(dataset_id, start_ms=start_ms, stop_ms=stop_ms)


@router.get("/datasets/{dataset_id}/products")
def products(
    dataset_id: DatasetId,
    request: Request,
    title_contains: str = "",
    max_source_resolution: Annotated[float | None, Query(gt=0)] = None,
    limit: Annotated[int, Query(ge=1, le=5000)] = 100,
):
    """Filter a saved product catalog; source resolution retains its native units."""
    return _dataset(request, dataset_id).products(
        dataset_id,
        title_contains=title_contains,
        max_source_resolution=max_source_resolution,
        limit=limit,
    )


@router.get("/datasets/{dataset_id}/regions")
def regions(dataset_id: DatasetId, request: Request):
    """Candidate polygons with their original lunar coordinate reference."""
    return _dataset(request, dataset_id).regions(dataset_id)
