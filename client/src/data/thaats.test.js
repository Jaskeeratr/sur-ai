import { describe, expect, it } from "vitest";
import { DEFAULT_THAAT, THAATS, getThaat, sargamLabelForDegree, sargamLabelForInterval } from "./thaats.js";
import { getSargamLabel } from "./notes.js";
import { buildSargamScale } from "./sargam.js";
import { buildPracticeNotes } from "./practice.js";

const ROOT_C_SHARP = { label: "Men C#", value: "C#", octave: 3 };

describe("thaat definitions", () => {
  it("defines all ten thaats with seven ascending intervals from Sa", () => {
    expect(THAATS).toHaveLength(10);
    for (const thaat of THAATS) {
      expect(thaat.intervals).toHaveLength(7);
      expect(thaat.intervals[0]).toBe(0);
      expect(thaat.intervals[4]).toBe(7); // Pa is never altered in a thaat
      for (let index = 1; index < thaat.intervals.length; index += 1) {
        expect(thaat.intervals[index]).toBeGreaterThan(thaat.intervals[index - 1]);
        expect(thaat.intervals[index]).toBeLessThanOrEqual(11);
      }
    }
  });

  it("falls back to the default thaat for unknown ids", () => {
    expect(getThaat("bhairav").name).toBe("Bhairav");
    expect(getThaat("nope")).toBe(DEFAULT_THAAT);
  });
});

describe("sargam labels with komal and tivra swaras", () => {
  it("marks komal swaras lowercase", () => {
    expect(sargamLabelForDegree(1, 1)).toBe("re");
    expect(sargamLabelForDegree(2, 3)).toBe("ga");
    expect(sargamLabelForDegree(5, 8)).toBe("dha");
    expect(sargamLabelForDegree(6, 10)).toBe("ni");
  });

  it("marks tivra Ma with a sharp", () => {
    expect(sargamLabelForDegree(3, 6)).toBe("Ma#");
    expect(sargamLabelForDegree(3, 5)).toBe("Ma");
  });

  it("maps intervals through a thaat", () => {
    const bhairav = getThaat("bhairav");
    expect(sargamLabelForInterval(1, bhairav.intervals)).toBe("re");
    expect(sargamLabelForInterval(2, bhairav.intervals)).toBe("");
    expect(sargamLabelForInterval(11, bhairav.intervals)).toBe("Ni");
  });
});

describe("thaat-aware scale building", () => {
  it("builds Kalyan with tivra Ma", () => {
    const scale = buildSargamScale("C#", 3, getThaat("kalyan").intervals);
    expect(scale.map((step) => step.sargam)).toEqual([
      "Sa",
      "Re",
      "Ga",
      "Ma#",
      "Pa",
      "Dha",
      "Ni",
      "Sa'"
    ]);
    expect(scale[3].note).toBe("G3");
  });

  it("builds Bhairavi with four komal swaras", () => {
    const scale = buildSargamScale("C#", 3, getThaat("bhairavi").intervals);
    expect(scale.map((step) => step.sargam)).toEqual([
      "Sa",
      "re",
      "ga",
      "Ma",
      "Pa",
      "dha",
      "ni",
      "Sa'"
    ]);
  });

  it("labels harmonium keys against the selected thaat", () => {
    const root = { noteName: "C#", octave: 3 };
    expect(getSargamLabel("D", 3, root, getThaat("bhairav").intervals)).toBe("re");
    expect(getSargamLabel("D", 3, root, getThaat("bilawal").intervals)).toBe("");
  });

  it("maps practice phrases through the thaat", () => {
    const notes = buildPracticeNotes("Sa Re Ga", ROOT_C_SHARP, getThaat("kafi").intervals);
    expect(notes.map((note) => note.note)).toEqual(["C#3", "D#3", "E3"]);
    expect(notes.map((note) => note.sargam)).toEqual(["Sa", "Re", "ga"]);
  });
});
