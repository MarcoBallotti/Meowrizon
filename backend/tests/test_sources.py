"""Acquisition failure/caching behavior; these tests make no network calls."""

import json
import io
from support import temporary_directory
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

from app.cli import main
from app.services.sources import Collector, DownloadError, validate_response


class AcquisitionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = temporary_directory()
        self.addCleanup(self.temporary.cleanup)
        self.output = Path(self.temporary.name)
        self.entry = {
            "name": "sun", "provider": "horizons", "format": "json",
            "url": "https://ssd.jpl.nasa.gov/api/horizons.api",
        }
        self.body = b'{"result": "header\\n$$SOE\\nsample\\n$$EOE"}\n'

    def test_raw_bytes_preserved_and_repeated_request_uses_cache(self):
        with Collector(self.output, "test") as collector:
            with patch.object(collector, "_request", return_value=(self.body, {})) as request:
                first, cached = collector.fetch(self.entry)
                self.assertFalse(cached)
                second, cached = collector.fetch(self.entry)
                self.assertTrue(cached)
                self.assertEqual(first, second)
                self.assertEqual(first.read_bytes(), self.body)
                request.assert_called_once()

    def test_refresh_preserves_previous_file(self):
        with Collector(self.output, "test") as collector:
            with patch.object(collector, "_request", return_value=(self.body, {})):
                first, _ = collector.fetch(self.entry)
                second, cached = collector.fetch(self.entry, refresh=True)
                self.assertFalse(cached)
                self.assertNotEqual(first, second)
                self.assertEqual(first.read_bytes(), second.read_bytes())

    def test_corrupted_cache_is_retrieved_again(self):
        with Collector(self.output, "test") as collector:
            with patch.object(collector, "_request", return_value=(self.body, {})) as request:
                first, _ = collector.fetch(self.entry)
                first.write_bytes(b"interrupted local write")
                second, cached = collector.fetch(self.entry)
                self.assertFalse(cached)
                self.assertEqual(second.read_bytes(), self.body)
                self.assertEqual(request.call_count, 2)

    def test_http_200_provider_error_is_recorded_and_never_cached_as_data(self):
        error = b'{"error": "No such record", "result": "No such record"}'
        with Collector(self.output, "test") as collector:
            with patch.object(collector, "_request", return_value=(error, {"http_status": 200})):
                with self.assertRaises(DownloadError):
                    collector.fetch(self.entry)
            metadata = next(self.output.rglob("metadata.json"))
            self.assertEqual(json.loads(metadata.read_text())["status"], "failed")
            self.assertEqual((metadata.parent / "failed-response.bin").read_bytes(), error)
            self.assertFalse((metadata.parent / "response.json").exists())
            with patch.object(collector, "_request", return_value=(self.body, {})):
                _, cached = collector.fetch(self.entry)
                self.assertFalse(cached)

    def test_error_json_is_not_saved_as_a_terrain_tiff(self):
        with self.assertRaises(DownloadError):
            validate_response(b'{"error": "Export too large"}', {"format": "tiff"})

    def test_truncated_catalog_and_features_are_rejected(self):
        for body, check in [
            (b'{"response": {"numFound": 2, "docs": [{}]}}', "catalog"),
            (b'{"features": [{}], "exceededTransferLimit": true}', "features"),
        ]:
            with self.subTest(check=check), self.assertRaises(DownloadError):
                validate_response(body, {"provider": "moon_trek", "format": "json", "check": check})

    def test_cli_continues_after_failure_and_exits_nonzero(self):
        config = self.output / "sources.json"
        config.write_text(json.dumps({"downloads": [self.entry, {**self.entry, "name": "earth"}]}))
        output = io.StringIO()
        with patch.object(Collector, "fetch", side_effect=[DownloadError("offline"), (self.output, False)]) as fetch:
            with redirect_stdout(output), redirect_stderr(output):
                result = main(["fetch", "--config", str(config), "--output", str(self.output / "raw")])
        self.assertNotEqual(result, 0)
        self.assertEqual(fetch.call_count, 2)
        self.assertIn("Failed downloads: sun", output.getvalue())


if __name__ == "__main__":
    unittest.main()
