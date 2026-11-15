"""Terrain coverage and removal of a preview fetched with an Earth projection."""

from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["terrain"])


@router.get("/coverage")
def coverage() -> dict:
    # Local PGDA windows are prepared for individual requests. They are not a
    # fully prepared global DEM catalog; each analysis carries its exact sources.
    return {"origin": "engine", "products": []}


@router.get("/terrain-preview/{region_id}.png")
def retired_preview(region_id: str):
    raise HTTPException(
        410,
        "This preview used an incorrect Earth projection. "
        "Request /api/terrain-analyses for a real PGDA lunar horizon.",
    )
