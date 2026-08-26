import { Headphones, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { startHarmoniumVoice } from "../audio/harmonium.js";

// Lets the singer hear their last recorded attempt, alone or layered under
// the harmonium reference, which is one of the most effective feedback loops
// in vocal practice.
export function AttemptPlayback({ blob, notes, noteDuration = 1.2 }) {
  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const [blobUrl, setBlobUrl] = useState(null);

  useEffect(() => {
    if (!blob) {
      setBlobUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  useEffect(() => {
    return () => {
      audioContextRef.current?.close();
      audioContextRef.current = null;
    };
  }, []);

  if (!blob || !blobUrl) {
    return null;
  }

  async function playWithReference() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const player = audioRef.current;
    if (!player) {
      return;
    }

    if (AudioContext && notes?.length) {
      const audioContext = audioContextRef.current || new AudioContext();
      audioContextRef.current = audioContext;
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
      notes.forEach((note, index) => {
        const start = audioContext.currentTime + 0.05 + index * noteDuration;
        startHarmoniumVoice(audioContext, note, start, Math.max(0.45, noteDuration * 0.86), 0.1);
      });
    }

    player.currentTime = 0;
    await player.play();
  }

  return (
    <div className="info-card attempt-card">
      <div className="attempt-header">
        <Headphones size={18} aria-hidden="true" />
        <div>
          <p className="eyebrow">Your attempt</p>
          <h3>Listen back</h3>
        </div>
      </div>
      <audio ref={audioRef} controls src={blobUrl} className="attempt-audio" />
      {notes?.length ? (
        <button className="ghost-button" type="button" onClick={playWithReference}>
          <Play size={18} />
          Play with reference
        </button>
      ) : null}
    </div>
  );
}
