import math
import wave

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def write_sequence_wav(path, frequencies, seconds_per_note=0.7, sample_rate=16000):
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        frames = bytearray()
        for frequency in frequencies:
            for index in range(int(seconds_per_note * sample_rate)):
                sample = 0.42 * math.sin(2 * math.pi * frequency * index / sample_rate)
                frames.extend(int(sample * 32767).to_bytes(2, "little", signed=True))
        wav_file.writeframes(bytes(frames))


def test_analyze_sequence_scores_multiple_target_notes(tmp_path):
    path = tmp_path / "sequence.wav"
    write_sequence_wav(path, [138.59, 207.65, 138.59], seconds_per_note=0.8)

    with path.open("rb") as audio_file:
        response = client.post(
            "/analyze-sequence",
            data={"target_notes": "C#3,G#3,C#3"},
            files={"file": ("sequence.wav", audio_file, "audio/wav")},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["analysis_status"] == "pitch_detected"
    assert payload["sequence_accuracy"] >= 90
    assert [segment["target_note"] for segment in payload["segments"]] == ["C#3", "G#3", "C#3"]
    assert all(segment["status"] in {"excellent", "on_pitch"} for segment in payload["segments"])


def write_timed_sequence_wav(path, timed_notes, sample_rate=16000):
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        frames = bytearray()
        for frequency, seconds in timed_notes:
            for index in range(int(seconds * sample_rate)):
                sample = 0.42 * math.sin(2 * math.pi * frequency * index / sample_rate)
                frames.extend(int(sample * 32767).to_bytes(2, "little", signed=True))
        wav_file.writeframes(bytes(frames))


def test_analyze_sequence_uses_onset_segmentation(tmp_path):
    path = tmp_path / "sequence.wav"
    write_sequence_wav(path, [138.59, 207.65, 138.59], seconds_per_note=0.8)

    with path.open("rb") as audio_file:
        response = client.post(
            "/analyze-sequence",
            data={"target_notes": "C#3,G#3,C#3"},
            files={"file": ("sequence.wav", audio_file, "audio/wav")},
        )

    assert response.status_code == 200
    assert response.json()["segmentation"] == "onset"


def test_analyze_sequence_scores_unevenly_held_notes(tmp_path):
    # A singer holding the first note long breaks uniform time slicing, but
    # onset alignment should still score every note against its own span.
    path = tmp_path / "uneven.wav"
    write_timed_sequence_wav(
        path,
        [(138.59, 1.6), (207.65, 0.5), (155.56, 1.1)],
    )

    with path.open("rb") as audio_file:
        response = client.post(
            "/analyze-sequence",
            data={"target_notes": "C#3,G#3,D#3"},
            files={"file": ("uneven.wav", audio_file, "audio/wav")},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["segmentation"] == "onset"
    assert payload["sequence_accuracy"] >= 90
    assert all(segment["status"] in {"excellent", "on_pitch"} for segment in payload["segments"])
    assert [segment["detected_note"] for segment in payload["segments"]] == ["C#3", "G#3", "D#3"]


def test_analyze_sequence_scores_repeated_notes_in_one_held_tone(tmp_path):
    # Two identical consecutive targets sung as one continuous note should
    # both score, since no onset exists between them.
    path = tmp_path / "repeated.wav"
    write_timed_sequence_wav(path, [(138.59, 2.0)])

    with path.open("rb") as audio_file:
        response = client.post(
            "/analyze-sequence",
            data={"target_notes": "C#3,C#3"},
            files={"file": ("repeated.wav", audio_file, "audio/wav")},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["sequence_accuracy"] >= 90
    assert all(segment["status"] == "excellent" for segment in payload["segments"])


def test_analyze_sequence_rejects_empty_targets(tmp_path):
    path = tmp_path / "sequence.wav"
    write_sequence_wav(path, [138.59])

    with path.open("rb") as audio_file:
        response = client.post(
            "/analyze-sequence",
            data={"target_notes": ""},
            files={"file": ("sequence.wav", audio_file, "audio/wav")},
        )

    assert response.status_code == 400
