// Validates the content files and projects positions to kilometres. A file that fails
// validation stops the game with a text message; nothing is patched silently.

import type { Region, SiteDef, Tuning } from "../sim/types";

const EARTH_KM = 6371;

export interface FaithfulNote {
  id: string;
  text: string;
  source: string;
}

export interface SimplifiedNote {
  id: string;
  text: string;
  real: string;
}

export interface Text {
  briefing: string;
  pitch: string;
  faithful: FaithfulNote[];
  simplified: SimplifiedNote[];
  reasons: Record<string, string>;
  events: Record<string, string>;
  help: string[];
}

export type Palette = Record<string, string>;

export interface Coast {
  rings: number[][];
  lakes: number[][];
}

function fail(file: string, problem: string): never {
  throw new Error(`${file}: ${problem}`);
}

function record(file: string, raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) fail(file, "must be a record");
  return raw as Record<string, unknown>;
}

function whole(file: string, raw: Record<string, unknown>, key: string, min: number): number {
  const value = raw[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
    fail(file, `${key} must be a whole number of at least ${min}`);
  }
  return value;
}

function range(file: string, raw: Record<string, unknown>, key: string): [number, number] {
  const value = raw[key];
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 1) ||
    value[0] > value[1]
  ) {
    fail(file, `${key} must be a [low, high] pair of whole numbers`);
  }
  return [value[0], value[1]];
}

export function validateTuning(raw: unknown): Tuning {
  const file = "tuning.json";
  const r = record(file, raw);
  const tiers = r.tiers;
  if (
    !Array.isArray(tiers) ||
    tiers.length === 0 ||
    !tiers.every((n, i) => typeof n === "number" && Number.isInteger(n) && n >= 1 && (i === 0 || n > tiers[i - 1]))
  ) {
    fail(file, "tiers must be a rising list of whole numbers");
  }
  const tuning: Tuning = {
    stepsPerSec: whole(file, r, "stepsPerSec", 1),
    tiers: [...(tiers as number[])],
    queueLen: whole(file, r, "queueLen", 1),
    utilWindowSec: whole(file, r, "utilWindowSec", 1),
    busyPct: whole(file, r, "busyPct", 1),
    congestedPct: whole(file, r, "congestedPct", 1),
    meterSize: whole(file, r, "meterSize", 1),
    meterDrainDelaySec: whole(file, r, "meterDrainDelaySec", 1),
    meterDrainIntervalSec: whole(file, r, "meterDrainIntervalSec", 1),
    rewardEverySec: whole(file, r, "rewardEverySec", 1),
    rewardFiberKm: whole(file, r, "rewardFiberKm", 1),
    graceSec: whole(file, r, "graceSec", 0),
    startSites: whole(file, r, "startSites", 2),
    siteEverySec: whole(file, r, "siteEverySec", 1),
    maxSites: whole(file, r, "maxSites", 2),
    startFiberKm: whole(file, r, "startFiberKm", 0),
    startUpgrades: whole(file, r, "startUpgrades", 0),
    baseRateMilli: whole(file, r, "baseRateMilli", 0),
    rateGrowthMilliPerMin: whole(file, r, "rateGrowthMilliPerMin", 0),
    firstCutSec: whole(file, r, "firstCutSec", 1),
    cutEverySec: range(file, r, "cutEverySec"),
    cutLenSec: range(file, r, "cutLenSec"),
    kmPerSec: whole(file, r, "kmPerSec", 1),
  };
  if (tuning.busyPct >= tuning.congestedPct) fail(file, "busyPct must be below congestedPct");
  if (tuning.startSites > tuning.maxSites) fail(file, "startSites must not exceed maxSites");
  return tuning;
}

/** Equirectangular projection at the region's reference latitude, in whole kilometres. North is +y. */
export function project(lon: number, lat: number, lon0: number, lat0: number): { x: number; y: number } {
  const rad = Math.PI / 180;
  return {
    x: Math.round(EARTH_KM * Math.cos(lat0 * rad) * (lon - lon0) * rad),
    y: Math.round(EARTH_KM * (lat - lat0) * rad),
  };
}

export function validateRegion(raw: unknown, minSites: number): Region & { lon0: number; lat0: number } {
  const file = "region";
  const r = record(file, raw);
  if (typeof r.id !== "string" || !/^[a-z0-9-]+$/.test(r.id)) fail(file, "id must be lower-case letters, digits or hyphens");
  if (typeof r.name !== "string" || r.name.length === 0) fail(file, "name is missing");
  const lon0 = r.lon0;
  const lat0 = r.lat0;
  if (typeof lon0 !== "number" || lon0 < -180 || lon0 > 180) fail(file, "lon0 is out of range");
  if (typeof lat0 !== "number" || lat0 < -90 || lat0 > 90) fail(file, "lat0 is out of range");
  if (!Array.isArray(r.sites)) fail(file, "sites must be a list");
  const seen = new Set<string>();
  const sites: SiteDef[] = r.sites.map((entry: unknown, i: number) => {
    const s = record(`${file} site ${i + 1}`, entry);
    if (typeof s.code !== "string" || !/^[A-Z]{3}$/.test(s.code)) fail(file, `site ${i + 1}: code must be three upper-case letters`);
    if (seen.has(s.code)) fail(file, `site code ${s.code} is used twice`);
    seen.add(s.code);
    if (typeof s.name !== "string" || s.name.length === 0) fail(file, `${s.code}: name is missing`);
    if (typeof s.lon !== "number" || s.lon < -180 || s.lon > 180) fail(file, `${s.code}: lon is out of range`);
    if (typeof s.lat !== "number" || s.lat < -90 || s.lat > 90) fail(file, `${s.code}: lat is out of range`);
    if (s.weight !== 1 && s.weight !== 2 && s.weight !== 3) fail(file, `${s.code}: weight must be 1, 2 or 3`);
    return { code: s.code, name: s.name, weight: s.weight, ...project(s.lon, s.lat, lon0, lat0) };
  });
  if (sites.length < minSites) fail(file, `needs at least ${minSites} sites, has ${sites.length}`);
  return { id: r.id, name: r.name, lon0, lat0, sites };
}

export function validatePalette(raw: unknown): Palette {
  const file = "palette.json";
  const r = record(file, raw);
  const out: Palette = {};
  for (const [role, value] of Object.entries(r)) {
    if (typeof value !== "string" || !/^#[0-9a-f]{6}$/.test(value)) fail(file, `${role} must be a six-digit hex color`);
    out[role] = value;
  }
  return out;
}

export function validateText(raw: unknown): Text {
  const file = "text.json";
  const r = record(file, raw);
  const strings = (key: string): Record<string, string> => {
    const group = record(`${file} ${key}`, r[key]);
    for (const [k, v] of Object.entries(group)) if (typeof v !== "string" || v.length === 0) fail(file, `${key}.${k} is empty`);
    return group as Record<string, string>;
  };
  const notes = <T extends { id: string; text: string }>(key: string, prefix: string, count: number, extra: string): T[] => {
    const list = r[key];
    if (!Array.isArray(list)) fail(file, `${key} must be a list`);
    const ids = list.map((n: unknown) => {
      const note = record(`${file} ${key}`, n);
      if (typeof note.text !== "string" || note.text.length === 0) fail(file, `${String(note.id)}: text is empty`);
      if (typeof note[extra] !== "string" || (note[extra] as string).length === 0) fail(file, `${String(note.id)}: ${extra} is empty`);
      return note.id;
    });
    const wanted = Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`);
    if (JSON.stringify(ids) !== JSON.stringify(wanted)) fail(file, `${key} must hold ${wanted[0]} to ${wanted.at(-1)}, once each, in order`);
    return list as T[];
  };
  if (typeof r.briefing !== "string" || r.briefing.length === 0) fail(file, "briefing is empty");
  if (typeof r.pitch !== "string" || r.pitch.length === 0) fail(file, "pitch is empty");
  if (!Array.isArray(r.help) || !r.help.every((h) => typeof h === "string" && h.length > 0)) fail(file, "help must be a list of sentences");
  return {
    briefing: r.briefing,
    pitch: r.pitch,
    faithful: notes<FaithfulNote>("faithful", "F", 8, "source"),
    simplified: notes<SimplifiedNote>("simplified", "S", 11, "real"),
    reasons: strings("reasons"),
    events: strings("events"),
    help: r.help as string[],
  };
}

/** Projects the coastline's flat [lon, lat, lon, lat, …] rings to kilometres. */
export function projectCoast(raw: unknown, lon0: number, lat0: number): Coast {
  const r = record("coast", raw);
  const rings = (key: string): number[][] => {
    const list = r[key];
    if (!Array.isArray(list)) fail("coast", `${key} must be a list`);
    return list.map((ring: unknown) => {
      if (!Array.isArray(ring) || ring.length % 2 !== 0 || !ring.every((n) => typeof n === "number")) fail("coast", "a ring must be a flat list of lon, lat pairs");
      const out: number[] = [];
      for (let i = 0; i < ring.length; i += 2) {
        const p = project(ring[i] as number, ring[i + 1] as number, lon0, lat0);
        out.push(p.x, p.y);
      }
      return out;
    });
  };
  return { rings: rings("rings"), lakes: rings("lakes") };
}
