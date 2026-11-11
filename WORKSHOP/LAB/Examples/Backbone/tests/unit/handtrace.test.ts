import { describe, expect, it } from "vitest";
import { validateRegion, validateTuning } from "../../src/content/load";
import regionJson from "../../src/content/region-na.json";
import tuningJson from "../../src/content/tuning.json";
import { createWorld, findLink, injectPacket, step } from "../../src/sim/world";

// The engine must agree with docs/verification/hand-trace.md, which follows one packet from
// the region file through the routing code by hand (C6 evidence). The numbers below are
// the ones worked out in that document.

const base = validateTuning(tuningJson);
const tuning = { ...base, startSites: 18, maxSites: 18, graceSec: 0, baseRateMilli: 0, rateGrowthMilliPerMin: 0, firstCutSec: 1e6, rewardEverySec: 1e6 };
const region = validateRegion(regionJson, 18);
const [DEN, MKC, MSP, CHI] = [6, 9, 10, 11];

describe("the hand trace (C6)", () => {
  const world = createWorld("trace", region, tuning, { inOrder: true });

  it("router IDs follow the order of the region file, and positions and lengths are as worked by hand", () => {
    expect([DEN, MKC, MSP, CHI].map((id) => world.sites[id - 1]!.code)).toEqual(["DEN", "MKC", "MSP", "CHI"]);
    expect([world.sites[DEN - 1]!.x, world.sites[DEN - 1]!.y]).toEqual([-777, 82]);
    for (const [a, b] of [[DEN, MKC], [MKC, CHI], [DEN, MSP], [MSP, CHI]] as const) {
      expect(step(world, [{ type: "layLink", a, b }]).rejected).toEqual([]);
    }
    expect([findLink(world, DEN, MKC)!.km, findLink(world, MKC, CHI)!.km, findLink(world, DEN, MSP)!.km, findLink(world, MSP, CHI)!.km]).toEqual([900, 675, 1171, 596]);
    expect(world.fiberKm).toBe(base.startFiberKm - 3342);
  });

  it("Denver's route to Chicago costs 20 and leaves through Kansas City, the lower router ID of the tie", () => {
    expect(world.routes[DEN]![CHI]).toEqual({ cost: 20, nextHops: [MKC] });
    expect(world.routes[MKC]![CHI]).toEqual({ cost: 10, nextHops: [CHI] });
  });

  it("the packet rides DEN–MKC then MKC–CHI and is delivered 28 steps after it is sent", () => {
    for (let i = 0; i < 10; i++) step(world, []); // let the idle links build their one packet of credit
    const sent = world.step;
    injectPacket(world, DEN, CHI);
    const visited: string[] = [];
    while (world.delivered === 0 && world.step < sent + 100) {
      step(world, []);
      for (const link of world.links) {
        const name = `${world.sites[link.a - 1]!.code}-${world.sites[link.b - 1]!.code}`;
        if (link.dirs.some((d) => d.queue.length + d.wire.length > 0) && visited.at(-1) !== name) visited.push(name);
      }
    }
    expect(visited).toEqual(["DEN-MKC", "MKC-CHI"]);
    expect(world.step - sent).toBe(28);
  });

  it("raising DEN–MKC to 11 moves the route to Minneapolis", () => {
    step(world, [{ type: "setCost", link: findLink(world, DEN, MKC)!.id, cost: 11 }]);
    expect(world.routes[DEN]![CHI]).toEqual({ cost: 20, nextHops: [MSP] });
  });
});
