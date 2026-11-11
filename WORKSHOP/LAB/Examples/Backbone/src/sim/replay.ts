// Command log and re-simulation (R13, R14). A run is its seed plus the player's commands
// and the steps at which they were sent; replaying them rebuilds the run exactly.

import type { Command, LogEntry, Region, Tuning, World } from "./types";
import { createWorld, step, type WorldOptions } from "./world";

/** Notes commands in the log against the world's step count at the moment they are sent. */
export function recordCommands(log: LogEntry[], world: World, commands: Command[]): void {
  for (const command of commands) log.push({ step: world.step, command });
}

/**
 * Feeds the log's commands to `world` up to `untilStep`, calling `onStep` after each step.
 * Returns the index of the first log entry not yet used, so a caller can continue later.
 */
export function advanceWithLog(
  world: World,
  log: LogEntry[],
  from: number,
  untilStep: number,
  onStep?: (world: World) => void,
): number {
  let next = from;
  while (!world.over && world.step < untilStep) {
    const commands: Command[] = [];
    while (next < log.length && log[next]!.step === world.step) commands.push(log[next++]!.command);
    const before = world.step;
    step(world, commands);
    if (world.step === before && commands.length === 0) break; // a reward the log never answers
    if (world.step !== before) onStep?.(world);
  }
  return next;
}

/** Rebuilds a run from its seed and command log. */
export function replay(
  seed: string,
  region: Region,
  tuning: Tuning,
  log: LogEntry[],
  untilStep: number,
  options: WorldOptions = {},
): World {
  const world = createWorld(seed, region, tuning, options);
  advanceWithLog(world, log, 0, untilStep);
  return world;
}
