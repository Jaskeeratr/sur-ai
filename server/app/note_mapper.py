import math

NOTE_FREQUENCIES = {
    "C4": 261.63,
    "D4": 293.66,
    "E4": 329.63,
    "F4": 349.23,
    "G4": 392.00,
    "A4": 440.00,
    "B4": 493.88,
    "C5": 523.25,
}

SARGAM_LABELS = {
    "C4": "Sa",
    "D4": "Re",
    "E4": "Ga",
    "F4": "Ma",
    "G4": "Pa",
    "A4": "Dha",
    "B4": "Ni",
    "C5": "Sa",
}


def get_target_frequency(note: str) -> float:
    normalized = note.strip().upper()
    if normalized not in NOTE_FREQUENCIES:
        supported = ", ".join(NOTE_FREQUENCIES)
        raise ValueError(f"Unsupported target note '{note}'. Supported notes: {supported}.")
    return NOTE_FREQUENCIES[normalized]


def frequency_to_note(frequency: float) -> str | None:
    if frequency <= 0 or math.isnan(frequency):
        return None

    return min(
        NOTE_FREQUENCIES,
        key=lambda note: abs(1200 * math.log2(frequency / NOTE_FREQUENCIES[note])),
    )


def cents_between(detected_frequency: float, target_frequency: float) -> float:
    return 1200 * math.log2(detected_frequency / target_frequency)

