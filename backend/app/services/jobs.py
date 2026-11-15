"""One local worker, persistent JSON jobs and serialized source collection."""

import json
import logging
import re
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime

from filelock import FileLock

from .sources import Collector, DownloadError, validate_entries
from .storage import DataStore, _write_json

LOG = logging.getLogger(__name__)


def _now():
    return datetime.now(UTC).isoformat()


class QueueFullError(RuntimeError):
    pass


class DataJobs:
    """Owned by the FastAPI lifespan. Run one server process per data directory."""

    def __init__(self, settings):
        self.settings = settings
        self.lock = FileLock(settings.service_lock, timeout=0)
        self.executor = None
        self.pending = 0
        self.pending_lock = threading.Lock()

    def start(self):
        self.settings.jobs.mkdir(parents=True, exist_ok=True)
        self.lock.acquire()
        try:
            # Jobs interrupted by a prior process must not poll forever.
            for path in self.settings.jobs.glob("*.json"):
                job = json.loads(path.read_text())
                if job.get("status") in {"queued", "running"}:
                    job.update(
                        status="failed",
                        error="Service stopped before this job completed",
                        updatedAt=_now(),
                    )
                    _write_json(path, job)
            self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="data-collector")
        except Exception:
            self.lock.release()
            raise

    def close(self):
        try:
            if self.executor is not None:
                self.executor.shutdown(wait=True)
        finally:
            self.lock.release()

    def entries(self, profile, names=None):
        entries = json.loads(self.settings.configuration(profile).read_text())["downloads"]
        validate_entries(entries)
        if names is not None:
            if not names or len(names) != len(set(names)):
                raise ValueError("Source names must be nonempty and unique")
            unknown = set(names) - {entry["name"] for entry in entries}
            if unknown:
                raise ValueError(f"Unknown source names: {', '.join(sorted(unknown))}")
            entries = [entry for entry in entries if entry["name"] in names]
        return entries

    def submit(self, action, *, profile="default", names=None, refresh=False):
        entries = self.entries(profile, names) if action == "collect" else []
        job = {
            "id": uuid.uuid4().hex,
            "action": action,
            "status": "queued",
            "progress": 0,
            "profile": profile if action == "collect" else None,
            "sourceNames": [entry["name"] for entry in entries],
            "createdAt": _now(),
            "updatedAt": _now(),
            "result": None,
            "error": None,
        }
        response = dict(job)
        with self.pending_lock:
            if self.pending >= 8:
                raise QueueFullError(
                    "The data job queue is full; wait for an existing job to finish"
                )
            if self.executor is None:
                raise RuntimeError("Data worker has not started")
            self._save(job)
            self.pending += 1
            try:
                future = self.executor.submit(self._run, job, entries, refresh)
            except Exception:
                self.pending -= 1
                job.update(status="failed", error="Unable to submit job", updatedAt=_now())
                self._save(job)
                raise
        future.add_done_callback(self._finished)
        return response

    def _finished(self, _):
        with self.pending_lock:
            self.pending -= 1

    def _save(self, job):
        _write_json(self.settings.jobs / f"{job['id']}.json", job)

    def get(self, job_id):
        if not re.fullmatch(r"[a-f0-9]{32}", job_id):
            raise KeyError(job_id)
        path = self.settings.jobs / f"{job_id}.json"
        if not path.is_file():
            raise KeyError(job_id)
        return json.loads(path.read_text())

    def _run(self, job, entries, refresh):
        errors, downloads = [], []
        try:
            job.update(status="running", updatedAt=_now())
            self._save(job)
            self.settings.raw.mkdir(parents=True, exist_ok=True)
            if job["action"] == "collect":
                # Also excludes concurrent CLI acquisition; never overlap upstream calls.
                with FileLock(self.settings.collection_lock, timeout=0):
                    with Collector(self.settings.raw, self.settings.user_agent) as collector:
                        for index, entry in enumerate(entries):
                            try:
                                path, cached = collector.fetch(entry, refresh=refresh)
                                downloads.append(
                                    {
                                        "name": entry["name"],
                                        "cached": cached,
                                        "path": path.relative_to(self.settings.root).as_posix(),
                                    }
                                )
                            except (DownloadError, OSError) as exc:
                                errors.append(f"{entry['name']}: {exc}")
                            job.update(progress=0.8 * (index + 1) / len(entries), updatedAt=_now())
                            self._save(job)
            prepared = DataStore(self.settings.prepared, self.settings.raw).prepare()
            errors.extend(prepared["failed"])
            job.update(
                status="failed" if errors else "completed",
                progress=1,
                result={"downloads": downloads, "preparation": prepared},
                error="; ".join(errors) if errors else None,
                updatedAt=_now(),
            )
        except Exception as exc:
            LOG.exception("Data job %s failed", job["id"])
            job.update(status="failed", error=str(exc), updatedAt=_now())
        self._save(job)
