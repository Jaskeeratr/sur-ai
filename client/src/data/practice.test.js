import { describe, expect, it } from "vitest";
import { buildPracticeNotes, parseToken } from "./practice.js";

const MEN_ROOT = { label: "Men C#", value: "C#", octave: 3 };

describe("parseToken", () => {
  it("parses plain sargam syllables case-insensitively", () => {
    expect(parseToken("sa")).toEqual({ label: "Sa", degree: 0 });
    expect(parseToken("PA")).toEqual({ label: "Pa", degree: 4 });
  });

  it("parses the upper Sa written with an apostrophe", () => {
    expect(parseToken("Sa'")).toEqual({ label: "Sa", degree: 7 });
  });

  it("ignores trailing commas", () => {
    expect(parseToken("Re,")).toEqual({ label: "Re", degree: 1 });
  });

  it("rejects unknown tokens and blanks", () => {
    expect(parseToken("Xy")).toBeNull();
    expect(parseToken("  ")).toBeNull();
  });
});

describe("buildPracticeNotes", () => {
  it("maps a phrase onto the selected root", () => {
    const notes = buildPracticeNotes("Sa Pa Sa", MEN_ROOT);
    expect(notes.map((note) => note.note)).toEqual(["C#3", "G#3", "C#3"]);
    expect(notes.map((note) => note.step)).toEqual([1, 2, 3]);
  });

  it("places the upper Sa one octave above the root", () => {
    const notes = buildPracticeNotes("Sa Sa'", MEN_ROOT);
    expect(notes[1].note).toBe("C#4");
    expect(notes[1].sargam).toBe("Sa'");
    expect(notes[1].frequency).toBeCloseTo(notes[0].frequency * 2, 1);
  });

  it("skips invalid tokens instead of failing", () => {
    const notes = buildPracticeNotes("Sa nope Ga", MEN_ROOT);
    expect(notes.map((note) => note.sargam)).toEqual(["Sa", "Ga"]);
  });

  it("returns an empty list for an empty phrase", () => {
    expect(buildPracticeNotes("", MEN_ROOT)).toEqual([]);
  });
});
