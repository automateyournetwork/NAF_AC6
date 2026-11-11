// The run: sites, links, traffic, events, the drop meter and the score. `step` is the only
// function that advances time, and it does its work in the fixed order written in
// specs/001-backbone-first-playable/contracts/simulation.md.

import { pickNextHop } from "./forwarding";
import { beginStep, newDirection, offer, refusedInWindow, serve, utilization } from "./linkq";
import { nextInt, nextRange, nextU32, seedRng } from "./rng";
import { computeRoutes } from "./spf";
import type {
  Command,
  Direction,
  DropCounts,
  Link,
  LinkId,
  Packet,
  Reason,
  Region,
  Site,
  SiteId,
  StepEvents,
  Tuning,
  World,
} from "./types";

/** New links get cost 10 (S6, FR-015). This is a rule of the model, not a tuning constant. */
export const DEFAULT_LINK_COST = 10;
/** Link cost is a whole number from 1 to 65535 (F2). */
export const MIN_COST = 1;
export const MAX_COST = 65535;

export interface WorldOptions {
  /** Routes kept per destination. 1 in v1 play (F4, Q3). */
  maxPaths?: number;
  /** Take the region's sites in file order instead of letting the seed choose. For tests and hand traces. */
  inOrder?: boolean;
}

export type LoadState = "nominal" | "busy" | "congested" | "dropping";

// --- creation ---------------------------------------------------------------------------

/**
 * The seed picks the first site, then each next site from the three nearest to those
 * already chosen, so the network grows outward and links stay affordable.
 */
function chooseSites(seed: string, region: Region, count: number): number[] {
  const rng = seedRng(`${seed}/sites`);
  const chosen = [nextInt(rng, region.sites.length)];
  while (chosen.length < count) {
    const near = region.sites
      .map((site, index) => ({
        index,
        km: Math.min(...chosen.map((c) => Math.hypot(site.x - region.sites[c]!.x, site.y - region.sites[c]!.y))),
      }))
      .filter((candidate) => !chosen.includes(candidate.index))
      .sort((p, q) => p.km - q.km || p.index - q.index);
    chosen.push(near[nextInt(rng, Math.min(3, near.length))]!.index);
  }
  return chosen;
}

export function createWorld(seed: string, region: Region, tuning: Tuning, options: WorldOptions = {}): World {
  const count = Math.min(tuning.maxSites, region.sites.length);
  const order = options.inOrder ? Array.from({ length: count }, (_, i) => i) : chooseSites(seed, region, count);
  const S = tuning.stepsPerSec;
  const sites: Site[] = order.map((index, i) => {
    const def = region.sites[index]!;
    const appearStep = i < tuning.startSites ? 0 : (i - tuning.startSites + 1) * tuning.siteEverySec * S;
    return {
      id: i + 1,
      code: def.code,
      name: def.name,
      x: def.x,
      y: def.y,
      weight: def.weight,
      appearStep,
      activeStep: appearStep + tuning.graceSec * S,
      credit: 0,
    };
  });
  const world: World = {
    seed,
    tuning: JSON.parse(JSON.stringify(tuning)) as Tuning,
    maxPaths: options.maxPaths ?? 1,
    step: 0,
    rngTraffic: seedRng(`${seed}/traffic`),
    rngEvents: seedRng(`${seed}/events`),
    sites,
    links: [],
    nextLinkId: 1,
    nextPacketId: 1,
    routes: {},
    rotors: {},
    routesDirty: false,
    fiberKm: tuning.startFiberKm,
    upgrades: tuning.startUpgrades,
    meter: 0,
    lastDropStep: 0,
    stepDrops: 0,
    delivered: 0,
    dropped: { queue: 0, cut: 0, noRoute: 0 },
    nextRewardStep: tuning.rewardEverySec * S,
    rewardPending: false,
    nextCutStep: tuning.firstCutSec * S,
    over: false,
  };
  recompute(world);
  return world;
}

// --- reading the world ------------------------------------------------------------------

/** Sites that have appeared on the map. */
export function presentSites(world: World): Site[] {
  return world.sites.filter((site) => site.appearStep <= world.step);
}

/** Sites whose grace period has ended: they send and receive traffic. */
export function activeSites(world: World): Site[] {
  return world.sites.filter((site) => site.activeStep <= world.step);
}

export function siteById(world: World, id: SiteId): Site | undefined {
  const site = world.sites[id - 1];
  return site && site.appearStep <= world.step ? site : undefined;
}

export function linkById(world: World, id: LinkId): Link | undefined {
  return world.links.find((link) => link.id === id);
}

export function findLink(world: World, a: SiteId, b: SiteId): Link | undefined {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return world.links.find((link) => link.a === lo && link.b === hi);
}

/** Packets per second each direction of the link serves. */
export function capacityOf(world: World, link: Link): number {
  return world.tuning.tiers[link.tier]!;
}

/** Steps a packet spends on the link: proportional to its length on the map (S11). */
export function travelSteps(world: World, link: Link): number {
  return Math.max(1, Math.round((link.km * world.tuning.stepsPerSec) / world.tuning.kmPerSec));
}

/** Utilization of one direction, 0 to 1: packets served over capacity, averaged over the window (R5). */
export function dirUtilization(world: World, link: Link, dir: 0 | 1): number {
  return utilization(link.dirs[dir], capacityOf(world, link), world.tuning.stepsPerSec);
}

/** The load state of a link, taken from its busier direction (R5, FR-008). */
export function loadState(world: World, link: Link): LoadState {
  if (refusedInWindow(link.dirs[0]) + refusedInWindow(link.dirs[1]) > 0) return "dropping";
  const percent = Math.max(dirUtilization(world, link, 0), dirUtilization(world, link, 1)) * 100;
  if (percent >= world.tuning.congestedPct) return "congested";
  if (percent >= world.tuning.busyPct) return "busy";
  return "nominal";
}

/** An active site with no route to any other active site is dark (R8). */
export function isDark(world: World, id: SiteId): boolean {
  const active = activeSites(world);
  if (!active.some((site) => site.id === id)) return false;
  return !active.some((other) => other.id !== id && world.routes[id]?.[other.id] !== undefined);
}

/** Packets still in the network: queued or on a wire. */
export function inFlight(world: World): number {
  let n = 0;
  for (const link of world.links) for (const dir of link.dirs) n += dir.queue.length + dir.wire.length;
  return n;
}

export function formatTime(steps: number, stepsPerSec: number): string {
  const seconds = Math.floor(steps / stepsPerSec);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Score is the number of packets delivered; time survived is recorded beside it (R12). */
export function scoreOf(world: World): { score: number; steps: number; time: string } {
  return { score: world.delivered, steps: world.step, time: formatTime(world.step, world.tuning.stepsPerSec) };
}

// --- routes, drops, packets -------------------------------------------------------------

function recompute(world: World): void {
  world.routes = computeRoutes(
    presentSites(world).map((site) => site.id),
    world.links.filter((link) => link.up),
    world.maxPaths,
  );
  world.rotors = {};
  world.routesDirty = false;
}

function addDrops(world: World, kind: keyof DropCounts, n: number): void {
  world.dropped[kind] += n;
  world.stepDrops += n;
}

/** Empties both directions of a link and returns how many packets were on it. */
function emptyLink(link: Link): number {
  let n = 0;
  for (const dir of link.dirs) {
    n += dir.queue.length + dir.wire.length;
    dir.queue = [];
    dir.wire = [];
  }
  return n;
}

/** Handles a packet standing at router `at`: deliver it, queue it for its next hop, or drop it. */
function forward(world: World, packet: Packet, at: SiteId): "delivered" | "queued" | "dropped" {
  if (at === packet.dst) {
    world.delivered += 1;
    return "delivered";
  }
  const hop = pickNextHop(world.routes, world.rotors, at, packet.dst);
  const link = hop === null ? undefined : findLink(world, at, hop);
  if (!link || !link.up) {
    addDrops(world, "noRoute", 1);
    return "dropped";
  }
  const dir: Direction = at === link.a ? link.dirs[0] : link.dirs[1];
  if (!offer(dir, packet, world.tuning.queueLen, world.step)) {
    addDrops(world, "queue", 1);
    return "dropped";
  }
  return "queued";
}

/** Creates a packet at its source and routes it there. Used by emission, and by tests. */
export function injectPacket(world: World, src: SiteId, dst: SiteId): void {
  if (world.routesDirty) recompute(world); // R1: routes are current before a packet is forwarded
  const packet: Packet = { id: world.nextPacketId++, src, dst, born: world.step, t0: world.step, t1: world.step };
  forward(world, packet, src);
}

/** Cuts a link for `durationSteps`. Everything on it is lost (S10). Used by the schedule, and by tests. */
export function cutLink(world: World, id: LinkId, durationSteps: number): void {
  const link = linkById(world, id);
  if (!link || !link.up) return;
  link.up = false;
  link.restoreStep = world.step + durationSteps;
  addDrops(world, "cut", emptyLink(link));
  world.routesDirty = true;
}

// --- commands ---------------------------------------------------------------------------

/** Fiber a link between two sites takes, in whole km. The one rule for the budget, the bot and the screen. */
export function linkLength(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(1, Math.round(Math.hypot(a.x - b.x, a.y - b.y)));
}

/** Says whether a command would be accepted, without changing the world. */
export function validate(world: World, command: Command): Reason | null {
  if (world.over) return "run-over";
  switch (command.type) {
    case "layLink": {
      const a = siteById(world, command.a);
      const b = siteById(world, command.b);
      if (!a || !b) return "no-such-site";
      if (a.id === b.id) return "same-site";
      if (findLink(world, a.id, b.id)) return "duplicate-link";
      if (linkLength(a, b) > world.fiberKm) return "not-enough-fiber";
      return null;
    }
    case "removeLink": {
      const link = linkById(world, command.link);
      if (!link) return "no-such-link";
      if (!link.up) return "link-is-cut";
      return null;
    }
    case "setCost": {
      if (!linkById(world, command.link)) return "no-such-link";
      const ok = Number.isInteger(command.cost) && command.cost >= MIN_COST && command.cost <= MAX_COST;
      return ok ? null : "bad-cost";
    }
    case "upgrade": {
      const link = linkById(world, command.link);
      if (!link) return "no-such-link";
      if (link.tier >= world.tuning.tiers.length - 1) return "max-tier";
      if (world.upgrades < 1) return "no-upgrade";
      return null;
    }
    case "chooseReward": {
      if (!world.rewardPending) return "no-reward-pending";
      if (command.choice !== "fiber" && command.choice !== "upgrade") return "bad-choice";
      return null;
    }
  }
}

function apply(world: World, command: Command): void {
  switch (command.type) {
    case "layLink": {
      const a = siteById(world, Math.min(command.a, command.b))!;
      const b = siteById(world, Math.max(command.a, command.b))!;
      const km = linkLength(a, b);
      const windowSteps = world.tuning.utilWindowSec * world.tuning.stepsPerSec;
      world.links.push({
        id: world.nextLinkId++,
        a: a.id,
        b: b.id,
        km,
        cost: DEFAULT_LINK_COST,
        tier: 0,
        up: true,
        restoreStep: 0,
        dirs: [newDirection(windowSteps), newDirection(windowSteps)],
      });
      world.fiberKm -= km;
      world.routesDirty = true;
      return;
    }
    case "removeLink": {
      const link = linkById(world, command.link)!;
      addDrops(world, "cut", emptyLink(link));
      world.fiberKm += link.km; // returned in full; the upgrades spent on the link are forfeited (Q5)
      world.links = world.links.filter((other) => other.id !== link.id);
      world.routesDirty = true;
      return;
    }
    case "setCost": {
      const link = linkById(world, command.link)!;
      if (link.cost !== command.cost) {
        link.cost = command.cost;
        world.routesDirty = true;
      }
      return;
    }
    case "upgrade": {
      linkById(world, command.link)!.tier += 1;
      world.upgrades -= 1;
      return;
    }
    case "chooseReward": {
      if (command.choice === "fiber") world.fiberKm += world.tuning.rewardFiberKm;
      else world.upgrades += 1;
      world.rewardPending = false;
      return;
    }
  }
}

/** Applies a command if the rules accept it, and says why when they do not. Does not advance time. */
export function applyCommand(world: World, command: Command): Reason | null {
  const reason = validate(world, command);
  if (!reason) apply(world, command);
  return reason;
}

// --- the step ---------------------------------------------------------------------------

function pickDestination(world: World, from: Site, active: Site[]): SiteId {
  let total = 0;
  for (const site of active) if (site.id !== from.id) total += site.weight;
  let pick = nextInt(world.rngTraffic, total);
  for (const site of active) {
    if (site.id === from.id) continue;
    if (pick < site.weight) return site.id;
    pick -= site.weight;
  }
  throw new Error("no destination"); // unreachable: total covers every other active site
}

/** Advances the world by at most one step. See contracts/simulation.md for the order of work. */
export function step(world: World, commands: Command[]): StepEvents {
  const events: StepEvents = {
    advanced: false,
    rejected: [],
    delivered: 0,
    dropped: { queue: 0, cut: 0, noRoute: 0 },
    siteAppeared: [],
    siteActivated: [],
    linkCut: null,
    linkRestored: null,
    routesChanged: false,
    rewardOffered: false,
    over: world.over,
  };
  const deliveredBefore = world.delivered;
  const droppedBefore = { ...world.dropped };
  const finish = (): StepEvents => {
    events.delivered = world.delivered - deliveredBefore;
    events.dropped = {
      queue: world.dropped.queue - droppedBefore.queue,
      cut: world.dropped.cut - droppedBefore.cut,
      noRoute: world.dropped.noRoute - droppedBefore.noRoute,
    };
    events.over = world.over;
    return events;
  };

  // 1–2. Commands, in the order given.
  for (const command of commands) {
    const reason = applyCommand(world, command);
    if (reason) events.rejected.push({ command, reason });
  }
  // 1, 3. Time stands still once the run is over and while a reward is pending.
  if (world.over || world.rewardPending) return finish();

  // 4.
  world.step += 1;
  events.advanced = true;
  const S = world.tuning.stepsPerSec;

  // 5. Timed events.
  for (const site of world.sites) {
    if (site.appearStep === world.step) {
      events.siteAppeared.push(site.id);
      world.routesDirty = true;
    }
    if (site.activeStep === world.step) events.siteActivated.push(site.id);
  }
  for (const link of world.links) {
    if (!link.up && link.restoreStep === world.step) {
      link.up = true;
      link.restoreStep = 0;
      world.routesDirty = true;
      events.linkRestored = link.id;
    }
  }
  if (world.step === world.nextCutStep) {
    // The same three draws happen whether or not a link is up, so the schedule of later
    // cuts does not depend on what the player has built.
    const pick = nextU32(world.rngEvents);
    const length = nextRange(world.rngEvents, world.tuning.cutLenSec[0] * S, world.tuning.cutLenSec[1] * S);
    const gap = nextRange(world.rngEvents, world.tuning.cutEverySec[0] * S, world.tuning.cutEverySec[1] * S);
    const up = world.links.filter((link) => link.up);
    if (up.length > 0) {
      const target = up[Math.floor((pick / 4294967296) * up.length)]!;
      cutLink(world, target.id, length);
      events.linkCut = target.id;
    }
    world.nextCutStep = world.step + gap;
  }

  // 6. Routes are current before any packet is forwarded in this step (R1).
  if (world.routesDirty) {
    recompute(world);
    events.routesChanged = true;
  }

  // 7. Service comes before arrivals, so a packet is never served in the step it joins a queue.
  for (const link of world.links) {
    for (const dir of link.dirs) {
      beginStep(dir, world.step);
      if (link.up) serve(dir, capacityOf(world, link), S, world.step, travelSteps(world, link));
    }
  }

  // 8. Arrivals at the far router.
  for (const link of world.links) {
    for (let d = 0; d < 2; d++) {
      const dir = link.dirs[d]!;
      const far = d === 0 ? link.b : link.a;
      while (dir.wire.length > 0 && dir.wire[0]!.t1 <= world.step) forward(world, dir.wire.shift()!, far);
    }
  }

  // 9. Emission. It does not depend on the network, only on the seed and the clock (R3).
  const active = activeSites(world);
  if (active.length >= 2) {
    const perWeight = world.tuning.baseRateMilli + Math.floor((world.tuning.rateGrowthMilliPerMin * world.step) / (60 * S));
    const onePacket = 1000 * S;
    for (const site of active) {
      site.credit += site.weight * perWeight;
      while (site.credit >= onePacket) {
        site.credit -= onePacket;
        injectPacket(world, site.id, pickDestination(world, site, active));
      }
    }
  }

  // 11. The drop meter (R7, FR-010).
  if (world.stepDrops > 0) {
    world.meter = Math.min(world.tuning.meterSize, world.meter + world.stepDrops);
    world.lastDropStep = world.step;
    world.stepDrops = 0;
  } else if (world.meter > 0) {
    const since = world.step - world.lastDropStep;
    const delay = world.tuning.meterDrainDelaySec * S;
    if (since >= delay && (since - delay) % (world.tuning.meterDrainIntervalSec * S) === 0) world.meter -= 1;
  }
  if (world.meter >= world.tuning.meterSize) world.over = true;

  // 12. Rewards (R10).
  if (!world.over && world.step === world.nextRewardStep) {
    world.rewardPending = true;
    world.nextRewardStep += world.tuning.rewardEverySec * S;
    events.rewardOffered = true;
  }
  return finish();
}

// --- copying and hashing ----------------------------------------------------------------

export function cloneWorld(world: World): World {
  return JSON.parse(JSON.stringify(world)) as World;
}

/** A fingerprint of the whole world. Equal worlds give equal text (R13). */
export function hashWorld(world: World): string {
  let h1 = 0x811c9dc5 | 0;
  let h2 = 0x9e3779b9 | 0;
  const num = (n: number): void => {
    const low = n | 0;
    const high = Math.floor(n / 4294967296) | 0;
    h1 = Math.imul(h1 ^ low, 0x01000193) ^ high;
    h2 = Math.imul(h2 ^ (low + high), 0x85ebca6b);
    h2 ^= h2 >>> 13;
  };
  const text = (s: string): void => {
    num(s.length);
    for (let i = 0; i < s.length; i++) num(s.charCodeAt(i));
  };
  const flag = (b: boolean): void => num(b ? 1 : 0);
  const packets = (list: Packet[]): void => {
    num(list.length);
    for (const p of list) {
      num(p.id);
      num(p.src);
      num(p.dst);
      num(p.born);
      num(p.t0);
      num(p.t1);
    }
  };
  const numbers = (list: number[]): void => {
    num(list.length);
    for (const n of list) num(n);
  };

  text(world.seed);
  text(JSON.stringify(world.tuning));
  num(world.maxPaths);
  num(world.step);
  for (const rng of [world.rngTraffic, world.rngEvents]) numbers([rng.a, rng.b, rng.c, rng.d]);
  num(world.sites.length);
  for (const s of world.sites) {
    text(s.code);
    numbers([s.id, s.x, s.y, s.weight, s.appearStep, s.activeStep, s.credit]);
  }
  num(world.links.length);
  for (const l of world.links) {
    numbers([l.id, l.a, l.b, l.km, l.cost, l.tier, l.restoreStep]);
    flag(l.up);
    for (const dir of l.dirs) {
      num(dir.credit);
      packets(dir.queue);
      packets(dir.wire);
      numbers(dir.served);
      numbers(dir.refused);
    }
  }
  const keys = (table: Record<number, unknown>): number[] => Object.keys(table).map(Number).sort((x, y) => x - y);
  for (const router of keys(world.routes)) {
    num(router);
    for (const dst of keys(world.routes[router]!)) {
      const route = world.routes[router]![dst]!;
      num(dst);
      num(route.cost);
      numbers(route.nextHops);
    }
  }
  for (const router of keys(world.rotors)) {
    num(router);
    for (const dst of keys(world.rotors[router]!)) numbers([dst, world.rotors[router]![dst]!]);
  }
  numbers([world.nextLinkId, world.nextPacketId, world.fiberKm, world.upgrades, world.meter, world.lastDropStep]);
  numbers([world.stepDrops, world.delivered, world.dropped.queue, world.dropped.cut, world.dropped.noRoute]);
  numbers([world.nextRewardStep, world.nextCutStep]);
  flag(world.routesDirty);
  flag(world.rewardPending);
  flag(world.over);
  const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, "0");
  return hex(h1) + hex(h2);
}
