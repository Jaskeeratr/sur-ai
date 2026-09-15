"""Synthesize labeled vocal recordings for stability model training.

The labels come from the *generating parameters* of each clip (how far off
centre it is sung, how much it drifts, how much it wobbles). The model never
sees those parameters: every clip is rendered to audio, pushed through the
same `detect_pitch_points` the API uses, and described with the same
`extract_stability_features`. So the learning problem is recovering the
latent singing regime from a noisy measured contour, including whatever
dropouts and estimation error the detector introduces.
"""

import argparse
import csv
import math
import tempfile
import wave
from pathlib import Path
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.ml_model import extract_stability_features  # noqa: E402
from app.note_mapper import NOTE_FREQUENCIES  # noqa: E402
from app.pitch_detector import detect_pitch_points  # noqa: E402

SAMPLE_RATE = 16000
LABELS = ["stable", "shaky", "sharp_drift", "flat_drift", "off_pitch"]

# Feature columns fed to the classifier, in a fixed order that the exported
# model and the runtime both rely on.
FEATURE_NAMES = [
    "absolute_average_cents",
    "average_cents",
    "cents_std",
    "average_step_change",
    "drift",
    "slope",
    "detrended_std",
    "zero_crossing_rate",
    "cents_range",
    "note_duration",
    "voiced_frames",
]

# Practice range: the harmonium keys the app actually exposes.
TRAINING_NOTES = [
    note
    for note in NOTE_FREQUENCIES
    if note[-1] in {"3", "4", "5"} and NOTE_FREQUENCIES[note] <= 900
]


# Thresholds in *parameter* space that define the ground-truth labels. The
# model never sees these numbers, and because parameters are sampled
# continuously across the whole range, plenty of clips land near a boundary
# and are genuinely ambiguous once measurement noise is added.
OFF_PITCH_CENTS = 90.0
DRIFT_CENTS = 32.0
VIBRATO_CENTS = 22.0
JITTER_CENTS = 15.0


def _sample_parameters(rng: np.random.Generator) -> dict:
    """Draw singing parameters from a continuous, unlabelled distribution."""
    # Mixtures keep most clips in the realistic near-the-note range while
    # still covering badly missed notes and heavy drift.
    if rng.random() < 0.7:
        center_error = float(rng.uniform(-95, 95))
    else:
        center_error = float(rng.uniform(-340, 340))

    if rng.random() < 0.65:
        drift_total = float(rng.uniform(-45, 45))
    else:
        drift_total = float(rng.uniform(-140, 140))

    return {
        "center_error": center_error,
        "drift_total": drift_total,
        "vibrato_depth": float(rng.uniform(0, 34) if rng.random() < 0.6 else rng.uniform(0, 80)),
        "vibrato_rate": float(rng.uniform(4.0, 7.5)),
        "jitter": float(rng.uniform(1.0, 20.0) if rng.random() < 0.6 else rng.uniform(1.0, 40.0)),
    }


def label_for(parameters: dict) -> str:
    """Ground-truth label implied by how the clip was actually sung."""
    if abs(parameters["center_error"]) > OFF_PITCH_CENTS:
        return "off_pitch"
    if parameters["drift_total"] > DRIFT_CENTS:
        return "sharp_drift"
    if parameters["drift_total"] < -DRIFT_CENTS:
        return "flat_drift"
    if parameters["vibrato_depth"] > VIBRATO_CENTS or parameters["jitter"] > JITTER_CENTS:
        return "shaky"
    return "stable"


def render_clip(
    target_frequency: float,
    duration: float,
    parameters: dict,
    noise_level: float,
    amplitude: float,
    rng: np.random.Generator,
) -> np.ndarray:
    """Render a voice-like tone whose pitch follows the requested contour."""
    sample_count = int(duration * SAMPLE_RATE)
    time = np.arange(sample_count) / SAMPLE_RATE

    # Centre the drift on the clip so the mean offset stays at center_error.
    drift = parameters["drift_total"] * (time / duration - 0.5)
    vibrato = parameters["vibrato_depth"] * np.sin(
        2 * np.pi * parameters["vibrato_rate"] * time + rng.uniform(0, 2 * np.pi)
    )

    # Jitter is generated at a low control rate and interpolated, which looks
    # far more like real pitch instability than per-sample white noise.
    control_rate = 45
    control_points = max(2, int(duration * control_rate))
    jitter_control = rng.normal(0.0, parameters["jitter"], control_points)
    jitter = np.interp(
        np.linspace(0, control_points - 1, sample_count),
        np.arange(control_points),
        jitter_control,
    )

    cents = parameters["center_error"] + drift + vibrato + jitter
    frequency = target_frequency * (2 ** (cents / 1200))

    phase = np.cumsum(2 * np.pi * frequency / SAMPLE_RATE)
    signal = np.sin(phase) + 0.45 * np.sin(2 * phase) + 0.22 * np.sin(3 * phase)
    signal += 0.1 * np.sin(4 * phase)

    # Soft attack and release so frames at the edges behave like real singing.
    envelope = np.ones(sample_count)
    ramp = max(1, int(0.06 * SAMPLE_RATE))
    envelope[:ramp] = np.linspace(0, 1, ramp)
    envelope[-ramp:] = np.linspace(1, 0, ramp)

    signal = signal / np.max(np.abs(signal)) * amplitude * envelope
    signal += rng.normal(0.0, noise_level, sample_count)

    return np.clip(signal, -1.0, 1.0)


def write_wav(path: Path, samples: np.ndarray) -> None:
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(SAMPLE_RATE)
        wav_file.writeframes((samples * 32767).astype("<i2").tobytes())


def build_example(rng: np.random.Generator, parameters: dict, label: str, temp_dir: Path) -> dict | None:
    """Render one clip, measure it with the real detector, return its features."""
    note = TRAINING_NOTES[int(rng.integers(len(TRAINING_NOTES)))]
    target_frequency = NOTE_FREQUENCIES[note]
    duration = float(rng.uniform(1.6, 4.0))
    samples = render_clip(
        target_frequency,
        duration,
        parameters,
        noise_level=float(rng.uniform(0.0, 0.02)),
        amplitude=float(rng.uniform(0.22, 0.55)),
        rng=rng,
    )

    path = temp_dir / "clip.wav"
    write_wav(path, samples)

    try:
        detection = detect_pitch_points(path)
    except ValueError:
        return None

    features = extract_stability_features(detection["pitch_points"], target_frequency)
    row = {name: features[name] for name in FEATURE_NAMES}
    row["label"] = label
    row["target_note"] = note
    return row


def build_dataset(sample_count: int, seed: int, output_path: Path) -> dict:
    """Rejection-sample continuous parameters into a class-balanced dataset."""
    rng = np.random.default_rng(seed)
    rows: list[dict] = []
    skipped = 0
    per_label = max(1, sample_count // len(LABELS))
    counts = {label: 0 for label in LABELS}
    attempts = 0
    max_attempts = sample_count * 60

    with tempfile.TemporaryDirectory() as temp_name:
        temp_dir = Path(temp_name)
        while sum(counts.values()) < per_label * len(LABELS) and attempts < max_attempts:
            attempts += 1
            parameters = _sample_parameters(rng)
            label = label_for(parameters)
            if counts[label] >= per_label:
                continue

            row = build_example(rng, parameters, label, temp_dir)
            if row is None:
                skipped += 1
                continue

            counts[label] += 1
            rows.append(row)
            if len(rows) % 250 == 0:
                print(f"  generated {len(rows)}/{per_label * len(LABELS)}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=[*FEATURE_NAMES, "label", "target_note"])
        writer.writeheader()
        writer.writerows(rows)

    return {"written": len(rows), "skipped": skipped, "path": str(output_path), "counts": counts}


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the stability training dataset.")
    parser.add_argument("--samples", type=int, default=2500)
    parser.add_argument("--seed", type=int, default=20260914)
    parser.add_argument("--output", type=Path, default=ROOT / "training" / "data" / "stability_dataset.csv")
    arguments = parser.parse_args()

    print(f"Generating {arguments.samples} labelled clips (seed {arguments.seed})...")
    summary = build_dataset(arguments.samples, arguments.seed, arguments.output)
    print(f"Wrote {summary['written']} rows to {summary['path']} (skipped {summary['skipped']} undetectable clips).")


if __name__ == "__main__":
    main()
