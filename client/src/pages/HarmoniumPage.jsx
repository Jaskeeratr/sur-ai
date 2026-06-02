import { useMemo, useState } from "react";
import { HARMONIUM_NOTES } from "../data/notes.js";
import { HarmoniumKeyboard } from "../components/HarmoniumKeyboard.jsx";
import { PracticeInstructions } from "../components/PracticeInstructions.jsx";
import { SelectedNoteCard } from "../components/SelectedNoteCard.jsx";
import { RecordingControls } from "../components/RecordingControls.jsx";
import { FeedbackCard } from "../components/FeedbackCard.jsx";
import { PitchGraph } from "../components/PitchGraph.jsx";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export function HarmoniumPage() {
  const [selectedNote, setSelectedNote] = useState(HARMONIUM_NOTES[0]);
  const [analysis, setAnalysis] = useState(null);
  const [analysisError, setAnalysisError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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
      const response = await fetch(`${API_BASE_URL}/analyze-note`, {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.detail || "Pitch analysis failed.");
      }

      setAnalysis(await response.json());
    } catch (error) {
      setAnalysis({
        analysis_status: "request_failed",
        average_frequency: null,
        detected_note: null,
        comparison_available: false,
        status: "request_failed",
        accuracy: 0,
        pitch_points: [],
        feedback: `The backend could not be reached. ${error.message}`
      });
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <div className="practice-layout">
      <section className="practice-main">
        <PracticeInstructions />
        <HarmoniumKeyboard
          notes={HARMONIUM_NOTES}
          selectedNote={selectedNote}
          onSelect={(note) => {
            setSelectedNote(note);
            setAnalysis(null);
            setAnalysisError("");
          }}
        />
        <RecordingControls
          disabled={isAnalyzing}
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
