import { Square, Mic, Loader2 } from "lucide-react";
import { useRef, useState } from "react";

const UPLOAD_SAMPLE_RATE = 16000;
const MAX_RECORDING_SECONDS = 6;

function resampleChannel(channelData, sourceRate, targetRate) {
  if (sourceRate === targetRate) {
    return channelData;
  }

  const outputLength = Math.max(1, Math.floor((channelData.length * targetRate) / sourceRate));
  const output = new Float32Array(outputLength);
  const ratio = sourceRate / targetRate;

  for (let index = 0; index < outputLength; index += 1) {
    const sourcePosition = index * ratio;
    const sourceIndex = Math.floor(sourcePosition);
    const fraction = sourcePosition - sourceIndex;
    const current = channelData[sourceIndex] || 0;
    const next = channelData[sourceIndex + 1] || current;
    output[index] = current + (next - current) * fraction;
  }

  return output;
}

export async function convertBlobToWav(blob) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    throw new Error("This browser does not support audio processing.");
  }

  const audioContext = new AudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  await audioContext.close();

  const sampleRate = UPLOAD_SAMPLE_RATE;
  const maxSamples = Math.min(
    audioBuffer.length,
    Math.floor(audioBuffer.sampleRate * MAX_RECORDING_SECONDS)
  );
  const channelData = resampleChannel(
    audioBuffer.getChannelData(0).slice(0, maxSamples),
    audioBuffer.sampleRate,
    sampleRate
  );
  const wavBuffer = new ArrayBuffer(44 + channelData.length * 2);
  const view = new DataView(wavBuffer);

  function writeString(offset, value) {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + channelData.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, channelData.length * 2, true);

  let offset = 44;
  for (let index = 0; index < channelData.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, channelData[index]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([view], { type: "audio/wav" });
}

export function RecordingControls({
  disabled,
  isAnalyzing,
  onRecordingReady,
  eyebrow = "Voice sample",
  title = "Record your note",
  recordingTitle = "Recording in progress",
  description = "A short 2-5 second clip is enough for the first analysis pass.",
  recordingDescription = "Hold the note steadily, then stop when ready.",
  startLabel = "Start recording",
  analyzingLabel = "Analyzing"
}) {
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState("");

  async function startRecording() {
    setRecordingError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        try {
          const wavBlob = await convertBlobToWav(blob);
          onRecordingReady(wavBlob);
        } catch (error) {
          setRecordingError(error.message || "Could not prepare the recording for analysis.");
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (error) {
      setRecordingError(
        error.name === "NotAllowedError"
          ? "Microphone permission was denied."
          : "Could not start microphone recording."
      );
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    setIsRecording(false);
  }

  const isBusy = disabled || isAnalyzing;

  return (
    <div className="recording-panel">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h3>{isRecording ? recordingTitle : title}</h3>
        <p className="muted">
          {isRecording ? recordingDescription : description}
        </p>
      </div>

      <div className="recording-actions">
        {!isRecording ? (
          <button className="primary-button" type="button" onClick={startRecording} disabled={isBusy}>
            {isAnalyzing ? <Loader2 className="spin" size={18} /> : <Mic size={18} />}
            {isAnalyzing ? analyzingLabel : startLabel}
          </button>
        ) : (
          <button className="stop-button" type="button" onClick={stopRecording}>
            <Square size={18} />
            Stop recording
          </button>
        )}
      </div>

      {recordingError ? <p className="error-banner">{recordingError}</p> : null}
    </div>
  );
}
