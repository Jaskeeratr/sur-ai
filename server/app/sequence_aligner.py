"""Onset-aware alignment of a sung pitch contour to a target note sequence.

The previous approach split the recording into equal time slices, which
mis-scores every later note as soon as the singer holds one note slightly
long. Here we instead assign every voiced frame to a target note with a
monotonic Viterbi alignment: frame order is preserved, each target gets a
contiguous span of frames, and boundaries fall where the sung pitch actually
changes rather than where the clock says they should.
"""

import math

from app.note_mapper import cents_between

# Frames further than this from a target still cost the same, so one wild
# frame cannot dominate the alignment.
MAX_FRAME_COST_CENTS = 300.0
# Frames further than this from their segment's median are treated as
# transition glides and excluded from the segment average.
OUTLIER_CENTS = 150.0
MIN_SEGMENT_FRAMES = 2


def _median(values: list[float]) -> float:
    ordered = sorted(values)
    midpoint = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[midpoint]
    return (ordered[midpoint - 1] + ordered[midpoint]) / 2


def _trim_outliers(points: list[dict]) -> list[dict]:
    if len(points) <= 4:
        return points
    median_frequency = _median([point["frequency"] for point in points])
    kept = [
        point
        for point in points
        if abs(cents_between(point["frequency"], median_frequency)) <= OUTLIER_CENTS
    ]
    return kept if len(kept) >= MIN_SEGMENT_FRAMES else points


def align_sequence(pitch_points: list[dict], target_frequencies: list[float]) -> list[list[dict]] | None:
    """Assign each voiced frame to one target, in order.

    Returns one (possibly empty) list of frames per target, or None when the
    recording has fewer voiced frames than targets (caller should fall back
    to uniform time slicing).
    """
    frame_count = len(pitch_points)
    target_count = len(target_frequencies)
    if target_count == 0 or frame_count < target_count:
        return None

    cost = [
        [
            min(abs(cents_between(point["frequency"], frequency)), MAX_FRAME_COST_CENTS)
            for point in pitch_points
        ]
        for frequency in target_frequencies
    ]

    infinity = math.inf
    best = [[infinity] * frame_count for _ in range(target_count)]
    best[0][0] = cost[0][0]
    for frame in range(1, frame_count):
        best[0][frame] = best[0][frame - 1] + cost[0][frame]
    for target in range(1, target_count):
        # Target j cannot start before frame j (each earlier target needs a frame).
        for frame in range(target, frame_count):
            previous = min(best[target][frame - 1], best[target - 1][frame - 1])
            best[target][frame] = previous + cost[target][frame]

    assignment = [0] * frame_count
    target = target_count - 1
    frame = frame_count - 1
    while frame > 0:
        assignment[frame] = target
        if target > 0 and best[target - 1][frame - 1] <= best[target][frame - 1]:
            target -= 1
        frame -= 1
    assignment[0] = 0

    spans: list[list[dict]] = [[] for _ in range(target_count)]
    for frame, point in enumerate(pitch_points):
        spans[assignment[frame]].append(point)

    # Consecutive identical targets sung as one continuous note produce no
    # onset between them, so the boundary frame count is arbitrary. Let a
    # starved target borrow the span of an adjacent target with the same
    # pitch instead of failing as no_pitch.
    for index in range(target_count):
        if len(spans[index]) >= MIN_SEGMENT_FRAMES:
            continue
        for neighbor in (index - 1, index + 1):
            if (
                0 <= neighbor < target_count
                and target_frequencies[neighbor] == target_frequencies[index]
                and len(spans[neighbor]) >= MIN_SEGMENT_FRAMES
            ):
                spans[index] = list(spans[neighbor])
                break

    return [_trim_outliers(span) if len(span) >= MIN_SEGMENT_FRAMES else span for span in spans]
