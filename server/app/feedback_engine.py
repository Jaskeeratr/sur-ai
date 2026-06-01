from app.note_mapper import cents_between


def classify_cents(cents_off: float) -> str:
    if abs(cents_off) <= 10:
        return "excellent"
    if abs(cents_off) <= 25:
        return "on_pitch"
    if cents_off > 25:
        return "sharp"
    return "flat"


def calculate_accuracy(cents_off: float) -> int:
    return max(0, min(100, round(100 - abs(cents_off) * 0.9)))


def build_feedback(status: str) -> str:
    messages = {
        "excellent": "Great pitch. You were very close to the target note.",
        "on_pitch": "Good pitch. You were close, with a small adjustment needed.",
        "sharp": "You were sharp. Relax the pitch slightly and aim lower.",
        "flat": "You were flat. Lift the pitch slightly and aim higher.",
    }
    return messages[status]


def compare_pitch(average_frequency: float, target_frequency: float) -> dict:
    cents_off = cents_between(average_frequency, target_frequency)
    status = classify_cents(cents_off)

    return {
        "cents_off": round(cents_off, 2),
        "status": status,
        "accuracy": calculate_accuracy(cents_off),
        "feedback": build_feedback(status),
    }

