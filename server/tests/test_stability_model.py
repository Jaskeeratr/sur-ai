import json
import math

import pytest

from app.ml_model import analyze_stability, extract_stability_features
from app.stability_model import MODEL_PATH, load_model, predict


def contour(cents_offsets: list[float], target_frequency: float = 220.0, hop: float = 0.03) -> list[dict]:
    """Build pitch points that sit at the requested cents offsets from target."""
    return [
        {
            "time": index * hop,
            "frequency": target_frequency * (2 ** (offset / 1200)),
            "confidence": 0.9,
        }
        for index, offset in enumerate(cents_offsets)
    ]


def test_shipped_model_is_present_and_well_formed():
    model = load_model()

    assert model is not None, "The trained stability model should ship with the app."
    assert model["model_type"] in {"logistic_regression", "random_forest"}
    assert len(model["features"]) >= 8
    assert set(model["labels"]) == {"stable", "shaky", "sharp_drift", "flat_drift", "off_pitch"}
    assert model["metrics"]["test_accuracy"] > 0.7


def test_predict_returns_normalized_probabilities():
    features = extract_stability_features(contour([2.0] * 40), 220.0)
    prediction = predict(features)

    assert prediction is not None
    assert prediction["label"] in {"stable", "shaky", "sharp_drift", "flat_drift", "off_pitch"}
    assert 0.0 <= prediction["confidence"] <= 1.0
    assert math.isclose(sum(prediction["probabilities"].values()), 1.0, abs_tol=1e-6)
    assert prediction["model_source"].startswith("trained:")


def test_predict_returns_none_for_missing_features():
    assert predict({"average_cents": 0.0}) is None


def test_predict_returns_none_when_model_file_is_unreadable(tmp_path):
    missing = tmp_path / "nope.json"
    features = extract_stability_features(contour([0.0] * 30), 220.0)

    assert predict(features, model_path=str(missing)) is None


def test_predict_returns_none_for_malformed_model(tmp_path):
    broken = tmp_path / "broken.json"
    broken.write_text(json.dumps({"model_type": "logistic_regression"}), encoding="utf-8")
    features = extract_stability_features(contour([0.0] * 30), 220.0)

    assert predict(features, model_path=str(broken)) is None


def test_analyze_stability_uses_the_trained_model():
    result = analyze_stability(contour([1.0, -2.0, 0.5, 1.5, -1.0] * 8), 220.0)

    assert result["model_source"].startswith("trained:")
    assert "label_probabilities" in result
    assert result["stability"] > 70


def test_analyze_stability_falls_back_when_frames_are_too_few():
    result = analyze_stability(contour([0.0, 1.0]), 220.0)

    assert result["model_source"] == "insufficient_data"
    assert result["stability"] == 0


@pytest.mark.parametrize(
    "offsets, expected",
    [
        ([0.0, 3.0, -2.0, 1.0] * 8, "stable"),
        ([index * 3.0 for index in range(30)], "sharp_drift"),
        ([-index * 3.0 for index in range(30)], "flat_drift"),
        ([220.0 + (index % 3) for index in range(30)], "off_pitch"),
    ],
)
def test_trained_model_labels_clear_cases(offsets, expected):
    result = analyze_stability(contour(offsets), 220.0)

    assert result["stability_label"] == expected


def test_detrended_features_separate_wobble_from_drift():
    # A clean upward ramp has a large cents_std but almost no wobble once the
    # linear trend is removed, which is what lets the model tell them apart.
    ramp = extract_stability_features(contour([index * 4.0 for index in range(30)]), 220.0)
    wobble = extract_stability_features(contour([40.0 * (index % 2) for index in range(30)]), 220.0)

    assert ramp["cents_std"] > 20
    assert ramp["detrended_std"] < 2
    assert wobble["detrended_std"] > 15
    assert wobble["zero_crossing_rate"] > 0.5


def test_model_file_lives_where_the_runtime_expects_it():
    assert MODEL_PATH.exists()
