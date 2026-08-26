import { describe, expect, it } from "vitest";
import { buildHarmoniumKeys, getFrequency, getSargamLabel } from "./notes.js";
import { buildSargamScale } from "./sargam.js";

describe("getFrequency", () => {
  it("returns concert pitch for A4", () => {
    expect(getFrequency("A", 4)).toBe(440);
  });

  it("returns the men's default Sa frequency for C#3", () => {
    expect(getFrequency("C#", 3)).toBeCloseTo(138.59, 2);
  });

  it("doubles the frequency one octave up", () => {
    expect(getFrequency("C", 5)).toBeCloseTo(getFrequency("C", 4) * 2, 1);
  });
});

describe("getSargamLabel", () => {
  it("labels the root as Sa", () => {
    expect(getSargamLabel("C#", 3, { noteName: "C#", octave: 3 })).toBe("Sa");
  });

  it("labels the fifth as Pa", () => {
    expect(getSargamLabel("G#", 3, { noteName: "C#", octave: 3 })).toBe("Pa");
  });

  it("returns an empty label for notes outside the major scale", () => {
    expect(getSargamLabel("D", 3, { noteName: "C#", octave: 3 })).toBe("");
  });

  it("returns an empty label below the root", () => {
    expect(getSargamLabel("C", 3, { noteName: "C#", octave: 3 })).toBe("");
  });
});

describe("buildHarmoniumKeys", () => {
  it("spans C3 to B5", () => {
    const keys = buildHarmoniumKeys({ noteName: "C#", octave: 3 });
    expect(keys).toHaveLength(36);
    expect(keys[0].note).toBe("C3");
    expect(keys[keys.length - 1].note).toBe("B5");
  });

  it("marks sharps as black keys", () => {
    const keys = buildHarmoniumKeys({ noteName: "C#", octave: 3 });
    for (const key of keys) {
      expect(key.isBlack).toBe(key.noteName.includes("#"));
    }
  });
});

describe("buildSargamScale", () => {
  it("builds an eight-step major scale ending on the upper Sa", () => {
    const scale = buildSargamScale("C#", 3);
    expect(scale.map((step) => step.sargam)).toEqual([
      "Sa",
      "Re",
      "Ga",
      "Ma",
      "Pa",
      "Dha",
      "Ni",
      "Sa"
    ]);
    expect(scale[0].note).toBe("C#3");
    expect(scale[7].note).toBe("C#4");
    expect(scale[7].frequency).toBeCloseTo(scale[0].frequency * 2, 1);
  });

  it("crosses the octave boundary correctly", () => {
    const scale = buildSargamScale("A", 3);
    expect(scale[2].note).toBe("C#4");
    expect(scale[7].note).toBe("A4");
  });
});
