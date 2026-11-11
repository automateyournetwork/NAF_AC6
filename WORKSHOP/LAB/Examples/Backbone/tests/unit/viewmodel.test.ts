import { describe, expect, it } from "vitest";
import { projectCoast, validateRegion, validateTuning } from "../../src/content/load";
import coastJson from "../../src/content/coast-na.json";
import regionJson from "../../src/content/region-na.json";
import tuningJson from "../../src/content/tuning.json";
import { Camera, distanceToSegment } from "../../src/render/camera";
import { buildScene, type ViewState } from "../../src/render/viewmodel";
import { botCommands } from "../../src/sim/bot";
import { applyCommand, cloneWorld, createWorld, cutLink, step } from "../../src/sim/world";

const tuning = validateTuning(tuningJson);
const region = validateRegion(regionJson, tuning.maxSites);
const coast = projectCoast(coastJson, region.lon0, region.lat0);

function view(extra: Partial<ViewState> = {}): ViewState {
  const camera = new Camera();
  camera.resize(1920, 1080);
  camera.fit(-2600, -1600, 2100, 1400);
  return {
    camera,
    coast,
    alpha: 0.5,
    nowMs: 1000,
    unit: 16,
    paused: false,
    reducedMotion: false,
    projected: null,
    drag: null,
    focusSite: null,
    focusLink: null,
    linkStart: null,
    effects: [],
    ...extra,
  };
}

function playedWorld(seconds: number) {
  const world = createWorld("stage-1", region, tuning);
  while (world.step < seconds * tuning.stepsPerSec && !world.over) step(world, botCommands(world));
  return world;
}

describe("the scene shows what the simulation computed (FR-005, S8)", () => {
  const world = playedWorld(150);
  const scene = buildScene(world, view());

  it("has one pulse for every packet on a wire, and no other", () => {
    const onWires = world.links.reduce((n, l) => n + l.dirs[0].wire.length + l.dirs[1].wire.length, 0);
    expect(onWires).toBeGreaterThan(5);
    expect(scene.pulses.length).toBe(onWires);
  });

  it("draws every pulse on the segment of a link that holds a packet", () => {
    const busy = scene.links.filter((l) => {
      const link = world.links.find((w) => w.id === l.id)!;
      return link.dirs[0].wire.length + link.dirs[1].wire.length > 0;
    });
    for (const pulse of scene.pulses) {
      const nearest = Math.min(...busy.map((l) => distanceToSegment(pulse.x, pulse.y, l.ax, l.ay, l.bx, l.by)));
      expect(nearest).toBeLessThan(4);
    }
  });

  it("has one site per site on the map and one link per link, with the simulation's cost and state", () => {
    expect(scene.sites.map((s) => s.id)).toEqual(world.sites.filter((s) => s.appearStep <= world.step).map((s) => s.id));
    expect(scene.links.map((l) => l.id)).toEqual(world.links.map((l) => l.id));
    for (const item of scene.links) {
      const link = world.links.find((l) => l.id === item.id)!;
      expect(item.cost).toBe(link.cost);
      expect(item.tier).toBe(link.tier);
      expect(item.look === "cut").toBe(!link.up);
    }
  });

  it("makes a link thicker and brighter as its load rises", () => {
    const sorted = [...scene.links].filter((l) => l.look !== "cut").sort((p, q) => p.load - q.load);
    const low = sorted[0]!;
    const high = sorted.at(-1)!;
    expect(high.load).toBeGreaterThan(low.load);
    expect(high.width / high.s).toBeGreaterThan(low.width / low.s);
    expect(high.glow).toBeGreaterThan(low.glow);
  });

  it("shows a cut link as cut with no pulses on it", () => {
    const copy = cloneWorld(world);
    const target = copy.links.find((l) => l.dirs[0].wire.length + l.dirs[1].wire.length > 0)!;
    cutLink(copy, target.id, 100);
    const after = buildScene(copy, view());
    expect(after.links.find((l) => l.id === target.id)!.look).toBe("cut");
    expect(after.pulses.length).toBe(copy.links.reduce((n, l) => n + l.dirs[0].wire.length + l.dirs[1].wire.length, 0));
  });
});

describe("pending changes and reduced motion", () => {
  it("shows a queued link, a queued cost and a queued removal as pending, without touching the world", () => {
    const world = playedWorld(60);
    const before = JSON.stringify(world);
    const projected = cloneWorld(world);
    const first = world.links[0]!;
    const second = world.links[1]!;
    expect(applyCommand(projected, { type: "setCost", link: first.id, cost: 19 })).toBeNull();
    expect(applyCommand(projected, { type: "removeLink", link: second.id })).toBeNull();
    const sites = world.sites.filter((s) => s.appearStep <= world.step);
    const pair = sites.flatMap((a) => sites.map((b) => [a.id, b.id] as const)).find(([a, b]) => a < b && !world.links.some((l) => l.a === a && l.b === b))!;
    expect(applyCommand(projected, { type: "layLink", a: pair[0], b: pair[1] })).toBeNull();
    const scene = buildScene(world, view({ paused: true, projected }));
    expect(scene.links.find((l) => l.id === first.id)!.pendingCost).toBe(19);
    expect(scene.links.find((l) => l.id === first.id)!.cost).toBe(first.cost);
    expect(scene.links.find((l) => l.id === second.id)!.pending).toBe("remove");
    expect(scene.links.filter((l) => l.pending === "new").map((l) => [l.aId, l.bId])).toEqual([[pair[0], pair[1]]]);
    expect(JSON.stringify(world)).toBe(before);
  });

  it("reduced motion removes the sweep, the trails and the parallax, and keeps every item", () => {
    const world = playedWorld(150);
    const moving = buildScene(world, view());
    const still = buildScene(world, view({ reducedMotion: true }));
    expect(moving.sweep).not.toBeNull();
    expect(still.sweep).toBeNull();
    expect(still.pulses.length).toBe(moving.pulses.length);
    expect(still.links.length).toBe(moving.links.length);
    expect(still.sites.length).toBe(moving.sites.length);
    expect(still.pulses.every((p) => p.tx === p.x && p.ty === p.y)).toBe(true);
    expect(moving.pulses.some((p) => p.tx !== p.x || p.ty !== p.y)).toBe(true);
    // Without parallax the coastline sits exactly on the map plane.
    const cam = view().camera;
    const first = coast.rings[0]!;
    const onPlane = cam.toScreen(first[0]!, first[1]!);
    expect(still.land[0]![0]).toBeCloseTo(onPlane.x, 9);
    expect(moving.land[0]![0]).not.toBeCloseTo(onPlane.x, 3);
  });
});

describe("zoomed far in, a line that runs off the bottom of the view keeps its true direction (found in review)", () => {
  // A link from a site in view to a site so far south that the camera can only hold it at
  // its limit. Drawn to the held point, the part in view pointed up to 15 degrees wrong.
  const world = playedWorld(150);
  const busiest = world.links
    .filter((l) => l.up && l.dirs[0].wire.length + l.dirs[1].wire.length >= 3)
    .map((l) => ({ link: l, a: world.sites[l.a - 1]!, b: world.sites[l.b - 1]! }))
    .sort((p, q) => Math.abs(q.a.y - q.b.y) - Math.abs(p.a.y - p.b.y))[0]!;
  const north = busiest.a.y > busiest.b.y ? busiest.a : busiest.b;
  const south = north === busiest.a ? busiest.b : busiest.a;
  const v = view();
  const camera = v.camera;
  camera.resize(844, 390);
  camera.cx = north.x;
  camera.cy = north.y;
  camera.zoom = 1;
  // Put the limit half way down the link.
  camera.zoom = (camera.cy - camera.southLimit()) / (0.5 * (north.y - south.y));
  const scene = buildScene(world, v);
  const item = scene.links.find((l) => l.id === busiest.link.id)!;
  const start = camera.toScreen(north.x, north.y);
  // A second point truly on the link and north of the limit gives the true direction on screen.
  const inView = camera.toScreen(north.x + (south.x - north.x) * 0.25, north.y + (south.y - north.y) * 0.25);
  const offLine = (x: number, y: number): number => {
    const dx = inView.x - start.x;
    const dy = inView.y - start.y;
    return Math.abs((x - start.x) * dy - (y - start.y) * dx) / Math.hypot(dx, dy);
  };

  it("has a real case: the far end is beyond the limit, within the zoom the player can reach", () => {
    expect(north.y - south.y).toBeGreaterThan(300);
    expect(north.x).not.toBe(south.x);
    expect(south.y).toBeLessThan(camera.southLimit());
    expect(camera.zoom).toBeLessThanOrEqual(camera.maxZoom);
  });

  it("draws the link from the site in view along the link's true line, cut far below the view", () => {
    const [near, far] = item.aId === north.id ? [{ x: item.ax, y: item.ay }, { x: item.bx, y: item.by }] : [{ x: item.bx, y: item.by }, { x: item.ax, y: item.ay }];
    expect(near.x).toBeCloseTo(start.x, 9);
    expect(near.y).toBeCloseTo(start.y, 9);
    expect(far.y).toBeGreaterThan(camera.height * 4);
    expect(offLine(far.x, far.y)).toBeLessThan(1e-6);
    // The held point, which the link used to be drawn to, is not on that line.
    const held = camera.toScreen(south.x, south.y);
    expect(offLine(held.x, held.y)).toBeGreaterThan(50);
    // The far end's large scale does not make the part in view thick.
    expect(item.s).toBeLessThanOrEqual(1.5);
  });

  it("places each of the link's packets on that line where it is north of the limit, and below the view where it is not", () => {
    const before = world.links.slice(0, world.links.indexOf(busiest.link)).reduce((n, l) => n + (l.up ? l.dirs[0].wire.length + l.dirs[1].wire.length : 0), 0);
    const count = busiest.link.dirs[0].wire.length + busiest.link.dirs[1].wire.length;
    const pulses = scene.pulses.slice(before, before + count);
    expect(pulses).toHaveLength(count);
    const onLine = pulses.filter((pulse) => offLine(pulse.x, pulse.y) <= 2.2 * item.s + 1e-6);
    const below = pulses.filter((pulse) => pulse.y > camera.height * 4);
    expect(onLine.length).toBeGreaterThan(0);
    expect(onLine.length + below.length).toBeGreaterThanOrEqual(count);

    // And at the right place along it: the packet's own position on the map, projected.
    // Each pulse sits 2.2 scaled pixels to one side of that point, as traffic keeps to its side.
    let index = 0;
    let checked = 0;
    for (let d = 0; d < 2; d++) {
      const from = world.sites[(d === 0 ? busiest.link.a : busiest.link.b) - 1]!;
      const to = world.sites[(d === 0 ? busiest.link.b : busiest.link.a) - 1]!;
      for (const packet of busiest.link.dirs[d]!.wire) {
        const f = Math.min(1, Math.max(0, (world.step + v.alpha - packet.t0) / Math.max(1, packet.t1 - packet.t0)));
        const mapY = from.y + (to.y - from.y) * f;
        const pulse = pulses[index++]!;
        if (mapY < camera.southLimit()) continue;
        const truly = camera.toScreen(from.x + (to.x - from.x) * f, mapY);
        expect(Math.hypot(pulse.x - truly.x, pulse.y - truly.y)).toBeCloseTo(2.2 * item.s, 6);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("cuts a coastline ring at the limit too, and leaves a ring north of it point for point", () => {
    const limit = camera.southLimit();
    const ring = [north.x - 100, limit + 200, north.x + 100, limit + 200, north.x + 400, limit - 900, north.x - 300, limit - 900];
    const whole = [north.x - 100, limit + 200, north.x + 100, limit + 200, north.x + 100, limit + 50, north.x - 100, limit + 50];
    const drawn = buildScene(null, { ...v, reducedMotion: true, coast: { ...coast, rings: [ring, whole], lakes: [] } }).land;
    // Two corners north of the limit, and two crossing points in place of the two corners beyond
    // it. In order: the crossing coming back in, corner 0, corner 1, the crossing going out.
    expect(drawn[0]).toHaveLength(8);
    const corner = camera.toScreen(ring[2]!, ring[3]!);
    const crossing = { x: drawn[0]![6]!, y: drawn[0]![7]! };
    expect([drawn[0]![4], drawn[0]![5]]).toEqual([corner.x, corner.y]);
    expect(crossing.y).toBeGreaterThan(camera.height * 4);
    // The edge leaving the corner in view points along the true edge.
    const along = camera.toScreen(ring[2]! + (ring[4]! - ring[2]!) * 0.1, ring[3]! + (ring[5]! - ring[3]!) * 0.1);
    const cross = (crossing.x - corner.x) * (along.y - corner.y) - (crossing.y - corner.y) * (along.x - corner.x);
    expect(Math.abs(cross) / Math.hypot(crossing.x - corner.x, crossing.y - corner.y) / Math.hypot(along.x - corner.x, along.y - corner.y)).toBeLessThan(1e-9);
    expect(drawn[1]).toEqual(whole.reduce<number[]>((out, _, i) => (i % 2 === 0 ? [...out, camera.toScreen(whole[i]!, whole[i + 1]!).x, camera.toScreen(whole[i]!, whole[i + 1]!).y] : out), []));
  });
});
