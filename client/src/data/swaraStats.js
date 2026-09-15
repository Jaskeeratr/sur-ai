// Aggregates saved attempts per swara so the app can say something a teacher
// would say - "your Ga runs flat" - instead of only scoring one note at a time.

// Scale order, not alphabetical: musicians read a scale in this order.
export const SWARA_ORDER = ["Sa", "re", "Re", "ga", "Ga", "Ma", "Ma#", "Pa", "dha", "Dha", "ni", "Ni"];

const MIN_OBSERVATIONS = 3;
const TENDENCY_CENTS = 8;
const INCONSISTENT_CENTS = 20;

// The upper Sa is the same swara an octave up, so it counts toward Sa.
export function normalizeSwara(swara) {
  if (typeof swara !== "string") {
    return null;
  }
  const trimmed = swara.trim().replace(/'+$/, "");
  return SWARA_ORDER.includes(trimmed) ? trimmed : null;
}

// One attempt may carry a single note or a whole sequence breakdown.
function observationsFor(entry) {
  if (Array.isArray(entry.breakdown) && entry.breakdown.length) {
    return entry.breakdown;
  }
  return [{ swara: entry.swara, centsOff: entry.centsOff, accuracy: entry.accuracy }];
}

export function summarizeSwaras(entries) {
  const buckets = new Map();

  for (const entry of entries) {
    for (const observation of observationsFor(entry)) {
      const swara = normalizeSwara(observation.swara);
      if (!swara || !Number.isFinite(observation.centsOff)) {
        continue;
      }
      if (!buckets.has(swara)) {
        buckets.set(swara, { cents: [], accuracies: [] });
      }
      const bucket = buckets.get(swara);
      bucket.cents.push(observation.centsOff);
      if (Number.isFinite(observation.accuracy)) {
        bucket.accuracies.push(observation.accuracy);
      }
    }
  }

  const rows = [];
  for (const [swara, bucket] of buckets) {
    const attempts = bucket.cents.length;
    const meanCents = bucket.cents.reduce((sum, value) => sum + value, 0) / attempts;
    const meanAbsCents = bucket.cents.reduce((sum, value) => sum + Math.abs(value), 0) / attempts;
    const averageAccuracy = bucket.accuracies.length
      ? Math.round(bucket.accuracies.reduce((sum, value) => sum + value, 0) / bucket.accuracies.length)
      : null;

    rows.push({
      swara,
      attempts,
      meanCents: Math.round(meanCents * 10) / 10,
      meanAbsCents: Math.round(meanAbsCents * 10) / 10,
      averageAccuracy,
      verdict: verdictFor(attempts, meanCents, meanAbsCents)
    });
  }

  return rows.sort((first, second) => SWARA_ORDER.indexOf(first.swara) - SWARA_ORDER.indexOf(second.swara));
}

function verdictFor(attempts, meanCents, meanAbsCents) {
  if (attempts < MIN_OBSERVATIONS) {
    return "insufficient";
  }
  if (meanCents > TENDENCY_CENTS) {
    return "sharp";
  }
  if (meanCents < -TENDENCY_CENTS) {
    return "flat";
  }
  // Centred on average but wide either way: not a bias, just unsteady aim.
  if (meanAbsCents > INCONSISTENT_CENTS) {
    return "inconsistent";
  }
  return "solid";
}

// The swara most worth practising: the largest average miss among swaras with
// enough attempts to judge. Returns null when nothing qualifies yet.
export function findWeakestSwara(rows) {
  const judged = rows.filter((row) => row.verdict !== "insufficient" && row.verdict !== "solid");
  if (!judged.length) {
    return null;
  }
  return judged.reduce((worst, row) => (row.meanAbsCents > worst.meanAbsCents ? row : worst));
}

export function describeVerdict(row) {
  switch (row.verdict) {
    case "sharp":
      return `averages ${Math.abs(row.meanCents)} cents sharp`;
    case "flat":
      return `averages ${Math.abs(row.meanCents)} cents flat`;
    case "inconsistent":
      return `swings ${row.meanAbsCents} cents either way`;
    case "solid":
      return "consistently in tune";
    default:
      return `needs ${MIN_OBSERVATIONS - row.attempts} more attempt${
        MIN_OBSERVATIONS - row.attempts === 1 ? "" : "s"
      }`;
  }
}
