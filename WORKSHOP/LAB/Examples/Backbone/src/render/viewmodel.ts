// Turns the world into a screen-space scene. Both renderers draw this one scene, so the
// fallback renderer shows the same information by construction (AC20). The scene reads the
// world and never writes to it; every pulse is one simulated packet on its own link (FR-005).

import type { Coast } from "../content/load";
import type { Link, LinkId, SiteId, World } from "../sim/types";
import { capacityOf, dirUtilization, isDark, linkLength, loadState, presentSites, type LoadState } from "../sim/world";
import type { Camera, ScreenPoint } from "./camera";

export type LinkLook = LoadState | "cut";

export interface SceneSite {
  id: SiteId;
  code: string;
  x: number;
  y: number;
  s: number;
  state: "new" | "active" | "dark";
  focused: boolean;
  /** The site a link is being started from. */
  armed: boolean;
}

export interface SceneLink {
  id: LinkId;
  aId: SiteId;
  bId: SiteId;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  s: number;
  look: LinkLook;
  /** Utilization of the busier direction, 0 to 1. */
  load: number;
  utilAB: number;
  utilBA: number;
  queueAB: number;
  queueBA: number;
  cost: number;
  /** The cost a pending change will set, or null. */
  pendingCost: number | null;
  tier: number;
  pendingTier: number | null;
  /** Width in CSS pixels: thicker with load. */
  width: number;
  /** 0 to 1: brighter with load. */
  glow: number;
  pending: "new" | "remove" | null;
  focused: boolean;
}

export interface ScenePulse {
  x: number;
  y: number;
  /** Where its trail ends. */
  tx: number;
  ty: number;
  s: number;
  hot: boolean;
}

export interface SceneEffect {
  kind: "spark" | "ripple";
  x: number;
  y: number;
  /** 0 at its start, 1 at its end. */
  age: number;
}

export interface Effect {
  kind: "spark" | "ripple";
  /** Map position in km. */
  x: number;
  y: number;
  startMs: number;
  /** The simulation step at which it began. */
  step: number;
}

export interface Scene {
  width: number;
  height: number;
  unit: number;
  paused: boolean;
  reducedMotion: boolean;
  timeMs: number;
  /** Packets a link direction can hold waiting (tuning), so a full queue can be marked. 0 with no run. */
  queueLen: number;
  /** Screen-space polylines: flat x, y lists. */
  land: number[][];
  lakes: number[][];
  grid: number[][];
  /** Horizontal position of the scanning sweep, 0 to 1 across the view, or null when motion is reduced. */
  sweep: number | null;
  links: SceneLink[];
  pulses: ScenePulse[];
  sites: SceneSite[];
  effects: SceneEffect[];
  /** A link being dragged out from a site. */
  drag: { ax: number; ay: number; bx: number; by: number; km: number; affordable: boolean } | null;
}

export interface ViewState {
  camera: Camera;
  coast: Coast;
  /** Fraction of the current step already shown, 0 to 1, for smooth pulse movement. */
  alpha: number;
  nowMs: number;
  unit: number;
  paused: boolean;
  reducedMotion: boolean;
  /** The world as it will be once pending changes apply, while there are any. */
  projected: World | null;
  drag: { from: SiteId; x: number; y: number } | null;
  focusSite: SiteId | null;
  focusLink: LinkId | null;
  linkStart: SiteId | null;
  effects: Effect[];
}

export const SPARK_MS = 700;
export const RIPPLE_MS = 1600;
/** An effect is over after this many simulation steps, however little real time has passed. */
const EFFECT_STEPS = 60;
const SWEEP_MS = 9000;
const GRID_KM = 400;
const GRID_DEPTH = 0.9;
const COAST_DEPTH = 0.985;

/** A link's scale is the mean of its ends'. An end far below the view must not make the part in view thick. */
const END_SCALE_CAP = 1.5;

/**
 * Projects closed rings of map points. A ring that crosses the camera's southern limit is
 * cut along the limit first, so that its edges in view keep their true direction; the cut
 * itself lies far below the view. A ring wholly north of the limit comes out point for point.
 */
function polylines(rings: number[][], camera: Camera, depth: number): number[][] {
  const limit = camera.southLimit(depth);
  return rings.map((ring) => {
    const out: number[] = [];
    const count = ring.length / 2;
    for (let i = 0; i < count; i++) {
      const x = ring[i * 2]!;
      const y = ring[i * 2 + 1]!;
      const before = (i + count - 1) % count;
      const px = ring[before * 2]!;
      const py = ring[before * 2 + 1]!;
      if (y >= limit !== py >= limit) {
        const crossing = camera.toScreen(px + ((x - px) * (limit - py)) / (y - py), limit, depth);
        out.push(crossing.x, crossing.y);
      }
      if (y >= limit) {
        const p = camera.toScreen(x, y, depth);
        out.push(p.x, p.y);
      }
    }
    return out;
  });
}

interface MapPoint {
  x: number;
  y: number;
}

/**
 * Projects the map segment between two points. An end beyond the camera's southern limit is
 * cut back to the limit along the segment, so that the part in view keeps its true
 * direction; the cut end is far below the view. With both ends beyond, nothing is in view
 * and the ends stay where the camera holds them.
 */
function span(camera: Camera, a: MapPoint, b: MapPoint): { a: ScreenPoint; b: ScreenPoint; cut: boolean } {
  const limit = camera.southLimit();
  const trim = (p: MapPoint, q: MapPoint): MapPoint =>
    p.y >= limit || q.y < limit ? p : { x: p.x + ((q.x - p.x) * (limit - p.y)) / (q.y - p.y), y: limit };
  const from = trim(a, b);
  const to = trim(b, a);
  return { a: camera.toScreen(from.x, from.y), b: camera.toScreen(to.x, to.y), cut: from !== a || to !== b };
}

function gridLines(camera: Camera, depth: number): number[][] {
  const lines: number[][] = [];
  const corners = [camera.toMap(0, 0), camera.toMap(camera.width, 0), camera.toMap(0, camera.height), camera.toMap(camera.width, camera.height)];
  const pad = GRID_KM * 2;
  const minX = Math.floor((Math.min(...corners.map((c) => c.x)) - pad) / GRID_KM) * GRID_KM;
  const maxX = Math.ceil((Math.max(...corners.map((c) => c.x)) + pad) / GRID_KM) * GRID_KM;
  const minY = Math.floor((Math.min(...corners.map((c) => c.y)) - pad) / GRID_KM) * GRID_KM;
  const maxY = Math.ceil((Math.max(...corners.map((c) => c.y)) + pad) / GRID_KM) * GRID_KM;
  if ((maxX - minX) / GRID_KM > 80 || (maxY - minY) / GRID_KM > 80) return lines;
  for (let x = minX; x <= maxX; x += GRID_KM) {
    const a = camera.toScreen(x, minY, depth);
    const b = camera.toScreen(x, maxY, depth);
    lines.push([a.x, a.y, b.x, b.y]);
  }
  for (let y = minY; y <= maxY; y += GRID_KM) {
    const a = camera.toScreen(minX, y, depth);
    const b = camera.toScreen(maxX, y, depth);
    lines.push([a.x, a.y, b.x, b.y]);
  }
  return lines;
}

/** Builds the scene for this frame. */
export function buildScene(world: World | null, view: ViewState): Scene {
  const { camera } = view;
  const still = view.reducedMotion;
  const scene: Scene = {
    width: camera.width,
    height: camera.height,
    unit: view.unit,
    paused: view.paused,
    reducedMotion: still,
    timeMs: view.nowMs,
    queueLen: world?.tuning.queueLen ?? 0,
    // Parallax applies to the grid, the coastline and the sweep only, and not when motion is reduced.
    land: polylines(view.coast.rings, camera, still ? 1 : COAST_DEPTH),
    lakes: polylines(view.coast.lakes, camera, still ? 1 : COAST_DEPTH),
    grid: gridLines(camera, still ? 1 : GRID_DEPTH),
    sweep: still ? null : (view.nowMs % SWEEP_MS) / SWEEP_MS,
    links: [],
    pulses: [],
    sites: [],
    effects: [],
    drag: null,
  };

  if (!world) return scene; // the map alone, behind the welcome screen

  const present = presentSites(world);
  const at = new Map<SiteId, { x: number; y: number; s: number }>();
  for (const site of present) {
    const p = camera.toScreen(site.x, site.y);
    at.set(site.id, p);
    scene.sites.push({
      id: site.id,
      code: site.code,
      x: p.x,
      y: p.y,
      s: p.s,
      state: site.activeStep > world.step ? "new" : isDark(world, site.id) ? "dark" : "active",
      focused: view.focusSite === site.id,
      armed: view.linkStart === site.id,
    });
  }

  const projected = view.projected;
  const later = (id: LinkId): Link | undefined => projected?.links.find((l) => l.id === id);
  /** Links with an end cut at the camera's limit: their pulses are placed from the map, not along the screen line. */
  const cutLinks = new Set<LinkId>();
  const sceneLink = (link: Link, pending: SceneLink["pending"]): SceneLink | null => {
    if (!at.has(link.a) || !at.has(link.b)) return null;
    const ends = span(camera, world.sites[link.a - 1]!, world.sites[link.b - 1]!);
    if (ends.cut) cutLinks.add(link.id);
    const { a, b } = ends;
    const utilAB = pending === "new" ? 0 : dirUtilization(world, link, 0);
    const utilBA = pending === "new" ? 0 : dirUtilization(world, link, 1);
    const load = Math.min(1, Math.max(utilAB, utilBA));
    const look: LinkLook = !link.up ? "cut" : pending === "new" ? "nominal" : loadState(world, link);
    const s = (Math.min(a.s, END_SCALE_CAP) + Math.min(b.s, END_SCALE_CAP)) / 2;
    const future = pending === null ? later(link.id) : undefined;
    return {
      id: link.id,
      aId: link.a,
      bId: link.b,
      ax: a.x,
      ay: a.y,
      bx: b.x,
      by: b.y,
      s,
      look,
      load,
      utilAB,
      utilBA,
      queueAB: link.dirs[0].queue.length,
      queueBA: link.dirs[1].queue.length,
      cost: link.cost,
      pendingCost: future && future.cost !== link.cost ? future.cost : null,
      tier: link.tier,
      pendingTier: future && future.tier !== link.tier ? future.tier : null,
      width: (2.6 + 5.5 * load + (look === "congested" || look === "dropping" ? 1.5 : 0)) * s,
      glow: 0.35 + 0.65 * load,
      pending,
      focused: view.focusLink === link.id,
    };
  };

  for (const link of world.links) {
    const removed = projected !== null && later(link.id) === undefined;
    const item = sceneLink(link, removed ? "remove" : null);
    if (!item) continue;
    scene.links.push(item);
    if (!link.up) continue;
    // One pulse per packet on the wire, where the simulation says it is.
    for (let d = 0; d < 2; d++) {
      const [fx, fy, tx, ty] = d === 0 ? [item.ax, item.ay, item.bx, item.by] : [item.bx, item.by, item.ax, item.ay];
      const length = Math.hypot(tx - fx, ty - fy) || 1;
      // Each direction keeps to its own side of the line, like traffic on a road.
      const nx = (-(ty - fy) / length) * 2.2 * item.s;
      const ny = ((tx - fx) / length) * 2.2 * item.s;
      const trail = still ? 0 : Math.min(26 * item.s, length * 0.25);
      // Where a link is cut at the camera's limit, the screen line is only part of the link,
      // so a packet's place is taken from the map and projected.
      const exact = cutLinks.has(link.id);
      const from = world.sites[(d === 0 ? link.a : link.b) - 1]!;
      const to = world.sites[(d === 0 ? link.b : link.a) - 1]!;
      for (const packet of link.dirs[d]!.wire) {
        const travel = Math.max(1, packet.t1 - packet.t0);
        const f = Math.min(1, Math.max(0, (world.step + view.alpha - packet.t0) / travel));
        const on = exact ? camera.toScreen(from.x + (to.x - from.x) * f, from.y + (to.y - from.y) * f) : { x: fx + (tx - fx) * f, y: fy + (ty - fy) * f };
        const x = on.x + nx;
        const y = on.y + ny;
        const back = Math.min(trail, exact ? Math.hypot(on.x - fx, on.y - fy) : length * f);
        scene.pulses.push({
          x,
          y,
          tx: x - ((tx - fx) / length) * back,
          ty: y - ((ty - fy) / length) * back,
          s: item.s,
          hot: item.look === "congested" || item.look === "dropping",
        });
      }
    }
  }
  if (projected) {
    for (const link of projected.links) {
      if (world.links.some((l) => l.id === link.id)) continue;
      const item = sceneLink(link, "new");
      if (item) scene.links.push(item);
    }
  }

  for (const effect of view.effects) {
    const duration = effect.kind === "spark" ? SPARK_MS : RIPPLE_MS;
    const age = (view.nowMs - effect.startMs) / duration;
    if (age < 0 || age >= 1 || world.step - effect.step > EFFECT_STEPS) continue;
    const p = camera.toScreen(effect.x, effect.y);
    scene.effects.push({ kind: effect.kind, x: p.x, y: p.y, age });
  }

  if (view.drag) {
    const from = world.sites[view.drag.from - 1];
    const start = at.get(view.drag.from);
    if (from && start) {
      const target = camera.toMap(view.drag.x, view.drag.y);
      const km = linkLength(from, target);
      const budget = (projected ?? world).fiberKm;
      scene.drag = { ax: start.x, ay: start.y, bx: view.drag.x, by: view.drag.y, km, affordable: km <= budget };
    }
  }
  return scene;
}

/** What a renderer reports it drew, so two renderers can be compared (AC20). */
export interface DrawReport {
  links: number;
  pulses: number;
  sites: number;
  effects: number;
  labels: number;
  icons: number;
}
