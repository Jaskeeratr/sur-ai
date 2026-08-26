# SurSadhana AI

SurSadhana AI is a full-stack singing practice app that helps vocalists match their voice to harmonium and sargam notes. The app plays a harmonium-style reference key, records the singer, extracts the pitch contour on a FastAPI backend, compares the voice against the selected target note, and returns accuracy, cents offset, pitch drift, and vocal stability feedback.

## Why This Project Matters

This project combines frontend product design, backend API engineering, browser audio recording, signal processing, and data visualization. It is designed as a portfolio-quality audio analysis project rather than a generic CRUD app.

## Live Demo

- Frontend: https://sur-ai.vercel.app
- Backend health check: https://sursadhana-ai-api.onrender.com/health

## Features

- Playable harmonium keyboard from `C3` to `B5`
- Men's harmonium scale default: `C#3 = Sa`
- "Find my Sa" voice calibration that detects a comfortable sung Sa and remaps the practice root
- Tap mode for short reference notes
- Hold mode for sustained reference notes while matching pitch
- Reed-style synthesized harmonium reference tone with detuned reeds, harmonic layers, filtered attack noise, and compression
- Browser microphone recording with compact 16 kHz WAV upload
- FastAPI pitch detection using a custom YIN-style held-note analyzer
- Sharp/flat/on-pitch feedback using cents calculation
- Frequency-first feedback when the user sings far from the selected note
- Recorded pitch movement graph with target line, average line, high/low range, and rising/falling/steady drift
- Sargam practice mode with selectable root Sa
- Guided practice page with recommended drills, custom Sargam phrases, adjustable note timing, room-noise calibration, reference playback, live rough pitch tracking, and final multi-note scoring
- Vocal stability classification: `stable`, `shaky`, `sharp_drift`, `flat_drift`, `off_pitch`
- Heuristic vocal stability analysis from cents deviation, wobble, drift, and voiced-frame features
- Live tuner on the Harmonium and Sargam pages: an AudioWorklet runs a YIN pitch detector on the microphone in real time and shows a cents-offset needle against the selected target
- All ten Hindustani thaats (Bilawal, Kalyan, Khamaj, Kafi, Asavari, Bhairavi, Bhairav, Poorvi, Marwa, Todi) with komal swaras shown lowercase and tivra Ma as `Ma#`, driving the keyboard labels, sargam scales, and practice phrases
- Alankar practice presets: three-note and four-note paltas, descending sargam, and a full aroha-avroha drill
- Onset-aware sequence scoring: a Viterbi alignment assigns voiced frames to target notes where the sung pitch actually changes, so unevenly held notes no longer shift later scoring windows (uniform time slicing remains as fallback)
- Attempt playback: replay your last recording on its own or layered under the harmonium reference
- Progress export/import: back up riyaz history as JSON and merge it on another device
- Installable PWA with an offline app shell (manifest, icons, and service worker via vite-plugin-pwa)
- Tanpura-style Sa drone (Sa + low Pa layers) on the Harmonium, Practice, and Sargam pages that retunes automatically when the root Sa changes
- Live recording timer with a 6-second auto-stop, and automatic stop of practice recordings once the phrase duration elapses
- Progress page with per-device riyaz history: accuracy trend chart, mode filters, average/best/recent stats, and recent attempt list stored in `localStorage`
- Upload size guard on all analysis endpoints (413 for clips over 10 MB)
- NumPy-vectorized pitch detection with an FFT-based YIN difference function (~12 ms average analysis latency, down from ~717 ms pure-Python)
- "Waking the backend" retry flow so free-tier cold starts show a friendly notice instead of an error
- Lazy-loaded pages with vendor chunk splitting (initial bundle ~188 kB instead of ~600 kB)
- Pitch detection benchmark script for reporting note accuracy, cents error, and backend analysis latency
- GitHub Actions CI for backend tests, frontend unit tests, and frontend production builds

## Tech Stack

- Frontend: React, Vite, Recharts, Lucide icons, AudioWorklet live pitch tracking
- Backend: FastAPI, NumPy-vectorized WAV processing
- Audio analysis: custom YIN-style pitch detector (FFT-based difference function) and cents-based note matching
- Stability analysis: deterministic feature-based classifier

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

FastAPI /calibrate-sa
      |
      +--> detects the user's comfortable Sa frequency
      +--> maps it to the nearest supported harmonium key
      |
      v
React updates harmonium labels and sargam root
```

## Project Structure

```text
client/
  src/components/        UI controls, harmonium keyboard, feedback cards, graph, drone toggle
  src/data/              note maps, sargam scale generation, practice phrase parsing, progress store
  src/pages/             harmonium, practice, sargam, and progress pages

server/
  app/main.py            FastAPI app
  app/pitch_detector.py  WAV reading and pitch contour detection
  app/feedback_engine.py cents feedback and accuracy
  app/ml_model.py        stability feature extraction and heuristic classification
  benchmarks/            pitch detection accuracy and latency benchmark
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

## Deploy

This repo is configured for a split deployment:

- Frontend: Vercel static Vite app
- Backend: Render FastAPI web service

### Render Backend

The backend service is defined in `render.yaml`.

Render settings:

```text
Service name: sursadhana-ai-api
Root directory: server
Runtime: Python
Build command: pip install -r requirements.txt
Start command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
Health check: /health
```

Environment variables:

```text
PYTHON_VERSION=3.11.9
ALLOWED_ORIGINS=https://your-vercel-app.vercel.app
```

During local development, `ALLOWED_ORIGINS` can stay unset because the API defaults to:

```text
http://127.0.0.1:5173,http://localhost:5173
```

Blueprint link after pushing this repo:

```text
https://dashboard.render.com/blueprint/new?repo=https://github.com/Jaskeeratr/sur-ai
```

After Render deploys, verify:

```text
https://sursadhana-ai-api.onrender.com/health
```

If you choose a different Render service name, use that generated URL instead.

### Vercel Frontend

The frontend deployment is defined in `vercel.json`.

Vercel environment variable:

```text
VITE_API_BASE_URL=https://sursadhana-ai-api.onrender.com
```

If Render gives a different backend URL, set `VITE_API_BASE_URL` to that exact URL.

Vercel uses:

```text
Install command: cd client && npm ci
Build command: cd client && npm run build
Output directory: client/dist
```

After Vercel gives the live frontend URL, update Render's `ALLOWED_ORIGINS` to that exact Vercel origin and redeploy the backend.

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

### `POST /calibrate-sa`

Multipart form:

```text
file: 16-bit WAV recording
```

Example response:

```json
{
  "analysis_status": "pitch_detected",
  "average_frequency": 138.9,
  "suggested_note": "C#3",
  "suggested_frequency": 138.59,
  "cents_from_suggested": 3.87,
  "duration": 2.4,
  "voiced_frame_count": 74,
  "feedback": "Detected your comfortable Sa near C#3 (138.59 Hz)."
}
```

### `POST /analyze-sequence`

Multipart form:

```text
file: 16-bit WAV recording
target_notes: C#3,D#3,F3,F#3,G#3
```

The endpoint analyzes a multi-note practice recording by aligning the sung pitch contour to the requested target sequence with a monotonic Viterbi alignment (`segmentation: "onset"`), scoring each aligned span, and returning an overall sequence accuracy. Notes may be held for uneven durations; when the recording has too few voiced frames to align, the endpoint falls back to uniform time slicing (`segmentation: "uniform"`).

## Pitch Detection Benchmark

Run the benchmark from the backend directory:

```bash
cd server
.venv\Scripts\activate
python benchmarks/pitch_detection_benchmark.py --output-json benchmark_reports/latest.json --output-csv benchmark_reports/latest.csv
```

The benchmark generates controlled 2-second WAV samples across two octaves, small cents offsets, and light noise levels. It runs the same `detect_pitch_points` function used by the API and reports:

- note detection accuracy
- successful detection count
- mean and median absolute cents error
- average and p95 analysis latency

Benchmark numbers should be described as synthetic test results unless they are later collected from real user recordings.

## Harmonium Audio Direction

The current app uses a generated harmonium-style reference tone rather than bundled third-party samples. This keeps deployment simple and avoids unclear asset licensing. A future sample-based upgrade should use clearly licensed audio, document attribution, and avoid redistributing sample packs in a way the license forbids. Candidate sources reviewed:

- Philharmonia sound samples: broad free sample library with usage restrictions around redistributing samples as-is.
- Play Harmonium Online credits: documents a CC BY single-reed harmonium sample approach.
- Pixabay harmonium sample page: royalty-free harmonium audio under the Pixabay Content License.

To benchmark real vocal recordings, collect `.wav` files in a folder and include the expected note in each filename:

```text
real_recordings/
  Csharp3_sa_01.wav
  D3_re_01.wav
  E3_ga_01.wav
  G3_pa_01.wav
```

Then run:

```bash
python benchmarks/pitch_detection_benchmark.py --recordings-dir real_recordings --output-json benchmark_reports/real.json --output-csv benchmark_reports/real.csv
```

The script infers labels such as `Csharp3`, `C#3`, `D3`, and `A4` from filenames, then reports note accuracy, cents error, and latency using the same detector as the API.

Current local synthetic benchmark:

```text
Recordings: 96 controlled 2-second WAV samples
Successful detections: 96 / 96
Note detection accuracy: 100.00%
Mean absolute cents error: 1.83 cents
Median absolute cents error: 1.65 cents
Average analysis latency: 12.11 ms
P95 analysis latency: 21.74 ms
```

Resume-safe wording:

```text
Benchmarked custom NumPy-vectorized pitch detector at 100% note detection accuracy across 96 controlled synthetic vocal-tone recordings, with 1.83-cent mean absolute error and 12 ms average backend analysis latency (59x faster than the original pure-Python implementation).
```

## Demo Flow

1. Open `/harmonium`.
2. Use `Find my Sa` to record a comfortable Sa and auto-select the closest harmonium key.
3. Use `Tap` to hear a short harmonium reference note.
4. Switch to `Hold` to sustain the note while matching your voice.
5. Record yourself holding the pitch for 2-4 seconds.
6. Review frequency, detected note, cents offset, pitch graph, drift direction, and AI vocal stability feedback.
7. Start the `Sa drone` for a sustained tanpura-style reference while practicing.
8. Start the `Live tuner` and watch the cents needle while you hold the note - no recording needed.
9. Pick a thaat (for example Kalyan or Bhairav) to relabel the keyboard and scales with komal/tivra swaras.
10. Use `Listen back` after any analysis to replay your attempt, alone or layered under the harmonium reference.
11. Open `/practice` for guided drills, alankar paltas, or a custom Sargam phrase with live pitch tracking and onset-aligned sequence scoring.
12. Open `/sargam` to calibrate the root and practice the full scale in any thaat.
13. Open `/progress` to review your saved riyaz history, and export/import it as JSON to move it between devices.
14. Install the app from the browser menu - it ships as a PWA with an offline app shell.

## Resume Summary

Built SurSadhana AI, a full-stack audio analysis singing practice app using React and FastAPI that records vocals, detects pitch contours, compares performance against harmonium and sargam target notes, visualizes pitch drift over time, and classifies vocal stability with deterministic signal-processing features.

## Known Limitations

- The current pitch detector is optimized for short held notes, not full song transcription.
- Vocal stability labels are heuristic and should be validated with labeled real vocal recordings before being described as a trained ML model.
- Browser microphone quality and background noise can affect pitch detection.

## Quality Checks

Backend tests, frontend unit tests, and frontend builds run in GitHub Actions on every push and pull request. Run the same checks locally:

```bash
cd server
.venv\Scripts\activate
python -m pytest tests

cd ../client
npm test
npm run build
```
