import math

import pytest

from app.note_mapper import (
    NOTE_FREQUENCIES,
    cents_between,
    frequency_to_note,
    get_target_frequency,
    nearest_note_match,
)


def test_standard_a4_frequency_is_440():
    assert get_target_frequency("A4") == 440.0


def test_mens_sa_c_sharp_3_frequency_is_supported():
    assert get_target_frequency("c#3") == 138.59


def test_unicode_sharp_is_normalized():
    assert get_target_frequency("C\u266f3") == 138.59


def test_invalid_target_note_lists_supported_notes():
    with pytest.raises(ValueError, match="Unsupported target note"):
        get_target_frequency("H2")


def test_frequency_to_note_returns_none_for_invalid_frequency():
    assert frequency_to_note(0) is None
    assert frequency_to_note(float("nan")) is None


def test_frequency_to_note_uses_nearest_chromatic_note():
    midpoint = math.sqrt(NOTE_FREQUENCIES["A4"] * NOTE_FREQUENCIES["A#4"])
    assert frequency_to_note(midpoint * 0.999) == "A4"
    assert frequency_to_note(midpoint * 1.001) == "A#4"


def test_cents_between_octave_and_unison():
    assert cents_between(440.0, 440.0) == pytest.approx(0.0)
    assert cents_between(880.0, 440.0) == pytest.approx(1200.0)


def test_nearest_note_match_includes_cents_and_frequency():
    match = nearest_note_match(441.0)
    assert match["note"] == "A4"
    assert match["frequency"] == 440.0
    assert match["cents_from_note"] == pytest.approx(3.93, abs=0.01)
