#!/usr/bin/env python3
"""Read-only verification of the reviewed API integration snapshot (stdlib only).

This verifies references and census consistency, not UI behavior or science.
Source changes require a new review; this script never updates the manifest.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "docs/api-integration-map.json"
EXPECTED = {
    "interactions": ("I", 150),
    "effects": ("E", 25),
    "networkCalls": ("N", 18),
    "functions": ("C", 303),
    "models": (None, 97),
    "integrationPoints": ("P", 42),
    "unknowns": ("U", 9),
}
DOCUMENTS = (
    "docs/api-contract.md",
    "docs/api-integration-map.md",
    "docs/api-data-dictionary.md",
    "docs/api-query-plan.md",
    "backend/API_CONTRACT.md",
)


def main() -> int:
    errors: list[str] = []
    data = json.loads(MANIFEST.read_text())
    sources: dict[str, bytes] = {}

    def check(ok: bool, message: str) -> None:
        if not ok:
            errors.append(message)

    def local_file(relative: str) -> Path:
        path = (ROOT / relative).resolve()
        if not path.is_relative_to(ROOT):
            raise ValueError(f"Path outside repository: {relative}")
        return path

    for relative, record in data["files"].items():
        path = local_file(relative)
        if not path.is_file():
            errors.append(f"Missing audited file: {relative}")
            continue
        raw = path.read_bytes()
        sources[relative] = raw
        check(hashlib.sha256(raw).hexdigest() == record["sha256"],
              f"Source changed; review required: {relative}")
        check(len(raw.splitlines()) == record["lineCount"],
              f"Line count changed: {relative}")

    frontend_files = {
        str(p.relative_to(ROOT)) for p in (ROOT / "frontend/src").rglob("*")
        if p.is_file() and p.suffix in {".ts", ".tsx", ".css"}
    }
    audited_frontend = {p for p in data["files"] if p.startswith("frontend/src/")}
    check(frontend_files == audited_frontend,
          f"Frontend inventory changed: added={sorted(frontend_files - audited_frontend)}, "
          f"removed={sorted(audited_frontend - frontend_files)}")

    for group, (prefix, count) in EXPECTED.items():
        rows = data[group]
        check(len(rows) == count, f"Unexpected {group} count: {len(rows)} != {count}")
        if prefix:
            width = 2 if prefix in {"P", "U"} else 3
            expected_ids = {f"{prefix}{n:0{width}d}" for n in range(1, count + 1)}
            ids = [r["id"] for r in rows]
            check(len(set(ids)) == len(ids) and set(ids) == expected_ids,
                  f"Incomplete/duplicate IDs in {group}")

    operations = data["operations"]
    plans = data["plans"]
    interaction_ids = {i["id"] for i in data["interactions"]}
    for row in data["interactions"]:
        plan = plans.get(row.get("plan"))
        check(plan is not None, f"Unmapped control: {row['id']}")
        check(bool(row.get("stateScope")) and bool(row.get("behavior")),
              f"Missing context/behavior: {row['id']}")
        if plan:
            check(row["targetRequests"] == plan["requests"],
                  f"Control/plan mismatch: {row['id']}")
    for name, plan in plans.items():
        check(bool(plan.get("parameters")) and bool(plan.get("reuse")),
              f"Missing request/reuse rules: {name}")
        for operation in plan["requests"]:
            check(operation in operations, f"Unknown operation {operation} in {name}")
    for group in ("effects", "networkCalls", "integrationPoints"):
        for row in data[group]:
            for op in row.get("targetRequests", row.get("requests", [])):
                check(op in operations, f"Unknown operation {op} in {row['id']}")
    for row in data["functions"]:
        check(set(row["interactionIds"]) <= interaction_ids,
              f"Invalid interaction reference in {row['id']}")
    regional = operations["REGION_COMPARISON"]
    check(regional["path"] is None and regional["method"] is None,
          "Regional binding is unresolved; do not invent a route")

    anchors = 0

    def verify_anchor(row: dict) -> None:
        nonlocal anchors
        relative = row["path"]
        raw = sources.get(relative)
        if raw is None:
            errors.append(f"Anchor references unaudited file: {relative}")
            return
        start, end = row["startByte"], row["endByte"]
        check(0 <= start < end <= len(raw), f"Invalid byte range: {relative}:{start}..{end}")
        part = raw[start:end]
        check(hashlib.sha256(part).hexdigest() == row["sha256"],
              f"Anchor changed: {relative}:{row['startLine']}")
        if "text" in row:
            check(part == row["text"].encode(), f"Snippet mismatch: {relative}:{start}")
        check(raw[:start].count(b"\n") + 1 == row["startLine"],
              f"Wrong start line: {relative}:{row['startLine']}")
        check(raw[:max(start, end - 1)].count(b"\n") + 1 == row["endLine"],
              f"Wrong end line: {relative}:{row['endLine']}")
        anchors += 1

    def walk(value) -> None:
        if isinstance(value, dict):
            if {"path", "startLine", "endLine", "startByte", "endByte", "sha256"} <= value.keys():
                verify_anchor(value)
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(data)

    def heading_slug(heading: str) -> str:
        heading = re.sub(r"<[^>]+>", "", heading).strip().lower()
        heading = re.sub(r"[^\w\- ]", "", heading, flags=re.UNICODE)
        return heading.replace(" ", "-")

    links = 0
    for relative in DOCUMENTS:
        path = ROOT / relative
        text = path.read_text()
        table_columns = None
        for number, line_text in enumerate(text.splitlines(), 1):
            if not line_text.startswith("|"):
                table_columns = None
                continue
            columns, escaped = 0, False
            for char in line_text:
                if char == "|" and not escaped:
                    columns += 1
                escaped = not escaped if char == "\\" else False
            if table_columns is None:
                table_columns = columns
            check(columns == table_columns,
                  f"Broken Markdown table: {relative}:{number}")
        # Documentation links deliberately use plain paths and optional GitHub #L anchors.
        for target in re.findall(r"\]\(([^\s)]+)\)", text):
            url = urlsplit(target)
            if url.scheme or url.netloc:
                continue
            destination = (path.parent / unquote(url.path)).resolve() if url.path else path
            check(destination.is_relative_to(ROOT), f"Link outside repository: {relative}: {target}")
            if not destination.is_file():
                errors.append(f"Broken link: {relative}: {target}")
                continue
            fragment = unquote(url.fragment)
            if fragment:
                line = re.fullmatch(r"L(\d+)(?:-L(\d+))?", fragment)
                if line:
                    a, b = int(line[1]), int(line[2] or line[1])
                    check(1 <= a <= b <= len(destination.read_bytes().splitlines()),
                          f"Invalid line link: {relative}: {target}")
                elif destination.suffix == ".md":
                    headings = re.findall(r"^#{1,6} (.+)$", destination.read_text(), re.MULTILINE)
                    check(fragment in {heading_slug(h) for h in headings},
                          f"Missing heading: {relative}: {target}")
            links += 1

    map_text = (ROOT / "docs/api-integration-map.md").read_text()
    for group in ("interactions", "effects", "networkCalls", "functions", "integrationPoints"):
        for row in data[group]:
            check(len(re.findall(rf"^\| {row['id']} \|", map_text, re.MULTILINE)) == 1,
                  f"Missing/duplicate Markdown row: {row['id']}")

    if errors:
        print("API documentation verification FAILED:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    counts = ", ".join(f"{len(data[g])} {g}" for g in EXPECTED)
    print(f"OK: {len(frontend_files)} frontend sources, {len(sources)} audited files, "
          f"{anchors} source anchors, {links} local links.")
    print(f"OK: {counts}.")
    print("Static snapshot only; no UI/API calls or scientific validation performed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
