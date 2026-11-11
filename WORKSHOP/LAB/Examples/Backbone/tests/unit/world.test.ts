import { describe, expect, it } from "vitest";
import { validateRegion, validateTuning } from "../../src/content/load";
import regionJson from "../../src/content/region-na.json";
import tuningJson from "../../src/content/tuning.json";
import type { Command, Link, Packet, Region, Tuning, World } from "../../src/sim/types";
import {
  DEFAULT_LINK_COST,
  activeSites,
  capacityOf,
  cloneWorld,
  createWorld,
  cutLink,
  findLink,
  formatTime,
  hashWorld,
  inFlight,
  injectPacket,
  isDark,
  presentSites,
  scoreOf,
  step,
  validate,
} from "../../src/sim/world";
import { cases } from "./helpers";

const tuning = validateTuning(tuningJson);
const region = validateRegion(regionJson, tuning.maxSites);
const S = tuning.stepsPerSec;
const NEVER = 1_000_000;

/** No traffic, no cuts, no rewards: the test injects exactly the packets it reasons about. */
const quiet = (extra: Partial<Tuning> = {}): Tuning => ({
  ...tuning,
  baseRateMilli: 0,
  rateGrowthMilliPerMin: 0,
  firstCutSec: NEVER,
  rewardEverySec: NEVER,
  ...extra,
});

// Topology T1 of the spec, laid out so every link is a few steps long.
const T1: Region = {
  id: "t1",
  name: "T1",
  sites: [
    { code: "AAA", name: "A", x: 0, y: 0, weight: 1 },
    { code: "BBB", name: "B", x: 300, y: 200, weight: 1 },
    { code: "CCC", name: "C", x: 600, y: 0, weight: 1 },
    { code: "DDD", name: "D", x: 300, y: -200, weight: 1 },
    { code: "EEE", name: "E", x: 900, y: 0, weight: 1 },
  ],
};
const ID = cases.topologies.T1.routers as Record<string, number>;
const [A, B, C, D, E] = [ID.A!, ID.B!, ID.C!, ID.D!, ID.E!];

function send(world: World, ...commands: Command[]) {
  const events = step(world, commands);
  expect(events.rejected, "commands accepted").toEqual([]);
  return events;
}

function run(world: World, steps: number): void {
  for (let i = 0; i < steps; i++) step(world, []);
}

/** T1 with the spec's costs, built through commands. Router IDs are A=1 … E=5. */
function t1(maxPaths = 1, extra: Partial<Tuning> = {}): World {
  const world = createWorld("t1", T1, quiet({ startSites: 5, maxSites: 5, graceSec: 0, startFiberKm: 100_000, ...extra }), {
    maxPaths,
    inOrder: true,
  });
  expect(world.sites.map((s) => s.id)).toEqual([1, 2, 3, 4, 5]);
  for (const [a, b, cost] of cases.topologies.T1.links as [string, string, number][]) {
    send(world, { type: "layLink", a: ID[a]!, b: ID[b]! });
    send(world, { type: "setCost", link: findLink(world, ID[a]!, ID[b]!)!.id, cost });
  }
  return world;
}

const link = (world: World, a: number, b: number): Link => findLink(world, a, b)!;
const packetsOn = (l: Link): Packet[] => l.dirs.flatMap((d) => [...d.queue, ...d.wire]);
const totalDrops = (w: World): number => w.dropped.queue + w.dropped.cut + w.dropped.noRoute;

/** The links that currently hold a packet matching the test. */
function linksHolding(world: World, match: (p: Packet) => boolean): string[] {
  const names = "?ABCDE";
  return world.links.filter((l) => packetsOn(l).some(match)).map((l) => `${names[l.a]}-${names[l.b]}`);
}

describe("creating a run", () => {
  it("introduces sites in router-ID order on the tuning's schedule (FR-018)", () => {
    const world = createWorld("stage-1", region, tuning);
    expect(world.sites.length).toBe(tuning.maxSites);
    expect(world.sites.map((s) => s.id)).toEqual(Array.from({ length: tuning.maxSites }, (_, i) => i + 1));
    expect(new Set(world.sites.map((s) => s.code)).size).toBe(tuning.maxSites);
    world.sites.forEach((site, i) => {
      const appear = i < tuning.startSites ? 0 : (i - tuning.startSites + 1) * tuning.siteEverySec * S;
      expect(site.appearStep).toBe(appear);
      expect(site.activeStep).toBe(appear + tuning.graceSec * S);
    });
    expect(presentSites(world).length).toBe(tuning.startSites);
    expect(activeSites(world).length).toBe(0);
    expect(world.fiberKm).toBe(tuning.startFiberKm);
    expect(world.upgrades).toBe(tuning.startUpgrades);
  });

  it("gives the same sites for the same seed and different ones for another", () => {
    const codes = (seed: string): string => createWorld(seed, region, tuning).sites.map((s) => s.code).join(",");
    expect(codes("stage-1")).toBe(codes("stage-1"));
    expect(new Set(["a", "b", "c", "d", "e", "f"].map(codes)).size).toBeGreaterThan(1);
  });

  it("never has more sites than the tuning allows, and a new site is dark once its grace period ends", () => {
    const world = createWorld("stage-1", region, quiet());
    expect(isDark(world, 1)).toBe(false); // still in its grace period
    run(world, tuning.graceSec * S);
    expect(activeSites(world).length).toBe(tuning.startSites);
    expect(isDark(world, 1)).toBe(true); // active, no link
    send(world, { type: "layLink", a: 1, b: 2 });
    expect(isDark(world, 1)).toBe(false);
    expect(isDark(world, 3)).toBe(true);
    run(world, tuning.maxSites * tuning.siteEverySec * S);
    expect(presentSites(world).length).toBe(tuning.maxSites);
  });
});

describe("commands and their refusals (contracts/simulation.md)", () => {
  it("lays a link: cost 10, lowest tier, fiber spent equals its length (R9, FR-012, FR-015)", () => {
    const world = createWorld("t1", T1, quiet({ startSites: 5, maxSites: 5, startFiberKm: 1000 }), { inOrder: true });
    send(world, { type: "layLink", a: C, b: A });
    const l = link(world, A, C);
    expect(DEFAULT_LINK_COST).toBe(10);
    expect({ a: l.a, b: l.b, km: l.km, cost: l.cost, tier: l.tier, up: l.up }).toEqual({ a: A, b: C, km: 600, cost: 10, tier: 0, up: true });
    expect(world.fiberKm).toBe(400);
  });

  it("refuses a link with too little fiber, to the same site, a duplicate, or an unknown site, and spends nothing (AC5)", () => {
    const world = createWorld("t1", T1, quiet({ startSites: 4, maxSites: 5, startFiberKm: 700 }), { inOrder: true });
    send(world, { type: "layLink", a: A, b: C });
    const before = hashWorld(world);
    const refused = (command: Command): string | null => validate(world, command);
    expect(refused({ type: "layLink", a: A, b: B })).toBe("not-enough-fiber");
    expect(refused({ type: "layLink", a: A, b: A })).toBe("same-site");
    expect(refused({ type: "layLink", a: C, b: A })).toBe("duplicate-link");
    expect(refused({ type: "layLink", a: A, b: 99 })).toBe("no-such-site");
    expect(refused({ type: "layLink", a: A, b: E })).toBe("no-such-site"); // E has not appeared yet
    expect(hashWorld(world)).toBe(before); // validate changes nothing
    const events = step(world, [{ type: "layLink", a: A, b: B }, { type: "layLink", a: A, b: A }]);
    expect(events.rejected.map((r) => r.reason)).toEqual(["not-enough-fiber", "same-site"]);
    expect(world.fiberKm).toBe(100);
    expect(world.links.length).toBe(1);
  });

  it("case 10: refuses cost 0 and 65536, leaving cost, routes and state unchanged (F2, FR-004)", () => {
    const world = t1();
    const l = link(world, A, C);
    const before = hashWorld(world);
    for (const cost of [...cases.invalidCost.values, -1, 1.5, Number.NaN]) {
      expect(validate(world, { type: "setCost", link: l.id, cost }), `cost ${cost}`).toBe("bad-cost");
    }
    expect(validate(world, { type: "setCost", link: 99, cost: 5 })).toBe("no-such-link");
    expect(hashWorld(world)).toBe(before);
    const routes = JSON.stringify(world.routes);
    const events = step(world, [{ type: "setCost", link: l.id, cost: 0 }, { type: "setCost", link: l.id, cost: 65536 }]);
    expect(events.rejected.map((r) => r.reason)).toEqual(["bad-cost", "bad-cost"]);
    expect(events.routesChanged).toBe(false);
    expect(l.cost).toBe(25);
    expect(JSON.stringify(world.routes)).toBe(routes);
    // The two ends of the legal range are accepted.
    send(world, { type: "setCost", link: l.id, cost: 1 });
    send(world, { type: "setCost", link: l.id, cost: 65535 });
    expect(l.cost).toBe(65535);
  });

  it("upgrades one tier in both directions, spends one upgrade and leaves the cost (AC8, FR-014)", () => {
    const world = t1(1, { startUpgrades: 3 });
    const l = link(world, B, C);
    expect(capacityOf(world, l)).toBe(tuning.tiers[0]);
    send(world, { type: "upgrade", link: l.id });
    expect({ tier: l.tier, cost: l.cost, upgrades: world.upgrades }).toEqual({ tier: 1, cost: 10, upgrades: 2 });
    expect(capacityOf(world, l)).toBe(tuning.tiers[1]);
    send(world, { type: "upgrade", link: l.id });
    expect(validate(world, { type: "upgrade", link: l.id })).toBe("max-tier");
    expect(validate(world, { type: "upgrade", link: 99 })).toBe("no-such-link");
    send(world, { type: "upgrade", link: link(world, A, B).id });
    expect(world.upgrades).toBe(0);
    expect(validate(world, { type: "upgrade", link: link(world, A, D).id })).toBe("no-upgrade");
  });

  it("removes an up link: fiber back in full, upgrades forfeited, its packets dropped (AC24, FR-013)", () => {
    const world = t1(1, { startUpgrades: 1 });
    const l = link(world, A, B);
    send(world, { type: "upgrade", link: l.id });
    const fiber = world.fiberKm;
    for (let i = 0; i < 5; i++) injectPacket(world, A, C); // queued for A–B
    step(world, []);
    const held = packetsOn(l).length;
    expect(held).toBe(5);
    send(world, { type: "removeLink", link: l.id });
    expect(findLink(world, A, B)).toBeUndefined();
    expect(world.fiberKm).toBe(fiber + l.km);
    expect(world.upgrades).toBe(0); // the upgrade spent on the link does not come back
    expect(world.dropped.cut).toBe(held);
    expect(world.meter).toBe(held);
    expect(validate(world, { type: "removeLink", link: l.id })).toBe("no-such-link");
  });

  it("refuses to remove a cut link until it is repaired (AC25)", () => {
    const world = t1();
    const l = link(world, B, C);
    cutLink(world, l.id, 3 * S);
    const fiber = world.fiberKm;
    const events = step(world, [{ type: "removeLink", link: l.id }]);
    expect(events.rejected.map((r) => r.reason)).toEqual(["link-is-cut"]);
    expect(world.fiberKm).toBe(fiber);
    run(world, 3 * S);
    expect(l.up).toBe(true);
    send(world, { type: "removeLink", link: l.id });
    expect(world.fiberKm).toBe(fiber + l.km);
  });

  it("refuses a reward choice when none is pending, and an unknown choice", () => {
    const world = t1();
    expect(validate(world, { type: "chooseReward", choice: "fiber" })).toBe("no-reward-pending");
    world.rewardPending = true;
    expect(validate(world, { type: "chooseReward", choice: "gold" as "fiber" })).toBe("bad-choice");
  });
});

describe("routes follow the topology (R1, FR-001)", () => {
  it("recomputes before the next packet is forwarded", () => {
    const world = t1();
    expect(world.routes[A]![C]).toEqual({ cost: 20, nextHops: [B] });
    const events = send(world, { type: "setCost", link: link(world, A, C).id, cost: 19 });
    expect(events.routesChanged).toBe(true);
    expect(world.routes[A]![C]).toEqual({ cost: 19, nextHops: [C] });
    expect(world.routes[A]![E]).toEqual({ cost: 24, nextHops: [C] });
  });

  it("the worked interaction: A→C traffic rides A–B–C, never the direct link (AC3, case 6)", () => {
    const world = t1(1);
    const seen = new Set<string>();
    for (let i = 0; i < 20 * S; i++) {
      if (i % 5 === 0) injectPacket(world, A, C);
      step(world, []);
      for (const name of linksHolding(world, (p) => p.src === A && p.dst === C)) seen.add(name);
    }
    expect([...seen].sort()).toEqual(["A-B", "B-C"]);
    expect(world.delivered).toBeGreaterThan(60);
    expect(totalDrops(world)).toBe(0);
  });

  it("with every tied route kept, A→C traffic uses A–B–C and A–D–C only, half each (AC3, case 1)", () => {
    const world = t1(16);
    const seen = new Set<string>();
    const viaB = new Set<number>();
    const viaD = new Set<number>();
    for (let i = 0; i < 20 * S; i++) {
      if (i % 5 === 0) injectPacket(world, A, C);
      step(world, []);
      for (const name of linksHolding(world, (p) => p.src === A && p.dst === C)) seen.add(name);
      for (const p of packetsOn(link(world, A, B))) viaB.add(p.id);
      for (const p of packetsOn(link(world, A, D))) viaD.add(p.id);
    }
    expect([...seen].sort()).toEqual(["A-B", "A-D", "B-C", "C-D"]);
    expect(seen.has("A-C")).toBe(false);
    expect(viaB.size + viaD.size).toBe(4 * 20);
    expect(viaB.size).toBe(viaD.size);
    expect(totalDrops(world)).toBe(0);
  });

  it("after A–C is set to 19, every new A→C and A→E packet takes the direct link (AC4, case 4)", () => {
    const world = t1(1);
    for (let i = 0; i < 2 * S; i++) {
      if (i % 5 === 0) injectPacket(world, A, C);
      step(world, []);
    }
    const lastBefore = world.nextPacketId - 1;
    send(world, { type: "setCost", link: link(world, A, C).id, cost: 19 });
    const seen = new Set<string>();
    for (let i = 0; i < 10 * S; i++) {
      if (i % 5 === 0) injectPacket(world, A, i % 10 === 0 ? C : E);
      step(world, []);
      for (const name of linksHolding(world, (p) => p.id > lastBefore)) seen.add(name);
    }
    expect([...seen].sort()).toEqual(["A-C", "C-E"]);
    expect(totalDrops(world)).toBe(0);
  });
});

describe("drops (R6, FR-009) and dark sites (R8, FR-011)", () => {
  it("case 8: with C–E cut, E is dark and every packet to or from E is a no-route drop", () => {
    const world = t1(16);
    const before = JSON.parse(JSON.stringify(world.routes));
    cutLink(world, link(world, C, E).id, NEVER);
    step(world, []);
    expect(isDark(world, E)).toBe(true);
    for (const other of [A, B, C, D]) {
      expect(isDark(world, other)).toBe(false);
      expect(world.routes[other]![E]).toBeUndefined();
      expect(world.routes[E]![other]).toBeUndefined();
      // All other routes are unchanged.
      for (const to of [A, B, C, D]) if (to !== other) expect(world.routes[other]![to]).toEqual(before[other][to]);
    }
    for (let i = 0; i < 10; i++) {
      injectPacket(world, A, E);
      injectPacket(world, E, A);
    }
    injectPacket(world, A, C);
    run(world, 3 * S);
    expect(world.dropped).toEqual({ queue: 0, cut: 0, noRoute: 20 });
    expect(world.delivered).toBe(1);
  });

  it("a packet already on its way is dropped as no-route at the first router with no route for it", () => {
    const world = t1(1);
    injectPacket(world, A, E); // A–B–C–E
    step(world, []);
    step(world, []);
    expect(packetsOn(link(world, A, B)).length).toBe(1);
    cutLink(world, link(world, C, E).id, NEVER);
    const seen = new Set<string>();
    for (let i = 0; i < 2 * S; i++) {
      step(world, []);
      for (const name of linksHolding(world, () => true)) seen.add(name);
    }
    expect(world.dropped).toEqual({ queue: 0, cut: 0, noRoute: 1 });
    expect(seen.has("B-C")).toBe(false); // B had no route, so the packet went no further
  });

  it("a cost change by itself drops nothing", () => {
    const world = t1(1);
    for (let i = 0; i < 6; i++) injectPacket(world, A, C);
    step(world, []);
    send(world, { type: "setCost", link: link(world, B, C).id, cost: 500 });
    run(world, 15 * S);
    expect(totalDrops(world)).toBe(0);
    expect(world.delivered).toBe(6);
  });

  it("a packet is never served in the step in which it joins a queue (service before arrivals)", () => {
    const world = t1(1);
    injectPacket(world, A, C);
    const ab = link(world, A, B);
    const bc = link(world, B, C);
    while (ab.dirs[0].wire.length === 0) step(world, []);
    const arrives = ab.dirs[0].wire[0]!.t1;
    while (world.step < arrives) step(world, []);
    expect(bc.dirs[0].queue.length).toBe(1); // it reached B in this step and waits
    expect(bc.dirs[0].wire.length).toBe(0);
    step(world, []);
    expect(bc.dirs[0].wire.map((p) => p.t0)).toEqual([arrives + 1]);
  });

  it("a full queue refuses a packet and counts one drop", () => {
    const world = t1(1);
    for (let i = 0; i < tuning.queueLen + 3; i++) injectPacket(world, A, B);
    expect(world.dropped.queue).toBe(3);
    expect(link(world, A, B).dirs[0].queue.length).toBe(tuning.queueLen);
  });

  it("every packet is delivered, dropped or still in the network, at every step", () => {
    const world = createWorld("stage-1", region, { ...tuning, firstCutSec: 30, cutEverySec: [5, 8], cutLenSec: [2, 4] });
    send(world, { type: "layLink", a: 1, b: 2 }, { type: "layLink", a: 2, b: 3 });
    for (let i = 0; i < 55 * S && !world.over; i++) {
      step(world, []);
      expect(world.nextPacketId - 1).toBe(world.delivered + totalDrops(world) + inFlight(world));
    }
    expect(world.delivered).toBeGreaterThan(0);
    expect(world.dropped.cut + world.dropped.noRoute).toBeGreaterThan(0);
  });
});

describe("fiber cuts (R11, FR-017)", () => {
  it("a cut drops the packets on the link, reroutes, and the link returns unchanged (cases 5, F6, F7)", () => {
    const world = t1(1, { startUpgrades: 1 });
    const l = link(world, B, C);
    send(world, { type: "upgrade", link: l.id });
    for (let i = 0; i < 4; i++) injectPacket(world, B, C);
    step(world, []);
    cutLink(world, l.id, 2 * S);
    expect(l.up).toBe(false);
    expect(world.dropped.cut).toBe(4);
    const events = step(world, []);
    expect(events.routesChanged).toBe(true);
    expect(world.routes[A]![C]).toEqual({ cost: 20, nextHops: [D] });
    expect(world.routes[B]![C]).toEqual({ cost: 30, nextHops: [A] });
    expect(world.routes[B]![E]!.cost).toBe(35);
    let restored: number | null = null;
    for (let i = 0; i < 2 * S; i++) restored = step(world, []).linkRestored ?? restored;
    expect(restored).toBe(l.id);
    expect({ up: l.up, cost: l.cost, tier: l.tier, restoreStep: l.restoreStep }).toEqual({ up: true, cost: 10, tier: 1, restoreStep: 0 });
    expect(world.routes[B]![C]).toEqual({ cost: 10, nextHops: [C] });
  });

  it("the schedule cuts one up link at the due step, and none when no link is up", () => {
    const due = 5 * S;
    const world = t1(1, { firstCutSec: 5, cutEverySec: [4, 6], cutLenSec: [2, 3] });
    let cutId: number | null = null;
    while (world.step < due) cutId = step(world, []).linkCut ?? cutId;
    expect(world.step).toBe(due);
    expect(cutId).not.toBeNull();
    expect(world.links.filter((l) => !l.up).map((l) => l.id)).toEqual([cutId]);

    const empty = createWorld("t1", T1, quiet({ startSites: 5, maxSites: 5, firstCutSec: 5, cutEverySec: [4, 6], cutLenSec: [2, 3] }), { inOrder: true });
    for (let i = 0; i < 30 * S; i++) expect(step(empty, []).linkCut).toBeNull();
  });
});

describe("the drop meter (R7, FR-010)", () => {
  const delay = tuning.meterDrainDelaySec * S;
  const interval = tuning.meterDrainIntervalSec * S;

  it("uses the three numbers the spec states", () => {
    expect([tuning.meterSize, tuning.meterDrainDelaySec, tuning.meterDrainIntervalSec]).toEqual([100, 3, 1]);
  });

  it("adds 1 per drop, drains 1 after the delay and 1 per interval after that, and a drop restarts the delay", () => {
    const world = createWorld("t1", T1, quiet({ startSites: 5, maxSites: 5, graceSec: 0 }), { inOrder: true });
    for (let i = 0; i < 5; i++) injectPacket(world, A, C); // no links: five no-route drops
    step(world, []);
    const dropStep = world.step;
    expect(world.meter).toBe(5);
    while (world.step < dropStep + delay - 1) step(world, []);
    expect(world.meter).toBe(5);
    step(world, []); // exactly one drain delay after the last drop
    expect(world.meter).toBe(4);
    run(world, interval - 1);
    expect(world.meter).toBe(4);
    step(world, []);
    expect(world.meter).toBe(3);
    injectPacket(world, A, C); // a new drop restarts the delay
    step(world, []);
    expect(world.meter).toBe(4);
    run(world, delay - 1);
    expect(world.meter).toBe(4);
    step(world, []);
    expect(world.meter).toBe(3);
    run(world, 10 * interval);
    expect(world.meter).toBe(0); // never below zero
  });

  it("ends the run at the step the meter reaches its size, and refuses everything after", () => {
    const world = createWorld("t1", T1, quiet({ startSites: 5, maxSites: 5, graceSec: 0 }), { inOrder: true });
    for (let i = 0; i < tuning.meterSize - 1; i++) injectPacket(world, A, C);
    expect(step(world, []).over).toBe(false);
    expect(world.meter).toBe(tuning.meterSize - 1);
    injectPacket(world, A, C);
    const events = step(world, []);
    expect(events.over).toBe(true);
    expect(world.over).toBe(true);
    expect(world.meter).toBe(tuning.meterSize);
    const ended = world.step;
    const after = step(world, [{ type: "layLink", a: A, b: B }]);
    expect(after.advanced).toBe(false);
    expect(after.rejected.map((r) => r.reason)).toEqual(["run-over"]);
    expect(world.step).toBe(ended);
  });
});

describe("rewards (R10, FR-016)", () => {
  it("time stops while a reward is pending and the choice is applied", () => {
    const world = createWorld("stage-1", region, { ...quiet(), rewardEverySec: 60 });
    const due = 60 * S;
    let offered = false;
    while (world.step < due) offered = step(world, []).rewardOffered || offered;
    expect(offered).toBe(true);
    expect(world.rewardPending).toBe(true);
    for (let i = 0; i < 50; i++) expect(step(world, []).advanced).toBe(false);
    expect(world.step).toBe(due);
    const fiber = world.fiberKm;
    const events = send(world, { type: "chooseReward", choice: "fiber" });
    expect(events.advanced).toBe(true);
    expect(world.fiberKm).toBe(fiber + tuning.rewardFiberKm);
    expect(world.rewardPending).toBe(false);
    while (!world.rewardPending) step(world, []);
    expect(world.step).toBe(2 * due);
    const upgrades = world.upgrades;
    send(world, { type: "chooseReward", choice: "upgrade" });
    expect(world.upgrades).toBe(upgrades + 1);
  });
});

describe("traffic (R3, FR-006)", () => {
  it("the same seed offers the same traffic to two different networks", () => {
    const endless = { ...tuning, meterSize: NEVER };
    const bare = createWorld("stage-1", region, endless);
    const built = createWorld("stage-1", region, endless);
    send(built, { type: "layLink", a: 1, b: 2 }, { type: "layLink", a: 2, b: 3 }, { type: "layLink", a: 1, b: 3 });
    step(bare, []);
    let emitted = 0;
    for (let i = 0; i < 45 * S; i++) {
      step(bare, []);
      step(built, []);
      expect(built.nextPacketId).toBe(bare.nextPacketId);
      expect(built.rngTraffic).toEqual(bare.rngTraffic);
      emitted = bare.nextPacketId - 1;
    }
    expect(emitted).toBeGreaterThan(40);
    expect(built.delivered).toBeGreaterThan(0);
    expect(bare.delivered).toBe(0);
  });

  it("sends nothing to or from a site still in its grace period, and grows over the run", () => {
    const world = createWorld("stage-1", region, { ...tuning, firstCutSec: NEVER, rewardEverySec: NEVER, meterSize: NEVER });
    run(world, tuning.graceSec * S - 1);
    expect(world.nextPacketId).toBe(1);
    const perMinute: number[] = [];
    for (let minute = 0; minute < 3; minute++) {
      const before = world.nextPacketId;
      run(world, 60 * S);
      perMinute.push(world.nextPacketId - before);
    }
    expect(perMinute[1]!).toBeGreaterThan(perMinute[0]!);
    expect(perMinute[2]!).toBeGreaterThan(perMinute[1]!);
  });
});

describe("score (R12, FR-019) and determinism (R13, FR-020)", () => {
  it("case 11: 1,840 delivered at 6 min 05 s gives score 1,840 and time 6:05", () => {
    const c = cases.score;
    const world = createWorld("stage-1", region, tuning);
    world.delivered = c.delivered;
    world.dropped = { queue: c.dropped, cut: 0, noRoute: 0 };
    world.step = c.seconds * S;
    expect(scoreOf(world)).toEqual({ score: c.expect.score, steps: c.seconds * S, time: c.expect.time });
    expect(formatTime(c.seconds * S, S)).toBe(c.expect.time);
    expect(formatTime(59 * S, S)).toBe("0:59");
    expect(formatTime(600 * S + 7, S)).toBe("10:00");
  });

  it("case 12: the same seed and commands give an identical state at every step and an identical score", () => {
    const play = (): { hashes: string[]; score: number; steps: number } => {
      const world = createWorld("stage-1", region, tuning);
      const hashes: string[] = [];
      while (!world.over && world.step < 9 * 60 * S) {
        const commands: Command[] = [];
        if (world.rewardPending) commands.push({ type: "chooseReward", choice: world.step % 2400 === 0 ? "upgrade" : "fiber" });
        if (world.step === 10) commands.push({ type: "layLink", a: 1, b: 2 }, { type: "layLink", a: 2, b: 3 });
        if (world.step === 300) commands.push({ type: "layLink", a: 1, b: 3 }, { type: "setCost", link: 1, cost: 30 });
        if (world.step === 900) commands.push({ type: "upgrade", link: 2 }, { type: "layLink", a: 4, b: 2 });
        if (world.step === 1700) commands.push({ type: "layLink", a: 5, b: 1 }, { type: "removeLink", link: 3 });
        step(world, commands);
        hashes.push(hashWorld(world));
      }
      return { hashes, score: world.delivered, steps: world.step };
    };
    const first = play();
    const second = play();
    expect(first.steps).toBeGreaterThan(60 * S);
    expect(second.hashes.length).toBe(first.hashes.length);
    expect(second.hashes).toEqual(first.hashes);
    expect(second.score).toBe(first.score);
    expect(new Set(first.hashes).size).toBe(first.hashes.length); // the state really changes every step
  });

  it("the hash sees any change to the world, and a copy is equal but separate", () => {
    const world = t1(1);
    for (let i = 0; i < 3; i++) injectPacket(world, A, C);
    step(world, []);
    const base = hashWorld(world);
    const copy = cloneWorld(world);
    expect(hashWorld(copy)).toBe(base);
    const changes: ((w: World) => void)[] = [
      (w) => (w.links[0]!.cost += 1),
      (w) => (w.meter += 1),
      (w) => (w.fiberKm -= 1),
      (w) => (w.links[0]!.dirs[0].queue[0]!.dst = D),
      (w) => (w.links[1]!.up = false),
      (w) => (w.rngTraffic.a += 1),
      (w) => (w.delivered += 1),
      (w) => (w.step += 1),
    ];
    for (const change of changes) {
      const altered = cloneWorld(world);
      change(altered);
      expect(hashWorld(altered)).not.toBe(base);
    }
    expect(hashWorld(world)).toBe(base); // changing a copy never touches the original
  });
});
