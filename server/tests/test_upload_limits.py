import io

from fastapi.testclient import TestClient

from app.main import MAX_UPLOAD_BYTES, app

client = TestClient(app)


def oversized_payload():
    return io.BytesIO(b"\x00" * (MAX_UPLOAD_BYTES + 1))


def test_analyze_note_rejects_oversized_upload():
    response = client.post(
        "/analyze-note",
        data={"target_note": "C#3"},
        files={"file": ("huge.wav", oversized_payload(), "audio/wav")},
    )

    assert response.status_code == 413
    assert "too large" in response.json()["detail"]


def test_analyze_sequence_rejects_oversized_upload():
    response = client.post(
        "/analyze-sequence",
        data={"target_notes": "C#3,D#3"},
        files={"file": ("huge.wav", oversized_payload(), "audio/wav")},
    )

    assert response.status_code == 413


def test_calibrate_sa_rejects_oversized_upload():
    response = client.post(
        "/calibrate-sa",
        files={"file": ("huge.wav", oversized_payload(), "audio/wav")},
    )

    assert response.status_code == 413
