import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTrendData,
  clearProgress,
  exportProgress,
  importProgress,
  loadProgress,
  saveAttempt,
  summarizeProgress
} from "./progress.js";

function createStorageStub() {
  const store = new Map();
  return {
    getItem: vi.fn((key) => (store.has(key) ? store.get(key) : null)),
    setItem: vi.fn((key, value) => store.set(key, String(value))),
    removeItem: vi.fn((key) => store.delete(key))
  };
}

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: createStorageStub() });
});

describe("saveAttempt and loadProgress", () => {
  it("stores attempts newest-first with rounded scores", () => {
    saveAttempt({ mode: "harmonium", label: "Sa / C#3", accuracy: 91.6, centsOff: -4.44 });
    saveAttempt({ mode: "sargam", label: "Pa / G#3", accuracy: 78.2 });

    const entries = loadProgress();
    expect(entries).toHaveLength(2);
    expect(entries[0].mode).toBe("sargam");
    expect(entries[1].accuracy).toBe(92);
    expect(entries[1].centsOff).toBe(-4.4);
    expect(entries[1].recordedAt).toBeTruthy();
  });

  it("survives corrupted storage", () => {
    window.localStorage.setItem("sursadhana-progress-v1", "{not json");
    expect(loadProgress()).toEqual([]);
  });

  it("clears all attempts", () => {
    saveAttempt({ mode: "practice", label: "Sa Pa Sa", accuracy: 80 });
    clearProgress();
    expect(loadProgress()).toEqual([]);
  });
});

describe("summarizeProgress", () => {
  it("handles an empty history", () => {
    const summary = summarizeProgress([]);
    expect(summary.attempts).toBe(0);
    expect(summary.averageAccuracy).toBeNull();
  });

  it("computes averages and best score, skipping unscored attempts", () => {
    const entries = [
      { accuracy: 90 },
      { accuracy: 70 },
      { accuracy: null },
      { accuracy: 80 }
    ];
    const summary = summarizeProgress(entries);
    expect(summary.attempts).toBe(4);
    expect(summary.scoredAttempts).toBe(3);
    expect(summary.averageAccuracy).toBe(80);
    expect(summary.bestAccuracy).toBe(90);
  });
});

describe("export and import", () => {
  it("round-trips history through an export file", () => {
    saveAttempt({ mode: "harmonium", label: "Sa / C#3", accuracy: 90 });
    const backup = exportProgress();

    clearProgress();
    expect(loadProgress()).toEqual([]);

    const result = importProgress(backup);
    expect(result.imported).toBe(1);
    expect(loadProgress()).toHaveLength(1);
    expect(loadProgress()[0].label).toBe("Sa / C#3");
  });

  it("deduplicates by entry id when importing", () => {
    saveAttempt({ mode: "sargam", label: "Pa / G#3", accuracy: 85 });
    const backup = exportProgress();

    const result = importProgress(backup);
    expect(result.imported).toBe(0);
    expect(loadProgress()).toHaveLength(1);
  });

  it("rejects files that are not progress exports", () => {
    expect(() => importProgress("not json at all")).toThrow("not valid JSON");
    expect(() => importProgress('{"foo": 1}')).toThrow("does not look like");
    expect(() => importProgress('{"entries": [{"bogus": true}]}')).toThrow("No valid attempts");
  });
});

describe("buildTrendData", () => {
  it("reverses newest-first entries into chronological order", () => {
    const entries = [
      { accuracy: 95, label: "latest", mode: "sargam" },
      { accuracy: 60, label: "oldest", mode: "harmonium" }
    ];
    const trend = buildTrendData(entries);
    expect(trend[0]).toMatchObject({ attempt: 1, accuracy: 60, label: "oldest" });
    expect(trend[1]).toMatchObject({ attempt: 2, accuracy: 95, label: "latest" });
  });
});
