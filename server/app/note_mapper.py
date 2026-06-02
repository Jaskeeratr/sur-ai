import math

_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def _frequency_for(note_name: str, octave: int) -> float:
    semitone_index = _NOTE_NAMES.index(note_name)
    midi_number = (octave + 1) * 12 + semitone_index
    return round(440.0 * (2 ** ((midi_number - 69) / 12)), 2)


NOTE_FREQUENCIES = {
    f"{note_name}{octave}": _frequency_for(note_name, octave)
    for octave in range(3, 7)
    for note_name in _NOTE_NAMES
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
    normalized = note.strip().upper().replace("♯", "#")
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
