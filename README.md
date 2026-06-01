# SurSadhana AI

SurSadhana AI is a web app for singers to practice pitch accuracy against harmonium-style notes. The MVP focuses on selecting a target note, recording a short vocal sample, detecting pitch on the backend, and showing sharp/flat/on-pitch feedback with a pitch graph.

## Tech Stack

- Frontend: React, Vite, Recharts
- Backend: FastAPI
- Audio processing: librosa, numpy, scipy, soundfile
- Future ML: PyTorch

## Project Structure

```text
client/   React app
server/   FastAPI app and pitch analysis modules
```

## Run Locally

### Backend

```bash
cd server
python -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Health check:

```http
GET http://127.0.0.1:8000/health
```

Expected response:

```json
{ "status": "running" }
```

### Frontend

```bash
cd client
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

## MVP Flow

1. Select a harmonium target note.
2. Record a short vocal sample.
3. Send the audio to FastAPI.
4. Detect pitch and compare it with the target frequency.
5. Display cents difference, accuracy, status, feedback, and pitch graph.

## Future Phases

- Sargam practice sessions
- PyTorch vocal stability classification
- Audio/video upload melody extraction
- Song practice comparison mode
- Spotify and Apple Music metadata helpers for song identification

