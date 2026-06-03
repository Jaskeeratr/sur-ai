import argparse
import csv
import json
import math
import statistics
import tempfile
import time
import wave
from pathlib import Path

import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.note_mapper import NOTE_FREQUENCIES, cents_between, frequency_to_note
from app.pitch_detector import detect_pitch_points

DEFAULT_NOTES = [
    "C3",
    "C#3",
    "D3",
    "D#3",
    "E3",
    "F3",
    "F#3",
    "G3",
    "G#3",
    "A3",
    "A#3",
    "B3",
    "C4",
    "C#4",
    "D4",
    "D#4",
    "E4",
    "F4",
    "F#4",
    "G4",
    "G#4",
    "A4",
    "A#4",
    "B4",
]


def _detuned_frequency(base_frequency: float, cents: float) -> float:
    return base_frequency * (2 ** (cents / 1200))


def _sample_value(
    frequency: float,
    index: int,
    sample_rate: int,
    amplitude: float,
    noise: float,
) -> float:
    voice = amplitude * math.sin(2 * math.pi * frequency * index / sample_rate)
    harmonic = 0.035 * math.sin(2 * math.pi * frequency * 2 * index / sample_rate)
    deterministic_noise = noise * math.sin(2 * math.pi * 1277 * index / sample_rate)
    return max(-1.0, min(1.0, voice + harmonic + deterministic_noise))


def _write_wav(path: Path, frequency: float, seconds: float, sample_rate: int, noise: float) -> None:
    total_samples = int(seconds * sample_rate)
    fade_samples = max(1, int(sample_rate * 0.05))

    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        frames = bytearray()

        for index in range(total_samples):
            envelope = 1.0
            if index < fade_samples:
                envelope = index / fade_samples
            elif index > total_samples - fade_samples:
                envelope = (total_samples - index) / fade_samples

            value = envelope * _sample_value(frequency, index, sample_rate, 0.44, noise)
            frames.extend(int(value * 32767).to_bytes(2, "little", signed=True))

        wav_file.writeframes(bytes(frames))


def run_benchmark(
    seconds: float = 2.0,
    sample_rate: int = 16000,
    cents_offsets: tuple[int, ...] = (-8, 8),
    noise_levels: tuple[float, ...] = (0.0, 0.004),
) -> dict:
    rows = []

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        for note in DEFAULT_NOTES:
            for cents_offset in cents_offsets:
                for noise_level in noise_levels:
                    expected_frequency = _detuned_frequency(NOTE_FREQUENCIES[note], cents_offset)
                    wav_path = temp_path / f"{note.replace('#', 'sharp')}_{cents_offset}_{noise_level}.wav"
                    _write_wav(wav_path, expected_frequency, seconds, sample_rate, noise_level)

                    started = time.perf_counter()
                    try:
                        result = detect_pitch_points(wav_path)
                        latency_ms = (time.perf_counter() - started) * 1000
                        detected_frequency = result["average_frequency"]
                        detected_note = frequency_to_note(detected_frequency)
                        absolute_cents_error = abs(cents_between(detected_frequency, expected_frequency))
                        status = "ok"
                    except Exception as error:
                        latency_ms = (time.perf_counter() - started) * 1000
                        detected_frequency = None
                        detected_note = None
                        absolute_cents_error = None
                        status = f"failed: {error}"

                    rows.append(
                        {
                            "expected_note": note,
                            "expected_frequency": round(expected_frequency, 3),
                            "cents_offset": cents_offset,
                            "noise_level": noise_level,
                            "detected_note": detected_note,
                            "detected_frequency": round(detected_frequency, 3) if detected_frequency else None,
                            "absolute_cents_error": round(absolute_cents_error, 3)
                            if absolute_cents_error is not None
                            else None,
                            "latency_ms": round(latency_ms, 3),
                            "status": status,
                            "correct_note": detected_note == note,
                        }
                    )

    successful_rows = [row for row in rows if row["status"] == "ok"]
    correct_rows = [row for row in successful_rows if row["correct_note"]]
    cents_errors = [row["absolute_cents_error"] for row in successful_rows]
    latencies = [row["latency_ms"] for row in rows]

    summary = {
        "recording_count": len(rows),
        "successful_detections": len(successful_rows),
        "note_accuracy_percent": round((len(correct_rows) / len(rows)) * 100, 2) if rows else 0,
        "mean_absolute_cents_error": round(statistics.mean(cents_errors), 2) if cents_errors else None,
        "median_absolute_cents_error": round(statistics.median(cents_errors), 2) if cents_errors else None,
        "average_latency_ms": round(statistics.mean(latencies), 2) if latencies else None,
        "p95_latency_ms": round(
            statistics.quantiles(latencies, n=20, method="inclusive")[18], 2
        )
        if len(latencies) >= 20
        else None,
    }

    return {"summary": summary, "rows": rows}


def _write_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark SurSadhana pitch detection accuracy and latency.")
    parser.add_argument("--seconds", type=float, default=2.0)
    parser.add_argument("--sample-rate", type=int, default=16000)
    parser.add_argument(
        "--cents-offsets",
        default="-8,8",
        help="Comma-separated cents offsets to apply to each benchmark note.",
    )
    parser.add_argument(
        "--noise-levels",
        default="0,0.004",
        help="Comma-separated deterministic noise amplitudes to mix into each sample.",
    )
    parser.add_argument("--output-json", type=Path, default=None)
    parser.add_argument("--output-csv", type=Path, default=None)
    args = parser.parse_args()

    report = run_benchmark(
        seconds=args.seconds,
        sample_rate=args.sample_rate,
        cents_offsets=tuple(int(value) for value in args.cents_offsets.split(",") if value),
        noise_levels=tuple(float(value) for value in args.noise_levels.split(",") if value),
    )
    print(json.dumps(report["summary"], indent=2))

    if args.output_json:
        args.output_json.parent.mkdir(parents=True, exist_ok=True)
        args.output_json.write_text(json.dumps(report, indent=2), encoding="utf-8")

    if args.output_csv:
        args.output_csv.parent.mkdir(parents=True, exist_ok=True)
        _write_csv(args.output_csv, report["rows"])


if __name__ == "__main__":
    main()
