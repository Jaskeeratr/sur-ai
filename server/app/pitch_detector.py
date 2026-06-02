import math
import wave
from pathlib import Path


def _read_wav_mono(file_path: Path) -> tuple[list[float], int]:
    with wave.open(str(file_path), "rb") as wav_file:
        channels = wav_file.getnchannels()
        sample_width = wav_file.getsampwidth()
        sample_rate = wav_file.getframerate()
        frames = wav_file.readframes(wav_file.getnframes())

    if sample_width != 2:
        raise ValueError("Only 16-bit WAV recordings are supported.")

    samples: list[float] = []
    frame_size = sample_width * channels
    for offset in range(0, len(frames), frame_size):
        total = 0
        for channel in range(channels):
            start = offset + channel * sample_width
            total += int.from_bytes(frames[start : start + sample_width], "little", signed=True)
        samples.append((total / channels) / 32768.0)

    return samples, sample_rate


def _downsample(samples: list[float], sample_rate: int, target_rate: int = 11025) -> tuple[list[float], int]:
    if sample_rate <= target_rate:
        return samples, sample_rate

    step = max(1, round(sample_rate / target_rate))
    return samples[::step], round(sample_rate / step)


def _rms(frame: list[float]) -> float:
    if not frame:
        return 0.0
    return math.sqrt(sum(sample * sample for sample in frame) / len(frame))


def _estimate_frequency(frame: list[float], sample_rate: int) -> float | None:
    frame_rms = _rms(frame)
    if frame_rms < 0.008:
        return None

    mean = sum(frame) / len(frame)
    centered = [sample - mean for sample in frame]
    energy = sum(sample * sample for sample in centered)
    if energy <= 0:
        return None

    min_lag = max(1, int(sample_rate / 1046.5))  # C6
    max_lag = min(len(centered) // 2, int(sample_rate / 130.81))  # C3
    best_lag = 0
    best_score = 0.0

    for lag in range(min_lag, max_lag + 1):
        score = 0.0
        lagged_energy = 0.0
        limit = len(centered) - lag
        for index in range(limit):
            current = centered[index]
            lagged = centered[index + lag]
            score += current * lagged
            lagged_energy += lagged * lagged

        if lagged_energy <= 0:
            continue

        normalized = score / math.sqrt(energy * lagged_energy)
        if normalized > best_score:
            best_score = normalized
            best_lag = lag

    if best_lag == 0 or best_score < 0.32:
        return None

    return sample_rate / best_lag


def _median(values: list[float]) -> float:
    ordered = sorted(values)
    midpoint = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[midpoint]
    return (ordered[midpoint - 1] + ordered[midpoint]) / 2


def detect_pitch_points(file_path: Path) -> dict:
    samples, sample_rate = _read_wav_mono(file_path)
    samples, sample_rate = _downsample(samples, sample_rate)

    if not samples:
        raise ValueError("Uploaded audio did not contain readable samples.")

    frame_length = min(2048, max(512, int(sample_rate * 0.09)))
    hop_length = max(128, frame_length // 4)

    pitch_points: list[dict] = []
    for start in range(0, max(0, len(samples) - frame_length), hop_length):
        frame = samples[start : start + frame_length]
        frequency = _estimate_frequency(frame, sample_rate)
        if frequency is None:
            continue
        pitch_points.append({"time": start / sample_rate, "frequency": frequency})

    if not pitch_points:
        raise ValueError("No stable sung pitch was detected. Try recording a clearer held note.")

    frequencies = [point["frequency"] for point in pitch_points]
    median_frequency = _median(frequencies)
    stable_frequencies = [
        frequency
        for frequency in frequencies
        if abs(1200 * math.log2(frequency / median_frequency)) <= 160
    ]

    if not stable_frequencies:
        stable_frequencies = frequencies

    average_frequency = sum(stable_frequencies) / len(stable_frequencies)
    stable_points = [
        point
        for point in pitch_points
        if abs(1200 * math.log2(point["frequency"] / average_frequency)) <= 220
    ]

    return {
        "average_frequency": average_frequency,
        "pitch_points": stable_points,
    }
