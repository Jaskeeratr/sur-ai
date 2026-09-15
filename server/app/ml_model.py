import math

from app.stability_model import predict as predict_stability

LABELS = ["stable", "shaky", "sharp_drift", "flat_drift", "off_pitch"]

FEEDBACK = {
    "stable": "Your pitch was stable for the held note. Keep using this level of steadiness while matching the harmonium.",
    "shaky": "You were near the note, but the pitch wobbled. Try holding the vowel with steadier breath support.",
    "sharp_drift": "Your pitch started closer but drifted upward. Keep the note relaxed and avoid pushing higher near the end.",
    "flat_drift": "Your pitch started closer but drifted downward. Support the note steadily so it does not sink near the end.",
    "off_pitch": "A pitch was detected, but it is far from the target note. Pick a closer harmonium key or adjust your starting pitch.",
}

MIN_VOICED_FRAMES = 4


def _safe_cents(frequency: float, target_frequency: float) -> float | None:
    if frequency <= 0 or target_frequency <= 0:
        return None
    return 1200 * math.log2(frequency / target_frequency)


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _std(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    average = _mean(values)
    return math.sqrt(sum((value - average) ** 2 for value in values) / len(values))


def _linear_slope(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0

    x_average = (len(values) - 1) / 2
    y_average = _mean(values)
    numerator = sum((index - x_average) * (value - y_average) for index, value in enumerate(values))
    denominator = sum((index - x_average) ** 2 for index in range(len(values)))
    return numerator / denominator if denominator else 0.0


def _detrend(values: list[float]) -> list[float]:
    """Remove the linear trend so wobble can be measured apart from drift."""
    if len(values) < 3:
        return list(values)

    slope = _linear_slope(values)
    average = _mean(values)
    x_average = (len(values) - 1) / 2
    return [value - (average + slope * (index - x_average)) for index, value in enumerate(values)]


def _zero_crossing_rate(values: list[float]) -> float:
    """Oscillations per frame in a zero-centred signal: a vibrato proxy."""
    if len(values) < 2:
        return 0.0

    crossings = sum(
        1
        for index in range(1, len(values))
        if (values[index - 1] <= 0 < values[index]) or (values[index - 1] >= 0 > values[index])
    )
    return crossings / (len(values) - 1)


def extract_stability_features(pitch_points: list[dict], target_frequency: float) -> dict:
    cents_sequence = [
        cents
        for point in pitch_points
        if (cents := _safe_cents(float(point["frequency"]), target_frequency)) is not None
    ]
    frequencies = [float(point["frequency"]) for point in pitch_points]
    duration = 0.0
    if pitch_points:
        duration = max(float(point["time"]) for point in pitch_points) - min(float(point["time"]) for point in pitch_points)

    deltas = [
        abs(cents_sequence[index] - cents_sequence[index - 1])
        for index in range(1, len(cents_sequence))
    ]

    detrended = _detrend(cents_sequence)

    return {
        "cents_sequence": cents_sequence,
        "average_cents": _mean(cents_sequence),
        "absolute_average_cents": abs(_mean(cents_sequence)),
        "cents_std": _std(cents_sequence),
        "average_step_change": _mean(deltas),
        "drift": cents_sequence[-1] - cents_sequence[0] if len(cents_sequence) >= 2 else 0.0,
        "slope": _linear_slope(cents_sequence),
        # Wobble measured with the drift removed, so a steadily rising note is
        # not mistaken for an unsteady one.
        "detrended_std": _std(detrended),
        "zero_crossing_rate": _zero_crossing_rate(detrended),
        "cents_range": max(cents_sequence) - min(cents_sequence) if cents_sequence else 0.0,
        "pitch_variance": _std(frequencies),
        "note_duration": duration,
        "voiced_frames": len(pitch_points),
    }


def _stability_score(features: dict) -> int:
    """How steady the note was, independent of which label it earned."""
    cents_std = features["cents_std"]
    drift = features["drift"]
    return max(0, min(100, round(100 - min(70, cents_std * 1.2) - min(25, abs(drift) * 0.25))))


def _insufficient_data() -> dict:
    return {
        "stability": 0,
        "stability_label": "off_pitch",
        "stability_confidence": 0.55,
        "ai_feedback": "Not enough stable voiced frames were detected. Hold the note longer and sing a little closer to the mic.",
        "model_source": "insufficient_data",
    }


def _heuristic_stability(features: dict) -> dict:
    absolute_average = features["absolute_average_cents"]
    cents_std = features["cents_std"]
    step_change = features["average_step_change"]
    drift = features["drift"]

    if absolute_average > 95:
        label = "off_pitch"
        confidence = min(0.96, 0.58 + absolute_average / 260)
    elif drift > 28:
        label = "sharp_drift"
        confidence = min(0.94, 0.58 + abs(drift) / 120)
    elif drift < -28:
        label = "flat_drift"
        confidence = min(0.94, 0.58 + abs(drift) / 120)
    elif cents_std > 24 or step_change > 18:
        label = "shaky"
        confidence = min(0.92, 0.56 + cents_std / 80)
    else:
        label = "stable"
        confidence = max(0.72, 1 - cents_std / 80)

    return {
        "stability": _stability_score(features),
        "stability_label": label,
        "stability_confidence": round(confidence, 2),
        "ai_feedback": FEEDBACK[label],
        "model_source": "heuristic",
    }


def _trained_stability(features: dict) -> dict | None:
    prediction = predict_stability(features)
    if prediction is None:
        return None

    label = prediction["label"]
    return {
        "stability": _stability_score(features),
        "stability_label": label,
        "stability_confidence": round(prediction["confidence"], 2),
        "ai_feedback": FEEDBACK.get(label, FEEDBACK["stable"]),
        "model_source": prediction["model_source"],
        "label_probabilities": {
            name: round(value, 3) for name, value in prediction["probabilities"].items()
        },
    }


def analyze_stability(pitch_points: list[dict], target_frequency: float) -> dict:
    features = extract_stability_features(pitch_points, target_frequency)

    if features["voiced_frames"] < MIN_VOICED_FRAMES:
        prediction = _insufficient_data()
    else:
        prediction = _trained_stability(features) or _heuristic_stability(features)

    return {
        **prediction,
        "stability_features": {
            "average_cents": round(features["average_cents"], 2),
            "cents_std": round(features["cents_std"], 2),
            "drift": round(features["drift"], 2),
            "average_step_change": round(features["average_step_change"], 2),
            "voiced_frames": features["voiced_frames"],
        },
    }
