import { Square, Mic, Loader2 } from "lucide-react";
import { useRef, useState } from "react";

export function RecordingControls({ disabled, isAnalyzing, onRecordingReady }) {
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

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        onRecordingReady(blob);
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
        <p className="eyebrow">Voice sample</p>
        <h3>{isRecording ? "Recording in progress" : "Record your note"}</h3>
        <p className="muted">
          {isRecording
            ? "Hold the note steadily, then stop when ready."
            : "A short 2-5 second clip is enough for the first analysis pass."}
        </p>
      </div>

      <div className="recording-actions">
        {!isRecording ? (
          <button className="primary-button" type="button" onClick={startRecording} disabled={isBusy}>
            {isAnalyzing ? <Loader2 className="spin" size={18} /> : <Mic size={18} />}
            {isAnalyzing ? "Analyzing" : "Start recording"}
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

