from app.note_mapper import cents_between

CENTS_DISPLAY_LIMIT = 100


def classify_cents(cents_off: float) -> str:
    if cents_off > CENTS_DISPLAY_LIMIT:
        return "too_sharp"
    if cents_off < -CENTS_DISPLAY_LIMIT:
        return "too_flat"
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
        "too_sharp": "A pitch was detected, but it is well above the selected target. Choose a closer target note or sing lower.",
        "too_flat": "A pitch was detected, but it is well below the selected target. Choose a closer target note or sing higher.",
    }
    return messages[status]


def compare_pitch(average_frequency: float, target_frequency: float) -> dict:
    cents_off = cents_between(average_frequency, target_frequency)
    status = classify_cents(cents_off)
    show_cents = abs(cents_off) <= CENTS_DISPLAY_LIMIT

    return {
        "cents_off": round(cents_off, 2) if show_cents else None,
        "raw_cents_off": round(cents_off, 2),
        "comparison_available": show_cents,
        "status": status,
        "accuracy": calculate_accuracy(cents_off),
        "feedback": build_feedback(status),
    }
