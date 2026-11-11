import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { projectCoast, validatePalette, validateRegion, validateText, validateTuning } from "../../src/content/load";
import coastJson from "../../src/content/coast-na.json";
import paletteJson from "../../src/content/palette.json";
import regionJson from "../../src/content/region-na.json";
import textJson from "../../src/content/text.json";
import tuningJson from "../../src/content/tuning.json";
import { botCommands } from "../../src/sim/bot";
import { DEFAULT_LINK_COST, createWorld, step } from "../../src/sim/world";
import trialJson from "../fixtures/region-trial.json";

const ROOT = join(import.meta.dirname, "../..");
const spec = readFileSync(join(ROOT, "specs/001-backbone-first-playable/spec.md"), "utf8");
const tuning = validateTuning(tuningJson);

describe("content files (C6)", () => {
  it("the shipped files are valid", () => {
    const region = validateRegion(regionJson, tuning.maxSites);
    expect(region.sites.length).toBe(18);
    expect(Object.keys(validatePalette(paletteJson)).length).toBeGreaterThan(8);
    const coast = projectCoast(coastJson, region.lon0, region.lat0);
    expect(coast.rings.length).toBeGreaterThan(5);
    expect(validateText(textJson).faithful.length).toBe(8);
  });

  it("projects positions to kilometres: New York to Los Angeles is about 3,900 km", () => {
    const region = validateRegion(regionJson, tuning.maxSites);
    const nyc = region.sites.find((s) => s.code === "NYC")!;
    const lax = region.sites.find((s) => s.code === "LAX")!;
    const km = Math.hypot(nyc.x - lax.x, nyc.y - lax.y);
    expect(km).toBeGreaterThan(3700);
    expect(km).toBeLessThan(4100);
    expect(nyc.x).toBeGreaterThan(lax.x); // east is +x
    expect(nyc.y).toBeGreaterThan(lax.y); // north is +y
  });

  it("the loader refuses bad files with a message that names the problem", () => {
    const sites = regionJson.sites;
    const withSite = (site: object): object => ({ ...regionJson, sites: [...sites.slice(0, 17), site] });
    expect(() => validateRegion(withSite({ code: "denver", name: "x", lon: 0, lat: 0, weight: 1 }), 12)).toThrow(/three upper-case letters/);
    expect(() => validateRegion(withSite({ ...sites[0] }), 12)).toThrow(/used twice/);
    expect(() => validateRegion(withSite({ code: "ZZZ", name: "x", lon: 0, lat: 0, weight: 4 }), 12)).toThrow(/weight must be 1, 2 or 3/);
    expect(() => validateRegion(withSite({ code: "ZZZ", name: "x", lon: 200, lat: 0, weight: 1 }), 12)).toThrow(/lon is out of range/);
    expect(() => validateRegion({ ...regionJson, sites: sites.slice(0, 5) }, 12)).toThrow(/at least 12 sites/);
    expect(() => validateTuning({ ...tuningJson, queueLen: 0 })).toThrow(/queueLen/);
    expect(() => validateTuning({ ...tuningJson, tiers: [8, 4] })).toThrow(/tiers/);
    expect(() => validateTuning({ ...tuningJson, stepsPerSec: 2.5 })).toThrow(/stepsPerSec/);
    expect(() => validatePalette({ ...paletteJson, link: "blue" })).toThrow(/six-digit hex/);
    expect(() => validateText({ ...textJson, faithful: textJson.faithful.slice(1) })).toThrow(/F1 to F8/);
    expect(() => validateText({ ...textJson, simplified: [...textJson.simplified, textJson.simplified[0]] })).toThrow(/S1 to S11/);
  });
});

describe("explanatory text matches the spec (C1, FR-027, FR-028)", () => {
  const text = validateText(textJson);

  it("the briefing is the spec's sentence, word for word", () => {
    expect(spec).toContain(`one-card briefing: "${text.briefing}"`);
  });

  it("holds F1–F8 and S1–S11 exactly once each, and every faithful note names its RFC section", () => {
    expect(text.faithful.map((n) => n.id)).toEqual(["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8"]);
    expect(text.simplified.map((n) => n.id)).toEqual(Array.from({ length: 11 }, (_, i) => `S${i + 1}`));
    for (const note of text.faithful) expect(note.source, note.id).toMatch(/^RFC 2328 §/);
  });

  it("has a sentence for every reason a command can be refused", () => {
    const types = readFileSync(join(ROOT, "src/sim/types.ts"), "utf8");
    const reasons = [...types.slice(types.indexOf("export type Reason")).matchAll(/\| "([a-z-]+)"/g)].map((m) => m[1]!);
    expect(reasons.length).toBe(12);
    for (const reason of reasons) expect(text.reasons[reason], reason).toBeTruthy();
  });
});

describe("the README describes the same game (C1, C7)", () => {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  const text = validateText(textJson);

  it("states every faithful note in the game's own words, and lists every simplification", () => {
    for (const note of text.faithful) expect(readme, note.id).toContain(`| ${note.id} | ${note.text} |`);
    for (const note of text.simplified) expect(readme, note.id).toMatch(new RegExp(`\\| ${note.id} \\| `));
  });

  it("gives the commands that exist in package.json", () => {
    const scripts = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts as Record<string, string>;
    for (const [, name] of readme.matchAll(/^npm run ([a-z0-9:]+)/gm)) expect(scripts[name!], `npm run ${name}`).toBeDefined();
    expect(readme).toContain("npm test");
  });
});

describe("rules stated in the spec are the ones in the data and the code", () => {
  it("the drop meter's three numbers equal FR-010", () => {
    expect(spec).toContain("**v1 values: size 100 drops, drain delay 3 seconds, drain interval 1 second.**");
    expect([tuning.meterSize, tuning.meterDrainDelaySec, tuning.meterDrainIntervalSec]).toEqual([100, 3, 1]);
  });

  it("the default cost is 10 (S6, FR-015)", () => {
    expect(spec).toContain("**FR-015 (S6 Default cost)**: A new link has cost 10.");
    expect(DEFAULT_LINK_COST).toBe(10);
  });
});

describe("adding a region is a data change (C6)", () => {
  it("the unchanged simulation runs on the trial region", () => {
    const trialTuning = { ...tuning, maxSites: 6 };
    const trial = validateRegion(trialJson, trialTuning.maxSites);
    const world = createWorld("trial", trial, trialTuning);
    expect(world.sites.map((s) => s.code).sort()).toEqual(["ALF", "BRV", "CHA", "DLT", "ECH", "FOX"]);
    while (!world.over && world.step < 4 * 60 * tuning.stepsPerSec) step(world, botCommands(world));
    expect(world.links.length).toBeGreaterThan(4);
    expect(world.delivered).toBeGreaterThan(100);
  });
});
