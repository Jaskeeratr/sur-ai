import { useMemo, useRef, useState } from "react";
import { Loader2, Mic, Music2, Play, Square } from "lucide-react";
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { convertBlobToWav } from "../components/RecordingControls.jsx";
import { startHarmoniumVoice } from "../audio/harmonium.js";
import { CHROMATIC_NOTES, DEFAULT_SA, MAJOR_SCALE_INTERVALS, SARGAM_LABELS, getFrequency } from "../data/notes.js";
import { ROOT_OPTIONS } from "../data/sargam.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const SAMPLE_RATE = 16000;
const BUFFER_SIZE = 2048;

const PRACTICES = [
  {
    id: "hold-sa",
    name: "Hold Sa",
    text: "Sa Sa Sa Sa",
    goal: "Stabilize one pitch before moving through the scale."
  },
  {
    id: "sa-pa-sa",
    name: "Sa Pa Sa",
    text: "Sa Pa Sa",
    goal: "Practice a clean jump to Pa and return to Sa."
  },
  {
    id: "ascending",
    name: "Ascending Sargam",
    text: "Sa Re Ga Ma Pa Dha Ni Sa'",
    goal: "Move upward through the major Sargam sequence."
  },
  {
    id: "turnaround",
    name: "Sargam Turnaround",
    text: "Sa Re Ga Re Sa",
    goal: "Control short melodic movement around Sa."
  }
];

function parseToken(token) {
  const clean = token.trim();
  if (!clean) {
    return null;
  }
  const upper = clean.replace(/[,]/g, "");
  const isUpperSa = upper.toLowerCase().startsWith("sa") && upper.includes("'");
  const label = upper.replace(/'/g, "");
  const normalized = SARGAM_LABELS.find((item) => item.toLowerCase() === label.toLowerCase());
  if (!normalized) {
    return null;
  }
  const degree = normalized === "Sa" && isUpperSa ? 7 : SARGAM_LABELS.indexOf(normalized);
  return { label: normalized, degree };
}

function buildPracticeNotes(text, rootOption) {
  const rootIndex = CHROMATIC_NOTES.indexOf(rootOption.value);
  return text
    .split(/\s+/)
    .map(parseToken)
    .filter(Boolean)
    .map((token, index) => {
      const interval = token.degree === 7 ? 12 : MAJOR_SCALE_INTERVALS[token.degree];
      const chromaticIndex = rootIndex + interval;
      const octave = rootOption.octave + Math.floor(chromaticIndex / CHROMATIC_NOTES.length);
      const noteName = CHROMATIC_NOTES[chromaticIndex % CHROMATIC_NOTES.length];
      return {
        step: index + 1,
        sargam: token.degree === 7 ? "Sa'" : token.label,
        note: `${noteName}${octave}`,
        frequency: getFrequency(noteName, octave)
      };
    });
}

function getRms(samples) {
  let rms = 0;
  for (const sample of samples) {
    rms += sample * sample;
  }
  return Math.sqrt(rms / samples.length);
}

function estimatePitch(samples, sampleRate, gateThreshold) {
  const rms = getRms(samples);
  if (rms < gateThreshold) {
    return null;
  }

  let bestOffset = -1;
  let bestCorrelation = 0;
  const minOffset = Math.floor(sampleRate / 900);
  const maxOffset = Math.floor(sampleRate / 70);

  for (let offset = minOffset; offset <= maxOffset; offset += 1) {
    let correlation = 0;
    for (let index = 0; index < samples.length - offset; index += 1) {
      correlation += samples[index] * samples[index + offset];
    }
    correlation /= samples.length - offset;
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
    }
  }

  if (bestOffset <= 0 || bestCorrelation < 0.01) {
    return null;
  }
  return sampleRate / bestOffset;
}

export function PracticePage() {
  const [rootOption, setRootOption] = useState(ROOT_OPTIONS[0]);
  const [practiceText, setPracticeText] = useState(PRACTICES[1].text);
  const [selectedPractice, setSelectedPractice] = useState(PRACTICES[1].id);
  const [livePoints, setLivePoints] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCalibratingNoise, setIsCalibratingNoise] = useState(false);
  const [noiseFloor, setNoiseFloor] = useState(null);
  const [noteDuration, setNoteDuration] = useState(1.2);
  const [currentTarget, setCurrentTarget] = useState(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const startedAtRef = useRef(0);
  const referenceContextRef = useRef(null);

  const notes = useMemo(() => buildPracticeNotes(practiceText, rootOption), [practiceText, rootOption]);
  const targetData = useMemo(
    () =>
      notes.map((note, index) => ({
        time: index,
        target: note.frequency,
        label: `${note.sargam} / ${note.note}`
      })),
    [notes]
  );
  const pitchGate = Math.max(0.015, (noiseFloor || 0) * 3.5);

  async function calibrateNoise() {
    setError("");
    setIsCalibratingNoise(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        throw new Error("This browser does not support audio processing.");
      }
      const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
      const levels = [];
      const startedAt = performance.now();

      await new Promise((resolve) => {
        processor.onaudioprocess = (event) => {
          levels.push(getRms(event.inputBuffer.getChannelData(0)));
          if (performance.now() - startedAt > 1200) {
            resolve();
          }
        };
        source.connect(processor);
        processor.connect(audioContext.destination);
      });

      processor.disconnect();
      source.disconnect();
      await audioContext.close();
      stream.getTracks().forEach((track) => track.stop());
      const sorted = levels.sort((first, second) => first - second);
      const median = sorted[Math.floor(sorted.length / 2)] || 0;
      setNoiseFloor(Number(median.toFixed(4)));
    } catch (calibrationError) {
      setError(`Noise calibration failed. ${calibrationError.message}`);
    } finally {
      setIsCalibratingNoise(false);
    }
  }

  async function playReferenceSequence() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext || !notes.length) {
      return;
    }
    const audioContext = referenceContextRef.current || new AudioContext();
    referenceContextRef.current = audioContext;
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    notes.forEach((note, index) => {
      const start = audioContext.currentTime + index * noteDuration;
      startHarmoniumVoice(audioContext, note, start, Math.max(0.45, noteDuration * 0.86), 0.2);
    });
  }

  async function startRecording() {
    if (!notes.length) {
      setError("Add at least one valid Sargam note before recording.");
      return;
    }

    setError("");
    setAnalysis(null);
    setLivePoints([]);
    setCurrentTarget(notes[0]);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      startedAtRef.current = performance.now();

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = async () => {
        stopLivePitch();
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setIsRecording(false);
        await analyzeRecording(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
      };

      startLivePitch(stream);
      recorder.start();
      setIsRecording(true);
    } catch (recordingError) {
      setError(
        recordingError.name === "NotAllowedError"
          ? "Microphone permission was denied."
          : "Could not start microphone recording."
      );
    }
  }

  function startLivePitch(stream) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      return;
    }
    const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
    processor.onaudioprocess = (event) => {
      const elapsed = (performance.now() - startedAtRef.current) / 1000;
      const target = notes[Math.min(notes.length - 1, Math.floor(elapsed / noteDuration))] || notes[0];
      setCurrentTarget(target);
      const frequency = estimatePitch(event.inputBuffer.getChannelData(0), audioContext.sampleRate, pitchGate);
      if (!frequency || !target) {
        return;
      }
      setLivePoints((current) => [
        ...current.slice(-80),
        {
          time: Number(elapsed.toFixed(2)),
          frequency: Math.round(frequency * 100) / 100,
          target: target.frequency
        }
      ]);
    };
    source.connect(processor);
    processor.connect(audioContext.destination);
    audioContextRef.current = audioContext;
    processorRef.current = processor;
    sourceRef.current = source;
  }

  function stopLivePitch() {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    audioContextRef.current?.close();
    processorRef.current = null;
    sourceRef.current = null;
    audioContextRef.current = null;
    setCurrentTarget(null);
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  async function analyzeRecording(blob) {
    setIsAnalyzing(true);
    const wavBlob = await convertBlobToWav(blob);
    const formData = new FormData();
    formData.append("file", wavBlob, "practice-sequence.wav");
    formData.append("target_notes", notes.map((note) => note.note).join(","));

    try {
      const response = await fetch(`${API_BASE_URL}/analyze-sequence`, {
        method: "POST",
        body: formData
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.detail || "Practice analysis failed.");
      }
      setAnalysis(await response.json());
    } catch (analysisError) {
      setError(`Could not analyze the practice recording. ${analysisError.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <div className="practice-layout">
      <section className="practice-main">
        <div className="practice-builder">
          <div>
            <p className="eyebrow">Guided practice</p>
            <h3>Choose a drill or build your own Sargam phrase.</h3>
          </div>
          <div className="practice-drill-grid">
            {PRACTICES.map((practice) => (
              <button
                className={selectedPractice === practice.id ? "selected" : ""}
                key={practice.id}
                type="button"
                onClick={() => {
                  setSelectedPractice(practice.id);
                  setPracticeText(practice.text);
                  setAnalysis(null);
                  setLivePoints([]);
                }}
              >
                <strong>{practice.name}</strong>
                <span>{practice.goal}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="practice-builder">
          <div className="practice-builder-row">
            <div>
              <p className="eyebrow">Root and phrase</p>
              <h3>Practice sequence</h3>
            </div>
            <div className="root-selector" aria-label="Practice root Sa">
              {ROOT_OPTIONS.slice(0, 8).map((option) => (
                <button
                  className={option.label === rootOption.label && option.octave === rootOption.octave ? "selected" : ""}
                  key={`${option.value}${option.octave}`}
                  type="button"
                  onClick={() => setRootOption(option)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="practice-settings">
            <label>
              <span>Note length</span>
              <input
                max="2"
                min="0.7"
                step="0.1"
                type="range"
                value={noteDuration}
                onChange={(event) => setNoteDuration(Number(event.target.value))}
              />
              <strong>{noteDuration.toFixed(1)}s</strong>
            </label>
            <button className="ghost-button" type="button" onClick={calibrateNoise} disabled={isCalibratingNoise || isRecording}>
              {isCalibratingNoise ? <Loader2 className="spin" size={18} /> : <Mic size={18} />}
              {isCalibratingNoise ? "Calibrating" : "Calibrate room"}
            </button>
            <span className="noise-readout">
              Gate {pitchGate.toFixed(3)}
              {noiseFloor != null ? ` from room ${noiseFloor.toFixed(4)}` : ""}
            </span>
          </div>
          <textarea
            className="practice-textarea"
            value={practiceText}
            onChange={(event) => {
              setPracticeText(event.target.value);
              setSelectedPractice("");
              setAnalysis(null);
            }}
            placeholder="Sa Re Ga Ma Pa Dha Ni Sa'"
          />
          <div className="sequence-pills">
            {notes.map((note) => (
              <span key={`${note.step}-${note.note}`}>
                {note.sargam} <strong>{note.note}</strong>
              </span>
            ))}
          </div>
          <div className="practice-actions">
            <button className="ghost-button" type="button" onClick={playReferenceSequence} disabled={!notes.length}>
              <Play size={18} />
              Play reference
            </button>
            {!isRecording ? (
              <button className="primary-button" type="button" onClick={startRecording} disabled={isAnalyzing}>
                {isAnalyzing ? <Loader2 className="spin" size={18} /> : <Mic size={18} />}
                {isAnalyzing ? "Analyzing" : "Record voice"}
              </button>
            ) : (
              <button className="stop-button" type="button" onClick={stopRecording}>
                <Square size={18} />
                Stop
              </button>
            )}
          </div>
          {error ? <p className="error-banner">{error}</p> : null}
        </div>
      </section>

      <aside className="practice-side">
        <div className="info-card">
          <p className="eyebrow">Live pitch</p>
          <h3>{isRecording ? "Listening while you sing" : "Ready for live tracking"}</h3>
          <div className="current-target">
            <span>Current target</span>
            <strong>{currentTarget ? `${currentTarget.sargam} / ${currentTarget.note}` : notes[0] ? `${notes[0].sargam} / ${notes[0].note}` : "-"}</strong>
          </div>
          <div className="live-graph">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={livePoints} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
                <XAxis dataKey="time" tick={{ fill: "#53635b", fontSize: 12 }} />
                <YAxis domain={["dataMin - 40", "dataMax + 40"]} width={48} tick={{ fill: "#53635b", fontSize: 12 }} />
                <Tooltip formatter={(value) => [`${Number(value).toFixed(2)} Hz`, "voice"]} />
                {targetData[0] ? <ReferenceLine y={targetData[0].target} stroke="#1f6f5b" strokeDasharray="5 5" /> : null}
                <Line type="stepAfter" dataKey="target" stroke="#1f6f5b" dot={false} strokeWidth={2} strokeOpacity={0.45} />
                <Line type="monotone" dataKey="frequency" stroke="#b54b35" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="info-card summary-card">
          <div className="summary-header">
            <div>
              <p className="eyebrow">Final result</p>
              <h3>{analysis ? `${analysis.sequence_accuracy}%` : "--%"}</h3>
            </div>
            <Music2 size={22} />
          </div>
          <div className="summary-list">
            {(analysis?.segments || notes).map((item, index) => (
              <div className="summary-row" key={`${item.target_note || item.note}-${index}`}>
                <span>
                  {item.target_note || item.note}
                  {item.detected_note ? ` -> ${item.detected_note}` : ""}
                </span>
                <strong>{item.accuracy != null ? `${item.accuracy}%` : "Pending"}</strong>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
