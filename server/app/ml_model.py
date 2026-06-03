import math

LABELS = ["stable", "shaky", "sharp_drift", "flat_drift", "off_pitch"]


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

    return {
        "cents_sequence": cents_sequence,
        "average_cents": _mean(cents_sequence),
        "absolute_average_cents": abs(_mean(cents_sequence)),
        "cents_std": _std(cents_sequence),
        "average_step_change": _mean(deltas),
        "drift": cents_sequence[-1] - cents_sequence[0] if len(cents_sequence) >= 2 else 0.0,
        "slope": _linear_slope(cents_sequence),
        "pitch_variance": _std(frequencies),
        "note_duration": duration,
        "voiced_frames": len(pitch_points),
    }


def _heuristic_stability(features: dict) -> dict:
    absolute_average = features["absolute_average_cents"]
    cents_std = features["cents_std"]
    step_change = features["average_step_change"]
    drift = features["drift"]

    if features["voiced_frames"] < 4:
        return {
            "stability": 0,
            "stability_label": "off_pitch",
            "stability_confidence": 0.55,
            "ai_feedback": "Not enough stable voiced frames were detected. Hold the note longer and sing a little closer to the mic.",
            "model_source": "heuristic",
        }

    if absolute_average > 95:
        label = "off_pitch"
        confidence = min(0.96, 0.58 + absolute_average / 260)
        feedback = "A pitch was detected, but it is far from the target note. Pick a closer harmonium key or adjust your starting pitch."
    elif drift > 28:
        label = "sharp_drift"
        confidence = min(0.94, 0.58 + abs(drift) / 120)
        feedback = "Your pitch started closer but drifted upward. Keep the note relaxed and avoid pushing higher near the end."
    elif drift < -28:
        label = "flat_drift"
        confidence = min(0.94, 0.58 + abs(drift) / 120)
        feedback = "Your pitch started closer but drifted downward. Support the note steadily so it does not sink near the end."
    elif cents_std > 24 or step_change > 18:
        label = "shaky"
        confidence = min(0.92, 0.56 + cents_std / 80)
        feedback = "You were near the note, but the pitch wobbled. Try holding the vowel with steadier breath support."
    else:
        label = "stable"
        confidence = max(0.72, 1 - cents_std / 80)
        feedback = "Your pitch was stable for the held note. Keep using this level of steadiness while matching the harmonium."

    stability = max(0, min(100, round(100 - min(70, cents_std * 1.2) - min(25, abs(drift) * 0.25))))
    return {
        "stability": stability,
        "stability_label": label,
        "stability_confidence": round(confidence, 2),
        "ai_feedback": feedback,
        "model_source": "heuristic",
    }


def analyze_stability(pitch_points: list[dict], target_frequency: float) -> dict:
    features = extract_stability_features(pitch_points, target_frequency)
    prediction = _heuristic_stability(features)

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
