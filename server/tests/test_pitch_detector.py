import math
import random
import wave
from pathlib import Path

import pytest

from app.pitch_detector import (
    TARGET_SAMPLE_RATE,
    _read_wav_mono,
    _resample_linear,
    detect_pitch_points,
)


def write_wav(
    path: Path,
    samples: list[float],
    sample_rate: int = 16000,
    channels: int = 1,
    sample_width: int = 2,
):
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(channels)
        wav_file.setsampwidth(sample_width)
        wav_file.setframerate(sample_rate)
        frames = bytearray()
        for sample in samples:
            if channels == 1:
                values = [sample]
            else:
                values = sample if isinstance(sample, tuple) else (sample, sample)

            for value in values:
                if sample_width == 1:
                    frames.append(max(0, min(255, int((value + 1) * 127.5))))
                else:
                    clamped = max(-1.0, min(1.0, float(value)))
                    frames.extend(int(clamped * 32767).to_bytes(2, "little", signed=True))
        wav_file.writeframes(bytes(frames))


def sine_wave(frequency: float, seconds: float = 2.0, sample_rate: int = 16000, amplitude: float = 0.45):
    return [
        amplitude * math.sin(2 * math.pi * frequency * index / sample_rate)
        for index in range(int(seconds * sample_rate))
    ]


def clipped_sine_wave(frequency: float, seconds: float = 2.0, sample_rate: int = 16000):
    return [
        max(-1.0, min(1.0, 1.8 * math.sin(2 * math.pi * frequency * index / sample_rate)))
        for index in range(int(seconds * sample_rate))
    ]


def test_read_wav_mono_averages_stereo_channels(tmp_path):
    path = tmp_path / "stereo.wav"
    write_wav(path, [(0.5, -0.5)] * 1600, channels=2)

    samples, sample_rate = _read_wav_mono(path)

    assert sample_rate == 16000
    assert len(samples) == 1600
    assert max(abs(sample) for sample in samples) < 0.001


def test_read_wav_mono_rejects_non_16_bit_wav(tmp_path):
    path = tmp_path / "eight-bit.wav"
    write_wav(path, [0.0] * 1600, sample_width=1)

    with pytest.raises(ValueError, match="Only 16-bit WAV"):
        _read_wav_mono(path)


def test_resample_linear_downsamples_to_target_rate():
    samples = sine_wave(220.0, seconds=1.0, sample_rate=16000)
    resampled, sample_rate = _resample_linear(samples, 16000, TARGET_SAMPLE_RATE)

    assert sample_rate == TARGET_SAMPLE_RATE
    assert len(resampled) == TARGET_SAMPLE_RATE


def test_detect_pitch_points_rejects_too_short_recording(tmp_path):
    path = tmp_path / "short.wav"
    write_wav(path, sine_wave(440.0, seconds=0.1))

    with pytest.raises(ValueError, match="too short"):
        detect_pitch_points(path)


def test_detect_pitch_points_rejects_silence(tmp_path):
    path = tmp_path / "silence.wav"
    write_wav(path, [0.0] * 32000)

    with pytest.raises(ValueError, match="No stable sung pitch"):
        detect_pitch_points(path)


def test_detect_pitch_points_rejects_low_level_noise(tmp_path):
    random.seed(7)
    path = tmp_path / "noise.wav"
    noise = [random.uniform(-0.001, 0.001) for _ in range(32000)]
    write_wav(path, noise)

    with pytest.raises(ValueError, match="No stable sung pitch"):
        detect_pitch_points(path)


def test_detect_pitch_points_finds_a4_sine_wave(tmp_path):
    path = tmp_path / "a4.wav"
    write_wav(path, sine_wave(440.0))

    result = detect_pitch_points(path)

    assert result["analysis_status"] == "pitch_detected"
    assert result["average_frequency"] == pytest.approx(440.0, abs=2.0)
    assert result["voiced_frame_count"] >= 20


def test_detect_pitch_points_handles_stereo_voice_input(tmp_path):
    path = tmp_path / "stereo-voice.wav"
    mono = sine_wave(261.63)
    stereo = [(sample, sample * 0.8) for sample in mono]
    write_wav(path, stereo, channels=2)

    result = detect_pitch_points(path)

    assert result["average_frequency"] == pytest.approx(261.63, abs=2.0)


def test_detect_pitch_points_handles_clipped_input(tmp_path):
    path = tmp_path / "clipped.wav"
    write_wav(path, clipped_sine_wave(329.63))

    result = detect_pitch_points(path)

    assert result["average_frequency"] == pytest.approx(329.63, abs=3.0)


def test_detect_pitch_points_handles_low_supported_voice_frequency(tmp_path):
    path = tmp_path / "low-c2.wav"
    write_wav(path, sine_wave(65.41, amplitude=0.5))

    result = detect_pitch_points(path)

    assert result["average_frequency"] == pytest.approx(65.41, abs=1.5)


def test_detect_pitch_points_handles_high_supported_voice_frequency(tmp_path):
    path = tmp_path / "high-c6.wav"
    write_wav(path, sine_wave(1046.5, amplitude=0.35))

    result = detect_pitch_points(path)

    assert result["average_frequency"] == pytest.approx(1046.5, abs=8.0)


def test_detect_pitch_points_resolves_borderline_between_a4_and_a_sharp4(tmp_path):
    path = tmp_path / "borderline.wav"
    frequency = math.sqrt(440.0 * 466.16) * 0.997
    write_wav(path, sine_wave(frequency))

    result = detect_pitch_points(path)

    assert result["average_frequency"] == pytest.approx(frequency, abs=2.0)
