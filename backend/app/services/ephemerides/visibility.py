"""Finite solar/terrestrial discs against a spherical, azimuth-dependent horizon."""

import numpy as np

DEG = np.pi / 180
DISC_SAMPLES = 2048
# Opposite pairs give exactly half a disc for a horizontal central cut.
_i = np.arange(DISC_SAMPLES // 2)
_r = np.sqrt((_i + 0.5) / len(_i))
_a = _i * np.pi * (3 - np.sqrt(5))
_x, _y = _r * np.cos(_a), _r * np.sin(_a)
POINTS = np.concatenate([np.stack([_x, _y], axis=-1), np.stack([-_x, -_y], axis=-1)])


def directions(body):
    az, el = body["az"] * DEG, body["el"] * DEG
    return np.stack([np.sin(az) * np.cos(el), np.cos(az) * np.cos(el), np.sin(el)], axis=-1)


def separation(a, b):
    # atan2 remains accurate near conjunction, unlike acos of a nearly unit dot product.
    u, v = directions(a), directions(b)
    return np.arctan2(np.linalg.norm(np.cross(u, v), axis=-1), np.sum(u * v, axis=-1)) / DEG


def horizon(profile, az):
    return np.interp(az, profile["azimuthDeg"], profile["elevationDeg"], period=360)


def fractions(profile, body, occulter=None):
    terrain, combined, occulted = [], [], []
    for start in range(0, len(body["az"]), 32):
        sl = slice(start, start + 32)
        az, el = body["az"][sl] * DEG, body["el"][sl] * DEG
        center = directions(body)[sl]
        east = np.stack([np.cos(az), -np.sin(az), np.zeros_like(az)], axis=-1)
        up = np.stack([-np.sin(az)*np.sin(el), -np.cos(az)*np.sin(el), np.cos(el)], axis=-1)
        tangent = POINTS[None, :, 0, None]*east[:, None, :] + POINTS[None, :, 1, None]*up[:, None, :]
        rays = center[:, None, :] + np.tan(body["radius"][sl]*DEG)[:, None, None]*tangent
        rays /= np.linalg.norm(rays, axis=-1, keepdims=True)
        ray_az = np.arctan2(rays[..., 0], rays[..., 1]) / DEG % 360
        ray_el = np.arcsin(np.clip(rays[..., 2], -1, 1)) / DEG
        clear = ray_el >= horizon(profile, ray_az)
        blocked = np.zeros_like(clear)
        if occulter is not None:
            dots = np.sum(rays * directions(occulter)[sl, None, :], axis=-1)
            blocked = dots >= np.cos(occulter["radius"][sl] * DEG)[:, None]
            blocked &= (occulter["distance"][sl] < body["distance"][sl])[:, None]
        terrain.extend(np.mean(clear, axis=1))
        combined.extend(np.mean(clear & ~blocked, axis=1))
        occulted.extend(np.mean(blocked, axis=1))
    return np.array(terrain), np.array(combined), np.array(occulted)


def intervals(times, values, threshold=0.5, refine=None):
    """Linear crossings or caller-provided refinement; endpoints explicitly marked truncated."""
    times, values = np.asarray(times), np.asarray(values)
    flags = values >= threshold
    out = []
    start = float(times[0]) if flags[0] else None
    for i in range(1, len(times)):
        if flags[i] == flags[i-1]:
            continue
        if refine:
            edge = refine(float(times[i-1]), float(times[i]), bool(flags[i-1]))
        else:
            edge = float(times[i-1] + (threshold-values[i-1])/(values[i]-values[i-1])*(times[i]-times[i-1]))
        if flags[i]:
            start = edge
        else:
            out.append({"startMs": start, "endMs": edge,
                        "startTruncated": bool(start == times[0]), "endTruncated": False})
            start = None
    if start is not None:
        out.append({"startMs": start, "endMs": float(times[-1]),
                    "startTruncated": bool(start == times[0]), "endTruncated": True})
    return out


def intersect(a, b):
    out = []
    for x in a:
        for y in b:
            start, stop = max(x["startMs"], y["startMs"]), min(x["endMs"], y["endMs"])
            if stop > start:
                out.append({"startMs": start, "endMs": stop,
                            "startTruncated": x["startTruncated"] and y["startTruncated"],
                            "endTruncated": x["endTruncated"] and y["endTruncated"]})
    return out
