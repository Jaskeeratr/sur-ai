const CHROMATIC_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SARGAM_LABELS = ["Sa", "Re", "Ga", "Ma", "Pa", "Dha", "Ni", "Sa"];
const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11, 12];

function getFrequency(noteName, octave) {
  const semitoneIndex = CHROMATIC_NOTES.indexOf(noteName);
  const midiNumber = (octave + 1) * 12 + semitoneIndex;
  return Math.round(440 * 2 ** ((midiNumber - 69) / 12) * 100) / 100;
}

export const ROOT_OPTIONS = [
  { label: "Low C", value: "C", octave: 3 },
  { label: "D", value: "D", octave: 3 },
  { label: "E", value: "E", octave: 3 },
  { label: "F", value: "F", octave: 3 },
  { label: "G", value: "G", octave: 3 },
  { label: "A", value: "A", octave: 3 },
  { label: "B", value: "B", octave: 3 },
  { label: "C", value: "C", octave: 4 }
];

export function buildSargamScale(root = "C", rootOctave = 3) {
  const rootIndex = CHROMATIC_NOTES.indexOf(root);

  return MAJOR_SCALE_INTERVALS.map((interval, index) => {
    const chromaticIndex = rootIndex + interval;
    const octave = rootOctave + Math.floor(chromaticIndex / CHROMATIC_NOTES.length);
    const noteName = CHROMATIC_NOTES[chromaticIndex % CHROMATIC_NOTES.length];

    return {
      sargam: SARGAM_LABELS[index],
      note: `${noteName}${octave}`,
      frequency: getFrequency(noteName, octave),
      step: index + 1
    };
  });
}
