import { describe, expect, it } from "vitest";
import { SWARA_ORDER, describeVerdict, findWeakestSwara, normalizeSwara, summarizeSwaras } from "./swaraStats.js";

function attempt(swara, centsOff, accuracy = 90) {
  return { id: `${swara}-${centsOff}-${Math.random()}`, mode: "sargam", swara, centsOff, accuracy };
}

describe("normalizeSwara", () => {
  it("folds the upper octave Sa into Sa", () => {
    expect(normalizeSwara("Sa'")).toBe("Sa");
    expect(normalizeSwara("Sa")).toBe("Sa");
  });

  it("keeps komal and tivra swaras distinct from their shuddha forms", () => {
    expect(normalizeSwara("re")).toBe("re");
    expect(normalizeSwara("Re")).toBe("Re");
    expect(normalizeSwara("Ma#")).toBe("Ma#");
  });

  it("rejects anything that is not a swara", () => {
    expect(normalizeSwara("C#3")).toBeNull();
    expect(normalizeSwara("")).toBeNull();
    expect(normalizeSwara(null)).toBeNull();
    expect(normalizeSwara(42)).toBeNull();
  });
});

describe("summarizeSwaras", () => {
  it("returns nothing when no attempt carries a swara", () => {
    expect(summarizeSwaras([{ id: "a", mode: "harmonium", swara: null, centsOff: 12 }])).toEqual([]);
  });

  it("flags a swara that is consistently flat", () => {
    const rows = summarizeSwaras([attempt("Ga", -22), attempt("Ga", -18), attempt("Ga", -25)]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ swara: "Ga", attempts: 3, verdict: "flat" });
    expect(rows[0].meanCents).toBeCloseTo(-21.7, 1);
  });

  it("flags a swara that is consistently sharp", () => {
    const rows = summarizeSwaras([attempt("Pa", 19), attempt("Pa", 14), attempt("Pa", 22)]);

    expect(rows[0].verdict).toBe("sharp");
  });

  it("calls a swara solid when it lands near the target", () => {
    const rows = summarizeSwaras([attempt("Sa", 3), attempt("Sa", -4), attempt("Sa", 1)]);

    expect(rows[0].verdict).toBe("solid");
  });

  it("distinguishes wide scatter from a directional bias", () => {
    // Mean is ~0 but every attempt misses badly in one direction or the other.
    const rows = summarizeSwaras([attempt("Ma", 34), attempt("Ma", -30), attempt("Ma", 28), attempt("Ma", -32)]);

    expect(rows[0].verdict).toBe("inconsistent");
    expect(Math.abs(rows[0].meanCents)).toBeLessThan(8);
    expect(rows[0].meanAbsCents).toBeGreaterThan(20);
  });

  it("withholds a verdict until there are enough attempts", () => {
    const rows = summarizeSwaras([attempt("Dha", -40), attempt("Dha", -38)]);

    expect(rows[0].verdict).toBe("insufficient");
    expect(describeVerdict(rows[0])).toBe("needs 1 more attempt");
  });

  it("counts the upper Sa toward Sa", () => {
    const rows = summarizeSwaras([attempt("Sa", 2), attempt("Sa'", 4), attempt("Sa'", 3)]);

    expect(rows).toHaveLength(1);
    expect(rows[0].attempts).toBe(3);
  });

  it("pulls per-note observations out of a sequence attempt", () => {
    const rows = summarizeSwaras([
      {
        id: "seq",
        mode: "practice",
        accuracy: 80,
        breakdown: [
          { swara: "Sa", note: "C#3", centsOff: 2, accuracy: 98 },
          { swara: "Ga", note: "F3", centsOff: -30, accuracy: 70 },
          { swara: "Pa", note: "G#3", centsOff: 4, accuracy: 96 }
        ]
      }
    ]);

    expect(rows.map((row) => row.swara)).toEqual(["Sa", "Ga", "Pa"]);
    expect(rows.find((row) => row.swara === "Ga").meanCents).toBe(-30);
  });

  it("ignores observations with no usable cents reading", () => {
    const rows = summarizeSwaras([attempt("Ni", 10), attempt("Ni", null), { id: "x", swara: "Ni" }]);

    expect(rows[0].attempts).toBe(1);
  });

  it("orders rows by scale position rather than alphabetically", () => {
    const rows = summarizeSwaras([attempt("Ni", 5), attempt("Sa", 5), attempt("Ga", 5), attempt("re", 5)]);

    expect(rows.map((row) => row.swara)).toEqual(["Sa", "re", "Ga", "Ni"]);
    for (let index = 1; index < rows.length; index += 1) {
      expect(SWARA_ORDER.indexOf(rows[index].swara)).toBeGreaterThan(
        SWARA_ORDER.indexOf(rows[index - 1].swara)
      );
    }
  });
});

describe("findWeakestSwara", () => {
  it("picks the biggest average miss among judged swaras", () => {
    const rows = summarizeSwaras([
      ...[1, 2, 3].map(() => attempt("Sa", 2)),
      ...[1, 2, 3].map(() => attempt("Ga", -30)),
      ...[1, 2, 3].map(() => attempt("Pa", 12))
    ]);

    expect(findWeakestSwara(rows).swara).toBe("Ga");
  });

  it("returns null when everything judged is in tune", () => {
    const rows = summarizeSwaras([...[1, 2, 3].map(() => attempt("Sa", 2))]);

    expect(findWeakestSwara(rows)).toBeNull();
  });

  it("ignores swaras that do not have enough attempts yet", () => {
    const rows = summarizeSwaras([attempt("Ga", -45), ...[1, 2, 3].map(() => attempt("Pa", 15))]);

    expect(findWeakestSwara(rows).swara).toBe("Pa");
  });
});
