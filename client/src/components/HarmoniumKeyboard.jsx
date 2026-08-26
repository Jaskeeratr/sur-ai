import { MousePointerClick, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { startHarmoniumVoice } from "../audio/harmonium.js";

export function HarmoniumKeyboard({ notes, selectedNote, onSelect }) {
  const audioContextRef = useRef(null);
  const activeVoiceRef = useRef(null);
  const [playMode, setPlayMode] = useState("tap");

  useEffect(() => {
    return () => stopTone();
  }, []);

  function getAudioContext() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      return null;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    return audioContextRef.current;
  }

  function stopTone() {
    const voice = activeVoiceRef.current;
    if (!voice) {
      return;
    }

    const now = voice.audioContext.currentTime;
    voice.output.gain.cancelScheduledValues(now);
    voice.output.gain.setTargetAtTime(0, now, 0.035);
    window.setTimeout(() => {
      voice.oscillators.forEach((oscillator) => {
        try {
          oscillator.stop();
        } catch {
          // Oscillator may already have a scheduled stop for tap playback.
        }
      });
      try {
        voice.output.disconnect();
      } catch {
        // Output may already be disconnected after a short tap note.
      }
    }, 120);
    activeVoiceRef.current = null;
  }

  function startTone(note, duration = null) {
    const audioContext = getAudioContext();
    if (!audioContext) {
      return;
    }

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    stopTone();
    const now = audioContext.currentTime;
    const voice = startHarmoniumVoice(audioContext, note, now, duration, 0.22);
    activeVoiceRef.current = { ...voice, audioContext };
    if (duration) {
      window.setTimeout(() => {
        if (activeVoiceRef.current?.output === voice.output) {
          try {
            voice.output.disconnect();
          } catch {
            // Tap note may already be disconnected.
          }
          activeVoiceRef.current = null;
        }
      }, duration + 220);
    }
  }

  function playReference(note) {
    onSelect(note);
    startTone(note, playMode === "tap" ? 950 : null);
  }

  function handlePointerDown(note) {
    if (playMode !== "hold") {
      return;
    }
    onSelect(note);
    startTone(note);
  }

  function handlePointerUp() {
    if (playMode === "hold") {
      stopTone();
    }
  }

  const isCompact = notes.length <= 12;

  return (
    <div className="keyboard-panel">
      <div className="section-heading keyboard-heading">
        <div>
          <p className="eyebrow">Target note</p>
          <h3>Playable harmonium</h3>
        </div>
        <div className="play-mode-toggle" aria-label="Playback mode">
          <button
            className={playMode === "tap" ? "active" : ""}
            type="button"
            onClick={() => {
              stopTone();
              setPlayMode("tap");
            }}
          >
            <MousePointerClick size={16} />
            Tap
          </button>
          <button
            className={playMode === "hold" ? "active" : ""}
            type="button"
            onClick={() => {
              stopTone();
              setPlayMode("hold");
            }}
          >
            <Volume2 size={16} />
            Hold
          </button>
        </div>
      </div>
      <div className="harmonium-body">
        <div className="harmonium-brand">SurSadhana</div>
        <div
          className={`harmonium-keyboard ${isCompact ? "compact-keyboard" : ""}`}
          role="list"
          aria-label="Playable harmonium notes"
        >
          {notes.map((note, index) => {
            const isSelected = selectedNote.note === note.note;
            const isSa = note.sargam === "Sa" || note.sargam === "Sa'";

            return (
              <button
                className={`harmonium-key ${note.isBlack ? "black-key" : "white-key"} ${
                  isSelected ? "selected" : ""
                } ${isSa ? "sa-key" : ""}`}
                key={`${note.note}-${note.sargam}-${index}`}
                type="button"
                onClick={() => {
                  if (playMode === "tap") {
                    playReference(note);
                  }
                }}
                onPointerDown={() => handlePointerDown(note)}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={handlePointerUp}
                aria-pressed={isSelected}
              >
                <span>{note.sargam || "-"}</span>
                <strong>{note.note}</strong>
                <small>{note.frequency.toFixed(2)} Hz</small>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
