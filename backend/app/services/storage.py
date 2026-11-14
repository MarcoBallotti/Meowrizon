"""JSON manifests, Parquet tables and native GeoTIFF windows; no database."""

import hashlib
import json
import math
import os
import uuid
from pathlib import Path

import numpy as np
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq
import rasterio
from filelock import FileLock, Timeout
from rasterio.windows import Window, from_bounds

from .normalization import PreparationError, horizons, number, webgeocalc
from .sources import DownloadError, validate_response


SCHEMA_VERSION = 1
PARSER_VERSION = 1
TABLE_FIELDS = {
    "products": {"product_id": pa.string(), "label": pa.string(), "title": pa.string(),
                 "source_resolution": pa.float64(), "projection": pa.string(), "source_json": pa.string()},
    "regions": {"region_id": pa.string(), "label": pa.string(),
                **{key: pa.float64() for key in ("min_x", "min_y", "max_x", "max_y")},
                "spatial_reference_json": pa.string(), "geometry_json": pa.string(), "attributes_json": pa.string()},
    "observer_samples": {"time_ms": pa.int64(), "source_time": pa.string(),
                         **{key: pa.float64() for key in ("azimuth_deg", "elevation_deg", "range_au", "range_rate_km_s")},
                         "solar_flag": pa.string(), "event_flag": pa.string()},
    "vector_samples": {"time_ms": pa.int64(), "source_time": pa.string(),
                       **{key: pa.float64() for key in ("jd_ut", "x_km", "y_km", "z_km", "vx_km_s", "vy_km_s", "vz_km_s")}},
}


def _json(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False)


def _sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def _write_json(path, value):
    """Readers see a complete manifest; a failed write leaves the old one intact."""
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        with temporary.open("x", encoding="utf-8") as stream:
            stream.write(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n")
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def _raster_metadata(path):
    with rasterio.open(path) as source:
        if not source.crs:
            raise PreparationError("Raster has no CRS; cannot index scientific terrain")
        if source.transform.b or source.transform.d or source.transform.a <= 0 or source.transform.e >= 0:
            raise PreparationError("Only north-up, unrotated raster grids are supported")
        details = {"driver": source.driver, "dtypes": source.dtypes,
                   "nodata": [str(n) if n is not None and not math.isfinite(n) else n
                              for n in source.nodatavals],
                   "transform": list(source.transform)[:6], "block_shapes": source.block_shapes,
                   "units": source.units, "scales": source.scales, "offsets": source.offsets,
                   "tags": source.tags(), "band_tags": [source.tags(i) for i in source.indexes],
                   "notes": ["Grid metadata only: vertical datum and full coverage still require verification."]}
        return {"width": source.width, "height": source.height, "bands": source.count,
                "min_x": source.bounds.left, "min_y": source.bounds.bottom,
                "max_x": source.bounds.right, "max_y": source.bounds.top,
                "pixel_size_x": source.res[0], "pixel_size_y": source.res[1],
                "crs_wkt": source.crs.to_wkt(), "details_json": _json(details)}


def _normalize(path, request):
    """Return kind, table/records. Unknown metadata/images remain archived only."""
    if request["format"] == "tiff":
        return "raster", {"rasters": [_raster_metadata(path)]}
    if request["format"] != "json":
        return "raw", {}
    content = path.read_bytes()
    validate_response(content, request)
    data = json.loads(content)
    if request["provider"] in {"horizons", "webgeocalc"}:
        adapter = horizons if request["provider"] == "horizons" else webgeocalc
        kind, context, rows = adapter(data, request)
        series = {"kind": kind, "start_ms": rows[0]["time_ms"], "stop_ms": rows[-1]["time_ms"],
                  "context_json": _json(context)}
        table = "observer_samples" if kind == "observer" else "vector_samples"
        return kind, {"series": [series], table: rows}
    if request.get("check") == "catalog":
        rows = []
        for doc in data["response"]["docs"]:
            rows.append({"product_id": str(doc["item_UUID"]), "label": doc["productLabel"],
                         "title": doc["title"], "source_resolution": number(doc.get("resolution"), nullable=True),
                         "projection": doc.get("projection"), "source_json": _json(doc)})
        return "products", {"products": rows}
    if request.get("check") == "features":
        if data.get("geometryType") != "esriGeometryPolygon" or not data.get("spatialReference"):
            raise PreparationError("Expected polygon regions with an explicit native spatial reference")
        rows = []
        for feature in data["features"]:
            attributes, geometry = feature["attributes"], feature["geometry"]
            points = [point for ring in geometry["rings"] for point in ring]
            xs = [number(point[0]) for point in points]
            ys = [number(point[1]) for point in points]
            rows.append({"region_id": str(attributes["FID"]), "label": attributes["label"],
                         "min_x": min(xs), "min_y": min(ys), "max_x": max(xs), "max_y": max(ys),
                         "spatial_reference_json": _json(data["spatialReference"]),
                         "geometry_json": _json(geometry), "attributes_json": _json(attributes)})
        return "regions", {"regions": rows}
    return "raw", {}


class DataStore:
    """One JSON manifest plus immutable prepared files; a lock serializes writers."""

    def __init__(self, prepared_root, raw_root):
        self.root = Path(prepared_root).resolve()
        self.raw_root = Path(raw_root).resolve()
        self.manifest_path = self.root / "catalog.json"

    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass

    def _catalog(self):
        if not self.manifest_path.exists():
            return {"schema_version": SCHEMA_VERSION, "datasets": {}}
        catalog = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        if catalog.get("schema_version") != SCHEMA_VERSION:
            raise PreparationError("Unsupported manifest schema; use a new prepared directory")
        return catalog

    def _raw_path(self, relative):
        path = (self.raw_root / relative).resolve()
        if not path.is_relative_to(self.raw_root):
            raise PreparationError("Raw path escapes the configured source directory")
        return path

    def _artifact_path(self, dataset, filename):
        path = (self.root / dataset["artifact_dir"] / filename).resolve()
        if not path.is_relative_to(self.root):
            raise PreparationError("Prepared path escapes its directory")
        return path

    def _files_intact(self, dataset):
        try:
            return all(_sha256(self._artifact_path(dataset, name)) == checksum
                       for name, checksum in dataset["prepared_files"].items())
        except (OSError, KeyError):
            return False

    def _write_tables(self, dataset_id, tables):
        directory = self.root / "datasets" / dataset_id / f"v{PARSER_VERSION}-{uuid.uuid4().hex}"
        directory.mkdir(parents=True)
        # The catalog references this directory only after all files are written.
        for name, rows in tables.items():
            if name in TABLE_FIELDS:
                key = {"products": "product_id", "regions": "region_id"}.get(name, "time_ms")
                if len({row[key] for row in rows}) != len(rows):
                    raise PreparationError(f"Duplicate {key} in {name}")
                schema = pa.schema(list(TABLE_FIELDS[name].items()), metadata={
                    b"dataset_id": dataset_id.encode(), b"parser_version": str(PARSER_VERSION).encode()})
                table = pa.Table.from_pylist(rows, schema=schema)
                pq.write_table(table, directory / f"{name}.parquet", compression="zstd",
                               row_group_size=4096, write_statistics=True)
            else:
                _write_json(directory / f"{name}.json", rows[0])
        files = {path.name: _sha256(path) for path in directory.iterdir()}
        return directory.relative_to(self.root).as_posix(), files

    def prepare(self):
        """Offline import with checksum verification and atomic manifest publication."""
        if not self.raw_root.is_dir():
            raise PreparationError(f"Raw data directory does not exist: {self.raw_root}")
        self.root.mkdir(parents=True, exist_ok=True)
        try:
            with FileLock(self.root / ".prepare.lock", timeout=0):
                return self._prepare_locked()
        except Timeout as exc:
            raise PreparationError("Another preparation process is running; try again when it finishes") from exc

    def _prepare_locked(self):
        catalog = self._catalog()
        report = {"prepared": 0, "archived": 0, "reused": 0, "skipped": 0, "failed": []}
        seen = set()
        for metadata_path in sorted(self.raw_root.glob("*/*/*/metadata.json")):
            relative = metadata_path.relative_to(self.raw_root).as_posix()
            dataset_id = hashlib.sha256(relative.encode()).hexdigest()
            seen.add(dataset_id)
            previous = catalog["datasets"].get(dataset_id)
            record = None
            try:
                metadata_bytes = metadata_path.read_bytes()
                metadata = json.loads(metadata_bytes)
                if metadata.get("status") != "complete":
                    report["skipped"] += 1
                    if previous:
                        previous.update(status="failed", error="Source metadata is no longer complete")
                        _write_json(self.manifest_path, catalog)
                    continue
                request = metadata["request"]
                filename = metadata["file"]
                if not isinstance(filename, str) or Path(filename).name != filename:
                    raise PreparationError("Expected a raw filename, not a path")
                raw_relative = (metadata_path.parent / filename).relative_to(self.raw_root).as_posix()
                path = self._raw_path(raw_relative)
                record = {"id": dataset_id, "name": request["name"], "provider": request["provider"],
                          "request_sha256": metadata["request_sha256"], "sha256": metadata["sha256"],
                          "metadata_sha256": hashlib.sha256(metadata_bytes).hexdigest(),
                          "raw_path": raw_relative, "fetched_at_utc": metadata["fetched_at_utc"],
                          "kind": "raw", "status": "failed", "parser_version": PARSER_VERSION,
                          "record_count": 0, "metadata": metadata, "error": None,
                          "artifact_dir": None, "prepared_files": {}}
                if path.stat().st_size != metadata["bytes"] or _sha256(path) != record["sha256"]:
                    raise PreparationError("Raw size/checksum mismatch; fetch a fresh snapshot")
                actual_request_hash = hashlib.sha256(json.dumps(request, sort_keys=True).encode()).hexdigest()
                if actual_request_hash != record["request_sha256"]:
                    raise PreparationError("Request checksum mismatch")
                if (previous and previous["metadata_sha256"] == record["metadata_sha256"]
                        and previous["parser_version"] == PARSER_VERSION
                        and previous["status"] in {"prepared", "archived"}
                        and self._files_intact(previous)):
                    report["reused"] += 1
                    continue
                kind, tables = _normalize(path, request)
                status = "prepared" if tables else "archived"
                count = sum(len(rows) for table, rows in tables.items() if table != "series")
                record.update(kind=kind, status=status, record_count=count)
                if tables:
                    record["artifact_dir"], record["prepared_files"] = self._write_tables(dataset_id, tables)
                catalog["datasets"][dataset_id] = record
                _write_json(self.manifest_path, catalog)
                report[status] += 1
            except (OSError, ValueError, KeyError, TypeError, IndexError, AttributeError, DownloadError,
                    rasterio.errors.RasterioError, pa.ArrowException) as exc:
                report["failed"].append(f"{relative}: {exc}")
                record = record or previous
                if record is not None:
                    record.update(status="failed", error=str(exc), record_count=0)
                    catalog["datasets"][dataset_id] = record
                    _write_json(self.manifest_path, catalog)
        for dataset_id, record in catalog["datasets"].items():
            if dataset_id not in seen:
                message = f"Source metadata missing for {record['name']} ({dataset_id})"
                record.update(status="failed", error=message, record_count=0)
                report["failed"].append(message)
        _write_json(self.manifest_path, catalog)
        return report

    def datasets(self, name=None):
        keys = ("id", "name", "provider", "kind", "status", "record_count",
                "request_sha256", "fetched_at_utc", "error", "artifact_dir")
        rows = [{key: row[key] for key in keys} for row in self._catalog()["datasets"].values()
                if name is None or row["name"] == name]
        return sorted(rows, key=lambda row: (row["name"], row["fetched_at_utc"], row["id"]))

    def latest_dataset(self, name, *, request_sha256=None):
        """Do not silently choose between different sites/dates sharing a name."""
        rows = [row for row in self.datasets(name) if row["status"] == "prepared"
                and (request_sha256 is None or row["request_sha256"] == request_sha256)]
        if not rows:
            raise PreparationError(f"No prepared dataset: {name}")
        if len({row["request_sha256"] for row in rows}) > 1:
            raise PreparationError("Multiple parameter sets: select a dataset ID or request_sha256")
        return rows[-1]

    def _require(self, dataset_id, kind=None):
        row = self._catalog()["datasets"].get(dataset_id)
        if row is None or row["status"] != "prepared" or (kind is not None and row["kind"] != kind):
            raise PreparationError(f"Dataset is not prepared for {kind or 'analysis'}: {dataset_id}")
        return row

    def raw_response(self, dataset_id):
        """Resolve a complete original response and verify its stored checksum."""
        row = self._catalog()["datasets"].get(dataset_id)
        if row is None:
            raise KeyError(dataset_id)
        if row["status"] not in {"prepared", "archived"}:
            raise PreparationError("Dataset is not available")
        path = self._raw_path(row["raw_path"])
        if not path.is_file():
            raise FileNotFoundError("Original response is missing; collect this source again")
        if _sha256(path) != row["sha256"]:
            raise PreparationError("Original response checksum mismatch; collect this source again")
        return path, row

    def series(self, dataset_id, *, start_ms=None, stop_ms=None):
        """Inclusive sample bounds, not visibility intervals. No interpolation/extrapolation."""
        dataset = self._require(dataset_id)
        if dataset["kind"] not in {"observer", "vectors"}:
            raise PreparationError("Dataset is not a time series")
        series = json.loads(self._artifact_path(dataset, "series.json").read_text())
        start = series["start_ms"] if start_ms is None else start_ms
        stop = series["stop_ms"] if stop_ms is None else stop_ms
        if type(start) is not int or type(stop) is not int:
            raise PreparationError("Time bounds must be integer UTC epoch milliseconds")
        if start > stop or start < series["start_ms"] or stop > series["stop_ms"]:
            raise PreparationError("Requested time bounds are invalid or outside this dataset")
        name = "observer_samples" if dataset["kind"] == "observer" else "vector_samples"
        table = pq.read_table(self._artifact_path(dataset, f"{name}.parquet"),
                              filters=[("time_ms", ">=", start), ("time_ms", "<=", stop)])
        return {"dataset_id": dataset_id, "kind": dataset["kind"],
                "context": json.loads(series["context_json"]),
                "provenance": dataset["metadata"], "samples": table.to_pylist()}

    def products(self, dataset_id, *, title_contains="", max_source_resolution=None, limit=100):
        dataset = self._require(dataset_id, "products")
        if type(limit) is not int or not 1 <= limit <= 5000:
            raise PreparationError("Product limit must be between 1 and 5000")
        filters = None
        if max_source_resolution is not None:
            threshold = number(max_source_resolution)
            if threshold <= 0:
                raise PreparationError("Resolution threshold must be positive")
            filters = [("source_resolution", ">", 0), ("source_resolution", "<=", threshold)]
        table = pq.read_table(self._artifact_path(dataset, "products.parquet"), filters=filters)
        table = table.filter(pc.match_substring(pc.utf8_lower(table["title"]), title_contains.lower()))
        return table.sort_by([("title", "ascending"), ("product_id", "ascending")]).slice(0, limit).to_pylist()

    def regions(self, dataset_id):
        dataset = self._require(dataset_id, "regions")
        table = pq.read_table(self._artifact_path(dataset, "regions.parquet"))
        return table.sort_by([("label", "ascending")]).to_pylist()

    def raster_window(self, dataset_id, bounds, *, band=1, max_pixels=4_000_000):
        """Return a masked array in native raster coordinates/units; never fill missing pixels."""
        dataset = self._require(dataset_id, "raster")
        left, bottom, right, top = map(number, bounds)
        if left >= right or bottom >= top:
            raise PreparationError("Expected ordered native bounds: left,bottom,right,top")
        if type(max_pixels) is not int or max_pixels <= 0 or type(band) is not int:
            raise PreparationError("Band and pixel limit must be positive integers")
        with rasterio.open(self._raw_path(dataset["raw_path"])) as source:
            extent = source.bounds
            if left < extent.left or right > extent.right or bottom < extent.bottom or top > extent.top:
                raise PreparationError("Requested region extends beyond this raster")
            if band not in source.indexes:
                raise PreparationError("Requested raster band does not exist")
            window = from_bounds(left, bottom, right, top, source.transform)
            # Read all intersecting native pixels, without resampling.
            x0, y0 = max(0, math.floor(window.col_off)), max(0, math.floor(window.row_off))
            x1 = min(source.width, math.ceil(window.col_off + window.width))
            y1 = min(source.height, math.ceil(window.row_off + window.height))
            window = Window(x0, y0, x1 - x0, y1 - y0)
            if window.width * window.height > max_pixels:
                raise PreparationError("Raster window exceeds the configured pixel limit")
            values = np.ma.masked_invalid(source.read(band, window=window, masked=True))
            return {"values": values, "transform": source.window_transform(window),
                    "crs_wkt": source.crs.to_wkt(), "scale": source.scales[band - 1],
                    "offset": source.offsets[band - 1], "unit": source.units[band - 1],
                    "no_data_fraction": float(np.ma.getmaskarray(values).mean()),
                    "dataset_id": dataset_id}
