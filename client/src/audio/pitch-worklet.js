// AudioWorklet processor that runs a YIN-style pitch detector on the live
// microphone signal and posts { frequency, confidence, rms, time } messages.
// This file must stay self-contained: it is loaded as a worklet module.

const MIN_FREQUENCY = 65;
const MAX_FREQUENCY = 1100;
const FRAME_SECONDS = 0.09;
const HOP_SECONDS = 0.06;
const YIN_THRESHOLD = 0.16;
const FALLBACK_CMND_LIMIT = 0.3;

class PitchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Decimate to roughly 12 kHz so the YIN loop stays cheap enough for the
    // real-time audio thread. Averaging each group is a crude but sufficient
    // anti-alias filter for voice fundamentals below MAX_FREQUENCY.
    this.decimation = Math.max(1, Math.round(sampleRate / 12000));
    this.effectiveRate = sampleRate / this.decimation;
    this.frameLength = Math.round(this.effectiveRate * FRAME_SECONDS);
    this.hopLength = Math.round(this.effectiveRate * HOP_SECONDS);
    this.ring = new Float32Array(this.frameLength);
    this.frame = new Float32Array(this.frameLength);
    this.writeIndex = 0;
    this.filled = 0;
    this.sinceLastFrame = 0;
    this.pendingSum = 0;
    this.pendingCount = 0;
    this.minLag = Math.max(2, Math.floor(this.effectiveRate / MAX_FREQUENCY));
    this.maxLag = Math.min(this.frameLength - 2, Math.ceil(this.effectiveRate / MIN_FREQUENCY));
    this.difference = new Float32Array(this.maxLag + 1);
    this.cmnd = new Float32Array(this.maxLag + 1);
    this.window = new Float32Array(this.frameLength);
    for (let i = 0; i < this.frameLength; i += 1) {
      this.window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (this.frameLength - 1));
    }
    this.prepared = new Float32Array(this.frameLength);
  }

  pushSample(value) {
    this.ring[this.writeIndex] = value;
    this.writeIndex = (this.writeIndex + 1) % this.frameLength;
    if (this.filled < this.frameLength) {
      this.filled += 1;
    }
    this.sinceLastFrame += 1;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel || !channel.length) {
      return true;
    }

    for (let i = 0; i < channel.length; i += 1) {
      this.pendingSum += channel[i];
      this.pendingCount += 1;
      if (this.pendingCount === this.decimation) {
        this.pushSample(this.pendingSum / this.decimation);
        this.pendingSum = 0;
        this.pendingCount = 0;
      }
    }

    if (this.filled >= this.frameLength && this.sinceLastFrame >= this.hopLength) {
      this.sinceLastFrame = 0;
      this.analyzeFrame();
    }

    return true;
  }

  analyzeFrame() {
    const n = this.frameLength;
    // Unroll the ring into chronological order.
    for (let i = 0; i < n; i += 1) {
      this.frame[i] = this.ring[(this.writeIndex + i) % n];
    }

    let sum = 0;
    let energy = 0;
    for (let i = 0; i < n; i += 1) {
      sum += this.frame[i];
      energy += this.frame[i] * this.frame[i];
    }
    const rms = Math.sqrt(energy / n);
    const time = currentTime;

    if (rms < 0.004) {
      this.port.postMessage({ frequency: null, confidence: 0, rms, time });
      return;
    }

    const mean = sum / n;
    for (let i = 0; i < n; i += 1) {
      this.prepared[i] = (this.frame[i] - mean) * this.window[i];
    }

    const maxLag = this.maxLag;
    for (let lag = 1; lag <= maxLag; lag += 1) {
      let total = 0;
      const limit = n - lag;
      for (let i = 0; i < limit; i += 1) {
        const delta = this.prepared[i] - this.prepared[i + lag];
        total += delta * delta;
      }
      this.difference[lag] = total;
    }

    let cumulative = 0;
    this.cmnd[0] = 1;
    for (let lag = 1; lag <= maxLag; lag += 1) {
      cumulative += this.difference[lag];
      this.cmnd[lag] = cumulative ? (this.difference[lag] * lag) / cumulative : 1;
    }

    let selected = -1;
    for (let lag = this.minLag; lag < maxLag; lag += 1) {
      if (this.cmnd[lag] < YIN_THRESHOLD) {
        while (lag + 1 < maxLag && this.cmnd[lag + 1] < this.cmnd[lag]) {
          lag += 1;
        }
        selected = lag;
        break;
      }
    }

    if (selected === -1) {
      let best = this.minLag;
      for (let lag = this.minLag + 1; lag <= maxLag; lag += 1) {
        if (this.cmnd[lag] < this.cmnd[best]) {
          best = lag;
        }
      }
      if (this.cmnd[best] > FALLBACK_CMND_LIMIT) {
        this.port.postMessage({ frequency: null, confidence: 0, rms, time });
        return;
      }
      selected = best;
    }

    let refined = selected;
    if (selected > 1 && selected < maxLag) {
      const prev = this.cmnd[selected - 1];
      const curr = this.cmnd[selected];
      const next = this.cmnd[selected + 1];
      const denominator = prev - 2 * curr + next;
      if (Math.abs(denominator) > 1e-12) {
        const adjustment = (0.5 * (prev - next)) / denominator;
        refined = selected + Math.max(-0.5, Math.min(0.5, adjustment));
      }
    }

    this.port.postMessage({
      frequency: this.effectiveRate / refined,
      confidence: Math.max(0, Math.min(1, 1 - this.cmnd[selected])),
      rms,
      time
    });
  }
}

registerProcessor("sursadhana-pitch-processor", PitchProcessor);
