"""Raw acquisition only: no terrain analysis, trajectory solving or API schemas."""

import hashlib
import json
import math
import re
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit
from xml.etree import ElementTree

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

WGC = "https://wgc2.jpl.nasa.gov:8443/webgeocalc/api"
FORMATS = {"json": ".json", "tiff": ".tif", "xml": ".xml", "jpeg": ".jpg", "png": ".png"}


class DownloadError(Exception):
    """A provider response cannot be saved as a successful dataset."""


def validate_entries(entries):
    if not isinstance(entries, list) or not entries:
        raise ValueError("downloads must be a nonempty list")
    names = set()
    for entry in entries:
        name = entry["name"]
        if not isinstance(name, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,79}", name):
            raise ValueError(
                "Download names must use lowercase letters, numbers, underscores or hyphens"
            )
        if name in names:
            raise ValueError(f"Duplicate name: {name}")
        names.add(name)
        if entry.get("format") not in FORMATS:
            raise ValueError(f"Unsupported format for {name}")
        if entry.get("provider") not in {"horizons", "moon_trek", "webgeocalc"}:
            raise ValueError(f"Unsupported provider for {name}")
        if entry.get("check") not in {None, "catalog", "features"}:
            raise ValueError(f"Unsupported response check for {name}")
        if not isinstance(entry.get("params", {}), dict):
            raise ValueError(f"params must be an object for {name}")
        if entry["provider"] == "webgeocalc":
            if entry["format"] != "json" or not isinstance(entry.get("calculation"), dict):
                raise ValueError("WebGeocalc needs a JSON calculation object")
            if not entry.get("kernel_set_mission"):
                raise ValueError("WebGeocalc needs kernel_set_mission")
        else:
            parsed = urlsplit(entry["url"])
            hosts = {"horizons": {"ssd.jpl.nasa.gov"}, "moon_trek": {"trek.nasa.gov"}}
            if parsed.scheme != "https" or parsed.hostname not in hosts[entry["provider"]]:
                raise ValueError(f"Unexpected source URL for {name}")
        limit = entry.get("max_mb", 128)
        if not isinstance(limit, (int, float)) or not math.isfinite(limit) or limit <= 0:
            raise ValueError(f"max_mb must be positive for {name}")


def _json_data(content):
    try:
        data = json.loads(content)
    except (ValueError, UnicodeError) as exc:
        raise DownloadError("Expected JSON, but the provider returned another format") from exc
    if isinstance(data, dict):
        if data.get("error"):
            raise DownloadError(f"Provider error: {str(data['error'])[:600]}")
        if isinstance(data.get("status"), str) and data["status"] in {"ERROR", "FAILED"}:
            raise DownloadError(f"Provider error: {str(data.get('message', data))[:600]}")
    return data


def validate_response(content, entry):
    """Check transport/provider failures without normalizing scientific data."""
    kind = entry["format"]
    if kind == "json":
        data = _json_data(content)
        if (entry["provider"] == "horizons" or entry.get("check")) and not isinstance(data, dict):
            raise DownloadError("Expected a provider JSON object")
        if entry["provider"] == "horizons":
            result = data.get("result", "")
            if not isinstance(result, str) or "$$SOE" not in result or "$$EOE" not in result:
                raise DownloadError(f"Horizons did not return an ephemeris: {str(result)[:600]}")
        if entry.get("check") == "catalog":
            response = data.get("response", {})
            if not isinstance(response, dict):
                raise DownloadError("Catalog response is not an object")
            docs = response.get("docs")
            if not isinstance(docs, list) or not isinstance(response.get("numFound"), int):
                raise DownloadError("Catalog response has no product list")
            if len(docs) < int(response["numFound"]):
                raise DownloadError(
                    "Catalog is truncated; increase rows in the request configuration"
                )
        if entry.get("check") == "features":
            if not isinstance(data.get("features"), list):
                raise DownloadError("Feature response has no features list")
            if data.get("exceededTransferLimit"):
                raise DownloadError("Feature response is truncated; retrieve a smaller region")
    elif kind == "tiff":
        if content[:4] not in {b"II*\x00", b"MM\x00*", b"II+\x00", b"MM\x00+"}:
            raise DownloadError("Expected a TIFF raster; the server may have returned an error")
    elif kind == "jpeg":
        if not content.startswith(b"\xff\xd8\xff"):
            raise DownloadError("Expected a JPEG tile")
    elif kind == "png":
        if not content.startswith(b"\x89PNG\r\n\x1a\n"):
            raise DownloadError("Expected a PNG tile")
    elif kind == "xml":
        try:
            root = ElementTree.fromstring(content)
        except ElementTree.ParseError as exc:
            raise DownloadError("Expected an XML capabilities document") from exc
        if root.tag.split("}")[-1] != "Capabilities":
            raise DownloadError("XML is not a WMTS capabilities document")


class Collector:
    def __init__(self, output, user_agent):
        self.output = Path(output)
        self.session = requests.Session()
        self.session.headers["User-Agent"] = user_agent
        # POST creates a remote calculation: never retry it automatically.
        retry = Retry(
            total=2,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET"],
            respect_retry_after_header=True,
        )
        self.session.mount("https://", HTTPAdapter(max_retries=retry))

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.session.close()

    def _request(self, url, *, params=None, body=None, max_mb=128):
        method = "POST" if body is not None else "GET"
        try:
            with self.session.request(
                method, url, params=params, json=body, timeout=(10, 60), stream=True
            ) as response:
                response.raise_for_status()
                chunks, size = [], 0
                for chunk in response.iter_content(chunk_size=65536):
                    size += len(chunk)
                    if size > max_mb * 1024 * 1024:
                        raise DownloadError(f"Response exceeds configured {max_mb} MiB limit")
                    chunks.append(chunk)
                content = b"".join(chunks)
                if not content:
                    raise DownloadError("Provider returned an empty body")
                details = {
                    "method": method,
                    "url": response.url,
                    "http_status": response.status_code,
                    "content_type": response.headers.get("Content-Type"),
                    "etag": response.headers.get("ETag"),
                    "last_modified": response.headers.get("Last-Modified"),
                }
                if body is not None:
                    details["request_body"] = body
                return content, details
        except requests.RequestException as exc:
            raise DownloadError(str(exc)) from exc

    def _trajectory(self, entry):
        trace = []

        def call(path, body=None):
            content, details = self._request(WGC + path, body=body, max_mb=entry.get("max_mb", 128))
            trace.append(details)
            data = _json_data(content)
            if not isinstance(data, dict) or data.get("status") != "OK":
                raise DownloadError(f"Unexpected WebGeocalc response: {str(data)[:600]}")
            return content, data

        _, sets = call("/kernel-sets")
        selected = next(
            (
                item
                for item in sets.get("items", [])
                if item.get("missionId") == entry["kernel_set_mission"]
            ),
            None,
        )
        if selected is None:
            raise DownloadError(f"Kernel set not available: {entry['kernel_set_mission']}")
        calculation = dict(entry["calculation"])
        calculation["kernels"] = [{"type": "KERNEL_SET", "id": int(selected["kernelSetId"])}]
        _, job = call("/calculation/new", calculation)
        identifier = job.get("calculationId")
        if not identifier:
            raise DownloadError(f"Missing WebGeocalc calculationId: {job}")
        deadline = time.monotonic() + 120
        while job.get("result", {}).get("phase") != "COMPLETE":
            phase = job.get("result", {}).get("phase")
            if phase in {"FAILED", "CANCELLED", "EXPIRED", "DISPATCHED"}:
                raise DownloadError(f"WebGeocalc calculation {identifier}: {job}")
            if time.monotonic() >= deadline:
                raise DownloadError(
                    f"WebGeocalc calculation {identifier} did not finish within polling deadline"
                )
            time.sleep(2)
            _, job = call(f"/calculation/{identifier}")
        content, result = call(f"/calculation/{identifier}/results")
        if not result.get("columns") or not result.get("rows"):
            raise DownloadError("WebGeocalc returned no trajectory samples")
        return content, {"kernel_set": selected, "requests": trace}

    def fetch(self, entry, *, refresh=False):
        fingerprint = hashlib.sha256(json.dumps(entry, sort_keys=True).encode()).hexdigest()
        root = self.output / entry["name"] / fingerprint[:16]
        extension = FORMATS[entry["format"]]
        if root.exists() and not refresh:
            for metadata_file in sorted(root.glob("*/metadata.json"), reverse=True):
                try:
                    metadata = json.loads(metadata_file.read_text(encoding="utf-8"))
                    path = metadata_file.parent / f"response{extension}"
                    if (
                        metadata.get("status") == "complete"
                        and path.is_file()
                        and hashlib.sha256(path.read_bytes()).hexdigest() == metadata.get("sha256")
                    ):
                        return path, True
                except (OSError, ValueError):
                    continue

        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S.%fZ")
        folder = root / f"{stamp}-{uuid.uuid4().hex[:8]}"
        folder.mkdir(parents=True, exist_ok=False)
        metadata = {
            "status": "incomplete",
            "requested_at_utc": stamp,
            "request_sha256": fingerprint,
            "request": entry,
        }
        content = None
        try:
            if entry["provider"] == "webgeocalc":
                content, details = self._trajectory(entry)
            else:
                content, details = self._request(
                    entry["url"], params=entry.get("params"), max_mb=entry.get("max_mb", 128)
                )
            metadata["response"] = details
            validate_response(content, entry)
            path = folder / f"response{extension}"
            partial = folder / "response.part"
            partial.write_bytes(content)
            partial.replace(path)
            metadata.update(
                status="complete",
                file=path.name,
                bytes=len(content),
                sha256=hashlib.sha256(content).hexdigest(),
                fetched_at_utc=datetime.now(UTC).isoformat(),
            )
        except (DownloadError, OSError) as exc:
            metadata.update(status="failed", error=str(exc))
            if content is not None:
                (folder / "failed-response.bin").write_bytes(content)
            raise
        finally:
            (folder / "metadata.json").write_text(
                json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
            )
        return path, False
