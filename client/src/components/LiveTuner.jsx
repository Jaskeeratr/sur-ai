import { Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createLivePitchTracker } from "../audio/livePitch.js";
import { CHROMATIC_NOTES } from "../data/notes.js";

const CENTS_RANGE = 50;
const SMOOTHING = 0.35;

function describeFrequency(frequency) {
  if (!frequency || frequency <= 0) {
    return null;
  }
  const midi = 69 + 12 * Math.log2(frequency / 440);
  const rounded = Math.round(midi);
  const noteName = CHROMATIC_NOTES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${noteName}${octave}`;
}

export function LiveTuner({ targetFrequency, targetLabel }) {
  const trackerRef = useRef(null);
  const smoothedCentsRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const [tunerError, setTunerError] = useState("");
  const [frame, setFrame] = useState(null);

  const targetRef = useRef(targetFrequency);
  targetRef.current = targetFrequency;

  useEffect(() => {
    return () => {
      trackerRef.current?.stop();
      trackerRef.current = null;
    };
  }, []);

  // Reset smoothing when the target changes so the needle snaps to the new note.
  useEffect(() => {
    smoothedCentsRef.current = null;
  }, [targetFrequency]);

  async function toggleListening() {
    if (isListening) {
      trackerRef.current?.stop();
      trackerRef.current = null;
      setIsListening(false);
      setFrame(null);
      smoothedCentsRef.current = null;
      return;
    }

    setTunerError("");
    try {
      trackerRef.current = await createLivePitchTracker({
        onFrame: (data) => {
          if (data.frequency && data.confidence >= 0.5) {
            const rawCents = 1200 * Math.log2(data.frequency / targetRef.current);
            const previous = smoothedCentsRef.current;
            const smoothed =
              previous == null || Math.abs(rawCents - previous) > 150
                ? rawCents
                : previous + (rawCents - previous) * SMOOTHING;
            smoothedCentsRef.current = smoothed;
            setFrame({ frequency: data.frequency, cents: smoothed, voiced: true });
          } else {
            setFrame((current) => (current?.voiced ? { ...current, voiced: false } : current));
          }
        }
      });
      setIsListening(true);
    } catch (error) {
      setTunerError(
        error.name === "NotAllowedError"
          ? "Microphone permission was denied."
          : error.message || "Could not start the live tuner."
      );
    }
  }

  const cents = frame?.cents ?? null;
  const clamped = cents == null ? 0 : Math.max(-CENTS_RANGE, Math.min(CENTS_RANGE, cents));
  const needlePosition = 50 + (clamped / CENTS_RANGE) * 50;
  const zone =
    cents == null ? "idle" : Math.abs(cents) <= 10 ? "in-tune" : Math.abs(cents) <= 25 ? "close" : "off";
  const outOfRange = cents != null && Math.abs(cents) > CENTS_RANGE;

  return (
    <div className="info-card tuner-card">
      <div className="tuner-header">
        <div>
          <p className="eyebrow">Live tuner</p>
          <h3>{isListening ? "Listening..." : "Sing against the target"}</h3>
        </div>
        <button
          className={`ghost-button ${isListening ? "tuner-active" : ""}`}
          type="button"
          onClick={toggleListening}
          aria-pressed={isListening}
        >
          {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          {isListening ? "Stop" : "Start tuner"}
        </button>
      </div>

      <div className={`tuner-meter zone-${zone}`} role="img" aria-label="Pitch offset meter">
        <div className="tuner-scale">
          <span className="tuner-tick" style={{ left: "0%" }}>
            -50
          </span>
          <span className="tuner-tick" style={{ left: "50%" }}>
            0
          </span>
          <span className="tuner-tick" style={{ left: "100%" }}>
            +50
          </span>
        </div>
        <div className="tuner-track">
          <span className="tuner-green-zone" />
          <span
            className={`tuner-needle ${frame?.voiced === false ? "tuner-needle-stale" : ""}`}
            style={{ left: `${needlePosition}%` }}
          />
        </div>
      </div>

      <div className="tuner-readout">
        <div>
          <span>Target</span>
          <strong>
            {targetLabel} · {targetFrequency.toFixed(2)} Hz
          </strong>
        </div>
        <div>
          <span>Voice</span>
          <strong>
            {frame?.frequency
              ? `${describeFrequency(frame.frequency)} · ${frame.frequency.toFixed(1)} Hz`
              : isListening
                ? "Waiting for a held note"
                : "Tuner off"}
          </strong>
        </div>
        <div>
          <span>Offset</span>
          <strong className={`tuner-cents zone-${zone}`}>
            {cents == null
              ? "-"
              : outOfRange
                ? `${cents > 0 ? ">+" : "<-"}${CENTS_RANGE} cents`
                : `${cents > 0 ? "+" : ""}${Math.round(cents)} cents`}
          </strong>
        </div>
      </div>

      {tunerError ? <p className="error-banner">{tunerError}</p> : null}
    </div>
  );
}
