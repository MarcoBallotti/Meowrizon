"""HTTP acquisition/preparation, persistent jobs and backend-only filesystem paths."""

import asyncio
import json
import shutil
import unittest
from pathlib import Path
from unittest.mock import patch

from httpx import ASGITransport, AsyncClient

from app import create_app
from app.services.jobs import DataJobs
from app.services.sources import Collector, DownloadError
from app.settings import BACKEND_ROOT, Settings, inside_backend
from support import temporary_directory


BODY = {"result": """Date__(UT)__HR:MN, , ,Azi_(a-app), Elev_(a-app), delta, deldot,
$$SOE
2026-Dec-01 00:00,*, ,280.0,1.5,0.986,-1.2,
2026-Dec-01 01:00,*, ,279.5,1.4,0.985,-1.2,
$$EOE
"""}


class AppTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        temporary = temporary_directory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        shutil.copytree(BACKEND_ROOT / "config", self.root / "config")
        self.settings = Settings(self.root)
        self.app = create_app(self.settings)
        self.lifespan = self.app.router.lifespan_context(self.app)
        await self.lifespan.__aenter__()
        self.client = AsyncClient(transport=ASGITransport(app=self.app), base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.lifespan.__aexit__(None, None, None)

    async def wait_job(self, identifier):
        for _ in range(250):
            response = await self.client.get(f"/api/data/jobs/{identifier}")
            self.assertEqual(response.status_code, 200)
            job = response.json()
            if job["status"] in {"completed", "failed"}:
                return job
            await asyncio.sleep(0.02)
        self.fail("Data job did not terminate")

    async def test_health_sources_and_empty_datasets_without_network(self):
        with patch.object(Collector, "_request") as network:
            response = await self.client.get("/health")
            self.assertEqual(response.json(), {"status": "ok"})
            schema = (await self.client.get("/openapi.json")).json()
            self.assertIn("/api/data/collect", schema["paths"])
            sources = (await self.client.get("/api/data/sources")).json()
            self.assertEqual(len(sources["default"]), 12)
            self.assertEqual((await self.client.get("/api/data/datasets")).json(), [])
            network.assert_not_called()
        self.assertEqual((await self.client.get("/api/coverage")).status_code, 404)

    async def test_http_collection_creates_local_files_and_filtered_samples(self):
        with patch.object(Collector, "_request", return_value=(json.dumps(BODY).encode(), {})) as network:
            response = await self.client.post("/api/data/collect", json={"names": ["horizons_sun_observer"]})
            self.assertEqual(response.status_code, 202)
            job = await self.wait_job(response.json()["id"])
            self.assertEqual(job["status"], "completed", job)
            network.assert_called_once()
        self.assertTrue((self.settings.jobs / f"{job['id']}.json").is_file())
        dataset = (await self.client.get("/api/data/datasets", params={"name": "horizons_sun_observer"})).json()[0]
        raw = await self.client.get("/api/data/sources/horizons_sun_observer/data")
        self.assertEqual(raw.status_code, 200)
        self.assertEqual(raw.content, json.dumps(BODY).encode())
        self.assertEqual(raw.headers["content-type"], "application/json")
        self.assertEqual(raw.headers["x-dataset-id"], dataset["id"])
        exact = await self.client.get(f"/api/data/datasets/{dataset['id']}/raw")
        self.assertEqual(exact.content, raw.content)
        path = f"/api/data/datasets/{dataset['id']}/samples"
        samples = await self.client.get(path, params={"start_ms": 1796086800000})
        self.assertEqual(samples.status_code, 200)
        self.assertEqual(len(samples.json()["samples"]), 1)
        self.assertEqual(samples.json()["samples"][0]["azimuth_deg"], 279.5)
        self.assertEqual((await self.client.get(path, params={"stop_ms": 1796200000000})).status_code, 422)
        # Repeated collection reuses the local raw response, without an upstream call.
        with patch.object(Collector, "_request") as network:
            response = await self.client.post("/api/data/collect", json={"names": ["horizons_sun_observer"]})
            repeated = await self.wait_job(response.json()["id"])
            self.assertEqual(repeated["status"], "completed")
            self.assertTrue(repeated["result"]["downloads"][0]["cached"])
            network.assert_not_called()
        self.assertTrue(list(self.settings.raw.glob("*/*/*/response.json")))
        self.assertTrue(list(self.settings.prepared.rglob("*.parquet")))

    async def test_invalid_sources_do_not_schedule_collection(self):
        for body in ({"profile": "unknown"}, {"names": ["not_a_source"]}, {"names": []},
                     {"names": ["horizons_sun_observer"] * 2}, {"url": "file:///anything"}):
            with self.subTest(body=body):
                response = await self.client.post("/api/data/collect", json=body)
                self.assertEqual(response.status_code, 422)
        self.assertFalse(list(self.settings.jobs.glob("*.json")))

    async def test_raw_endpoint_serves_archived_binary_and_rejects_corruption(self):
        body = b'\xff\xd8\xffimage-fixture'
        with patch.object(Collector, "_request", return_value=(body, {})):
            response = await self.client.post("/api/data/collect", json={"names": ["moon_imagery_sample"]})
            job = await self.wait_job(response.json()["id"])
            self.assertEqual(job["status"], "completed")
        url = "/api/data/sources/moon_imagery_sample/data"
        response = await self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, body)
        self.assertEqual(response.headers["content-type"], "image/jpeg")
        next(self.settings.raw.glob("*/*/*/response.jpg")).write_bytes(b"corrupt")
        self.assertEqual((await self.client.get(url)).status_code, 409)
        self.assertEqual((await self.client.get("/api/data/sources/missing/data")).status_code, 404)

    async def test_collection_failure_is_a_terminal_persistent_job(self):
        with patch.object(Collector, "_request", side_effect=DownloadError("source unavailable")):
            response = await self.client.post("/api/data/collect", json={"names": ["horizons_sun_observer"]})
            job = await self.wait_job(response.json()["id"])
        self.assertEqual(job["status"], "failed")
        self.assertIn("source unavailable", job["error"])
        self.assertEqual((await self.client.get("/api/data/datasets")).json(), [])
        self.assertEqual((await self.client.get("/api/data/jobs/unknown")).status_code, 404)
        self.assertEqual((await self.client.get(f"/api/data/datasets/{'a' * 64}/samples")).status_code, 404)

    async def test_prepare_is_an_offline_http_operation(self):
        with patch.object(Collector, "_request") as network:
            response = await self.client.post("/api/data/prepare")
            job = await self.wait_job(response.json()["id"])
            self.assertEqual(job["status"], "completed")
            network.assert_not_called()

    async def test_settings_reject_paths_outside_backend(self):
        for path in ("../data/raw", BACKEND_ROOT.parent / "data/raw"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                inside_backend(path)
        self.assertEqual(Settings().raw, BACKEND_ROOT / "data/raw")

    async def test_restart_marks_interrupted_jobs_failed(self):
        recovery = self.root / "recovery"
        recovery.mkdir()
        settings = Settings(recovery)
        settings.jobs.mkdir(parents=True)
        identifier = "a" * 32
        path = settings.jobs / f"{identifier}.json"
        path.write_text(json.dumps({"id": identifier, "status": "running"}))
        jobs = DataJobs(settings)
        jobs.start()
        try:
            self.assertEqual(jobs.get(identifier)["status"], "failed")
            self.assertIn("Service stopped", jobs.get(identifier)["error"])
        finally:
            jobs.close()


if __name__ == "__main__":
    unittest.main()
