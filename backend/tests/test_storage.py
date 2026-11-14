"""Storage integration checks using small provider-shaped fixtures, never the network."""

import io
import json
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pyarrow.parquet as pq
from filelock import FileLock
from rasterio.io import MemoryFile
from rasterio.transform import from_origin
from support import temporary_directory

from app.cli import main
from app.services.normalization import PreparationError, utc_ms
from app.services.sources import Collector
from app.services.storage import DataStore

OBSERVER = """Target body name: Sun (10) {source: fixture}
Center pole/equ : MEAN_ME
Date__(UT)__HR:MN, , ,Azi_(a-app), Elev_(a-app), delta, deldot,
$$SOE
2026-Dec-01 00:00,*, ,280.049441,1.566177,0.98633151640990,-1.2237764,
2026-Dec-01 01:00,*, ,279.542821,1.561149,0.98630206572534,-1.2238547,
2026-Dec-01 02:00, , ,n.a.,n.a.,0.98627261410199,-1.2238544,
$$EOE
"""
VECTOR = """Output units : KM-S
Reference frame : ICRF
JDUT,Calendar Date (UT ),X,Y,Z,VX,VY,VZ,
$$SOE
2461375.5,A.D. 2026-Dec-01 00:00:00.0000,-341707.8040466329,147546.009332391,56591.73545035761,-0.4854175734970284,-0.8038176746800663,-0.4471442889440291,
$$EOE
"""
MOON_CRS = "+proj=stere +lat_0=-90 +lon_0=0 +lat_ts=-90 +a=1737400 +b=1737400 +units=m +no_defs"


class StorageTests(unittest.TestCase):
    def setUp(self):
        temporary = temporary_directory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.raw = self.root / "raw"
        self.raw.mkdir()
        self.store = DataStore(self.root / "prepared", self.raw)
        self.entry = {
            "name": "sun",
            "provider": "horizons",
            "format": "json",
            "url": "https://ssd.jpl.nasa.gov/api/horizons.api",
            "params": {
                "EPHEM_TYPE": "'OBSERVER'",
                "CSV_FORMAT": "'YES'",
                "QUANTITIES": "'4,20'",
                "SITE_COORD": "'0,-89.45,0'",
            },
        }

    def save(self, data, entry=None):
        entry = entry or self.entry
        content = data if isinstance(data, bytes) else json.dumps(data).encode()
        with Collector(self.raw, "offline-test") as collector:
            with patch.object(collector, "_request", return_value=(content, {})):
                path, _ = collector.fetch(entry, refresh=True)
        return path

    def catalog(self, name="catalog", duplicate=False):
        entry = {
            "name": name,
            "provider": "moon_trek",
            "format": "json",
            "check": "catalog",
            "url": "https://trek.nasa.gov/moon/catalog",
        }
        first = {"item_UUID": "1", "productLabel": "dem", "title": "Terrain DEM", "resolution": 5}
        docs = (
            [first, first]
            if duplicate
            else [
                first,
                {"item_UUID": "2", "productLabel": "regions", "title": "Regions", "resolution": 0},
            ]
        )
        self.save({"response": {"numFound": len(docs), "docs": docs}}, entry)

    def test_observer_queries_preserve_values_nulls_context_and_raw(self):
        path = self.save({"result": OBSERVER, "signature": {"version": "fixture"}})
        before = path.read_bytes()
        self.assertFalse(self.store.prepare()["failed"])
        dataset = self.store.latest_dataset("sun")
        result = self.store.series(dataset["id"], start_ms=utc_ms("2026-12-01T01:00:00Z"))
        self.assertEqual(len(result["samples"]), 2)
        self.assertAlmostEqual(result["samples"][0]["azimuth_deg"], 279.542821)
        self.assertIsNone(result["samples"][1]["azimuth_deg"])
        self.assertEqual(result["context"]["units"]["range_au"], "au")
        self.assertEqual(result["provenance"]["request"]["params"]["SITE_COORD"], "'0,-89.45,0'")
        self.assertEqual(path.read_bytes(), before)
        self.assertEqual(self.store.prepare()["reused"], 1)
        with self.assertRaises(PreparationError):
            self.store.series(dataset["id"], stop_ms=utc_ms("2026-12-02T00:00:00Z"))

    def test_vector_units_and_time_scale_are_not_silently_reinterpreted(self):
        entry = {
            **self.entry,
            "name": "vectors",
            "params": {"EPHEM_TYPE": "VECTORS", "CSV_FORMAT": "YES"},
        }
        self.save({"result": VECTOR}, entry)
        self.assertFalse(self.store.prepare()["failed"])
        result = self.store.series(self.store.latest_dataset("vectors")["id"])
        self.assertAlmostEqual(result["samples"][0]["x_km"], -341707.8040466329)
        self.assertEqual(result["samples"][0]["time_ms"], 1796083200000)
        for name, text in [
            ("tdb", VECTOR.replace("JDUT", "JDTDB")),
            ("units", VECTOR.replace("KM-S", "AU-D")),
        ]:
            self.save({"result": text}, {**entry, "name": name})
        report = self.store.prepare()
        self.assertEqual(len(report["failed"]), 2)
        self.assertEqual(self.store.latest_dataset("vectors")["status"], "prepared")

    def test_webgeocalc_column_ids_not_positions_control_vectors(self):
        ids = ["Z", "D_Y_DT", "DATE", "X", "D_X_DT", "Y", "D_Z_DT"]
        columns = [
            {"outputID": i, "units": "" if i == "DATE" else "km/s" if i.startswith("D_") else "km"}
            for i in ids
        ]
        data = {
            "status": "OK",
            "columns": columns,
            "rows": [[30, 2, "2025-02-01 00:00:00.000000 UTC", 10, 1, 20, 3]],
        }
        entry = {
            "name": "flight",
            "provider": "webgeocalc",
            "format": "json",
            "kernel_set_mission": "clps",
            "calculation": {
                "timeSystem": "UTC",
                "calculationType": "STATE_VECTOR",
                "stateRepresentation": "RECTANGULAR",
                "observer": "MOON",
                "referenceFrame": "J2000",
            },
        }
        with Collector(self.raw, "offline-test") as collector:
            with patch.object(
                collector, "_trajectory", return_value=(json.dumps(data).encode(), {})
            ):
                collector.fetch(entry)
        self.assertFalse(self.store.prepare()["failed"])
        row = self.store.series(self.store.latest_dataset("flight")["id"])["samples"][0]
        self.assertEqual(
            [row[k] for k in ["x_km", "y_km", "z_km", "vx_km_s", "vy_km_s", "vz_km_s"]],
            [10, 20, 30, 1, 2, 3],
        )

    def test_corrupted_raw_invalidates_previously_prepared_dataset(self):
        path = self.save({"result": OBSERVER})
        self.store.prepare()
        dataset = self.store.latest_dataset("sun")
        path.write_bytes(b"broken")
        self.assertEqual(len(self.store.prepare()["failed"]), 1)
        with self.assertRaises(PreparationError):
            self.store.series(dataset["id"])

    def test_changed_site_requires_explicit_dataset_selection(self):
        self.save({"result": OBSERVER})
        changed = {**self.entry, "params": {**self.entry["params"], "SITE_COORD": "'1,-89,0'"}}
        self.save({"result": OBSERVER}, changed)
        self.store.prepare()
        with self.assertRaisesRegex(PreparationError, "Multiple parameter sets"):
            self.store.latest_dataset("sun")

    def test_missing_source_metadata_invalidates_old_manifest_entry(self):
        path = self.save({"result": OBSERVER})
        self.store.prepare()
        metadata = path.parent / "metadata.json"
        metadata.rename(path.parent / "metadata.backup")
        self.assertEqual(len(self.store.prepare()["failed"]), 1)
        with self.assertRaises(PreparationError):
            self.store.latest_dataset("sun")

    def test_duplicate_catalog_is_not_published_and_does_not_block_good_sources(self):
        self.catalog("good")
        self.catalog("bad", duplicate=True)
        report = self.store.prepare()
        self.assertEqual(report["prepared"], 1)
        self.assertEqual(len(report["failed"]), 1)
        good = self.store.latest_dataset("good")
        products = self.store.products(good["id"], title_contains="DEM", max_source_resolution=10)
        self.assertEqual([p["label"] for p in products], ["dem"])
        self.assertEqual(
            pq.read_table(self.store.root / good["artifact_dir"] / "products.parquet").num_rows, 2
        )
        self.assertEqual(self.store.datasets("bad")[0]["status"], "failed")
        # Failed imports remain observable and produce a nonzero CLI result.
        output = io.StringIO()
        with redirect_stdout(output), redirect_stderr(output):
            result = main(["prepare", "--raw", str(self.raw), "--output", str(self.store.root)])
        self.assertNotEqual(result, 0)
        self.assertIn("successful datasets remain usable", output.getvalue())

    def test_corrupted_parquet_is_rebuilt_from_preserved_raw(self):
        path = self.save({"result": OBSERVER})
        original = path.read_bytes()
        self.store.prepare()
        first = self.store.latest_dataset("sun")
        (self.store.root / first["artifact_dir"] / "observer_samples.parquet").write_bytes(
            b"broken"
        )
        report = self.store.prepare()
        second = self.store.latest_dataset("sun")
        self.assertEqual(report["prepared"], 1)
        self.assertNotEqual(first["artifact_dir"], second["artifact_dir"])
        self.assertEqual(len(self.store.series(second["id"])["samples"]), 3)
        self.assertEqual(path.read_bytes(), original)

    def test_second_writer_cannot_modify_the_manifest(self):
        self.store.root.mkdir()
        with FileLock(self.store.root / ".prepare.lock"):
            with self.assertRaisesRegex(PreparationError, "Another preparation process"):
                self.store.prepare()
        self.assertFalse(self.store.manifest_path.exists())

    def test_native_raster_window_preserves_mask_zero_and_scale(self):
        values = np.array(
            [[0, -9999, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15]], dtype="float32"
        )
        with MemoryFile() as memory:
            with memory.open(
                driver="GTiff",
                width=4,
                height=4,
                count=1,
                dtype="float32",
                crs=MOON_CRS,
                transform=from_origin(-10, 10, 5, 5),
                nodata=-9999,
            ) as output:
                output.write(values, 1)
                output.scales = (0.5,)
                output.offsets = (100,)
            content = memory.read()
        self.save(
            content,
            {
                "name": "terrain",
                "provider": "moon_trek",
                "format": "tiff",
                "url": "https://trek.nasa.gov/moon/terrain",
            },
        )
        self.assertFalse(self.store.prepare()["failed"])
        dataset = self.store.latest_dataset("terrain")
        result = self.store.raster_window(dataset["id"], (-10, 0, 0, 10))
        self.assertEqual(result["values"].shape, (2, 2))
        self.assertEqual(result["values"][0, 0], 0)
        self.assertTrue(result["values"].mask[0, 1])
        self.assertEqual(result["no_data_fraction"], 0.25)
        self.assertEqual((result["scale"], result["offset"]), (0.5, 100))
        with self.assertRaises(PreparationError):
            self.store.raster_window(dataset["id"], (-20, 0, 0, 10))
        with self.assertRaises(PreparationError):
            self.store.raster_window(dataset["id"], (-10, -10, 10, 10), max_pixels=4)

    def test_regions_retain_lunar_projection_instead_of_claiming_wgs84(self):
        reference = {"wkt": "fixture lunar projection in metres"}
        data = {
            "geometryType": "esriGeometryPolygon",
            "spatialReference": reference,
            "features": [
                {
                    "attributes": {"FID": 0, "label": "Candidate"},
                    "geometry": {"rings": [[[10, 20], [30, 20], [30, 40], [10, 20]]]},
                }
            ],
        }
        self.save(
            data,
            {
                "name": "regions",
                "provider": "moon_trek",
                "format": "json",
                "check": "features",
                "url": "https://trek.nasa.gov/moon/regions",
            },
        )
        self.store.prepare()
        row = self.store.regions(self.store.latest_dataset("regions")["id"])[0]
        self.assertEqual(json.loads(row["spatial_reference_json"]), reference)
        self.assertEqual((row["min_x"], row["max_y"]), (10, 40))


if __name__ == "__main__":
    unittest.main()
