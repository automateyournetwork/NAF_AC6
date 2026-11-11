import { expect, test } from "@playwright/test";
import { advance, lay, open, state, toGameOver } from "./helpers";

// User Story 5: endless mode.

test("AC21: a run starts from a typed seed or a random one, and the seed is shown", async ({ page }) => {
  await open(page);
  // A typed seed.
  await page.locator("#seed").fill("my-Seed-7");
  await page.locator("#start").click();
  await expect(page.locator("#hud-seed")).toHaveText("my-Seed-7");
  expect((await state(page)).seed).toBe("my-Seed-7");

  // A seed that is not 1 to 24 letters, digits or hyphens is refused in words.
  await open(page);
  await page.locator("#seed").fill("two words!");
  await page.locator("#start").click();
  await expect(page.locator("#seed-error")).toHaveText("A seed is 1 to 24 letters, digits or hyphens.");
  await expect(page.locator("#welcome")).toBeVisible();
  expect((await state(page)).screen).toBe("welcome");

  // An empty field gives a random seed, and it is shown so the run can be repeated.
  await page.locator("#seed").fill("");
  await page.locator("#start").click();
  await expect(page.locator("#hud")).toBeVisible();
  const first = (await state(page)).seed!;
  expect(first).toMatch(/^[A-Za-z0-9-]{1,24}$/);
  await expect(page.locator("#hud-seed")).toHaveText(first);

  // The Random seed button fills the field with a seed the player can read before starting.
  await open(page);
  await page.locator("#seed-random").click();
  const offered = await page.locator("#seed").inputValue();
  expect(offered).toMatch(/^[A-Za-z0-9-]{1,24}$/);
  await page.locator("#start").click();
  await expect(page.locator("#hud-seed")).toHaveText(offered);

  // A seed in the address is used too.
  await open(page, "seed=from-the-url");
  await expect(page.locator("#seed")).toHaveValue("from-the-url");
});

test("AC22: the same seed and the same inputs give the same final score", async ({ page }) => {
  const play = async (): Promise<{ score: number; steps: number; inputs: number; dropped: number; lapseScore: number }> => {
    await open(page, "autostart=1&seed=repeat-me&bot=1");
    await toGameOver(page);
    await expect.poll(async () => (await state(page)).lapse?.playing, { timeout: 30_000 }).toBe(false);
    const s = await state(page);
    return { score: s.score, steps: s.step, inputs: s.logLength, dropped: s.dropped.queue + s.dropped.cut + s.dropped.noRoute, lapseScore: s.lapse!.score };
  };
  const first = await play();
  const second = await play();
  expect(first.inputs).toBeGreaterThan(20);
  expect(first.score).toBeGreaterThan(1000);
  expect(second).toEqual(first);
  // The time-lapse replays the recorded inputs through the simulation and lands on the same score.
  expect(first.lapseScore).toBe(first.score);

  // A different seed is a different run.
  await open(page, "autostart=1&seed=another-seed&bot=1");
  await toGameOver(page);
  expect((await state(page)).score).not.toBe(first.score);
});

test("AC23: best scores are stored on the device and shown on the welcome screen", async ({ page }, info) => {
  await open(page);
  await expect(page.locator("#scores-note")).toHaveText("No finished runs yet.");
  await page.locator("#seed").fill("keep-score");
  await page.locator("#start").click();
  await lay(page, info, 1, 2);
  await toGameOver(page);
  const end = await state(page);
  expect(end.score).toBeGreaterThan(0);
  const seconds = Math.floor(end.step / 20);
  const line = `${end.score.toLocaleString("en-US")} delivered · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} · seed keep-score`;

  await page.locator("#over-new").click();
  await expect(page.locator("#welcome")).toBeVisible();
  await expect(page.locator("#scores li")).toHaveText([line]);
  await expect(page.locator("#seed")).toHaveValue("keep-score"); // ready to repeat the run

  // Still there after the page is loaded again.
  await open(page);
  await expect(page.locator("#scores li")).toHaveText([line]);

  // A second, shorter run goes below it: sorted by score, then by time survived.
  await page.locator("#seed").fill("second-run");
  await page.locator("#start").click();
  await toGameOver(page);
  const second = await state(page);
  expect(second.score).toBeLessThan(end.score);
  await page.locator("#over-new").click();
  await expect(page.locator("#scores li")).toHaveCount(2);
  await expect(page.locator("#scores li").first()).toHaveText(line);

  // What is stored is checked when read back: a damaged entry is dropped, good ones stay.
  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("backbone.scores.v1")!);
    stored.push({ score: 999999, steps: 1, seed: "<img src=x onerror=alert(1)>" }, { score: "many", steps: 1, seed: "x" });
    localStorage.setItem("backbone.scores.v1", JSON.stringify(stored));
  });
  await open(page);
  await expect(page.locator("#scores li")).toHaveCount(2);
  await expect(page.locator("#scores li").first()).toHaveText(line);
});

test("when the device refuses storage the game still plays and says scores are not kept", async ({ page }, info) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
  });
  await open(page);
  await expect(page.locator("#scores-note")).toHaveText("This device refused storage, so best scores are not being kept.");
  await page.locator("#seed").fill("no-storage");
  await page.locator("#start").click();
  await lay(page, info, 1, 2);
  await toGameOver(page);
  await expect(page.locator("#gameover")).toBeVisible();
  await page.locator("#over-new").click();
  await expect(page.locator("#welcome")).toBeVisible();
  await expect(page.locator("#scores li")).toHaveCount(0);
});

test("FR-028: About the model states F1–F8 and S1–S11, from the welcome screen and during a run", async ({ page }) => {
  await open(page, "seed=stage-1");
  await page.locator("#btn-about").click();
  await expect(page.locator("#about")).toBeVisible();
  await expect(page.locator("#about-faithful .tag")).toHaveText(["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8"]);
  await expect(page.locator("#about-simplified .tag")).toHaveText(["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11"]);
  await expect(page.locator("#about-faithful li").first()).toContainText("RFC 2328 §16.1");
  await expect(page.locator("#about-simplified li").nth(2)).toContainText("Convergence is instant.");
  await page.locator("#about-close").click();
  await expect(page.locator("#about")).toBeHidden();

  // During a run it is one button away, and reading it stops the clock.
  await page.locator("#start").click();
  await advance(page, 30);
  await page.locator("#btn-about-run").click();
  await expect(page.locator("#about")).toBeVisible();
  expect((await state(page)).paused).toBe(true);
  const frozen = (await state(page)).step;
  await page.waitForTimeout(300);
  expect((await state(page)).step).toBe(frozen);
  await page.keyboard.press("Escape");
  await expect(page.locator("#about")).toBeHidden();
  await expect.poll(async () => (await state(page)).paused).toBe(false);
});
