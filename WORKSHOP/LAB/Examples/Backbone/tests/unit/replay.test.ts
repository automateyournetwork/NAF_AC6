import { describe, expect, it } from "vitest";
import { validateRegion, validateTuning } from "../../src/content/load";
import regionJson from "../../src/content/region-na.json";
import tuningJson from "../../src/content/tuning.json";
import { botCommands } from "../../src/sim/bot";
import { advanceWithLog, recordCommands, replay } from "../../src/sim/replay";
import type { LogEntry } from "../../src/sim/types";
import { createWorld, hashWorld, step } from "../../src/sim/world";

const tuning = validateTuning(tuningJson);
const region = validateRegion(regionJson, tuning.maxSites);

/** Plays a run with the scripted player, recording the commands and the hash after every step. */
function recordRun(seed: string, limit: number): { log: LogEntry[]; hashes: string[]; score: number; steps: number } {
  const world = createWorld(seed, region, tuning);
  const log: LogEntry[] = [];
  const hashes: string[] = [];
  while (!world.over && world.step < limit) {
    const commands = botCommands(world);
    recordCommands(log, world, commands);
    const before = world.step;
    step(world, commands);
    if (world.step !== before) hashes.push(hashWorld(world));
  }
  return { log, hashes, score: world.delivered, steps: world.step };
}

describe("replay (R13, R14, FR-021)", () => {
  it("a run rebuilt from its command log equals the original at every step", () => {
    const original = recordRun("stage-1", 20 * 60 * tuning.stepsPerSec);
    expect(original.log.length).toBeGreaterThan(5);
    const again = createWorld("stage-1", region, tuning);
    const hashes: string[] = [];
    advanceWithLog(again, original.log, 0, original.steps, (w) => hashes.push(hashWorld(w)));
    expect(hashes.length).toBe(original.hashes.length);
    expect(hashes).toEqual(original.hashes);
    expect(again.delivered).toBe(original.score);
    expect(again.step).toBe(original.steps);
  });

  it("replays to an identical final state, the same as the first play", () => {
    const original = recordRun("loop", 20 * 60 * tuning.stepsPerSec);
    const rebuilt = replay("loop", region, tuning, original.log, original.steps);
    expect(hashWorld(rebuilt)).toBe(original.hashes.at(-1));
    expect(rebuilt.delivered).toBe(original.score);
  });

  it("can be replayed part of the way, then continued", () => {
    const original = recordRun("arcade", 4 * 60 * tuning.stepsPerSec);
    const half = Math.floor(original.steps / 2);
    const world = createWorld("arcade", region, tuning);
    const next = advanceWithLog(world, original.log, 0, half);
    expect(world.step).toBe(half);
    expect(hashWorld(world)).toBe(original.hashes[half - 1]);
    advanceWithLog(world, original.log, next, original.steps);
    expect(hashWorld(world)).toBe(original.hashes.at(-1));
  });

  it("a different log gives a different run", () => {
    const original = recordRun("stage-1", 3 * 60 * tuning.stepsPerSec);
    const fewer = replay("stage-1", region, tuning, original.log.slice(0, 2), original.steps);
    expect(hashWorld(fewer)).not.toBe(original.hashes.at(-1));
  });
});
