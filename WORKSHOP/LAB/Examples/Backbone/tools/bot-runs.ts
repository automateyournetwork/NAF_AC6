// Tuning aid: plays the scripted player on fixed seeds and prints how each run ended.
//   node tools/run-ts.mjs tools/bot-runs.ts [seed…]

import { validateRegion, validateTuning } from "../src/content/load";
import regionJson from "../src/content/region-na.json";
import tuningJson from "../src/content/tuning.json";
import { botCommands } from "../src/sim/bot";
import { createWorld, formatTime, step } from "../src/sim/world";

export const SEEDS = ["stage-1", "loop", "arcade", "2328", "autocon", "denver", "fiber", "ospf"];

export function main(args: string[]): void {
  const tuning = validateTuning(tuningJson);
  const region = validateRegion(regionJson, tuning.maxSites);
  const seeds = args.length > 0 ? args : SEEDS;
  const lengths: number[] = [];
  let byQueue = 0;
  console.log("seed       time   delivered  queue  cut  no-route  links  sites");
  for (const seed of seeds) {
    const world = createWorld(seed, region, tuning);
    const limit = 40 * 60 * tuning.stepsPerSec;
    while (!world.over && world.step < limit) step(world, botCommands(world));
    const d = world.dropped;
    lengths.push(world.step);
    if (d.queue >= d.cut && d.queue >= d.noRoute) byQueue++;
    console.log(
      [
        seed.padEnd(10),
        (world.over ? formatTime(world.step, tuning.stepsPerSec) : ">40:00").padStart(5),
        String(world.delivered).padStart(10),
        String(d.queue).padStart(6),
        String(d.cut).padStart(4),
        String(d.noRoute).padStart(9),
        String(world.links.length).padStart(6),
        String(world.sites.filter((s) => s.appearStep <= world.step).length).padStart(6),
      ].join(" "),
    );
  }
  const sorted = [...lengths].sort((a, b) => a - b);
  const median = (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.ceil((sorted.length - 1) / 2)]!) / 2;
  console.log(
    `median ${formatTime(median, tuning.stepsPerSec)}, shortest ${formatTime(sorted[0]!, tuning.stepsPerSec)}, ` +
      `longest ${formatTime(sorted.at(-1)!, tuning.stepsPerSec)}; queue drops are the largest cause in ${byQueue} of ${seeds.length}`,
  );
}
