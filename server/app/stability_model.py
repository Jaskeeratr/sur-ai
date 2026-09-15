"""Runtime inference for the trained vocal stability classifier.

Loads the weights exported by `training/train_stability.py` and scores them
with NumPy, so the API needs no scikit-learn at runtime. If the model file is
missing or malformed, `predict` returns None and the caller falls back to the
heuristic classifier.
"""

import json
from functools import lru_cache
from pathlib import Path

import numpy as np

MODEL_PATH = Path(__file__).resolve().parent / "models" / "stability_model.json"


@lru_cache(maxsize=1)
def load_model(path: str | None = None) -> dict | None:
    model_path = Path(path) if path else MODEL_PATH
    try:
        model = json.loads(model_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None

    if not model.get("features") or not model.get("labels"):
        return None
    if model.get("model_type") not in {"logistic_regression", "random_forest"}:
        return None
    return model


def _softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - logits.max()
    exponentiated = np.exp(shifted)
    return exponentiated / exponentiated.sum()


def _predict_logistic(model: dict, vector: np.ndarray) -> np.ndarray:
    mean = np.asarray(model["standardizer"]["mean"], dtype=float)
    scale = np.asarray(model["standardizer"]["scale"], dtype=float)
    scale = np.where(scale == 0, 1.0, scale)
    standardized = (vector - mean) / scale

    coefficients = np.asarray(model["coefficients"], dtype=float)
    intercepts = np.asarray(model["intercepts"], dtype=float)
    logits = coefficients @ standardized + intercepts

    # Binary logistic regression stores a single row; expand it to two logits.
    if logits.size == 1:
        logits = np.array([-logits[0], logits[0]])
    return _softmax(logits)


def _predict_tree(tree: dict, vector: np.ndarray) -> np.ndarray:
    children_left = tree["children_left"]
    children_right = tree["children_right"]
    feature = tree["feature"]
    threshold = tree["threshold"]

    node = 0
    while children_left[node] != children_right[node]:
        if vector[feature[node]] <= threshold[node]:
            node = children_left[node]
        else:
            node = children_right[node]
    return np.asarray(tree["value"][node], dtype=float)


def _predict_forest(model: dict, vector: np.ndarray) -> np.ndarray:
    trees = model["trees"]
    totals = np.zeros(len(model["labels"]), dtype=float)
    for tree in trees:
        totals += _predict_tree(tree, vector)
    return totals / len(trees)


def predict(features: dict, model_path: str | None = None) -> dict | None:
    """Return {label, confidence, probabilities, model_source} or None."""
    model = load_model(model_path)
    if model is None:
        return None

    try:
        vector = np.array([float(features[name]) for name in model["features"]], dtype=float)
    except (KeyError, TypeError, ValueError):
        return None

    if not np.all(np.isfinite(vector)):
        return None

    try:
        if model["model_type"] == "logistic_regression":
            probabilities = _predict_logistic(model, vector)
        else:
            probabilities = _predict_forest(model, vector)
    except (ValueError, IndexError):
        return None

    labels = model["labels"]
    if probabilities.size != len(labels):
        return None

    best = int(np.argmax(probabilities))
    return {
        "label": labels[best],
        "confidence": float(probabilities[best]),
        "probabilities": {label: float(value) for label, value in zip(labels, probabilities)},
        "model_source": f"trained:{model['model_type']}",
    }
