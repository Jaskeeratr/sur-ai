import { CHROMATIC_NOTES, DEFAULT_SA, getFrequency } from "./notes.js";
import { DEFAULT_THAAT, sargamLabelForDegree } from "./thaats.js";

export const ROOT_OPTIONS = [
  { label: "Men C#", value: "C#", octave: 3 },
  { label: "Low C", value: "C", octave: 3 },
  { label: "C#", value: "C#", octave: 4 },
  { label: "D", value: "D", octave: 3 },
  { label: "D#", value: "D#", octave: 3 },
  { label: "E", value: "E", octave: 3 },
  { label: "F", value: "F", octave: 3 },
  { label: "F#", value: "F#", octave: 3 },
  { label: "G", value: "G", octave: 3 },
  { label: "G#", value: "G#", octave: 3 },
  { label: "A", value: "A", octave: 3 },
  { label: "A#", value: "A#", octave: 3 },
  { label: "B", value: "B", octave: 3 },
  { label: "C", value: "C", octave: 4 }
];

export function buildSargamScale(
  root = DEFAULT_SA.noteName,
  rootOctave = DEFAULT_SA.octave,
  intervals = DEFAULT_THAAT.intervals
) {
  const rootIndex = CHROMATIC_NOTES.indexOf(root);
  const scaleIntervals = [...intervals, 12];

  return scaleIntervals.map((interval, index) => {
    const chromaticIndex = rootIndex + interval;
    const octave = rootOctave + Math.floor(chromaticIndex / CHROMATIC_NOTES.length);
    const noteName = CHROMATIC_NOTES[chromaticIndex % CHROMATIC_NOTES.length];

    return {
      sargam: index === 7 ? "Sa'" : sargamLabelForDegree(index, interval),
      note: `${noteName}${octave}`,
      frequency: getFrequency(noteName, octave),
      step: index + 1
    };
  });
}
