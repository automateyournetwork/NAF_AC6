// Makes the hero art and Arcade card image from a frame of the game's own renderer (Q7).
// No image generator is used.
//
//   npm run build && node tools/make-card.mjs [seed] [step] [settle ms] [sweep 0-1]
//
// The scripted player plays the seed to the step. `settle` lets the game run on for that
// many milliseconds before the picture, so that an effect that began at the step (the spark
// and ripple of a fiber cut) has grown. `sweep` says where across the view the scanning
// sweep should stand in the picture. The card in this repository was made with
//
//   node tools/make-card.mjs arcade 7764 450 0.93
//
// which is the moment a fiber is cut in the scripted run on seed `arcade`.
//
// Writes public/hero.webp (1600×900) and checks that it is 16:9 and under 1 MB.
// Run `npm run build` again afterwards so that dist/ carries the image.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { serveDist } from "./serve-dist.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const seed = process.argv[2] ?? "2328";
const step = Number(process.argv[3] ?? 5400);
const settle = Number(process.argv[4] ?? 0);
const sweep = process.argv[5] === undefined ? null : Number(process.argv[5]);
if (
  !/^[A-Za-z0-9-]{1,24}$/.test(seed) ||
  !Number.isInteger(step) ||
  step < 1 ||
  !Number.isInteger(settle) ||
  settle < 0 ||
  settle > 5000 ||
  (sweep !== null && !(sweep >= 0 && sweep <= 1))
) {
  console.error("usage: node tools/make-card.mjs [seed: 1 to 24 letters, digits or hyphens] [step: a whole number above 0] [settle: 0 to 5000 ms] [sweep: 0 to 1]");
  process.exit(2);
}
// The sweep crosses the view once in this many milliseconds (SWEEP_MS in src/render/viewmodel.ts).
// Only where the sweep stands in the picture depends on this copy of the number.
const SWEEP_MS = 9000;
const WIDTH = 1600;
const HEIGHT = 900;
const out = join(root, "public", "hero.webp");
// The server comes first: if it cannot start, nothing has been made that needs clearing away.
// Everything after it is inside the try, so the server and the folder never outlive a failure.
const server = await serveDist();
let work = null;

try {
  work = mkdtempSync(join(tmpdir(), "backbone-card-"));
  const png = join(work, "frame.png");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  await page.goto(`${server.url}?test=1&autostart=1&bot=1&hud=0&seed=${seed}`);
  await page.waitForFunction(() => typeof window.__backbone === "object" && window.__backbone.scene().width > 0);
  // The labels are drawn on a canvas, which uses a typeface only once it has loaded.
  await page.evaluate(() => Promise.all([document.fonts.load('500 16px "IBM Plex Mono"'), document.fonts.load('400 16px "IBM Plex Sans"')]));
  if (sweep !== null) {
    // Wait until the picture, taken `settle` ms after the step, will find the sweep where asked.
    await page.evaluate(
      ([at, period, lead]) => new Promise((resolve) => setTimeout(resolve, (((at * period - lead - performance.now()) % period) + period) % period)),
      [sweep, SWEEP_MS, settle],
    );
  }
  // Bring the run to the chosen step and let it draw. The run is not paused: a paused game
  // shows its inspector and utilization numbers, which belong to play, not to the art.
  await page.evaluate((target) => window.__backbone.advance(Math.max(0, target - window.__backbone.state().step)), step);
  if (settle > 0) await page.waitForTimeout(settle);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)))));
  const state = await page.evaluate(() => window.__backbone.state());
  const scene = await page.evaluate(() => window.__backbone.scene());
  // The picture must be of the moment asked for, in a run that is still going.
  if (state.over || state.step < step) throw new Error(`the run on seed ${seed} is at step ${state.step}${state.over ? " and over" : ""}; step ${step} was asked for`);
  await page.screenshot({ path: png });
  await browser.close();

  const header = readFileSync(png);
  const width = header.readUInt32BE(16);
  const height = header.readUInt32BE(20);
  if (width * 9 !== height * 16) throw new Error(`the frame is ${width}×${height}, not 16:9`);
  const converted = spawnSync("cwebp", ["-quiet", "-q", "84", png, "-o", out], { stdio: "inherit" });
  if (converted.status !== 0) throw new Error("cwebp failed");
  const bytes = statSync(out).size;
  if (bytes >= 1_000_000) throw new Error(`public/hero.webp is ${bytes} bytes; it must be under 1 MB`);
  console.log(
    JSON.stringify({
      out: "public/hero.webp",
      width,
      height,
      bytes,
      seed,
      step: state.step,
      renderer: state.renderer,
      score: state.score,
      paused: state.paused,
      sites: scene.siteStates.length,
      links: scene.looks.length,
      congested: scene.looks.filter((look) => /:(congested|dropping):/.test(look)).length,
      cut: scene.looks.filter((look) => /:cut:/.test(look)).length,
      effects: scene.effects,
    }),
  );
} finally {
  server.stop();
  if (work) rmSync(work, { recursive: true, force: true });
}
