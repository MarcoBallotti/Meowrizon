"""All service paths are anchored to this standalone backend directory."""

import os
from dataclasses import dataclass
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
USER_AGENT = "Meowrizon/0.1 (+https://github.com/MarcoBallotti/MeowrizonProject)"


def inside_backend(path, *, root=BACKEND_ROOT):
    root = Path(root).resolve()
    path = Path(path)
    path = (root / path).resolve() if not path.is_absolute() else path.resolve()
    if not path.is_relative_to(root):
        raise ValueError("Files must stay inside the backend directory")
    return path


@dataclass(frozen=True)
class Settings:
    root: Path = BACKEND_ROOT

    def __post_init__(self):
        object.__setattr__(self, "root", inside_backend(self.root))

    @property
    def raw(self):
        return inside_backend("data/raw", root=self.root)

    @property
    def prepared(self):
        return inside_backend("data/prepared", root=self.root)

    @property
    def jobs(self):
        return inside_backend("data/jobs", root=self.root)

    @property
    def collection_lock(self):
        return inside_backend("data/.collection.lock", root=self.root)

    @property
    def service_lock(self):
        return inside_backend("data/.service.lock", root=self.root)

    @property
    def user_agent(self):
        return os.environ.get("MEOWRIZON_USER_AGENT", USER_AGENT)

    def configuration(self, profile="default"):
        filenames = {"default": "sources.example.json", "trajectory": "trajectory.example.json"}
        if profile not in filenames:
            raise ValueError("Unknown source profile")
        return inside_backend(Path("config") / filenames[profile], root=self.root)
