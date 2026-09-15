"""Train the vocal stability classifier and export it as plain weights.

scikit-learn is a training-time dependency only. The exported JSON carries
the standardizer and either logistic-regression coefficients or the decision
trees of a random forest, and `app.stability_model` runs inference on it with
NumPy alone, so the deployed API stays light.
"""

import argparse
import json
import warnings
from datetime import datetime, timezone
from pathlib import Path
import sys

import numpy as np

# scipy/sklearn version skew emits a harmless lbfgs option warning.
warnings.filterwarnings("ignore", message="Unknown solver options")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from training.dataset import FEATURE_NAMES, LABELS, build_dataset  # noqa: E402

DEFAULT_DATA = ROOT / "training" / "data" / "stability_dataset.csv"
DEFAULT_MODEL = ROOT / "app" / "models" / "stability_model.json"
DEFAULT_REPORT = ROOT / "training" / "data" / "stability_report.json"


def load_dataset(path: Path) -> tuple[np.ndarray, np.ndarray]:
    import csv

    features: list[list[float]] = []
    labels: list[str] = []
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            features.append([float(row[name]) for name in FEATURE_NAMES])
            labels.append(row["label"])
    return np.array(features), np.array(labels)


def _export_logistic_regression(pipeline) -> dict:
    scaler = pipeline.named_steps["scaler"]
    model = pipeline.named_steps["model"]
    return {
        "model_type": "logistic_regression",
        "standardizer": {
            "mean": scaler.mean_.tolist(),
            "scale": scaler.scale_.tolist(),
        },
        "coefficients": model.coef_.tolist(),
        "intercepts": model.intercept_.tolist(),
        # Rows of coef_ follow the estimator's own class order, NOT any
        # canonical order of ours. Exporting anything else silently permutes
        # every prediction.
        "labels": model.classes_.tolist(),
    }


def _export_forest(model) -> dict:
    trees = []
    for estimator in model.estimators_:
        tree = estimator.tree_
        # Leaf rows hold class counts; normalise them to probabilities so the
        # runtime can average trees without knowing sample weights.
        values = tree.value.reshape(tree.value.shape[0], -1)
        totals = values.sum(axis=1, keepdims=True)
        probabilities = np.divide(values, totals, out=np.zeros_like(values), where=totals > 0)
        trees.append(
            {
                "children_left": tree.children_left.tolist(),
                "children_right": tree.children_right.tolist(),
                "feature": tree.feature.tolist(),
                "threshold": tree.threshold.tolist(),
                "value": probabilities.tolist(),
            }
        )
    return {"model_type": "random_forest", "trees": trees, "labels": model.classes_.tolist()}


def _verify_export(export: dict, test_features: np.ndarray, expected_labels) -> None:
    """Score the test set through the runtime path and demand exact agreement."""
    import os
    import tempfile

    from app.stability_model import predict as runtime_predict

    handle = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
    try:
        json.dump(export, handle)
        handle.close()

        mismatches = 0
        for row, expected in zip(test_features, expected_labels):
            features = {name: float(value) for name, value in zip(FEATURE_NAMES, row)}
            result = runtime_predict(features, model_path=handle.name)
            if result is None or result["label"] != expected:
                mismatches += 1
    finally:
        os.unlink(handle.name)

    if mismatches:
        raise SystemExit(
            f"Export verification FAILED: the exported weights disagree with the fitted "
            f"model on {mismatches}/{len(expected_labels)} test rows. Refusing to write."
        )
    print(f"Export verified: runtime matches sklearn on all {len(expected_labels)} test rows.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the vocal stability classifier.")
    parser.add_argument("--samples", type=int, default=2500, help="Clips to synthesize when regenerating data.")
    parser.add_argument("--seed", type=int, default=20260914)
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--model-output", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--report-output", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--regenerate", action="store_true", help="Rebuild the dataset before training.")
    arguments = parser.parse_args()

    from sklearn.ensemble import RandomForestClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
    from sklearn.model_selection import cross_val_score, train_test_split
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler

    if arguments.regenerate or not arguments.data.exists():
        print(f"Generating {arguments.samples} labelled clips (seed {arguments.seed})...")
        summary = build_dataset(arguments.samples, arguments.seed, arguments.data)
        print(f"Wrote {summary['written']} rows (skipped {summary['skipped']}).")

    features, labels = load_dataset(arguments.data)
    print(f"Loaded {len(labels)} examples with {features.shape[1]} features.")

    train_features, test_features, train_labels, test_labels = train_test_split(
        features, labels, test_size=0.25, random_state=arguments.seed, stratify=labels
    )

    linear = Pipeline(
        [
            ("scaler", StandardScaler()),
            ("model", LogisticRegression(max_iter=2000, C=1.0)),
        ]
    )
    forest = RandomForestClassifier(
        n_estimators=60, max_depth=8, min_samples_leaf=4, random_state=arguments.seed
    )

    candidates = {"logistic_regression": linear, "random_forest": forest}
    scores = {}
    for name, estimator in candidates.items():
        estimator.fit(train_features, train_labels)
        accuracy = accuracy_score(test_labels, estimator.predict(test_features))
        cross_validated = cross_val_score(estimator, train_features, train_labels, cv=5).mean()
        scores[name] = {"test_accuracy": accuracy, "cv_accuracy": float(cross_validated)}
        print(f"{name}: test accuracy {accuracy:.4f}, 5-fold CV {cross_validated:.4f}")

    # Prefer the linear model for its tiny export unless the forest is clearly
    # better; a few tenths of a point is not worth 60 serialized trees.
    best_name = "logistic_regression"
    if scores["random_forest"]["test_accuracy"] > scores["logistic_regression"]["test_accuracy"] + 0.02:
        best_name = "random_forest"
    best = candidates[best_name]
    print(f"Selected {best_name}.")

    predictions = best.predict(test_features)
    label_order = sorted(set(labels.tolist()), key=LABELS.index)
    report = classification_report(test_labels, predictions, output_dict=True, zero_division=0)
    matrix = confusion_matrix(test_labels, predictions, labels=label_order).tolist()

    print()
    print(classification_report(test_labels, predictions, zero_division=0))
    print("Confusion matrix (rows = actual, columns = predicted):")
    print("      " + "  ".join(f"{name[:9]:>9}" for name in label_order))
    for name, row in zip(label_order, matrix):
        print(f"{name[:11]:>11} " + "  ".join(f"{count:>9}" for count in row))

    if best_name == "logistic_regression":
        export = _export_logistic_regression(best)
    else:
        export = _export_forest(best)

    export.update(
        {
            "version": 1,
            "features": FEATURE_NAMES,
            "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "dataset": {"examples": int(len(labels)), "seed": arguments.seed},
            "metrics": {
                "test_accuracy": round(float(scores[best_name]["test_accuracy"]), 4),
                "cv_accuracy": round(float(scores[best_name]["cv_accuracy"]), 4),
                "per_label_f1": {
                    name: round(float(report[name]["f1-score"]), 4)
                    for name in label_order
                    if name in report
                },
            },
        }
    )

    # The exported weights are a hand-rolled serialization, so re-score the
    # test set through the runtime path and refuse to ship on any mismatch.
    # (This is what caught coef_ rows being paired with the wrong labels.)
    _verify_export(export, test_features, predictions)

    arguments.model_output.parent.mkdir(parents=True, exist_ok=True)
    arguments.model_output.write_text(json.dumps(export, indent=2), encoding="utf-8")
    print(f"\nWrote model to {arguments.model_output}")

    arguments.report_output.parent.mkdir(parents=True, exist_ok=True)
    arguments.report_output.write_text(
        json.dumps(
            {
                "selected_model": best_name,
                "candidates": scores,
                "labels": label_order,
                "classification_report": report,
                "confusion_matrix": matrix,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Wrote report to {arguments.report_output}")


if __name__ == "__main__":
    main()
