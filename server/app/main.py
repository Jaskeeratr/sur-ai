import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.feedback_engine import compare_pitch
from app.note_mapper import cents_between, frequency_to_note, get_target_frequency
from app.pitch_detector import detect_pitch_points

app = FastAPI(title="SurSadhana AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "running"}


def _no_pitch_response(target_note: str, target_frequency: float, detail: str) -> dict:
    return {
        "analysis_status": "no_pitch",
        "target_note": target_note.upper(),
        "target_frequency": target_frequency,
        "average_frequency": None,
        "detected_note": None,
        "duration": 0,
        "voiced_frame_count": 0,
        "pitch_points": [],
        "cents_off": None,
        "raw_cents_off": None,
        "comparison_available": False,
        "status": "no_pitch",
        "accuracy": 0,
        "feedback": detail,
    }


@app.post("/analyze-note")
async def analyze_note(file: UploadFile = File(...), target_note: str = Form(...)):
    try:
        target_frequency = get_target_frequency(target_note)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    suffix = Path(file.filename or "recording.wav").suffix or ".wav"

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_audio:
            temp_audio.write(await file.read())
            temp_path = Path(temp_audio.name)

        detection = detect_pitch_points(temp_path)
        average_frequency = detection["average_frequency"]
        detected_note = frequency_to_note(average_frequency)
        comparison = compare_pitch(average_frequency, target_frequency)

        pitch_points = [
            {
                **point,
                "cents_off": round(cents_between(point["frequency"], target_frequency), 2)
                if comparison["comparison_available"]
                else None,
                "raw_cents_off": round(cents_between(point["frequency"], target_frequency), 2),
            }
            for point in detection["pitch_points"]
        ]

        return {
            "analysis_status": detection.get("analysis_status", "pitch_detected"),
            "target_note": target_note.upper(),
            "target_frequency": target_frequency,
            "average_frequency": round(average_frequency, 2),
            "detected_note": detected_note,
            "duration": round(detection.get("duration", 0), 2),
            "voiced_frame_count": detection.get("voiced_frame_count", len(pitch_points)),
            "pitch_points": pitch_points,
            **comparison,
        }
    except ValueError as error:
        return _no_pitch_response(target_note, target_frequency, str(error))
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail="Audio analysis failed. Upload a short 16-bit WAV recording and try again.",
        ) from error
    finally:
        if "temp_path" in locals() and temp_path.exists():
            temp_path.unlink()
