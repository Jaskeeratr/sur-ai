import { useMemo, useState } from "react";
import { DEFAULT_HARMONIUM_NOTE, DEFAULT_SA, buildHarmoniumKeys, getFrequency } from "../data/notes.js";
import { saveAttempt } from "../data/progress.js";
import { DroneToggle } from "../components/DroneToggle.jsx";
import { HarmoniumKeyboard } from "../components/HarmoniumKeyboard.jsx";
import { PracticeInstructions } from "../components/PracticeInstructions.jsx";
import { SelectedNoteCard } from "../components/SelectedNoteCard.jsx";
import { RecordingControls } from "../components/RecordingControls.jsx";
import { FeedbackCard } from "../components/FeedbackCard.jsx";
import { PitchGraph } from "../components/PitchGraph.jsx";
import { SaCalibrationCard } from "../components/SaCalibrationCard.jsx";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

function buildBackendError(error) {
  return `The backend could not be reached at ${API_BASE_URL}. Check the deployed API URL and CORS allowed origins, then reload the page. ${error.message}`;
}

async function checkBackendHealth() {
  const response = await fetch(`${API_BASE_URL}/health`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Backend health check returned ${response.status}.`);
  }
}

function parseNote(note) {
  const match = note?.match(/^([A-G]#?)(\d)$/);
  return match ? { noteName: match[1], octave: Number(match[2]) } : null;
}

export function HarmoniumPage() {
  const [rootSa, setRootSa] = useState(DEFAULT_SA);
  const [selectedNote, setSelectedNote] = useState(DEFAULT_HARMONIUM_NOTE);
  const [analysis, setAnalysis] = useState(null);
  const [analysisError, setAnalysisError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [calibration, setCalibration] = useState(null);
  const [isCalibrating, setIsCalibrating] = useState(false);

  const harmoniumNotes = useMemo(() => buildHarmoniumKeys(rootSa), [rootSa]);

  const pitchData = useMemo(() => {
    if (!analysis?.pitch_points) {
      return [];
    }

    return analysis.pitch_points.map((point) => ({
      time: Number(point.time.toFixed(2)),
      detected: Math.round(point.frequency * 100) / 100,
      target: selectedNote.frequency,
      cents: point.cents_off == null ? null : Math.round(point.cents_off)
    }));
  }, [analysis, selectedNote.frequency]);

  async function analyzeRecording(blob) {
    setIsAnalyzing(true);
    setAnalysisError("");
    setAnalysis(null);

    const formData = new FormData();
    formData.append("file", blob, "voice-recording.wav");
    formData.append("target_note", selectedNote.note);

    try {
      await checkBackendHealth();
      const response = await fetch(`${API_BASE_URL}/analyze-note`, {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.detail || "Pitch analysis failed.");
      }

      const nextAnalysis = await response.json();
      setAnalysis(nextAnalysis);
      if (nextAnalysis.analysis_status === "pitch_detected" && nextAnalysis.comparison_available !== false) {
        saveAttempt({
          mode: "harmonium",
          label: selectedNote.sargam ? `${selectedNote.sargam} / ${selectedNote.note}` : selectedNote.note,
          targetNote: selectedNote.note,
          accuracy: nextAnalysis.accuracy,
          centsOff: nextAnalysis.cents_off,
          status: nextAnalysis.status,
          stabilityLabel: nextAnalysis.stability_label
        });
      }
    } catch (error) {
      setAnalysis({
        analysis_status: "request_failed",
        average_frequency: null,
        detected_note: null,
        comparison_available: false,
        status: "request_failed",
        accuracy: 0,
        pitch_points: [],
        feedback: buildBackendError(error)
      });
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function calibrateSa(blob) {
    setIsCalibrating(true);
    setCalibration(null);
    setAnalysis(null);
    setAnalysisError("");

    const formData = new FormData();
    formData.append("file", blob, "sa-calibration.wav");

    try {
      await checkBackendHealth();
      const response = await fetch(`${API_BASE_URL}/calibrate-sa`, {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.detail || "Sa calibration failed.");
      }

      const nextCalibration = await response.json();
      const parsedNote = parseNote(nextCalibration.suggested_note);
      if (parsedNote) {
        const nextNotes = buildHarmoniumKeys(parsedNote);
        const calibratedNote = nextNotes.find((note) => note.note === nextCalibration.suggested_note);
        if (calibratedNote) {
          setRootSa(parsedNote);
          setSelectedNote(calibratedNote);
        }
      }
      setCalibration(nextCalibration);
    } catch (error) {
      setCalibration({
        analysis_status: "request_failed",
        average_frequency: null,
        suggested_note: null,
        suggested_frequency: null,
        cents_from_suggested: null,
        feedback: buildBackendError(error)
      });
    } finally {
      setIsCalibrating(false);
    }
  }

  return (
    <div className="practice-layout">
      <section className="practice-main">
        <PracticeInstructions />
        <HarmoniumKeyboard
          notes={harmoniumNotes}
          selectedNote={selectedNote}
          onSelect={(note) => {
            setSelectedNote(note);
            setAnalysis(null);
            setAnalysisError("");
          }}
        />
        <div className="drone-row">
          <DroneToggle
            frequency={getFrequency(rootSa.noteName, rootSa.octave)}
            label={`${rootSa.noteName}${rootSa.octave}`}
          />
          <span className="muted">Hold your Sa against a steady tanpura-style drone while you practice.</span>
        </div>
        <SaCalibrationCard
          calibration={calibration}
          disabled={isAnalyzing || isCalibrating}
          isCalibrating={isCalibrating}
          onRecordingReady={calibrateSa}
        />
        <RecordingControls
          disabled={isAnalyzing || isCalibrating}
          isAnalyzing={isAnalyzing}
          onRecordingReady={analyzeRecording}
        />
        {analysisError ? <p className="error-banner">{analysisError}</p> : null}
      </section>

      <aside className="practice-side">
        <SelectedNoteCard note={selectedNote} />
        <FeedbackCard analysis={analysis} isAnalyzing={isAnalyzing} />
        <PitchGraph data={pitchData} targetFrequency={selectedNote.frequency} />
      </aside>
    </div>
  );
}
