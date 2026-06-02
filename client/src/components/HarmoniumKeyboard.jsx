import { MousePointerClick, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

function createHarmoniumVoice(audioContext, frequency) {
  const output = audioContext.createGain();
  const primary = audioContext.createOscillator();
  const reed = audioContext.createOscillator();
  const softBuzz = audioContext.createOscillator();
  const primaryGain = audioContext.createGain();
  const reedGain = audioContext.createGain();
  const buzzGain = audioContext.createGain();

  primary.type = "sine";
  reed.type = "triangle";
  softBuzz.type = "sawtooth";
  primary.frequency.value = frequency;
  reed.frequency.value = frequency * 2;
  softBuzz.frequency.value = frequency * 3;
  primaryGain.gain.value = 0.34;
  reedGain.gain.value = 0.1;
  buzzGain.gain.value = 0.025;
  output.gain.value = 0;

  primary.connect(primaryGain);
  reed.connect(reedGain);
  softBuzz.connect(buzzGain);
  primaryGain.connect(output);
  reedGain.connect(output);
  buzzGain.connect(output);
  output.connect(audioContext.destination);

  return {
    output,
    oscillators: [primary, reed, softBuzz]
  };
}

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
      voice.oscillators.forEach((oscillator) => oscillator.stop());
      voice.output.disconnect();
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
    const voice = createHarmoniumVoice(audioContext, note.frequency);
    const now = audioContext.currentTime;
    voice.output.gain.setValueAtTime(0, now);
    voice.output.gain.linearRampToValueAtTime(0.22, now + 0.035);
    voice.oscillators.forEach((oscillator) => oscillator.start(now));
    activeVoiceRef.current = { ...voice, audioContext };

    if (duration) {
      window.setTimeout(() => stopTone(), duration);
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
            const isSa = note.sargam === "Sa";

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
