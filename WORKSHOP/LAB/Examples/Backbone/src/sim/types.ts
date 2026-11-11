// Record types of the simulation. The world is plain data: numbers, strings, arrays and
// records, so it can be copied, hashed and replayed (data-model.md).

/** A router ID: 1, 2, 3… in the order the run introduces its sites. */
export type SiteId = number;
/** 1, 2, 3… in the order links are laid; never reused. */
export type LinkId = number;

export interface SiteDef {
  code: string;
  name: string;
  /** Map position in kilometres, set by the content loader. */
  x: number;
  y: number;
  /** The site's share of traffic: 1, 2 or 3. */
  weight: number;
}

export interface Region {
  id: string;
  name: string;
  sites: SiteDef[];
}

/** Play-balance numbers. Not rules, except the three meter numbers, which the spec also states. */
export interface Tuning {
  stepsPerSec: number;
  tiers: number[];
  queueLen: number;
  utilWindowSec: number;
  busyPct: number;
  congestedPct: number;
  meterSize: number;
  meterDrainDelaySec: number;
  meterDrainIntervalSec: number;
  rewardEverySec: number;
  rewardFiberKm: number;
  graceSec: number;
  startSites: number;
  siteEverySec: number;
  maxSites: number;
  startFiberKm: number;
  startUpgrades: number;
  baseRateMilli: number;
  rateGrowthMilliPerMin: number;
  firstCutSec: number;
  cutEverySec: [number, number];
  cutLenSec: [number, number];
  kmPerSec: number;
}

export interface Packet {
  id: number;
  src: SiteId;
  dst: SiteId;
  born: number;
  /** Step at which it left a router, and step at which it reaches the next. */
  t0: number;
  t1: number;
}

export interface Direction {
  /** Packets waiting, first in first out, at most the queue length. */
  queue: Packet[];
  /** Packets travelling. */
  wire: Packet[];
  /** Service accumulator. */
  credit: number;
  /** Counts per step over the utilization window. */
  served: number[];
  refused: number[];
}

export interface Link {
  id: LinkId;
  /** a < b; at most one link per pair. */
  a: SiteId;
  b: SiteId;
  /** Straight-line length on the map, a whole number; the fiber it cost. */
  km: number;
  /** 1 to 65535. 10 when laid. */
  cost: number;
  /** Index into the capacity tiers. 0 when laid. */
  tier: number;
  /** False while cut. */
  up: boolean;
  /** Step at which a cut ends; 0 when up. */
  restoreStep: number;
  /** dirs[0] carries a→b, dirs[1] carries b→a. */
  dirs: [Direction, Direction];
}

export interface Site extends SiteDef {
  id: SiteId;
  appearStep: number;
  /** appearStep plus the grace period. Traffic starts here. */
  activeStep: number;
  /** Emission accumulator. */
  credit: number;
}

export interface Route {
  cost: number;
  /** Sorted, at most maxPaths of them. */
  nextHops: SiteId[];
}

/** routes[router][destination]. A destination that cannot be reached has no entry. */
export type Routes = Record<number, Record<number, Route>>;
export type Rotors = Record<number, Record<number, number>>;

export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

export interface DropCounts {
  queue: number;
  cut: number;
  noRoute: number;
}

export interface World {
  seed: string;
  tuning: Tuning;
  maxPaths: number;
  step: number;
  rngTraffic: RngState;
  rngEvents: RngState;
  sites: Site[];
  links: Link[];
  nextLinkId: number;
  nextPacketId: number;
  routes: Routes;
  rotors: Rotors;
  routesDirty: boolean;
  fiberKm: number;
  upgrades: number;
  meter: number;
  lastDropStep: number;
  /** Drops not yet added to the meter. */
  stepDrops: number;
  delivered: number;
  dropped: DropCounts;
  nextRewardStep: number;
  rewardPending: boolean;
  nextCutStep: number;
  over: boolean;
}

export type Command =
  | { type: "layLink"; a: SiteId; b: SiteId }
  | { type: "removeLink"; link: LinkId }
  | { type: "setCost"; link: LinkId; cost: number }
  | { type: "upgrade"; link: LinkId }
  | { type: "chooseReward"; choice: "fiber" | "upgrade" };

export type Reason =
  | "no-such-site"
  | "same-site"
  | "duplicate-link"
  | "not-enough-fiber"
  | "no-such-link"
  | "link-is-cut"
  | "bad-cost"
  | "no-upgrade"
  | "max-tier"
  | "no-reward-pending"
  | "bad-choice"
  | "run-over";

export interface StepEvents {
  advanced: boolean;
  rejected: { command: Command; reason: Reason }[];
  delivered: number;
  dropped: DropCounts;
  siteAppeared: SiteId[];
  siteActivated: SiteId[];
  linkCut: LinkId | null;
  linkRestored: LinkId | null;
  routesChanged: boolean;
  rewardOffered: boolean;
  over: boolean;
}

export interface LogEntry {
  /** The world's step count when the command was sent. */
  step: number;
  command: Command;
}
