import { describe, expect, it } from "vitest";
import { SCORES_KEY, SEED_PATTERN, loadScores, rank, saveScore, validScores } from "../../src/ui/scores";
import { SETTINGS_KEY, isMotionReduced, loadMotion, parseSwitches } from "../../src/ui/settings";

function fakeStorage(initial: Record<string, string> = {}, refuse = false) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string): string | null => data.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      if (refuse) throw new Error("QuotaExceededError");
      data.set(key, value);
    },
    data,
  };
}

describe("best scores (FR-023, AC23, SEC-11)", () => {
  it("keeps the best five, sorted by score then by time survived (R12)", () => {
    const entries = [
      { score: 10, steps: 100, seed: "a" },
      { score: 30, steps: 50, seed: "b" },
      { score: 30, steps: 90, seed: "c" },
      { score: 5, steps: 999, seed: "d" },
      { score: 20, steps: 10, seed: "e" },
      { score: 1, steps: 1, seed: "f" },
    ];
    expect(rank(entries).map((e) => e.seed)).toEqual(["c", "b", "e", "a", "d"]);
  });

  it("drops anything read back that is not a well-formed entry", () => {
    const raw = [
      { score: 12, steps: 400, seed: "stage-1" },
      { score: -1, steps: 400, seed: "x" },
      { score: 1.5, steps: 400, seed: "x" },
      { score: 12, steps: "400", seed: "x" },
      { score: 12, steps: 400, seed: "<img src=x onerror=alert(1)>" },
      { score: 12, steps: 400, seed: "" },
      { score: 12, steps: 400, seed: "a".repeat(25) },
      { score: 12, steps: 400 },
      "nonsense",
      null,
    ];
    expect(validScores(raw)).toEqual([{ score: 12, steps: 400, seed: "stage-1" }]);
    expect(validScores("not a list")).toEqual([]);
    expect(validScores({ score: 1 })).toEqual([]);
  });

  it("saves, reloads and survives broken stored data", () => {
    const store = fakeStorage();
    expect(saveScore(store, { score: 7, steps: 70, seed: "one" }).saved).toBe(true);
    expect(saveScore(store, { score: 9, steps: 90, seed: "two" }).entries.map((e) => e.seed)).toEqual(["two", "one"]);
    expect(loadScores(store).map((e) => e.score)).toEqual([9, 7]);
    expect(loadScores(fakeStorage({ [SCORES_KEY]: "{broken" }))).toEqual([]);
    expect(loadScores(fakeStorage({ [SCORES_KEY]: '{"score":1}' }))).toEqual([]);
  });

  it("when the device refuses storage the game still gets its table and is told nothing was saved", () => {
    expect(saveScore(null, { score: 7, steps: 70, seed: "one" })).toEqual({ entries: [{ score: 7, steps: 70, seed: "one" }], saved: false });
    expect(saveScore(fakeStorage({}, true), { score: 7, steps: 70, seed: "one" }).saved).toBe(false);
    expect(loadScores(null)).toEqual([]);
  });
});

describe("seeds, settings and URL switches (FR-022, SEC-11, SEC-12)", () => {
  it("a seed is 1 to 24 letters, digits or hyphens", () => {
    for (const ok of ["a", "stage-1", "2328", "A-b-C-9", "x".repeat(24)]) expect(SEED_PATTERN.test(ok), ok).toBe(true);
    for (const bad of ["", "x".repeat(25), "two words", "semi;colon", "ünï", "a/b", "<b>"]) expect(SEED_PATTERN.test(bad), bad).toBe(false);
  });

  it("reads only the switches and values on its list", () => {
    expect(parseSwitches("?seed=stage-1&autostart=1&renderer=2d&motion=reduced&bot=1&speed=4&hud=0&test=1")).toEqual({
      seed: "stage-1",
      autostart: true,
      renderer: "2d",
      motion: "reduced",
      bot: true,
      speed: 4,
      hud: false,
      test: true,
    });
    expect(parseSwitches("?seed=%3Cscript%3E&autostart=yes&renderer=webgpu&motion=none&bot=true&speed=3&hud=1&test=0&extra=1")).toEqual({
      seed: null,
      autostart: false,
      renderer: null,
      motion: null,
      bot: false,
      speed: 1,
      hud: true,
      test: false,
    });
    expect(parseSwitches("").speed).toBe(1);
  });

  it("reduced motion: a URL switch wins, then the setting, then the device", () => {
    expect(isMotionReduced("auto", true, null)).toBe(true);
    expect(isMotionReduced("auto", false, null)).toBe(false);
    expect(isMotionReduced("on", false, null)).toBe(true);
    expect(isMotionReduced("off", true, null)).toBe(false);
    expect(isMotionReduced("off", false, "reduced")).toBe(true);
    expect(isMotionReduced("on", true, "full")).toBe(false);
  });

  it("an unknown stored setting becomes auto", () => {
    expect(loadMotion(fakeStorage({ [SETTINGS_KEY]: '{"reducedMotion":"on"}' }))).toBe("on");
    expect(loadMotion(fakeStorage({ [SETTINGS_KEY]: '{"reducedMotion":"sometimes"}' }))).toBe("auto");
    expect(loadMotion(fakeStorage({ [SETTINGS_KEY]: "[[" }))).toBe("auto");
    expect(loadMotion(null)).toBe("auto");
  });
});
