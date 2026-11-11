import { describe, expect, it } from "vitest";
import { validateRegion, validateTuning } from "../../src/content/load";
import regionJson from "../../src/content/region-na.json";
import tuningJson from "../../src/content/tuning.json";
import { botCommands } from "../../src/sim/bot";
import { createWorld, step, validate } from "../../src/sim/world";

const tuning = validateTuning(tuningJson);
const region = validateRegion(regionJson, tuning.maxSites);

function play(seed: string): { score: number; steps: number; rejected: number; links: number } {
  const world = createWorld(seed, region, tuning);
  let rejected = 0;
  while (!world.over && world.step < 30 * 60 * tuning.stepsPerSec) {
    const commands = botCommands(world);
    for (const command of commands) if (validate(world, command) !== null) rejected++;
    step(world, commands);
  }
  return { score: world.delivered, steps: world.step, rejected, links: world.links.length };
}

describe("the scripted player", () => {
  it("plays a headless run on a fixed seed to game over with a score (SC-003)", () => {
    const run = play("stage-1");
    expect(run.steps).toBeLessThan(30 * 60 * tuning.stepsPerSec); // the run ended by the drop meter
    expect(run.steps).toBeGreaterThan(60 * tuning.stepsPerSec);
    expect(run.score).toBeGreaterThan(100);
    expect(run.links).toBeGreaterThan(3);
    expect(run.rejected).toBe(0); // it only sends commands the rules accept
  });

  it("gives the same score for the same seed, twice", () => {
    expect(play("loop")).toEqual(play("loop"));
  });
});
