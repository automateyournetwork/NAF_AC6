// Shared by the end-to-end tests. Everything a test does to the game goes through real
// input (mouse, touch, keys); the test hook is used to read state and to let time pass.

import { mkdirSync, writeFileSync } from "node:fs";
import { expect, type CDPSession, type Page, type TestInfo } from "@playwright/test";
import { census } from "./census";

export interface HookState {
  screen: string;
  seed: string | null;
  step: number;
  score: number;
  emitted: number;
  dropped: { queue: number; cut: number; noRoute: number };
  meter: number;
  meterSize: number;
  fiberKm: number;
  plannedFiberKm: number;
  upgrades: number;
  paused: boolean;
  pending: number;
  pendingCommands: string[];
  over: boolean;
  rewardPending: boolean;
  renderer: string;
  reducedMotion: boolean;
  speed: number;
  logLength: number;
  lapse: { step: number; total: number; playing: boolean; score: number } | null;
}

export interface HookSite {
  id: number;
  code: string;
  x: number;
  y: number;
  state: string;
}

export interface HookLink {
  id: number;
  a: number;
  b: number;
  x: number;
  y: number;
  cost: number;
  pendingCost: number | null;
  tier: number;
  look: string;
  pending: string | null;
  km: number;
  utilAB: number;
  utilBA: number;
}

interface Hook {
  state(): HookState;
  sites(): HookSite[];
  links(): HookLink[];
  linkLoads(): { id: number; a: number; b: number; pairs: Record<string, number> }[];
  routes(from: number): Record<number, { cost: number; nextHops: number[] }>;
  report(): { links: number; pulses: number; sites: number; effects: number; labels: number; icons: number };
  scene(): { sweep: boolean; pulses: number; trails: number; effects: string[]; looks: string[]; siteStates: string[]; width: number; height: number };
  advance(steps: number): void;
}

declare global {
  interface Window {
    __backbone: Hook;
  }
}

export const isPhone = (info: TestInfo): boolean => info.project.name === "phone";

/** Opens the game with the test hook and waits until it is drawing. */
export async function open(page: Page, query = ""): Promise<void> {
  await page.goto(`./?test=1${query ? `&${query}` : ""}`);
  await page.waitForFunction(() => typeof window.__backbone === "object");
  await page.waitForFunction(() => window.__backbone.scene().width > 0);
}

export const state = (page: Page): Promise<HookState> => page.evaluate(() => window.__backbone.state());
export const sites = (page: Page): Promise<HookSite[]> => page.evaluate(() => window.__backbone.sites());
export const links = (page: Page): Promise<HookLink[]> => page.evaluate(() => window.__backbone.links());
export const scene = (page: Page) => page.evaluate(() => window.__backbone.scene());
export const report = (page: Page) => page.evaluate(() => window.__backbone.report());
export const linkLoads = (page: Page) => page.evaluate(() => window.__backbone.linkLoads());
/** The scene and what the renderer drew for it, read in one go so both are the same frame. */
export const snapshot = (page: Page) => page.evaluate(() => ({ scene: window.__backbone.scene(), drawn: window.__backbone.report() }));
export const routes = (page: Page, from: number) => page.evaluate((id) => window.__backbone.routes(id), from);

/** Lets simulated time pass. One animation frame afterwards so the screen is up to date. */
export async function advance(page: Page, steps: number): Promise<void> {
  await page.evaluate((n) => window.__backbone.advance(n), steps);
  await frame(page);
}

export async function frame(page: Page): Promise<void> {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)))));
}

const sessions = new WeakMap<Page, Promise<CDPSession>>();

/** A touch gesture through the browser's own touch input, so the page sees real pointer events. */
async function touch(page: Page, type: "touchStart" | "touchMove" | "touchEnd", points: { x: number; y: number }[]): Promise<void> {
  // One session per page: a gesture's start, moves and end must travel on the same session.
  let session = sessions.get(page);
  if (!session) {
    session = page.context().newCDPSession(page);
    sessions.set(page, session);
  }
  await (await session).send("Input.dispatchTouchEvent", { type, touchPoints: points.map((p, id) => ({ x: Math.round(p.x), y: Math.round(p.y), id })) });
}

/** Drags from one point to another: with a finger on the phone project, with the mouse otherwise. */
export async function drag(page: Page, info: TestInfo, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  const steps = 6;
  const at = (i: number) => ({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps });
  if (isPhone(info)) {
    await touch(page, "touchStart", [from]);
    for (let i = 1; i <= steps; i++) await touch(page, "touchMove", [at(i)]);
    await touch(page, "touchEnd", []);
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) await page.mouse.move(at(i).x, at(i).y);
    await page.mouse.up();
  }
  await frame(page);
}

/** A tap or a click at a point. */
export async function tap(page: Page, info: TestInfo, at: { x: number; y: number }): Promise<void> {
  if (isPhone(info)) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
  await frame(page);
}

/** Two fingers moving from one pair of points to another: a pinch or a two-finger drag. */
export async function twoFingers(page: Page, from: [{ x: number; y: number }, { x: number; y: number }], to: [{ x: number; y: number }, { x: number; y: number }]): Promise<void> {
  const steps = 6;
  const mix = (p: { x: number; y: number }, q: { x: number; y: number }, i: number) => ({ x: p.x + ((q.x - p.x) * i) / steps, y: p.y + ((q.y - p.y) * i) / steps });
  await touch(page, "touchStart", [from[0], from[1]]);
  for (let i = 1; i <= steps; i++) await touch(page, "touchMove", [mix(from[0], to[0], i), mix(from[1], to[1], i)]);
  await touch(page, "touchEnd", []);
  await frame(page);
}

/** A site's place on screen. Waits for the next drawn frame if the site is not there yet. */
export async function site(page: Page, id: number): Promise<HookSite> {
  for (let i = 0; i < 20; i++) {
    const found = (await sites(page)).find((s) => s.id === id);
    if (found) return found;
    await frame(page);
  }
  throw new Error(`site ${id} is not on the map`);
}

/** Lays a link by dragging between two sites, and checks that it was accepted. */
export async function lay(page: Page, info: TestInfo, a: number, b: number): Promise<void> {
  const before = (await links(page)).length;
  await drag(page, info, await site(page, a), await site(page, b));
  await expect.poll(async () => (await links(page)).length, { message: `link ${a}–${b} laid` }).toBe(before + 1);
  // While the game runs the link is pending for at most one step. Wait until it has reached
  // the simulation, so that a caller can read the world straight afterwards.
  await expect
    .poll(async () => {
      const s = await state(page);
      return s.paused || s.rewardPending || s.pending === 0;
    })
    .toBe(true);
}

/** The newest messages on screen. */
export const messages = (page: Page): Promise<string[]> => page.locator("#messages .message").allTextContents();

/** Answers a pending reward by pressing its button. */
export async function takeReward(page: Page, choice: "fiber" | "upgrade"): Promise<void> {
  await expect(page.locator("#reward")).toBeVisible();
  await page.locator(choice === "fiber" ? "#reward-fiber" : "#reward-upgrade").click();
  await expect(page.locator("#reward")).toBeHidden();
}

/**
 * Lets time pass up to a step, in small pieces. Between pieces it does what a careful
 * player would: links any site that has no link, and takes fiber when a reward is offered.
 */
export async function playTo(page: Page, info: TestInfo, untilStep: number, options: { connect?: boolean; reward?: "fiber" | "upgrade" } = {}): Promise<void> {
  for (let guard = 0; guard < 2000; guard++) {
    const s = await state(page);
    if (s.over || s.step >= untilStep) return;
    if (s.rewardPending) {
      await takeReward(page, options.reward ?? "fiber");
      continue;
    }
    if (options.connect !== false) {
      const all = await sites(page);
      const linked = new Set((await links(page)).flatMap((l) => [l.a, l.b]));
      const lonely = all.find((x) => !linked.has(x.id));
      const anchor = all.find((x) => linked.has(x.id)) ?? all.find((x) => x.id !== lonely?.id);
      if (lonely && anchor && all.length > 1) {
        await lay(page, info, lonely.id, anchor.id);
        continue;
      }
    }
    await advance(page, Math.min(40, untilStep - s.step));
  }
  throw new Error("playTo did not finish");
}

export interface CensusResult {
  project: string;
  renderer: string;
  worst: { green: number; red: number };
  shots: { moment: string; green: number; red: number; colored: number }[];
}

/**
 * Plays a scripted run and takes the color census of a full-page screenshot at five moments
 * (FR-032b). The numbers are written to test-results/ so they can be reported as they are.
 */
export async function censusRun(page: Page, info: TestInfo, query: string): Promise<CensusResult> {
  await open(page, `autostart=1&seed=stage-1&bot=1${query ? `&${query}` : ""}`);
  const shots: CensusResult["shots"] = [];
  const take = async (moment: string): Promise<void> => {
    await frame(page);
    const c = census(await page.screenshot());
    shots.push({ moment, green: c.greenShare, red: c.redShare, colored: c.colored });
  };
  await advance(page, 1500);
  await take("early run");
  // The moment of a fiber cut: the spark and the ripple are on screen.
  await advance(page, 1480);
  for (let i = 0; i < 500 && !(await links(page)).some((l) => l.look === "cut"); i++) await advance(page, 1);
  await take("fiber cut");
  await advance(page, 3600);
  await take("congested");
  // Pause and open the inspector with their buttons, so the fourth shot is what its name says at
  // both sizes: pausing opens the inspector by itself only on a wide screen. The game refuses to
  // pause in the one frame where a reward is being offered, so the button is pressed until it has.
  await expect
    .poll(async () => {
      if (!(await state(page)).paused) await page.locator("#btn-pause").click();
      return (await state(page)).paused;
    })
    .toBe(true);
  if (await page.locator("#inspector").isHidden()) await page.locator("#btn-inspector").click();
  await expect(page.locator("#inspector")).toBeVisible();
  await take("paused with the inspector");
  // The game does not step while it is paused. Resume, or the last shot is the paused screen again.
  if (await page.locator("#inspector").isVisible()) await page.locator("#inspector-close").click();
  await expect
    .poll(async () => {
      if ((await state(page)).paused) await page.locator("#btn-pause").click();
      return (await state(page)).paused;
    })
    .toBe(false);
  await toGameOver(page);
  await expect(page.locator("#gameover")).toBeVisible();
  // The time-lapse starts by itself at game over. Wait for it to finish, so the map behind the
  // panel is the network as the run ended and not whichever replay frame the shot lands on.
  await expect.poll(async () => (await state(page)).lapse?.playing ?? false, { timeout: 60_000 }).toBe(false);
  await take("game over");
  const renderer = (await state(page)).renderer;
  const result: CensusResult = {
    project: info.project.name,
    renderer,
    worst: { green: Math.max(...shots.map((s) => s.green)), red: Math.max(...shots.map((s) => s.red)) },
    shots,
  };
  mkdirSync("test-results", { recursive: true });
  writeFileSync(`test-results/census-${info.project.name}-${renderer}.json`, JSON.stringify(result, null, 2));
  info.annotations.push({ type: "census", description: `${renderer}: worst green ${(result.worst.green * 100).toFixed(4)}%, worst red ${(result.worst.red * 100).toFixed(4)}%` });
  return result;
}

/**
 * Lets a run play out to game over, taking fiber whenever a reward is offered. The reward
 * button is pressed only while its dialog is on screen: the game may already have taken the
 * choice by the time the test looks again.
 */
export async function toGameOver(page: Page): Promise<void> {
  for (let i = 0; i < 600 && !(await state(page)).over; i++) {
    if ((await state(page)).rewardPending && (await page.locator("#reward").isVisible())) {
      await page.locator("#reward-fiber").click({ timeout: 3000 }).catch(() => undefined);
    } else {
      await advance(page, 200);
    }
  }
  expect((await state(page)).over).toBe(true);
}
