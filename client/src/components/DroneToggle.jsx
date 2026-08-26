import { Radio, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { startDrone } from "../audio/harmonium.js";

export function DroneToggle({ frequency, label }) {
  const audioContextRef = useRef(null);
  const droneRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);

  function stopDrone() {
    droneRef.current?.stop();
    droneRef.current = null;
  }

  useEffect(() => {
    // Retune a running drone when the root Sa changes.
    if (isPlaying && audioContextRef.current) {
      stopDrone();
      droneRef.current = startDrone(audioContextRef.current, frequency);
    }
  }, [frequency]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      stopDrone();
      audioContextRef.current?.close();
      audioContextRef.current = null;
    };
  }, []);

  async function toggleDrone() {
    if (isPlaying) {
      stopDrone();
      setIsPlaying(false);
      return;
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      return;
    }
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }
    droneRef.current = startDrone(audioContextRef.current, frequency);
    setIsPlaying(true);
  }

  return (
    <button
      className={`ghost-button drone-toggle ${isPlaying ? "drone-active" : ""}`}
      type="button"
      onClick={toggleDrone}
      aria-pressed={isPlaying}
      title="Tanpura-style Sa and Pa drone for pitch reference"
    >
      {isPlaying ? <VolumeX size={18} /> : <Radio size={18} />}
      {isPlaying ? "Stop drone" : `Sa drone${label ? ` (${label})` : ""}`}
    </button>
  );
}
