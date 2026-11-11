import { expect, test, type Page } from "@playwright/test";
import { advance, censusRun, frame, open, report, scene, state } from "./helpers";

// AC20 and FR-035: without WebGL the game plays in the fallback renderer with the same
// information. FR-032(b): the color census in each renderer.

/** Makes WebGL unavailable, as on a device or browser that does not have it. */
async function withoutWebGl(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type === "webgl2" || type === "webgl" || type === "experimental-webgl") return null;
      return (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
}

/**
 * Brings the run to an exact step and pauses it there, so two pages can be compared like for
 * like. Both happen in one call into the page, so no frame can add a step in between. Time
 * does not move while paused, by the test hook either, so the pause comes last.
 */
async function freezeAt(page: Page, step: number): Promise<void> {
  await page.evaluate((target) => {
    window.__backbone.advance(target - window.__backbone.state().step);
    document.getElementById("btn-pause")!.click();
  }, step);
  await expect.poll(async () => (await state(page)).paused).toBe(true);
  if (await page.locator("#inspector").isVisible()) await page.locator("#inspector-close").click();
  await frame(page);
  expect((await state(page)).step).toBe(step);
}

test("the browser's WebGL2 renderer is used when it is available", async ({ page }) => {
  await open(page, "autostart=1&seed=stage-1&bot=1");
  expect((await state(page)).renderer).toBe("gl");
});

test("AC20: with WebGL unavailable the game falls back by itself and plays to game over", async ({ page }) => {
  await withoutWebGl(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page, "autostart=1&seed=stage-1&bot=1");
  expect((await state(page)).renderer).toBe("2d");
  await advance(page, 3000);
  expect((await state(page)).score).toBeGreaterThan(500);
  expect((await report(page)).links).toBeGreaterThan(5);
  for (let i = 0; i < 200 && !(await state(page)).over; i++) await advance(page, 200);
  expect((await state(page)).over).toBe(true);
  await expect(page.locator("#gameover")).toBeVisible();
  expect(errors).toEqual([]);
});

test("AC20: both renderers show the same information for the same step of the same run", async ({ page }) => {
  const look = async (query: string): Promise<{ renderer: string; scene: Awaited<ReturnType<typeof scene>>; drawn: Awaited<ReturnType<typeof report>> }> => {
    await open(page, `autostart=1&seed=stage-1&bot=1&motion=reduced${query}`);
    await freezeAt(page, 6600);
    return { renderer: (await state(page)).renderer, scene: await scene(page), drawn: await report(page) };
  };
  const gl = await look("");
  const flat = await look("&renderer=2d");
  expect(gl.renderer).toBe("gl");
  expect(flat.renderer).toBe("2d");
  // The same links in the same states with the same costs and tiers, the same sites, the same pulses.
  expect(flat.scene.looks).toEqual(gl.scene.looks);
  expect(flat.scene.siteStates).toEqual(gl.scene.siteStates);
  expect(flat.scene.pulses).toBe(gl.scene.pulses);
  expect(gl.scene.looks.length).toBeGreaterThan(10);
  expect(gl.scene.pulses).toBeGreaterThan(20);
  expect(gl.scene.looks.some((l) => /:(congested|dropping):/.test(l))).toBe(true);
  // And each renderer reports drawing all of it: every link, pulse and site, every label and icon.
  expect(flat.drawn).toEqual(gl.drawn);
  expect(gl.drawn.links).toBe(gl.scene.looks.length);
  expect(gl.drawn.pulses).toBe(gl.scene.pulses);
  expect(gl.drawn.sites).toBe(gl.scene.siteStates.length);
  expect(gl.drawn.icons).toBeGreaterThanOrEqual(1);
});

test("FR-035: a WebGL context lost in the middle of a run is survived in the fallback renderer", async ({ page }) => {
  await open(page, "autostart=1&seed=stage-1&bot=1");
  await advance(page, 1200);
  expect((await state(page)).renderer).toBe("gl");
  await page.evaluate(() => {
    const canvas = document.getElementById("map") as HTMLCanvasElement;
    canvas.getContext("webgl2")!.getExtension("WEBGL_lose_context")!.loseContext();
  });
  await expect.poll(async () => (await state(page)).renderer).toBe("2d");
  const before = await state(page);
  await advance(page, 400);
  await frame(page);
  const after = await state(page);
  expect(after.step).toBeGreaterThanOrEqual(before.step + 400);
  expect(after.score).toBeGreaterThan(before.score);
  expect((await report(page)).links).toBeGreaterThan(2);
  expect((await report(page)).sites).toBeGreaterThan(2);
});

test("FR-032(b): the color census in the fallback renderer, reported as numbers", async ({ page }, info) => {
  const result = await censusRun(page, info, "renderer=2d");
  expect(result.renderer).toBe("2d");
  for (const shot of result.shots) expect(shot.colored, shot.moment).toBeGreaterThan(1000);
  expect(result.worst.green).toBeLessThanOrEqual(0.01);
  expect(result.worst.red).toBeLessThanOrEqual(0.01);
});

test("frame work at a congested moment, recorded for each renderer", async ({ page }, info) => {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const results: Record<string, { frames: number; mean: number; p95: number; worst: number; gapMean: number; gapP95: number; pulses: number; links: number }> = {};
  for (const [name, query] of [["gl", ""], ["2d", "&renderer=2d"]] as const) {
    await open(page, `autostart=1&seed=stage-1&bot=1${query}`);
    await advance(page, 6600);
    await page.waitForTimeout(4500); // real frames, at real speed
    const work = await page.evaluate(() =>
      (window.__backbone as unknown as { frameWork(): { frames: number; mean: number; p95: number; worst: number; gapMean: number; gapP95: number } }).frameWork(),
    );
    const drawn = await report(page);
    expect((await state(page)).renderer).toBe(name);
    expect(work.frames).toBeGreaterThan(100);
    results[name] = { ...work, pulses: drawn.pulses, links: drawn.links };
  }
  mkdirSync("test-results", { recursive: true });
  writeFileSync(`test-results/frame-work-${info.project.name}.json`, JSON.stringify(results, null, 2));
  // A frame at 60 per second has 16.7 ms. This is headless Chromium on the build machine, not a phone.
  expect(results.gl!.mean).toBeLessThan(16.7);
  expect(results["2d"]!.mean).toBeLessThan(16.7);
});
