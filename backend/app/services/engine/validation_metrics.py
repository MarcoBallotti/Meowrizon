"""Diagnostics and conservative gates, separate from production classification."""

import numpy as np


def binary_metrics(reference, prediction) -> dict:
    """0 shadow, 1 light, anything else undecided. No inferred reference labels."""
    ref, pred = np.asarray(reference), np.asarray(prediction)
    if ref.shape != pred.shape:
        raise ValueError("Reference and prediction shapes differ")
    valid = np.isin(ref, [0, 1]) & np.isin(pred, [0, 1])
    matrix = np.zeros((2, 2), dtype=int)
    np.add.at(matrix, (ref[valid].astype(int), pred[valid].astype(int)), 1)
    recall = [float(matrix[i, i] / matrix[i].sum()) if matrix[i].sum() else None for i in range(2)]
    precision = [
        float(matrix[i, i] / matrix[:, i].sum()) if matrix[:, i].sum() else None for i in range(2)
    ]
    return {
        "labels": ["shadow", "light"],
        "rows": "reference",
        "columns": "prediction",
        "matrix": matrix.tolist(),
        "valid": int(valid.sum()),
        "total": int(ref.size),
        "excluded": int((~valid).sum()),
        "recall": recall,
        "precision": precision,
        "accuracy": float(np.trace(matrix) / valid.sum()) if valid.any() else None,
        "balanced_accuracy": float(np.mean(recall)) if all(v is not None for v in recall) else None,
    }


def validation_status(evidence) -> dict:
    """No empty group, skipped check, or unmeasured comparison can pass a full gate."""
    gates = {}
    for group in ("interpolation", "slope", "horizon", "scenarios", "alignment", "eclipse", "lroc"):
        items = evidence.get(group, [])
        if group in ("interpolation", "slope", "horizon", "scenarios"):
            states = [c.get("pass") for item in items for c in item.get("checks", [])]
            missing = any(not item.get("checks") for item in items)
        else:
            key = "consistent" if group == "eclipse" else "pass"
            states = [item.get(key) for item in items]
            missing = False
        gates[group] = (
            "failed"
            if any(s is False for s in states)
            else "incomplete"
            if missing or not states or any(s is not True for s in states)
            else "passed"
        )
    return {
        "gates": gates,
        "status": "passed" if all(s == "passed" for s in gates.values()) else "incomplete",
    }
