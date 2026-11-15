"""Prepare observation-only development samples, never auto-label ground truth."""

import csv
import hashlib
import json
from pathlib import Path

import numpy as np

from app.services.engine.validation_metrics import binary_metrics

root = Path("data/analysis/validation")
out = root / "review-20261115/annotation"
out.mkdir(parents=True, exist_ok=True)
manifest = []
for path in sorted(root.glob("lroc_*.npz")):
    data = np.load(path)
    x, y, obs = data["x_m"], data["y_m"], data["observed_i_over_f"]
    valid = np.isfinite(obs)
    product = path.stem.removeprefix("lroc_")
    csvpath = out / f"{product}.csv"
    if csvpath.exists():
        raise FileExistsError(f"Preserve annotations: {csvpath}")
    with csvpath.open("w") as f:
        writer = csv.writer(f)
        writer.writerow(
            ["row", "column", "x_m", "y_m", "observed_i_over_f", "label", "reason", "reviewer"]
        )
        for r, c in zip(*np.nonzero(valid), strict=True):
            writer.writerow([r, c, x[r, c], y[r, c], obs[r, c], -1, "unannotated", ""])
    values = obs[valid]
    lo, hi = np.percentile(values, [2, 98])
    gray = np.clip((np.nan_to_num(obs, nan=lo) - lo) / (hi - lo), 0, 1)
    nrow, ncol = obs.shape
    svg = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{max(ncol * 6, 650)}" '
        f'height="{nrow * 6 + 60}" viewBox="0 0 {max(ncol * 6, 650)} {nrow * 6 + 60}">',
        '<rect width="100%" height="100%" fill="#bbb"/>',
        f'<text x="5" y="18" font-size="12">{product}: development observations only</text>',
        '<text x="5" y="35" font-size="11">I/F 2–98 percentile stretch; '
        "gray gaps = NoData. Not an annotated mask.</text>",
    ]
    for r, c in zip(*np.nonzero(valid), strict=True):
        v = int(gray[r, c] * 255)
        svg.append(
            f'<rect x="{c * 6}" y="{r * 6 + 50}" width="6" height="6" fill="rgb({v},{v},{v})"/>'
        )
    (out / f"{product}.svg").write_text("\n".join(svg) + "</svg>")
    manifest.append(
        {
            "product": product,
            "split": "development",
            "samples": int(valid.sum()),
            "source_npz_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "labels": "unannotated",
            "csv": csvpath.name,
            "coordinates": "south polar stereographic sphere 1737400 m, central longitude 0",
        }
    )
(out / "manifest.json").write_text(json.dumps(manifest, indent=2))
# Existing Otsu benchmark: diagnostics only, same pre-existing reference definition.
evidence = json.loads((root / "review-20261115/previous-evidence.json").read_text())
metrics = []
for item in evidence["lroc"]:
    d = np.load(root / f"lroc_{item['product']}.npz")
    obs, frac = d["observed_i_over_f"], d["predicted_f_sun_terrain"]
    reference = np.where(np.isfinite(obs), (obs > item["i_over_f_threshold"]).astype(int), -1)
    prediction = np.where(
        ~np.isfinite(frac), -1, np.where(frac == 0, 0, np.where(frac >= 0.5, 1, -1))
    )
    metrics.append(
        {
            "product": item["product"],
            "protocol": "Otsu v1, diagnostic only",
            **binary_metrics(reference, prediction),
        }
    )
(out.parent / "lroc-otsu-class-metrics.json").write_text(json.dumps(metrics, indent=2))
print(json.dumps(manifest, indent=2))
