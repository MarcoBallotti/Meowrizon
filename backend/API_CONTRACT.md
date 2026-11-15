# Backend HTTP contract

The current [HTTP contract](../docs/api-contract.md) documents implemented FastAPI routes, request validation, job receipts, screening and source-data operations. The [data dictionary](../docs/api-data-dictionary.md) describes result fields.

Implementation references:

- [Scientific request models and routes](app/api/scientific.py)
- [Scientific worker and cache](app/services/scientific_jobs.py)
- [Source-data routes](app/routes.py)
- [Frontend transport types](../frontend/src/api/types.ts)

The running service exposes `/api/docs` and `/api/openapi.json`. The standalone Python V1 engine uses [separate versioned JSON schemas](docs/engine-v1.md); its validation does not automatically apply to HTTP calculations.
