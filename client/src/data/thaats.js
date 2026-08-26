// The ten Hindustani thaats. Intervals are semitone offsets from Sa.
// Komal swaras are shown lowercase (re, ga, dha, ni); tivra Ma is shown as Ma#.
export const THAATS = [
  {
    id: "bilawal",
    name: "Bilawal",
    intervals: [0, 2, 4, 5, 7, 9, 11],
    description: "All shuddha swaras (major scale)."
  },
  {
    id: "kalyan",
    name: "Kalyan (Yaman)",
    intervals: [0, 2, 4, 6, 7, 9, 11],
    description: "Tivra Ma."
  },
  {
    id: "khamaj",
    name: "Khamaj",
    intervals: [0, 2, 4, 5, 7, 9, 10],
    description: "Komal Ni."
  },
  {
    id: "kafi",
    name: "Kafi",
    intervals: [0, 2, 3, 5, 7, 9, 10],
    description: "Komal Ga and Ni."
  },
  {
    id: "asavari",
    name: "Asavari",
    intervals: [0, 2, 3, 5, 7, 8, 10],
    description: "Komal Ga, Dha, and Ni."
  },
  {
    id: "bhairavi",
    name: "Bhairavi",
    intervals: [0, 1, 3, 5, 7, 8, 10],
    description: "Komal Re, Ga, Dha, and Ni."
  },
  {
    id: "bhairav",
    name: "Bhairav",
    intervals: [0, 1, 4, 5, 7, 8, 11],
    description: "Komal Re and Dha."
  },
  {
    id: "poorvi",
    name: "Poorvi",
    intervals: [0, 1, 4, 6, 7, 8, 11],
    description: "Komal Re and Dha, tivra Ma."
  },
  {
    id: "marwa",
    name: "Marwa",
    intervals: [0, 1, 4, 6, 7, 9, 11],
    description: "Komal Re, tivra Ma."
  },
  {
    id: "todi",
    name: "Todi",
    intervals: [0, 1, 3, 6, 7, 8, 10],
    description: "Komal Re, Ga, Dha; tivra Ma."
  }
];

export const DEFAULT_THAAT = THAATS[0];

const DEGREE_VARIANTS = [
  { shuddha: "Sa" },
  { komal: "re", shuddha: "Re" },
  { komal: "ga", shuddha: "Ga" },
  { shuddha: "Ma", tivra: "Ma#" },
  { shuddha: "Pa" },
  { komal: "dha", shuddha: "Dha" },
  { komal: "ni", shuddha: "Ni" }
];

const SHUDDHA_INTERVALS = [0, 2, 4, 5, 7, 9, 11];

export function getThaat(id) {
  return THAATS.find((thaat) => thaat.id === id) || DEFAULT_THAAT;
}

// Label for the given scale degree (0-6) at the given semitone interval,
// e.g. degree 1 at interval 1 -> "re" (komal), degree 3 at interval 6 -> "Ma#".
export function sargamLabelForDegree(degree, interval) {
  const variants = DEGREE_VARIANTS[degree];
  if (!variants) {
    return "";
  }
  const shuddhaInterval = SHUDDHA_INTERVALS[degree];
  if (interval < shuddhaInterval && variants.komal) {
    return variants.komal;
  }
  if (interval > shuddhaInterval && variants.tivra) {
    return variants.tivra;
  }
  return variants.shuddha;
}

// Map a semitone interval (0-11 from Sa) to its label in the thaat, or "" if
// the pitch is outside the thaat's scale.
export function sargamLabelForInterval(interval, intervals = SHUDDHA_INTERVALS) {
  const degree = intervals.indexOf(interval);
  if (degree === -1) {
    return "";
  }
  return sargamLabelForDegree(degree, interval);
}
