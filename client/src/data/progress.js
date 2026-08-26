const STORAGE_KEY = "sursadhana-progress-v1";
const MAX_ENTRIES = 300;

function readStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStorage(entries) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage may be full or blocked; progress tracking is best-effort.
  }
}

export function loadProgress() {
  return readStorage();
}

export function saveAttempt(attempt) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    recordedAt: new Date().toISOString(),
    mode: attempt.mode,
    label: attempt.label,
    targetNote: attempt.targetNote || null,
    accuracy: Number.isFinite(attempt.accuracy) ? Math.round(attempt.accuracy) : null,
    centsOff: Number.isFinite(attempt.centsOff) ? Math.round(attempt.centsOff * 10) / 10 : null,
    status: attempt.status || null,
    stabilityLabel: attempt.stabilityLabel || null
  };
  const entries = [entry, ...readStorage()].slice(0, MAX_ENTRIES);
  writeStorage(entries);
  return entry;
}

export function clearProgress() {
  writeStorage([]);
}

export function summarizeProgress(entries) {
  const scored = entries.filter((entry) => Number.isFinite(entry.accuracy));
  if (!scored.length) {
    return { attempts: entries.length, scoredAttempts: 0, averageAccuracy: null, bestAccuracy: null, recentAverage: null };
  }

  const accuracies = scored.map((entry) => entry.accuracy);
  const recent = accuracies.slice(0, 10);

  return {
    attempts: entries.length,
    scoredAttempts: scored.length,
    averageAccuracy: Math.round(accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length),
    bestAccuracy: Math.max(...accuracies),
    recentAverage: Math.round(recent.reduce((sum, value) => sum + value, 0) / recent.length)
  };
}

export function buildTrendData(entries, limit = 40) {
  return entries
    .filter((entry) => Number.isFinite(entry.accuracy))
    .slice(0, limit)
    .reverse()
    .map((entry, index) => ({
      attempt: index + 1,
      accuracy: entry.accuracy,
      label: entry.label,
      mode: entry.mode
    }));
}
