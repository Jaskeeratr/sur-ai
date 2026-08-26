import { CHROMATIC_NOTES, MAJOR_SCALE_INTERVALS, SARGAM_LABELS, getFrequency } from "./notes.js";

export function parseToken(token) {
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

export function buildPracticeNotes(text, rootOption) {
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
