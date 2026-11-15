"""Ricerca degli intervalli in cui una condizione è vera dentro la finestra richiesta.

La condizione è descritta da un margine continuo g(t): è vera dove g >= 0 (o g > 0). Si
campiona fitto, si raffinano gli attraversamenti per bisezione e si cercano eventi più brevi
del passo dove il margine è vicino a zero. Non si interpolano booleani.

Ogni intervallo dichiara come inizia e come finisce: transizione osservata, bordo della
richiesta oppure lacuna di dati. Il bordo della richiesta non è un'alba o un tramonto.
"""

from dataclasses import dataclass

import numpy as np

UNKNOWN = -1
TRANSITION = "observed_transition"
REQUEST_START = "request_start"
REQUEST_END = "request_end"
DATA_GAP = "data_gap"


@dataclass
class Segment:
    start_ms: int
    end_ms: int
    state: int  # 1 vera, 0 falsa, -1 sconosciuta
    start_kind: str
    end_kind: str

    @property
    def truncated_left(self) -> bool:
        return self.start_kind != TRANSITION

    @property
    def truncated_right(self) -> bool:
        return self.end_kind != TRANSITION

    @property
    def observed_duration_s(self) -> float:
        return (self.end_ms - self.start_ms) / 1000.0

    @property
    def total_duration_s(self) -> float | None:
        """Durata fisica completa, nota solo se entrambi i confini sono stati osservati."""
        if self.truncated_left or self.truncated_right:
            return None
        return self.observed_duration_s


def classify(margin, inclusive: bool) -> np.ndarray:
    margin = np.asarray(margin, dtype=float)
    with np.errstate(invalid="ignore"):
        true = margin >= 0 if inclusive else margin > 0
    return np.where(np.isnan(margin), UNKNOWN, true.astype(np.int8)).astype(np.int8)


def scan_times(start_ms: int, stop_ms: int, step_s: float) -> np.ndarray:
    step_ms = max(1, int(round(step_s * 1000)))
    times = np.arange(start_ms, stop_ms, step_ms, dtype=np.int64)
    return np.append(times, np.int64(stop_ms))


def _bisect(margin_at, inclusive, left, right, left_state, tolerance_ms):
    """Raffina in parallelo le transizioni comprese fra `left` e `right` (stati diversi)."""
    left = np.array(left, dtype=np.int64)
    right = np.array(right, dtype=np.int64)
    left_state = np.asarray(left_state)
    for _ in range(64):
        active = (right - left) > tolerance_ms
        if not active.any():
            break
        middle = (left[active] + right[active]) // 2
        state = classify(margin_at(middle), inclusive)
        same = state == left_state[active]
        new_left, new_right = left[active], right[active]
        new_left = np.where(same, middle, new_left)
        # Uno stato sconosciuto nel mezzo chiude la ricerca dal lato noto più vicino.
        new_right = np.where(~same, middle, new_right)
        left[active], right[active] = new_left, new_right
    return (left + right + 1) // 2


def find_segments(
    margin_at,
    start_ms: int,
    stop_ms: int,
    scan_step_s: float,
    tolerance_s: float,
    inclusive: bool = True,
    probe_margin: float = 0.05,
    probe_subdivisions: int = 12,
    chunk: int = 20000,
    scan=None,
    probe_mask=None,
) -> list[Segment]:
    """Divide [start, stop] in tratti a stato costante. `margin_at(tempi_ms)` dà g o NaN.

    `scan` permette di riusare (tempi, margini) già calcolati sulla griglia di scansione.
    `probe_mask` (un valore per passo) sostituisce il criterio |g| < probe_margin quando il
    margine non misura la distanza dalla soglia, come per il buio completo.
    """

    def evaluate(times):
        times = np.asarray(times, dtype=np.int64)
        if times.size <= chunk:
            return np.asarray(margin_at(times), dtype=float)
        parts = [margin_at(times[i : i + chunk]) for i in range(0, times.size, chunk)]
        return np.concatenate([np.asarray(p, dtype=float) for p in parts])

    if scan is None:
        times = scan_times(start_ms, stop_ms, scan_step_s)
        margin = evaluate(times)
    else:
        times, margin = np.asarray(scan[0], dtype=np.int64), np.asarray(scan[1], dtype=float)
    state = classify(margin, inclusive)
    tolerance_ms = max(1, int(round(tolerance_s * 1000)))
    a_state, b_state = state[:-1], state[1:]
    changes: list[tuple[int, int, str]] = []  # (istante, stato successivo, tipo)

    crossing = (a_state != b_state) & (a_state != UNKNOWN) & (b_state != UNKNOWN)
    if crossing.any():
        index = np.flatnonzero(crossing)
        refined = _bisect(
            evaluate, inclusive, times[index], times[index + 1], a_state[index], tolerance_ms
        )
        changes += [
            (int(t), int(b_state[i]), TRANSITION) for t, i in zip(refined, index, strict=True)
        ]

    # Eventi più brevi del passo: stessi stati agli estremi ma margine vicino a zero.
    if probe_mask is None:
        with np.errstate(invalid="ignore"):
            near = np.minimum(np.abs(margin[:-1]), np.abs(margin[1:])) < probe_margin
    else:
        near = np.asarray(probe_mask, dtype=bool)
    candidates = np.flatnonzero((a_state == b_state) & (a_state != UNKNOWN) & near)
    if candidates.size and probe_subdivisions > 1:
        fractions = np.arange(1, probe_subdivisions) / probe_subdivisions
        t0 = times[candidates][:, None]
        t1 = times[candidates + 1][:, None]
        inner = (t0 + np.round((t1 - t0) * fractions[None, :])).astype(np.int64)
        inner_state = classify(evaluate(inner.ravel()), inclusive).reshape(inner.shape)
        hits = np.flatnonzero((inner_state != a_state[candidates][:, None]).any(axis=1))
        for row in hits:
            k = candidates[row]
            chain_t = np.concatenate([[times[k]], inner[row], [times[k + 1]]])
            chain_s = np.concatenate([[state[k]], inner_state[row], [state[k + 1]]])
            for m in range(chain_t.size - 1):
                s0, s1 = int(chain_s[m]), int(chain_s[m + 1])
                if s0 == s1:
                    continue
                if UNKNOWN in (s0, s1):
                    edge = chain_t[m] if s1 == UNKNOWN else chain_t[m + 1]
                    changes.append((int(edge), s1, DATA_GAP))
                else:
                    refined = _bisect(
                        evaluate, inclusive, [chain_t[m]], [chain_t[m + 1]], [s0], tolerance_ms
                    )
                    changes.append((int(refined[0]), s1, TRANSITION))

    # Lacune: il tratto noto finisce (o ricomincia) all'ultimo (primo) campione noto.
    for k in np.flatnonzero((a_state != UNKNOWN) & (b_state == UNKNOWN)):
        changes.append((int(times[k]), UNKNOWN, DATA_GAP))
    for k in np.flatnonzero((a_state == UNKNOWN) & (b_state != UNKNOWN)):
        changes.append((int(times[k + 1]), int(b_state[k]), DATA_GAP))

    changes.sort(key=lambda item: item[0])
    segments: list[Segment] = []
    current_state, current_start, current_kind = int(state[0]), int(start_ms), REQUEST_START
    for instant, new_state, kind in changes:
        if new_state == current_state:
            continue
        segments.append(Segment(current_start, instant, current_state, current_kind, kind))
        current_state, current_start, current_kind = new_state, instant, kind
    segments.append(Segment(current_start, int(stop_ms), current_state, current_kind, REQUEST_END))
    return [s for s in segments if s.end_ms > s.start_ms or len(segments) == 1]


def true_intervals(segments: list[Segment]) -> list[Segment]:
    return [segment for segment in segments if segment.state == 1]


def known_fraction(segments: list[Segment]) -> float:
    total = sum(s.end_ms - s.start_ms for s in segments)
    known = sum(s.end_ms - s.start_ms for s in segments if s.state != UNKNOWN)
    return known / total if total else 0.0
