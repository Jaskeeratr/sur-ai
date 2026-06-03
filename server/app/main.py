import tempfile
import os
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.feedback_engine import compare_pitch
from app.ml_model import analyze_stability
from app.note_mapper import cents_between, frequency_to_note, get_target_frequency, nearest_note_match
from app.pitch_detector import detect_pitch_points

app = FastAPI(title="SurSadhana AI API")

DEFAULT_ALLOWED_ORIGINS = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
]


def _get_allowed_origins() -> list[str]:
    configured_origins = os.getenv("ALLOWED_ORIGINS", "")
    origins = [
        origin.strip()
        for origin in configured_origins.split(",")
        if origin.strip()
    ]
    return origins or DEFAULT_ALLOWED_ORIGINS


app.add_middleware(
    CORSMiddleware,
    allow_origins=_get_allowed_origins(),
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
        "stability": 0,
        "stability_label": "off_pitch",
        "stability_confidence": 0,
        "ai_feedback": "No stable pitch contour was available for vocal stability analysis.",
        "model_source": "unavailable",
        "stability_features": {
            "average_cents": 0,
            "cents_std": 0,
            "drift": 0,
            "average_step_change": 0,
            "voiced_frames": 0,
        },
    }


def _no_calibration_pitch_response(detail: str) -> dict:
    return {
        "analysis_status": "no_pitch",
        "average_frequency": None,
        "suggested_note": None,
        "suggested_frequency": None,
        "cents_from_suggested": None,
        "duration": 0,
        "voiced_frame_count": 0,
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
        stability = analyze_stability(detection["pitch_points"], target_frequency)

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
            **stability,
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


@app.post("/calibrate-sa")
async def calibrate_sa(file: UploadFile = File(...)):
    suffix = Path(file.filename or "recording.wav").suffix or ".wav"

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_audio:
            temp_audio.write(await file.read())
            temp_path = Path(temp_audio.name)

        detection = detect_pitch_points(temp_path)
        average_frequency = detection["average_frequency"]
        match = nearest_note_match(average_frequency)
        if match is None:
            return _no_calibration_pitch_response("No usable pitch was detected. Try a clear 2-5 second Sa.")

        return {
            "analysis_status": detection.get("analysis_status", "pitch_detected"),
            "average_frequency": round(average_frequency, 2),
            "suggested_note": match["note"],
            "suggested_frequency": match["frequency"],
            "cents_from_suggested": match["cents_from_note"],
            "duration": round(detection.get("duration", 0), 2),
            "voiced_frame_count": detection.get("voiced_frame_count", 0),
            "feedback": (
                f"Detected your comfortable Sa near {match['note']} "
                f"({match['frequency']:.2f} Hz)."
            ),
        }
    except ValueError as error:
        return _no_calibration_pitch_response(str(error))
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail="Sa calibration failed. Upload a short 16-bit WAV recording and try again.",
        ) from error
    finally:
        if "temp_path" in locals() and temp_path.exists():
            temp_path.unlink()
