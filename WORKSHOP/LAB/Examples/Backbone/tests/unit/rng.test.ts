import { describe, expect, it } from "vitest";
import { nextInt, nextRange, nextU32, seedRng } from "../../src/sim/rng";

describe("seeded generator (R13)", () => {
  it("gives the same sequence for the same seed", () => {
    const a = seedRng("stage-1");
    const b = seedRng("stage-1");
    const first = Array.from({ length: 50 }, () => nextU32(a));
    const second = Array.from({ length: 50 }, () => nextU32(b));
    expect(second).toEqual(first);
  });

  it("gives a different sequence for a different seed", () => {
    const a = seedRng("stage-1");
    const b = seedRng("stage-2");
    expect(Array.from({ length: 8 }, () => nextU32(a))).not.toEqual(Array.from({ length: 8 }, () => nextU32(b)));
  });

  it("keeps whole numbers in range and reaches both ends", () => {
    const s = seedRng("range");
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const n = nextInt(s, 7);
      expect(Number.isInteger(n) && n >= 0 && n < 7).toBe(true);
      const r = nextRange(s, 12, 25);
      expect(r >= 12 && r <= 25).toBe(true);
      seen.add(r);
    }
    expect(seen.has(12) && seen.has(25)).toBe(true);
  });

  it("has a state of four whole numbers that can be copied", () => {
    const s = seedRng("copy");
    nextU32(s);
    const copy = JSON.parse(JSON.stringify(s));
    expect(Object.keys(copy).sort()).toEqual(["a", "b", "c", "d"]);
    expect(nextU32(copy)).toBe(nextU32(s));
  });
});
