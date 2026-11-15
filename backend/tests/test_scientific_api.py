"""Exercise the existing HttpProvider payloads without inventing scientific results."""

import json
import unittest
from copy import deepcopy

from fastapi.testclient import TestClient
from support import temporary_directory

from app import create_app
from app.services.scientific_jobs import ScientificJobs
from app.settings import Settings

TERRAIN = {
    "site": {"latDeg": -89.67, "lonEastDeg": 129.8},
    "observerHeightM": 2,
    "config": {"azimuthStepDeg": 0.5, "maxDistanceKm": 150},
}
SCENARIO = {
    "terrainAnalysisId": "terrain-result-id",
    "startUtc": "2026-11-15T00:17:00.000Z",
    "stopUtc": "2026-12-15T00:17:00.000Z",
    "stepMinutes": 30,
}


class ScientificApiTests(unittest.TestCase):
    def setUp(self):
        temporary = temporary_directory()
        self.addCleanup(temporary.cleanup)
        self.settings = Settings(temporary.name)
        self.client = self.enterContext(TestClient(create_app(self.settings)))

    def test_frontend_requests_polling_and_persistence(self):
        for route, kind, payload in (
            ("terrain-analyses", "terrain", TERRAIN),
            ("scenario-evaluations", "scenario", SCENARIO),
        ):
            with self.subTest(route=route):
                response = self.client.post(f"/api/{route}", json=payload)
                self.assertEqual(response.status_code, 202)
                job = response.json()
                self.assertEqual(job["status"], "failed")
                self.assertEqual(job["error"]["code"], f"{kind}_engine_unavailable")
                self.assertNotIn("result", job)
                self.assertEqual(self.client.get(f"/api/{route}/{job['id']}").json(), job)
                # A new service instance reads the same terminal state after restart.
                self.assertEqual(ScientificJobs(self.settings).get(kind, job["id"]), job)
                saved = json.loads(
                    (self.settings.jobs / "scientific" / f"{job['id']}.json").read_text()
                )
                self.assertEqual(saved["parameters"], payload)
                other = "scenario-evaluations" if kind == "terrain" else "terrain-analyses"
                self.assertEqual(self.client.get(f"/api/{other}/{job['id']}").status_code, 404)

    def test_invalid_payloads_do_not_create_job_files(self):
        for path, value in (
            (("site", "latDeg"), 91),
            (("site", "latDeg"), -90),
            (("site", "latDeg"), "-89"),
            (("site", "lonEastDeg"), True),
            (("observerHeightM",), -1),
            (("config", "azimuthStepDeg"), 0),
            (("config", "azimuthStepDeg"), 7),
            (("config", "maxDistanceKm"), 0),
        ):
            payload = deepcopy(TERRAIN)
            target = payload
            for key in path[:-1]:
                target = target[key]
            target[path[-1]] = value
            response = self.client.post("/api/terrain-analyses", json=payload)
            self.assertEqual(response.status_code, 422, response.text)
            self.assertIsInstance(response.json()["detail"], str)
        for key, value in (
            ("stopUtc", SCENARIO["startUtc"]),
            ("startUtc", "yesterday"),
            ("startUtc", "2026-11-15T00:00:00+01:00"),
            ("stepMinutes", True),
            ("stepMinutes", 0),
        ):
            response = self.client.post("/api/scenario-evaluations", json={**SCENARIO, key: value})
            self.assertEqual(response.status_code, 422, response.text)
        # JSON numeric NaN is rejected cleanly rather than breaking error serialization.
        payload = json.dumps(TERRAIN).replace("129.8", "NaN")
        self.assertEqual(
            self.client.post("/api/terrain-analyses", content=payload).status_code, 422
        )
        self.assertFalse(list(self.settings.jobs.rglob("*.json")))

    def test_normalization_unknown_jobs_and_separate_acquisition_store(self):
        payload = deepcopy(TERRAIN)
        payload["site"]["lonEastDeg"] = 489.8
        job = self.client.post("/api/terrain-analyses", json=payload).json()
        record = json.loads((self.settings.jobs / "scientific" / f"{job['id']}.json").read_text())
        self.assertAlmostEqual(record["parameters"]["site"]["lonEastDeg"], 129.8)
        self.assertEqual(self.client.get(f"/api/data/jobs/{job['id']}").status_code, 404)
        self.assertEqual(self.client.get("/api/terrain-analyses/unknown").status_code, 404)
        self.assertEqual(self.client.get(f"/api/terrain-analyses/{'0' * 32}").status_code, 404)

    def test_openapi_describes_only_the_implemented_boundary(self):
        paths = self.client.get("/api/openapi.json").json()["paths"]
        for name in ("terrain-analyses", "scenario-evaluations"):
            self.assertIn("post", paths[f"/api/{name}"])
            self.assertIn("get", paths[f"/api/{name}/{{jobId}}"])
        self.assertNotIn("/api/ranking", paths)
        self.assertNotIn("/api/globe-state", paths)
