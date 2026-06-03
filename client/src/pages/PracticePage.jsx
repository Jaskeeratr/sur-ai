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

function estimatePitch(samples, sampleRate) {
  let rms = 0;
  for (const sample of samples) {
    rms += sample * sample;
  }
  rms = Math.sqrt(rms / samples.length);
  if (rms < 0.015) {
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

function createVoice(audioContext, frequency) {
  const output = audioContext.createGain();
  const primary = audioContext.createOscillator();
  const reed = audioContext.createOscillator();
  primary.type = "sine";
  reed.type = "triangle";
  primary.frequency.value = frequency;
  reed.frequency.value = frequency * 2;
  const primaryGain = audioContext.createGain();
  const reedGain = audioContext.createGain();
  primaryGain.gain.value = 0.32;
  reedGain.gain.value = 0.08;
  output.gain.value = 0;
  primary.connect(primaryGain);
  reed.connect(reedGain);
  primaryGain.connect(output);
  reedGain.connect(output);
  output.connect(audioContext.destination);
  return { output, oscillators: [primary, reed] };
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
      const start = audioContext.currentTime + index * 0.82;
      const voice = createVoice(audioContext, note.frequency);
      voice.output.gain.setValueAtTime(0, start);
      voice.output.gain.linearRampToValueAtTime(0.2, start + 0.04);
      voice.output.gain.setTargetAtTime(0, start + 0.62, 0.04);
      voice.oscillators.forEach((oscillator) => {
        oscillator.start(start);
        oscillator.stop(start + 0.78);
      });
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
      const frequency = estimatePitch(event.inputBuffer.getChannelData(0), audioContext.sampleRate);
      if (!frequency) {
        return;
      }
      const elapsed = (performance.now() - startedAtRef.current) / 1000;
      setLivePoints((current) => [
        ...current.slice(-80),
        {
          time: Number(elapsed.toFixed(2)),
          frequency: Math.round(frequency * 100) / 100
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
          <div className="live-graph">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={livePoints} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
                <XAxis dataKey="time" tick={{ fill: "#53635b", fontSize: 12 }} />
                <YAxis domain={["dataMin - 40", "dataMax + 40"]} width={48} tick={{ fill: "#53635b", fontSize: 12 }} />
                <Tooltip formatter={(value) => [`${Number(value).toFixed(2)} Hz`, "voice"]} />
                {targetData[0] ? <ReferenceLine y={targetData[0].target} stroke="#1f6f5b" strokeDasharray="5 5" /> : null}
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
