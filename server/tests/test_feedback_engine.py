import pytest

from app.feedback_engine import calculate_accuracy, classify_cents, compare_pitch


@pytest.mark.parametrize(
    ("cents", "expected"),
    [
        (-10, "excellent"),
        (0, "excellent"),
        (10, "excellent"),
        (10.1, "on_pitch"),
        (-10.1, "on_pitch"),
        (25, "on_pitch"),
        (-25, "on_pitch"),
        (25.1, "sharp"),
        (-25.1, "flat"),
        (100.1, "too_sharp"),
        (-100.1, "too_flat"),
    ],
)
def test_classify_cents_thresholds(cents, expected):
    assert classify_cents(cents) == expected


def test_accuracy_is_100_at_exact_pitch():
    assert calculate_accuracy(0) == 100


def test_accuracy_scales_down_with_cents_error():
    assert calculate_accuracy(50) == 55


def test_accuracy_never_goes_below_zero():
    assert calculate_accuracy(500) == 0


def test_compare_pitch_returns_visible_cents_when_close():
    result = compare_pitch(441.0, 440.0)
    assert result["comparison_available"] is True
    assert result["cents_off"] == pytest.approx(3.93, abs=0.01)
    assert result["status"] == "excellent"
    assert result["accuracy"] == 96


def test_compare_pitch_hides_cents_when_out_of_display_range():
    result = compare_pitch(493.88, 440.0)
    assert result["comparison_available"] is False
    assert result["cents_off"] is None
    assert result["raw_cents_off"] == pytest.approx(200.0, abs=0.05)
    assert result["status"] == "too_sharp"


def test_compare_pitch_detects_flat_pitch():
    result = compare_pitch(430.0, 440.0)
    assert result["status"] == "flat"
    assert result["cents_off"] < 0
    assert "flat" in result["feedback"].lower()
