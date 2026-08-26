// Live microphone pitch tracking backed by the YIN AudioWorklet processor.
// Usage:
//   const tracker = await createLivePitchTracker({ onFrame });
//   ...
//   tracker.stop();
// onFrame receives { frequency, confidence, rms, time } roughly every 60 ms;
// frequency is null for unvoiced/silent frames.

export async function createLivePitchTracker({ stream = null, onFrame }) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    throw new Error("This browser does not support audio processing.");
  }
  if (!AudioContext.prototype || !("audioWorklet" in AudioContext.prototype)) {
    throw new Error("This browser does not support AudioWorklet-based live pitch tracking.");
  }

  const ownsStream = !stream;
  const activeStream = stream || (await navigator.mediaDevices.getUserMedia({ audio: true }));
  const audioContext = new AudioContext();

  try {
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
    await audioContext.audioWorklet.addModule(new URL("./pitch-worklet.js", import.meta.url));
  } catch (error) {
    if (ownsStream) {
      activeStream.getTracks().forEach((track) => track.stop());
    }
    await audioContext.close().catch(() => {});
    throw error;
  }

  const source = audioContext.createMediaStreamSource(activeStream);
  const workletNode = new AudioWorkletNode(audioContext, "sursadhana-pitch-processor", {
    numberOfInputs: 1,
    numberOfOutputs: 0
  });
  workletNode.port.onmessage = (event) => onFrame(event.data);
  source.connect(workletNode);

  let stopped = false;
  return {
    stop() {
      if (stopped) {
        return;
      }
      stopped = true;
      workletNode.port.onmessage = null;
      try {
        source.disconnect();
      } catch {
        // Source may already be disconnected.
      }
      if (ownsStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
      audioContext.close().catch(() => {});
    }
  };
}
