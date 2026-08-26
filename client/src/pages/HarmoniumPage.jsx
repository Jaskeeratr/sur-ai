import { useMemo, useState } from "react";
import { DEFAULT_HARMONIUM_NOTE, DEFAULT_SA, buildHarmoniumKeys, getFrequency } from "../data/notes.js";
import { DEFAULT_THAAT } from "../data/thaats.js";
import { saveAttempt } from "../data/progress.js";
import { DroneToggle } from "../components/DroneToggle.jsx";
import { LiveTuner } from "../components/LiveTuner.jsx";
import { ThaatSelector } from "../components/ThaatSelector.jsx";
import { HarmoniumKeyboard } from "../components/HarmoniumKeyboard.jsx";
import { PracticeInstructions } from "../components/PracticeInstructions.jsx";
import { SelectedNoteCard } from "../components/SelectedNoteCard.jsx";
import { RecordingControls } from "../components/RecordingControls.jsx";
import { FeedbackCard } from "../components/FeedbackCard.jsx";
import { PitchGraph } from "../components/PitchGraph.jsx";
import { SaCalibrationCard } from "../components/SaCalibrationCard.jsx";

import { API_BASE_URL, buildBackendError, checkBackendHealth } from "../data/api.js";

function parseNote(note) {
  const match = note?.match(/^([A-G]#?)(\d)$/);
  return match ? { noteName: match[1], octave: Number(match[2]) } : null;
}

export function HarmoniumPage() {
  const [rootSa, setRootSa] = useState(DEFAULT_SA);
  const [thaat, setThaat] = useState(DEFAULT_THAAT);
  const [selectedNote, setSelectedNote] = useState(DEFAULT_HARMONIUM_NOTE);
  const [analysis, setAnalysis] = useState(null);
  const [analysisError, setAnalysisError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [calibration, setCalibration] = useState(null);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [backendNotice, setBackendNotice] = useState("");

  const harmoniumNotes = useMemo(() => buildHarmoniumKeys(rootSa, thaat.intervals), [rootSa, thaat]);

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
    setBackendNotice("");

    const formData = new FormData();
    formData.append("file", blob, "voice-recording.wav");
    formData.append("target_note", selectedNote.note);

    try {
      await checkBackendHealth({
        onWaking: () => setBackendNotice("Waking the analysis backend (free hosting sleeps when idle)... this can take up to a minute.")
      });
      setBackendNotice("");
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
      setBackendNotice("");
    }
  }

  async function calibrateSa(blob) {
    setIsCalibrating(true);
    setCalibration(null);
    setAnalysis(null);
    setAnalysisError("");
    setBackendNotice("");

    const formData = new FormData();
    formData.append("file", blob, "sa-calibration.wav");

    try {
      await checkBackendHealth({
        onWaking: () => setBackendNotice("Waking the analysis backend (free hosting sleeps when idle)... this can take up to a minute.")
      });
      setBackendNotice("");
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
        const nextNotes = buildHarmoniumKeys(parsedNote, thaat.intervals);
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
      setBackendNotice("");
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
          <ThaatSelector thaat={thaat} onChange={setThaat} />
          <span className="muted">Hold your Sa against a steady tanpura-style drone while you practice.</span>
        </div>
        <LiveTuner
          targetFrequency={selectedNote.frequency}
          targetLabel={selectedNote.sargam ? `${selectedNote.sargam} / ${selectedNote.note}` : selectedNote.note}
        />
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
        {backendNotice ? <p className="waking-banner">{backendNotice}</p> : null}
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
