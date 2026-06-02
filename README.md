# SurSadhana AI

SurSadhana AI is a full-stack singing practice app that helps vocalists match their voice to harmonium and sargam notes. The app plays a harmonium-style reference key, records the singer, extracts the pitch contour on a FastAPI backend, compares the voice against the selected target note, and returns accuracy, cents offset, pitch drift, and AI-style vocal stability feedback.

## Why This Project Matters

This project combines frontend product design, backend API engineering, browser audio recording, signal processing, data visualization, and an optional PyTorch vocal stability model. It is designed as a portfolio-quality AI/audio project rather than a generic CRUD app.

## Features

- Playable harmonium keyboard from `C3` to `B5`
- Men's harmonium scale default: `C#3 = Sa`
- Tap mode for short reference notes
- Hold mode for sustained reference notes while matching pitch
- Browser microphone recording with compact 16 kHz WAV upload
- FastAPI pitch detection using a custom YIN-style held-note analyzer
- Sharp/flat/on-pitch feedback using cents calculation
- Frequency-first feedback when the user sings far from the selected note
- Recorded pitch movement graph with target line, average line, high/low range, and rising/falling/steady drift
- Sargam practice mode with selectable root Sa
- Vocal stability classification: `stable`, `shaky`, `sharp_drift`, `flat_drift`, `off_pitch`
- Optional PyTorch training pipeline using synthetic pitch-contour data
- Heuristic fallback when a trained PyTorch model is not installed

## Tech Stack

- Frontend: React, Vite, Recharts, Lucide icons
- Backend: FastAPI, Python standard-library WAV processing
- Audio analysis: custom YIN-style pitch detector and cents-based note matching
- ML: optional PyTorch stability classifier with deterministic fallback

## Architecture

```text
Browser microphone
      |
      v
React recording controls
      |
      v
16 kHz WAV upload through Vite /api proxy
      |
      v
FastAPI /analyze-note
      |
      +--> pitch_detector.py extracts pitch contour
      +--> feedback_engine.py compares target vs detected pitch
      +--> ml_model.py classifies vocal stability
      |
      v
React feedback cards + pitch movement graph
```

## Project Structure

```text
client/
  src/components/        UI controls, harmonium keyboard, feedback cards, graph
  src/data/              note maps, sargam scale generation
  src/pages/             harmonium and sargam practice pages

server/
  app/main.py            FastAPI app
  app/pitch_detector.py  WAV reading and pitch contour detection
  app/feedback_engine.py cents feedback and accuracy
  app/ml_model.py        stability feature extraction and model/fallback inference
  app/stability_network.py PyTorch model definition
  training/              synthetic dataset and training script
```

## Run Locally

### Backend

```bash
cd server
python -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Health check:

```http
GET http://127.0.0.1:8000/health
```

### Frontend

```bash
cd client
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173/harmonium
```

The frontend uses Vite's `/api` proxy, so browser requests go to:

```text
http://127.0.0.1:5173/api/analyze-note
```

and are forwarded to FastAPI on port `8000`.

## API

### `GET /health`

```json
{
  "status": "running"
}
```

### `POST /analyze-note`

Multipart form:

```text
file: 16-bit WAV recording
target_note: C#3
```

Example response:

```json
{
  "analysis_status": "pitch_detected",
  "target_note": "C#3",
  "target_frequency": 138.59,
  "average_frequency": 139.1,
  "detected_note": "C#3",
  "cents_off": 6.4,
  "status": "excellent",
  "accuracy": 94,
  "stability": 88,
  "stability_label": "stable",
  "stability_confidence": 0.91,
  "model_source": "heuristic",
  "ai_feedback": "Your pitch was stable for the held note."
}
```

## Optional PyTorch Stability Model

The app works without PyTorch by using the same extracted features with a deterministic fallback classifier. To train and use the PyTorch model:

```bash
cd server
.venv\Scripts\activate
python -m pip install -r requirements-ml.txt
python training/train_stability_model.py
```

This creates:

```text
server/models/stability_model.pt
```

The file is intentionally ignored by Git because model binaries can become large. When present, `/analyze-note` loads the PyTorch model and returns `model_source: "pytorch"`.

## Demo Flow

1. Open `/harmonium`.
2. Keep the default men's scale target: `C#3 = Sa`.
3. Use `Tap` to hear a short harmonium reference note.
4. Switch to `Hold` to sustain the note while matching your voice.
5. Record yourself holding the pitch for 2-4 seconds.
6. Review frequency, detected note, cents offset, pitch graph, drift direction, and AI vocal stability feedback.
7. Open `/sargam` to practice full Sa Re Ga Ma Pa Dha Ni Sa sequences.

## Resume Summary

Built SurSadhana AI, a full-stack audio ML singing practice app using React and FastAPI that records vocals, detects pitch contours, compares performance against harmonium and sargam target notes, visualizes pitch drift over time, and classifies vocal stability using a PyTorch-ready feature pipeline.

## Known Limitations

- The current pitch detector is optimized for short held notes, not full song transcription.
- The PyTorch classifier starts with synthetic training data and should be improved with labeled real vocal recordings.
- Browser microphone quality and background noise can affect pitch detection.

