function createNoiseBuffer(audioContext, duration = 0.08) {
  const sampleCount = Math.max(1, Math.floor(audioContext.sampleRate * duration));
  const buffer = audioContext.createBuffer(1, sampleCount, audioContext.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < sampleCount; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / sampleCount);
  }

  return buffer;
}

export function createHarmoniumVoice(audioContext, frequency) {
  const output = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  const compressor = audioContext.createDynamicsCompressor();
  const primary = audioContext.createOscillator();
  const reed = audioContext.createOscillator();
  const detunedReed = audioContext.createOscillator();
  const upper = audioContext.createOscillator();
  const air = audioContext.createBufferSource();
  const primaryGain = audioContext.createGain();
  const reedGain = audioContext.createGain();
  const detunedGain = audioContext.createGain();
  const upperGain = audioContext.createGain();
  const airGain = audioContext.createGain();

  primary.type = "sine";
  reed.type = "triangle";
  detunedReed.type = "sawtooth";
  upper.type = "triangle";
  primary.frequency.value = frequency;
  reed.frequency.value = frequency * 2;
  detunedReed.frequency.value = frequency * 1.005;
  upper.frequency.value = frequency * 3;
  air.buffer = createNoiseBuffer(audioContext);

  primaryGain.gain.value = 0.24;
  reedGain.gain.value = 0.11;
  detunedGain.gain.value = 0.035;
  upperGain.gain.value = 0.018;
  airGain.gain.value = 0.014;
  output.gain.value = 0;
  filter.type = "lowpass";
  filter.frequency.value = 1800;
  filter.Q.value = 0.7;
  compressor.threshold.value = -24;
  compressor.knee.value = 20;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.18;

  primary.connect(primaryGain);
  reed.connect(reedGain);
  detunedReed.connect(detunedGain);
  upper.connect(upperGain);
  air.connect(airGain);
  primaryGain.connect(filter);
  reedGain.connect(filter);
  detunedGain.connect(filter);
  upperGain.connect(filter);
  airGain.connect(filter);
  filter.connect(compressor);
  compressor.connect(output);
  output.connect(audioContext.destination);

  return {
    output,
    oscillators: [primary, reed, detunedReed, upper],
    oneShots: [air]
  };
}

export function startDrone(audioContext, saFrequency, level = 0.075) {
  const output = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  const oscillators = [];
  const now = audioContext.currentTime;

  // Tanpura-style Sa + low Pa drone: Sa, Pa below Sa, and an upper Sa shimmer.
  const layers = [
    { frequency: saFrequency, type: "triangle", gain: 0.5 },
    { frequency: saFrequency * 0.75, type: "triangle", gain: 0.34 },
    { frequency: saFrequency * 2, type: "sine", gain: 0.14 },
    { frequency: saFrequency * 1.002, type: "sine", gain: 0.12 }
  ];

  for (const layer of layers) {
    const oscillator = audioContext.createOscillator();
    const layerGain = audioContext.createGain();
    oscillator.type = layer.type;
    oscillator.frequency.value = layer.frequency;
    layerGain.gain.value = layer.gain;
    oscillator.connect(layerGain);
    layerGain.connect(filter);
    oscillator.start(now);
    oscillators.push(oscillator);
  }

  filter.type = "lowpass";
  filter.frequency.value = 1500;
  filter.Q.value = 0.6;
  filter.connect(output);
  output.connect(audioContext.destination);
  output.gain.setValueAtTime(0, now);
  output.gain.linearRampToValueAtTime(level, now + 0.8);

  return {
    stop() {
      const stopAt = audioContext.currentTime;
      output.gain.cancelScheduledValues(stopAt);
      output.gain.setTargetAtTime(0, stopAt, 0.25);
      for (const oscillator of oscillators) {
        try {
          oscillator.stop(stopAt + 1.2);
        } catch {
          // Oscillator may already be stopped.
        }
      }
      window.setTimeout(() => {
        try {
          output.disconnect();
        } catch {
          // Output may already be disconnected.
        }
      }, 1400);
    }
  };
}

export function startHarmoniumVoice(audioContext, note, startTime, duration = null, level = 0.22) {
  const voice = createHarmoniumVoice(audioContext, note.frequency);
  voice.output.gain.setValueAtTime(0, startTime);
  voice.output.gain.linearRampToValueAtTime(level, startTime + 0.055);
  voice.oscillators.forEach((oscillator) => oscillator.start(startTime));
  voice.oneShots.forEach((source) => source.start(startTime));

  if (duration) {
    const releaseStart = Math.max(startTime + 0.08, startTime + duration - 0.14);
    voice.output.gain.setTargetAtTime(0, releaseStart, 0.055);
    voice.oscillators.forEach((oscillator) => oscillator.stop(startTime + duration + 0.12));
  }

  return voice;
}
