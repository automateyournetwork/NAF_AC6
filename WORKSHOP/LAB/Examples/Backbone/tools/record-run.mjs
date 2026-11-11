// Records the seeded-run videos (SC-005, C7 evidence): the scripted player on a fixed seed,
// from start to game over and through the time-lapse, at phone and desktop sizes.
//
//   npm run build && npm run record [seed]
//
// Writes docs/verification/run-<seed>-844x390.mp4 and run-<seed>-1920x1080.mp4, and prints
// the final numbers of each run. The simulation runs at 4 times real speed; the speed is a
// multiple of the same fixed step, so the run is the same run as at real speed.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { serveDist } from "./serve-dist.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const seed = /^[A-Za-z0-9-]{1,24}$/.test(process.argv[2] ?? "") ? process.argv[2] : "stage-1";
const SPEED = 4;
const SIZES = [
  { name: "844x390", width: 844, height: 390, phone: true },
  { name: "1920x1080", width: 1920, height: 1080, phone: false },
];
// The server comes first: if it cannot start, nothing has been made that needs clearing away.
// Everything after it is inside the try, so the server and the folder never outlive a failure.
const server = await serveDist();
let work = null;

try {
  work = mkdtempSync(join(tmpdir(), "backbone-video-"));
  const browser = await chromium.launch();
  for (const size of SIZES) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      hasTouch: size.phone,
      isMobile: size.phone,
      recordVideo: { dir: work, size: { width: size.width, height: size.height } },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.url}?test=1&autostart=1&bot=1&speed=${SPEED}&seed=${seed}`);
    await page.waitForFunction(() => typeof window.__backbone === "object" && window.__backbone.state().over, null, { timeout: 15 * 60 * 1000, polling: 500 });
    // Stay for the time-lapse, then a moment on the finished screen.
    await page.waitForFunction(() => window.__backbone.state().lapse !== null && !window.__backbone.state().lapse.playing, null, { timeout: 60 * 1000, polling: 250 });
    await page.waitForTimeout(2500);
    const state = await page.evaluate(() => window.__backbone.state());
    const video = page.video();
    await context.close();
    const webm = await video.path();
    const out = join(root, "docs", "verification", `run-${seed}-${size.name}.mp4`);
    const encode = spawnSync(
      "ffmpeg",
      ["-loglevel", "error", "-y", "-i", webm, "-c:v", "libx264", "-preset", "slow", "-crf", "30", "-pix_fmt", "yuv420p", "-r", "25", "-movflags", "+faststart", "-an", out],
      { stdio: "inherit" },
    );
    if (encode.status !== 0) throw new Error("ffmpeg failed");
    const seconds = Math.floor(state.step / state.stepsPerSec);
    console.log(
      JSON.stringify({
        video: `docs/verification/run-${seed}-${size.name}.mp4`,
        bytes: statSync(out).size,
        seed,
        speed: SPEED,
        renderer: state.renderer,
        delivered: state.score,
        time: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
        steps: state.step,
        dropped: state.dropped,
        inputs: state.logLength,
        timeLapseScore: state.lapse.score,
        pageErrors: errors,
      }),
    );
  }
  await browser.close();
} finally {
  server.stop();
  if (work) rmSync(work, { recursive: true, force: true });
}
