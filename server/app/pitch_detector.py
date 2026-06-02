import math
import wave
from pathlib import Path

MIN_VOICE_FREQUENCY = 75.0
MAX_VOICE_FREQUENCY = 1100.0
TARGET_SAMPLE_RATE = 16000


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


def _resample_linear(samples: list[float], sample_rate: int, target_rate: int = TARGET_SAMPLE_RATE) -> tuple[list[float], int]:
    if sample_rate == target_rate or not samples:
        return samples, sample_rate

    duration = len(samples) / sample_rate
    output_length = max(1, int(duration * target_rate))
    ratio = sample_rate / target_rate
    resampled: list[float] = []

    for output_index in range(output_length):
        source_position = output_index * ratio
        source_index = int(source_position)
        fraction = source_position - source_index

        if source_index >= len(samples) - 1:
            resampled.append(samples[-1])
            continue

        current = samples[source_index]
        next_sample = samples[source_index + 1]
        resampled.append(current + (next_sample - current) * fraction)

    return resampled, target_rate


def _rms(frame: list[float]) -> float:
    if not frame:
        return 0.0
    return math.sqrt(sum(sample * sample for sample in frame) / len(frame))


def _median(values: list[float]) -> float:
    ordered = sorted(values)
    midpoint = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[midpoint]
    return (ordered[midpoint - 1] + ordered[midpoint]) / 2


def _percentile(values: list[float], percentile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * percentile)))
    return ordered[index]


def _preprocess_frame(frame: list[float]) -> list[float]:
    mean = sum(frame) / len(frame)
    centered = [sample - mean for sample in frame]
    # Hann window reduces edge artifacts that otherwise create octave errors.
    return [
        sample * (0.5 - 0.5 * math.cos((2 * math.pi * index) / (len(centered) - 1)))
        for index, sample in enumerate(centered)
    ]


def _parabolic_lag(cmnd: list[float], lag: int) -> float:
    if lag <= 1 or lag >= len(cmnd) - 1:
        return float(lag)

    previous_value = cmnd[lag - 1]
    current_value = cmnd[lag]
    next_value = cmnd[lag + 1]
    denominator = previous_value - 2 * current_value + next_value

    if abs(denominator) < 1e-12:
        return float(lag)

    adjustment = 0.5 * (previous_value - next_value) / denominator
    return lag + max(-0.5, min(0.5, adjustment))


def _estimate_frequency_yin(frame: list[float], sample_rate: int) -> tuple[float, float] | None:
    if _rms(frame) < 0.004:
        return None

    prepared = _preprocess_frame(frame)
    min_lag = max(2, int(sample_rate / MAX_VOICE_FREQUENCY))
    max_lag = min(len(prepared) - 2, int(sample_rate / MIN_VOICE_FREQUENCY))

    if max_lag <= min_lag:
        return None

    difference = [0.0] * (max_lag + 1)
    for lag in range(1, max_lag + 1):
        total = 0.0
        limit = len(prepared) - lag
        for index in range(limit):
            delta = prepared[index] - prepared[index + lag]
            total += delta * delta
        difference[lag] = total

    cumulative = 0.0
    cmnd = [1.0] * (max_lag + 1)
    for lag in range(1, max_lag + 1):
        cumulative += difference[lag]
        cmnd[lag] = difference[lag] * lag / cumulative if cumulative else 1.0

    threshold = 0.18
    selected_lag: int | None = None
    for lag in range(min_lag, max_lag):
        if cmnd[lag] < threshold:
            while lag + 1 < max_lag and cmnd[lag + 1] < cmnd[lag]:
                lag += 1
            selected_lag = lag
            break

    if selected_lag is None:
        search_range = range(min_lag, max_lag + 1)
        selected_lag = min(search_range, key=lambda candidate: cmnd[candidate])
        if cmnd[selected_lag] > 0.32:
            return None

    refined_lag = _parabolic_lag(cmnd, selected_lag)
    frequency = sample_rate / refined_lag
    confidence = max(0.0, min(1.0, 1.0 - cmnd[selected_lag]))

    return frequency, confidence


def _estimate_frequency_autocorrelation(frame: list[float], sample_rate: int) -> tuple[float, float] | None:
    if _rms(frame) < 0.003:
        return None

    prepared = _preprocess_frame(frame)
    energy = sum(sample * sample for sample in prepared)
    if energy <= 0:
        return None

    min_lag = max(2, int(sample_rate / MAX_VOICE_FREQUENCY))
    max_lag = min(len(prepared) // 2, int(sample_rate / MIN_VOICE_FREQUENCY))
    best_lag = 0
    best_score = 0.0

    for lag in range(min_lag, max_lag + 1):
        score = 0.0
        lagged_energy = 0.0
        for index in range(len(prepared) - lag):
            current = prepared[index]
            lagged = prepared[index + lag]
            score += current * lagged
            lagged_energy += lagged * lagged

        if lagged_energy <= 0:
            continue

        normalized = score / math.sqrt(energy * lagged_energy)
        if normalized > best_score:
            best_score = normalized
            best_lag = lag

    if best_lag == 0 or best_score < 0.18:
        return None

    return sample_rate / best_lag, min(0.67, max(0.25, best_score))


def _build_frames(samples: list[float], sample_rate: int) -> tuple[list[tuple[float, list[float]]], list[float]]:
    frame_length = min(4096, max(1024, int(sample_rate * 0.11)))
    hop_length = max(256, int(sample_rate * 0.02))
    frames: list[tuple[float, list[float]]] = []
    rms_values: list[float] = []

    for start in range(0, max(0, len(samples) - frame_length + 1), hop_length):
        frame = samples[start : start + frame_length]
        frame_rms = _rms(frame)
        frames.append((start / sample_rate, frame))
        rms_values.append(frame_rms)

    return frames, rms_values


def detect_pitch_points(file_path: Path) -> dict:
    samples, sample_rate = _read_wav_mono(file_path)
    samples, sample_rate = _resample_linear(samples, sample_rate)

    if len(samples) < int(sample_rate * 0.25):
        raise ValueError("Recording is too short. Hold one note for at least one second.")

    frames, rms_values = _build_frames(samples, sample_rate)
    if not frames:
        raise ValueError("Uploaded audio was too short to analyze.")

    noise_floor = _percentile(rms_values, 0.2)
    typical_level = _percentile(rms_values, 0.55)
    # If the whole clip is voiced, low-percentile RMS is still high. Cap the
    # gate below the typical level so a steady held note does not reject itself.
    active_floor = max(0.004, min(typical_level * 0.55, noise_floor * 2.2))

    pitch_points: list[dict] = []
    for time, frame in frames:
        frame_rms = _rms(frame)
        if frame_rms < active_floor:
            continue

        estimate = _estimate_frequency_yin(frame, sample_rate)
        if estimate is None:
            estimate = _estimate_frequency_autocorrelation(frame, sample_rate)
        if estimate is None:
            continue

        frequency, confidence = estimate
        pitch_points.append(
            {
                "time": time,
                "frequency": frequency,
                "confidence": round(confidence, 3),
            }
        )

    if not pitch_points:
        raise ValueError("No stable sung pitch was detected. Try a louder, clearer held note.")

    confident_points = [point for point in pitch_points if point["confidence"] >= 0.68]
    if len(confident_points) >= max(3, len(pitch_points) // 3):
        pitch_points = confident_points

    frequencies = [point["frequency"] for point in pitch_points]
    median_frequency = _median(frequencies)
    stable_points = [
        point
        for point in pitch_points
        if abs(1200 * math.log2(point["frequency"] / median_frequency)) <= 260
    ]

    if len(stable_points) >= 3:
        pitch_points = stable_points

    weighted_total = sum(point["frequency"] * point["confidence"] for point in pitch_points)
    confidence_total = sum(point["confidence"] for point in pitch_points)
    average_frequency = weighted_total / confidence_total if confidence_total else _median(frequencies)

    return {
        "average_frequency": average_frequency,
        "analysis_status": "pitch_detected",
        "duration": len(samples) / sample_rate,
        "voiced_frame_count": len(pitch_points),
        "pitch_points": pitch_points,
    }
