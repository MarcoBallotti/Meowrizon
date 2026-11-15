"""Published terrain products and their actual preparation status."""

from fastapi import APIRouter


router = APIRouter(tags=["terrain"])


@router.get("/coverage")
def coverage() -> dict:
    """A product listing does not imply local terrain coverage or analysis readiness."""
    return {"origin": "engine", "products": []}
