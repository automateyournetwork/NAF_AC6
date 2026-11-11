import { describe, expect, it } from "vitest";
import { Camera, HIT_RADIUS, distanceToSegment } from "../../src/render/camera";

function camera(width: number, height: number): Camera {
  const c = new Camera();
  c.resize(width, height);
  c.fit(-2400, -1500, 2000, 1300);
  return c;
}

describe("camera (FR-029: touch targets stay right on the tilted map)", () => {
  it("screen → map → screen is the identity, at phone and desktop sizes", () => {
    for (const [w, h] of [[844, 390], [1920, 1080], [390, 844]] as const) {
      const c = camera(w, h);
      for (const [x, y] of [[0, 0], [-2300, 1200], [1900, -1400], [722, 317], [-777, 82]] as const) {
        const screen = c.toScreen(x, y);
        const back = c.toMap(screen.x, screen.y);
        expect(back.x).toBeCloseTo(x, 6);
        expect(back.y).toBeCloseTo(y, 6);
      }
    }
  });

  it("fits the box inside the view with north up and the far edge drawn smaller", () => {
    const c = camera(1920, 1080);
    const north = c.toScreen(0, 1300);
    const south = c.toScreen(0, -1500);
    expect(north.y).toBeLessThan(south.y);
    expect(north.s).toBeLessThan(south.s);
    for (const [x, y] of [[-2400, -1500], [2000, 1300], [-2400, 1300], [2000, -1500]] as const) {
      const p = c.toScreen(x, y);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1920);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1080);
    }
  });

  it("fits the box into the part of the view the bars leave free", () => {
    const c = new Camera();
    c.resize(844, 390);
    c.fit(-1000, -900, 1000, 900, 44, 52);
    for (const [x, y] of [[-1000, -900], [1000, 900], [-1000, 900], [1000, -900]] as const) {
      const p = c.toScreen(x, y);
      expect(p.y).toBeGreaterThan(44);
      expect(p.y).toBeLessThan(390 - 52);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(844);
    }
    // The middle of the box sits in the middle of the free part.
    expect(c.toScreen(0, 0).y).toBeCloseTo(44 + (390 - 44 - 52) / 2, 6);
  });

  it("zooming keeps the point under the pointer where it is, and panning moves the map with the drag", () => {
    const c = camera(1920, 1080);
    const under = c.toMap(400, 300);
    c.zoomAt(1.8, 400, 300);
    const after = c.toMap(400, 300);
    expect(after.x).toBeCloseTo(under.x, 6);
    expect(after.y).toBeCloseTo(under.y, 6);
    const centre = c.toScreen(c.cx, c.cy);
    const mapPoint = { x: c.cx, y: c.cy };
    c.panBy(50, 0);
    expect(c.toScreen(mapPoint.x, mapPoint.y).x).toBeCloseTo(centre.x + 50, 6);
  });

  it("a drag keeps the grabbed map point under the pointer, anywhere on the tilted map", () => {
    const c = camera(1920, 1080);
    for (const [fromX, fromY, toX, toY] of [[200, 900, 320, 840], [1500, 150, 1300, 400], [960, 540, 500, 300]] as const) {
      const grabbed = c.toMap(fromX, fromY);
      c.pin(grabbed, toX, toY);
      const under = c.toMap(toX, toY);
      expect(under.x).toBeCloseTo(grabbed.x, 6);
      expect(under.y).toBeCloseTo(grabbed.y, 6);
    }
  });

  it("cannot be panned out of sight: the centre stays inside the fitted box, by drag, by keys and by zoom", () => {
    // Found in review: nothing limited panning, so the map could be dragged away with no way back but a new run.
    for (const [w, h] of [[844, 390], [1920, 1080]] as const) {
      const c = camera(w, h);
      const inside = (): boolean => c.cx >= -2400 && c.cx <= 2000 && c.cy >= -1500 && c.cy <= 1300;
      for (let i = 0; i < 40; i++) c.panBy(-600, 0);
      expect(c.cx).toBe(2000);
      for (let i = 0; i < 40; i++) c.panBy(0, -600);
      expect(c.cy).toBe(-1500);
      // A drag that would take the grabbed point far past the corner stops at the box.
      c.pin(c.toMap(w / 2, h / 2), -50 * w, -50 * h);
      expect(inside()).toBe(true);
      c.pin(c.toMap(w / 2, h / 2), 50 * w, 50 * h);
      expect(inside()).toBe(true);
      expect([c.cx, c.cy]).toEqual([-2400, 1300]);
      for (let i = 0; i < 30; i++) c.zoomAt(1.5, 0, 0);
      expect(inside()).toBe(true);
      // With the centre among the sites, zooming all the way out shows the whole box again.
      for (let i = 0; i < 80; i++) c.zoomAt(0.5, w / 2, h / 2);
      for (const [x, y] of [[-2400, -1500], [2000, 1300]] as const) {
        const p = c.toScreen(x, y);
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(w);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(h);
      }
      // Fitting again starts fresh, whatever the box was before.
      c.fit(5000, 5000, 6000, 6000);
      expect([c.cx, c.cy]).toEqual([5500, 5500]);
    }
  });

  it("stays inside its zoom limits", () => {
    const c = camera(844, 390);
    for (let i = 0; i < 50; i++) c.zoomAt(2, 100, 100);
    expect(c.zoom).toBe(c.maxZoom);
    for (let i = 0; i < 80; i++) c.zoomAt(0.5, 100, 100);
    expect(c.zoom).toBe(c.minZoom);
  });

  it("zoomed far in, points beyond the eye or the horizon keep a positive, finite scale", () => {
    // Found in review: at high zoom a point far south of the centre had a negative scale,
    // which mirrored its link and gave the fallback renderer a negative radius to draw.
    for (const [w, h] of [[844, 390], [1920, 1080], [390, 844]] as const) {
      const c = camera(w, h);
      c.zoom = c.maxZoom;
      for (const [x, y] of [[0, -1500], [300, -9000], [-2400, -90000], [0, 1300], [2000, 90000]] as const) {
        const p = c.toScreen(x, y);
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        expect(p.s).toBeGreaterThan(0);
        expect(p.s).toBeLessThanOrEqual(4);
      }
      // A point held at the limit is off the bottom of the view, so the hold is never seen.
      expect(c.toScreen(0, -90000).y).toBeGreaterThan(h);
      // A pointer far above or below the view still maps to a finite place.
      for (const sy of [-50 * h, 50 * h]) {
        const m = c.toMap(w / 2, sy);
        expect(Number.isFinite(m.x) && Number.isFinite(m.y)).toBe(true);
      }
    }
  });

  it("says where its southern limit is: north of it a point is drawn truly, at it the scale is 4", () => {
    const c = camera(844, 390);
    c.zoom = 1.2;
    const limit = c.southLimit();
    expect(limit).toBeLessThan(c.cy);
    expect(c.toScreen(c.cx + 300, limit).s).toBeCloseTo(4, 9);
    // Just north of the limit the projection still inverts exactly.
    const p = c.toScreen(c.cx + 300, limit + 1);
    const back = c.toMap(p.x, p.y);
    expect(back.x).toBeCloseTo(c.cx + 300, 6);
    expect(back.y).toBeCloseTo(limit + 1, 6);
    // South of it the point is held: it is drawn where the limit is, not where it is.
    expect(c.toScreen(c.cx + 300, limit - 500)).toEqual(c.toScreen(c.cx + 300, limit));
    // A layer with parallax has its own limit.
    expect(c.toScreen(0, c.southLimit(0.9), 0.9).s).toBeCloseTo(4, 9);
  });

  it("hit targets are 44 CSS pixels across", () => {
    expect(HIT_RADIUS * 2).toBeGreaterThanOrEqual(44);
    expect(distanceToSegment(5, 10, 0, 0, 10, 0)).toBeCloseTo(10, 9);
    expect(distanceToSegment(-3, 4, 0, 0, 10, 0)).toBeCloseTo(5, 9);
    expect(distanceToSegment(2, 2, 1, 1, 1, 1)).toBeCloseTo(Math.SQRT2, 9);
  });
});
