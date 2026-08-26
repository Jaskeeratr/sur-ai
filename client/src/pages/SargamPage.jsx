import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { ROOT_OPTIONS, buildSargamScale } from "../data/sargam.js";
import { DEFAULT_THAAT } from "../data/thaats.js";
import { saveAttempt } from "../data/progress.js";
import { AttemptPlayback } from "../components/AttemptPlayback.jsx";
import { DroneToggle } from "../components/DroneToggle.jsx";
import { LiveTuner } from "../components/LiveTuner.jsx";
import { ThaatSelector } from "../components/ThaatSelector.jsx";
import { HarmoniumKeyboard } from "../components/HarmoniumKeyboard.jsx";
import { RecordingControls } from "../components/RecordingControls.jsx";
import { FeedbackCard } from "../components/FeedbackCard.jsx";
import { SelectedNoteCard } from "../components/SelectedNoteCard.jsx";
import { SaCalibrationCard } from "../components/SaCalibrationCard.jsx";

import { API_BASE_URL, buildBackendError, checkBackendHealth } from "../data/api.js";

function parseNote(note) {
  const match = note?.match(/^([A-G]#?)(\d)$/);
  return match ? { noteName: match[1], octave: Number(match[2]) } : null;
}

export function SargamPage() {
  const [rootOption, setRootOption] = useState(ROOT_OPTIONS[0]);
  const [thaat, setThaat] = useState(DEFAULT_THAAT);
  const [stepIndex, setStepIndex] = useState(0);
  const [results, setResults] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [analysisError, setAnalysisError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [calibration, setCalibration] = useState(null);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [backendNotice, setBackendNotice] = useState("");
  const [lastAttempt, setLastAttempt] = useState(null);

  const scale = useMemo(
    () => buildSargamScale(rootOption.value, rootOption.octave, thaat.intervals),
    [rootOption, thaat]
  );
  const selectedNote = scale[stepIndex];
  const sessionScore = results.length
    ? Math.round(results.reduce((sum, result) => sum + result.accuracy, 0) / results.length)
    : 0;

  function resetSession(nextRootOption = rootOption) {
    setRootOption(nextRootOption);
    setStepIndex(0);
    setResults([]);
    setAnalysis(null);
    setAnalysisError("");
    setCalibration(null);
  }

  async function analyzeRecording(blob) {
    setIsAnalyzing(true);
    setAnalysisError("");
    setAnalysis(null);
    setBackendNotice("");
    setLastAttempt({ blob, notes: [selectedNote] });

    const formData = new FormData();
    formData.append("file", blob, "sargam-recording.wav");
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
          mode: "sargam",
          label: `${selectedNote.sargam} / ${selectedNote.note}`,
          targetNote: selectedNote.note,
          accuracy: nextAnalysis.accuracy,
          centsOff: nextAnalysis.cents_off,
          status: nextAnalysis.status,
          stabilityLabel: nextAnalysis.stability_label
        });
      }
      if (nextAnalysis.comparison_available !== false) {
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
      const matchedRoot = parsedNote
        ? ROOT_OPTIONS.find(
            (option) => option.value === parsedNote.noteName && option.octave === parsedNote.octave
          )
        : null;

      if (matchedRoot) {
        resetSession(matchedRoot);
      }
      setCalibration({
        ...nextCalibration,
        feedback: matchedRoot
          ? `${nextCalibration.feedback} Sargam root moved to ${matchedRoot.label}.`
          : `${nextCalibration.feedback || "Sa detected."} Pick the closest root manually if it is outside the selector.`
      });
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
                className={option.label === rootOption.label && option.octave === rootOption.octave ? "selected" : ""}
                key={`${option.value}${option.octave}`}
                type="button"
                onClick={() => resetSession(option)}
              >
                {option.label}
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

        <div className="drone-row">
          <DroneToggle frequency={scale[0].frequency} label={rootOption.label} />
          <ThaatSelector
            thaat={thaat}
            onChange={(nextThaat) => {
              setThaat(nextThaat);
              setStepIndex(0);
              setResults([]);
              setAnalysis(null);
            }}
          />
          <span className="muted">Keep the Sa drone running while you move through the scale.</span>
        </div>

        <LiveTuner
          targetFrequency={selectedNote.frequency}
          targetLabel={`${selectedNote.sargam} / ${selectedNote.note}`}
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
        <AttemptPlayback blob={lastAttempt?.blob} notes={lastAttempt?.notes} noteDuration={2.4} />
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
