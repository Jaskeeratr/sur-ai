import { DEFAULT_THAAT, sargamLabelForInterval } from "./thaats.js";

export const CHROMATIC_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const SARGAM_LABELS = ["Sa", "Re", "Ga", "Ma", "Pa", "Dha", "Ni"];
export const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
export const DEFAULT_SA = { noteName: "C#", octave: 3 };

export function getFrequency(noteName, octave) {
  const semitoneIndex = CHROMATIC_NOTES.indexOf(noteName);
  const midiNumber = (octave + 1) * 12 + semitoneIndex;
  return Math.round(440 * 2 ** ((midiNumber - 69) / 12) * 100) / 100;
}

function getChromaticDistance(fromNoteName, fromOctave, toNoteName, toOctave) {
  const fromIndex = fromOctave * 12 + CHROMATIC_NOTES.indexOf(fromNoteName);
  const toIndex = toOctave * 12 + CHROMATIC_NOTES.indexOf(toNoteName);
  return toIndex - fromIndex;
}

export function getSargamLabel(noteName, octave, root = DEFAULT_SA, intervals = DEFAULT_THAAT.intervals) {
  const distance = getChromaticDistance(root.noteName, root.octave, noteName, octave);
  if (distance < 0) {
    return "";
  }

  return sargamLabelForInterval(distance % 12, intervals);
}

export function buildHarmoniumKeys(root = DEFAULT_SA, intervals = DEFAULT_THAAT.intervals) {
  const keys = [];
  for (let octave = 3; octave <= 5; octave += 1) {
    for (const noteName of CHROMATIC_NOTES) {
      const note = `${noteName}${octave}`;
      keys.push({
        noteName,
        octave,
        note,
        frequency: getFrequency(noteName, octave),
        isBlack: noteName.includes("#"),
        sargam: getSargamLabel(noteName, octave, root, intervals)
      });
    }
  }

  return keys;
}

export const HARMONIUM_NOTES = buildHarmoniumKeys(DEFAULT_SA);
export const DEFAULT_HARMONIUM_NOTE =
  HARMONIUM_NOTES.find((note) => note.noteName === DEFAULT_SA.noteName && note.octave === DEFAULT_SA.octave) ||
  HARMONIUM_NOTES[0];
