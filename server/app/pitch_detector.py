from pathlib import Path

import librosa
import numpy as np


def detect_pitch_points(file_path: Path) -> dict:
    waveform, sample_rate = librosa.load(file_path, sr=22050, mono=True)

    if waveform.size == 0:
        raise ValueError("Uploaded audio did not contain readable samples.")

    frame_length = 2048
    hop_length = 256
    pitches = librosa.yin(
        waveform,
        fmin=librosa.note_to_hz("C3"),
        fmax=librosa.note_to_hz("C6"),
        sr=sample_rate,
        frame_length=frame_length,
        hop_length=hop_length,
    )
    rms = librosa.feature.rms(y=waveform, frame_length=frame_length, hop_length=hop_length)[0]
    times = librosa.frames_to_time(
        np.arange(len(pitches)),
        sr=sample_rate,
        hop_length=hop_length,
    )

    if not len(rms):
        raise ValueError("Uploaded audio was too short to analyze.")

    energy_floor = max(float(np.percentile(rms, 60)) * 0.55, 0.006)
    valid_mask = np.isfinite(pitches) & (pitches > 0) & (rms >= energy_floor)
    stable_pitches = pitches[valid_mask]

    if stable_pitches.size == 0:
        raise ValueError("No stable sung pitch was detected. Try recording a clearer held note.")

    median_frequency = float(np.median(stable_pitches))
    valid_deviation = np.abs(1200 * np.log2(stable_pitches / median_frequency)) <= 140
    filtered_pitches = stable_pitches[valid_deviation]

    if filtered_pitches.size == 0:
        filtered_pitches = stable_pitches

    average_frequency = float(np.mean(filtered_pitches))
    pitch_points = [
        {"time": float(time), "frequency": float(frequency)}
        for time, frequency, is_valid in zip(times, pitches, valid_mask)
        if is_valid and abs(1200 * np.log2(frequency / average_frequency)) <= 180
    ]

    return {
        "average_frequency": average_frequency,
        "pitch_points": pitch_points,
    }
