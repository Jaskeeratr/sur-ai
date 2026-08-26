import math
import wave
from pathlib import Path

import numpy as np

MIN_VOICE_FREQUENCY = 65.0
MAX_VOICE_FREQUENCY = 1100.0
TARGET_SAMPLE_RATE = 8000


def _read_wav_mono(file_path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(file_path), "rb") as wav_file:
        channels = wav_file.getnchannels()
        sample_width = wav_file.getsampwidth()
        sample_rate = wav_file.getframerate()
        frames = wav_file.readframes(wav_file.getnframes())

    if sample_width != 2:
        raise ValueError("Only 16-bit WAV recordings are supported.")

    data = np.frombuffer(frames, dtype="<i2").astype(np.float64)
    if channels > 1:
        usable = (data.size // channels) * channels
        data = data[:usable].reshape(-1, channels).mean(axis=1)

    return data / 32768.0, sample_rate


def _resample_linear(samples, sample_rate: int, target_rate: int = TARGET_SAMPLE_RATE) -> tuple[np.ndarray, int]:
    samples = np.asarray(samples, dtype=np.float64)
    if sample_rate == target_rate or samples.size == 0:
        return samples, sample_rate

    duration = samples.size / sample_rate
    output_length = max(1, int(duration * target_rate))
    positions = np.arange(output_length) * (sample_rate / target_rate)
    resampled = np.interp(positions, np.arange(samples.size), samples)

    return resampled, target_rate


def _percentile(values: np.ndarray, percentile: float) -> float:
    if values.size == 0:
        return 0.0
    ordered = np.sort(values)
    index = min(values.size - 1, max(0, round((values.size - 1) * percentile)))
    return float(ordered[index])


def _autocorrelation_fft(prepared: np.ndarray, max_lag: int) -> np.ndarray:
    fft_size = 1 << (2 * prepared.size - 1).bit_length()
    spectrum = np.fft.rfft(prepared, fft_size)
    correlation = np.fft.irfft(spectrum * np.conj(spectrum))
    return correlation[: max_lag + 1]


def _difference_function(prepared: np.ndarray, max_lag: int) -> np.ndarray:
    # YIN difference d(tau) = sum_j (x[j] - x[j+tau])^2, computed via the
    # FFT autocorrelation identity so long frames stay fast.
    n = prepared.size
    correlation = _autocorrelation_fft(prepared, max_lag)
    squares = np.concatenate(([0.0], np.cumsum(prepared * prepared)))
    total = squares[n]
    lags = np.arange(max_lag + 1)
    difference = squares[n - lags] + (total - squares[lags]) - 2 * correlation
    difference[0] = 0.0
    return np.maximum(difference, 0.0)


def _cumulative_mean_normalized(difference: np.ndarray) -> np.ndarray:
    cmnd = np.ones_like(difference)
    cumulative = np.cumsum(difference[1:])
    lags = np.arange(1, difference.size)
    valid = cumulative > 0
    cmnd[1:][valid] = difference[1:][valid] * lags[valid] / cumulative[valid]
    return cmnd


def _parabolic_lag(cmnd: np.ndarray, lag: int) -> float:
    if lag <= 1 or lag >= cmnd.size - 1:
        return float(lag)

    previous_value = cmnd[lag - 1]
    current_value = cmnd[lag]
    next_value = cmnd[lag + 1]
    denominator = previous_value - 2 * current_value + next_value

    if abs(denominator) < 1e-12:
        return float(lag)

    adjustment = 0.5 * (previous_value - next_value) / denominator
    return lag + max(-0.5, min(0.5, adjustment))


def _prepare_frame(frame: np.ndarray, window: np.ndarray) -> np.ndarray:
    # Hann window reduces edge artifacts that otherwise create octave errors.
    return (frame - frame.mean()) * window


def _estimate_frequency_yin(frame: np.ndarray, sample_rate: int, window: np.ndarray) -> tuple[float, float] | None:
    if math.sqrt(float(np.mean(frame * frame))) < 0.004:
        return None

    prepared = _prepare_frame(frame, window)
    min_lag = max(2, int(sample_rate / MAX_VOICE_FREQUENCY))
    max_lag = min(prepared.size - 2, int(sample_rate / MIN_VOICE_FREQUENCY))

    if max_lag <= min_lag:
        return None

    difference = _difference_function(prepared, max_lag)
    cmnd = _cumulative_mean_normalized(difference)

    threshold = 0.18
    selected_lag: int | None = None
    below = np.nonzero(cmnd[min_lag:max_lag] < threshold)[0]
    if below.size:
        lag = min_lag + int(below[0])
        while lag + 1 < max_lag and cmnd[lag + 1] < cmnd[lag]:
            lag += 1
        selected_lag = lag

    if selected_lag is None:
        selected_lag = min_lag + int(np.argmin(cmnd[min_lag : max_lag + 1]))
        if cmnd[selected_lag] > 0.32:
            return None

    refined_lag = _parabolic_lag(cmnd, selected_lag)
    frequency = sample_rate / refined_lag
    confidence = max(0.0, min(1.0, 1.0 - float(cmnd[selected_lag])))

    return frequency, confidence


def _estimate_frequency_autocorrelation(frame: np.ndarray, sample_rate: int, window: np.ndarray) -> tuple[float, float] | None:
    if math.sqrt(float(np.mean(frame * frame))) < 0.003:
        return None

    prepared = _prepare_frame(frame, window)
    energy = float(np.sum(prepared * prepared))
    if energy <= 0:
        return None

    n = prepared.size
    min_lag = max(2, int(sample_rate / MAX_VOICE_FREQUENCY))
    max_lag = min(n // 2, int(sample_rate / MIN_VOICE_FREQUENCY))
    if max_lag < min_lag:
        return None

    correlation = _autocorrelation_fft(prepared, max_lag)
    squares = np.concatenate(([0.0], np.cumsum(prepared * prepared)))
    lags = np.arange(max_lag + 1)
    lagged_energy = squares[n] - squares[lags]

    with np.errstate(divide="ignore", invalid="ignore"):
        normalized = np.where(
            lagged_energy > 0,
            correlation / np.sqrt(energy * lagged_energy),
            0.0,
        )

    window_scores = normalized[min_lag : max_lag + 1]
    best_offset = int(np.argmax(window_scores))
    best_score = float(window_scores[best_offset])
    best_lag = min_lag + best_offset

    if best_score < 0.18:
        return None

    return sample_rate / best_lag, min(0.67, max(0.25, best_score))


def _build_frames(samples: np.ndarray, sample_rate: int) -> tuple[list[tuple[float, np.ndarray]], np.ndarray]:
    frame_length = min(2048, max(1024, int(sample_rate * 0.14)))
    hop_length = max(160, int(sample_rate * 0.03))
    frames: list[tuple[float, np.ndarray]] = []

    for start in range(0, max(0, samples.size - frame_length + 1), hop_length):
        frames.append((start / sample_rate, samples[start : start + frame_length]))

    if frames:
        rms_values = np.array([math.sqrt(float(np.mean(frame * frame))) for _, frame in frames])
    else:
        rms_values = np.array([])

    return frames, rms_values


def detect_pitch_points(file_path: Path, filter_stable: bool = True) -> dict:
    samples, sample_rate = _read_wav_mono(file_path)
    samples, sample_rate = _resample_linear(samples, sample_rate)

    if samples.size < int(sample_rate * 0.25):
        raise ValueError("Recording is too short. Hold one note for at least one second.")

    frames, rms_values = _build_frames(samples, sample_rate)
    if not frames:
        raise ValueError("Uploaded audio was too short to analyze.")

    noise_floor = _percentile(rms_values, 0.2)
    typical_level = _percentile(rms_values, 0.55)
    # If the whole clip is voiced, low-percentile RMS is still high. Cap the
    # gate below the typical level so a steady held note does not reject itself.
    active_floor = max(0.004, min(typical_level * 0.55, noise_floor * 2.2))

    frame_length = frames[0][1].size
    window = np.hanning(frame_length)

    pitch_points: list[dict] = []
    for index, (time, frame) in enumerate(frames):
        if rms_values[index] < active_floor:
            continue
        if frame.size != frame_length:
            continue

        estimate = _estimate_frequency_yin(frame, sample_rate, window)
        if estimate is None:
            estimate = _estimate_frequency_autocorrelation(frame, sample_rate, window)
        if estimate is None:
            continue

        frequency, confidence = estimate
        pitch_points.append(
            {
                "time": float(time),
                "frequency": float(frequency),
                "confidence": round(float(confidence), 3),
            }
        )

    if not pitch_points:
        raise ValueError("No stable sung pitch was detected. Try a louder, clearer held note.")

    confident_points = [point for point in pitch_points if point["confidence"] >= 0.68]
    if len(confident_points) >= max(3, len(pitch_points) // 3):
        pitch_points = confident_points

    frequencies = np.array([point["frequency"] for point in pitch_points])
    if filter_stable:
        median_frequency = float(np.median(frequencies))
        stable_points = [
            point
            for point in pitch_points
            if abs(1200 * math.log2(point["frequency"] / median_frequency)) <= 260
        ]

        if len(stable_points) >= 3:
            pitch_points = stable_points
            frequencies = np.array([point["frequency"] for point in pitch_points])

    confidences = np.array([point["confidence"] for point in pitch_points])
    confidence_total = float(confidences.sum())
    average_frequency = (
        float((frequencies * confidences).sum() / confidence_total)
        if confidence_total
        else float(np.median(frequencies))
    )

    return {
        "average_frequency": average_frequency,
        "analysis_status": "pitch_detected",
        "duration": samples.size / sample_rate,
        "voiced_frame_count": len(pitch_points),
        "pitch_points": pitch_points,
    }
