import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { ROOT_OPTIONS, buildSargamScale } from "../data/sargam.js";
import { HarmoniumKeyboard } from "../components/HarmoniumKeyboard.jsx";
import { RecordingControls } from "../components/RecordingControls.jsx";
import { FeedbackCard } from "../components/FeedbackCard.jsx";
import { SelectedNoteCard } from "../components/SelectedNoteCard.jsx";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export function SargamPage() {
  const [root, setRoot] = useState("C");
  const [stepIndex, setStepIndex] = useState(0);
  const [results, setResults] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [analysisError, setAnalysisError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const scale = useMemo(() => buildSargamScale(root), [root]);
  const selectedNote = scale[stepIndex];
  const sessionScore = results.length
    ? Math.round(results.reduce((sum, result) => sum + result.accuracy, 0) / results.length)
    : 0;

  function resetSession(nextRoot = root) {
    setRoot(nextRoot);
    setStepIndex(0);
    setResults([]);
    setAnalysis(null);
    setAnalysisError("");
  }

  async function analyzeRecording(blob) {
    setIsAnalyzing(true);
    setAnalysisError("");
    setAnalysis(null);

    const formData = new FormData();
    formData.append("file", blob, "sargam-recording.wav");
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

      const nextAnalysis = await response.json();
      setAnalysis(nextAnalysis);
      setResults((currentResults) => {
        const withoutCurrent = currentResults.filter((result) => result.step !== selectedNote.step);
        return [
          ...withoutCurrent,
          {
            step: selectedNote.step,
            sargam: selectedNote.sargam,
            note: selectedNote.note,
            accuracy: nextAnalysis.accuracy,
            status: nextAnalysis.status
          }
        ].sort((first, second) => first.step - second.step);
      });
    } catch (error) {
      setAnalysisError(error.message);
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <div className="sargam-layout">
      <section className="practice-main">
        <div className="sargam-controls">
          <div>
            <p className="eyebrow">Sargam practice</p>
            <h3>Choose your root Sa and practice each note.</h3>
          </div>
          <div className="root-selector" aria-label="Root Sa">
            {ROOT_OPTIONS.map((option) => (
              <button
                className={option === root ? "selected" : ""}
                key={option}
                type="button"
                onClick={() => resetSession(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <HarmoniumKeyboard
          notes={scale}
          selectedNote={selectedNote}
          onSelect={(note) => {
            setStepIndex(note.step - 1);
            setAnalysis(null);
            setAnalysisError("");
          }}
        />

        <div className="step-controls">
          <button
            className="ghost-button"
            type="button"
            onClick={() => {
              setStepIndex(Math.max(0, stepIndex - 1));
              setAnalysis(null);
            }}
            disabled={stepIndex === 0}
          >
            <ChevronLeft size={18} />
            Previous
          </button>
          <strong>
            Step {stepIndex + 1} of {scale.length}
          </strong>
          <button
            className="ghost-button"
            type="button"
            onClick={() => {
              setStepIndex(Math.min(scale.length - 1, stepIndex + 1));
              setAnalysis(null);
            }}
            disabled={stepIndex === scale.length - 1}
          >
            Next
            <ChevronRight size={18} />
          </button>
        </div>

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
        <div className="info-card summary-card">
          <div className="summary-header">
            <div>
              <p className="eyebrow">Session score</p>
              <h3>{sessionScore || "--"}%</h3>
            </div>
            <button className="icon-button" type="button" onClick={() => resetSession()}>
              <RotateCcw size={18} />
            </button>
          </div>
          <div className="summary-list">
            {scale.map((note) => {
              const result = results.find((item) => item.step === note.step);
              return (
                <div className="summary-row" key={`${note.sargam}-${note.note}`}>
                  <span>
                    {note.sargam} / {note.note}
                  </span>
                  <strong>{result ? `${result.accuracy}%` : "Pending"}</strong>
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}

