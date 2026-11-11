import { expect, test } from "@playwright/test";
import { advance, frame, isPhone, lay, links, linkLoads, messages, open, playTo, report, routes, sites, snapshot, state, takeReward, tap } from "./helpers";

// User Story 2: operate under load and failure.

test("AC8: an upgrade raises capacity one tier and leaves the cost unchanged", async ({ page }, info) => {
  await open(page, "autostart=1&seed=stage-1");
  await lay(page, info, 1, 2);
  const [link] = await links(page);
  await tap(page, info, link!);
  await expect(page.locator("#linkpanel")).toBeVisible();
  await expect(page.locator("#lp-capacity")).toContainText("tier 1 of 3: 4 packets per second");
  await page.locator("#lp-upgrade").click();
  await expect.poll(async () => (await links(page))[0]!.tier).toBe(1);
  expect((await links(page))[0]!.cost).toBe(10);
  expect((await state(page)).upgrades).toBe(0);
  await expect(page.locator("#lp-capacity")).toContainText("tier 2 of 3: 8 packets per second");
  // The stock is empty now, and the game says so in words.
  await page.locator("#lp-upgrade").click();
  await expect(page.locator("#lp-message")).toHaveText("No capacity upgrade in stock. Rewards add upgrades.");
  expect((await links(page))[0]!.tier).toBe(1);
});

test("AC10: a site with no path is shown dark and its traffic is counted as no-route drops", async ({ page }, info) => {
  await open(page, "autostart=1&seed=stage-1");
  await lay(page, info, 1, 2); // site 3 is left without a link
  await playTo(page, info, 420, { connect: false });
  await expect.poll(async () => (await sites(page)).find((s) => s.id === 3)!.state).toBe("dark");
  const dark = (await sites(page)).find((s) => s.id === 3)!;
  expect((await messages(page)).some((m) => m === `${dark.code} has no path. Its traffic is being dropped.`)).toBe(true);
  expect((await sites(page)).filter((s) => s.id !== 3).map((s) => s.state)).toEqual(["active", "active"]);
  const before = await state(page);
  await advance(page, 300);
  // Stop the clock, so the numbers read from the simulation and from the screen are one moment.
  await page.locator("#btn-pause").click();
  await expect.poll(async () => (await state(page)).paused).toBe(true);
  const after = await state(page);
  expect(after.dropped.noRoute).toBeGreaterThan(before.dropped.noRoute);
  expect(after.dropped.queue + after.dropped.cut).toBe(0);
  // AC7 in miniature: every one of those drops is on the meter (none has drained yet, as drops keep coming).
  expect(after.meter).toBe(Math.min(after.meterSize, after.dropped.noRoute));
  await expect(page.locator("#hud-meter-text")).toHaveText(`${after.meter} / ${after.meterSize}`);
  // The dark site carries its slashed icon in both the drawing and the inspector's text.
  expect((await report(page)).icons).toBeGreaterThanOrEqual(1);
  if (await page.locator("#inspector").isHidden()) await page.locator("#btn-inspector").click();
  await expect(page.locator("#site-list")).toContainText(`${dark.code} · ID 3 · dark, no path`);
});

test("AC6, AC7, AC9, AC11: a scripted run shows congestion and a cut, counts every drop, and ends with score, time and time-lapse", async ({ page }) => {
  await open(page, "autostart=1&seed=stage-1&bot=1");

  // AC9: step up to the first fiber cut.
  let cutLink: Awaited<ReturnType<typeof links>>[number] | undefined;
  await advance(page, 2990);
  for (let i = 0; i < 400 && !cutLink; i++) {
    await advance(page, 1);
    cutLink = (await links(page)).find((l) => l.look === "cut");
  }
  expect(cutLink, "a fiber cut happened").toBeDefined();
  expect((await messages(page)).some((m) => /^Fiber cut: [A-Z]{3}–[A-Z]{3}\. Traffic is rerouting\.$/.test(m))).toBe(true);
  // The spark and the ripple are drawn, and the link carries its cut icon.
  const atCut = await snapshot(page);
  expect(atCut.scene.effects.sort()).toEqual(["ripple", "spark"]);
  expect(atCut.drawn.effects).toBe(2);
  expect(atCut.drawn.icons).toBeGreaterThanOrEqual(1);
  // Nothing rides the cut link, and neither end uses the other as its next hop any more.
  expect((await linkLoads(page)).find((l) => l.id === cutLink!.id)!.pairs).toEqual({});
  const viaCut = (await routes(page, cutLink!.a))[cutLink!.b];
  expect(viaCut === undefined || !viaCut.nextHops.includes(cutLink!.b)).toBe(true);

  // AC7: from here to the end, whenever packets are dropped the meter rises by exactly that many.
  let checked = 0;
  let congested: Awaited<ReturnType<typeof links>>[number] | undefined;
  let previous = await state(page);
  for (let i = 0; i < 6000 && !previous.over; i++) {
    await page.evaluate(() => window.__backbone.advance(1));
    const now = await state(page);
    const drops = (d: typeof now.dropped): number => d.queue + d.cut + d.noRoute;
    const dropped = drops(now.dropped) - drops(previous.dropped);
    if (dropped > 0) {
      expect(now.meter).toBe(Math.min(now.meterSize, previous.meter + dropped));
      checked++;
    } else {
      expect(now.meter === previous.meter || now.meter === previous.meter - 1).toBe(true);
    }
    if (!congested && i % 20 === 0) {
      await frame(page);
      if ((await links(page)).some((l) => l.look === "congested" || l.look === "dropping")) {
        // Stop the clock so that what the map shows and what the inspector says are one moment.
        await page.locator("#btn-pause").click();
        await expect.poll(async () => (await state(page)).paused).toBe(true);
        await frame(page);
        congested = (await links(page)).find((l) => l.look === "congested" || l.look === "dropping");
        if (congested) {
          // AC6: a congested link has its warning icon, and the inspector shows its utilization as a number.
          expect((await report(page)).icons).toBeGreaterThanOrEqual(1);
          if (await page.locator("#inspector").isHidden()) await page.locator("#btn-inspector").click();
          const row = page.locator("#link-rows tr").filter({ hasText: /congested|dropping packets/ }).first();
          await expect(row).toBeVisible();
          await expect(row.locator("td").nth(3)).toHaveText(/^\d+% to [A-Z]{3} · \d+% to [A-Z]{3}$/);
          await expect(row.locator("td").nth(4)).toHaveClass("is-congested");
        }
        if (await page.locator("#inspector").isVisible()) await page.locator("#inspector-close").click();
        await page.locator("#btn-pause").click();
        await expect.poll(async () => (await state(page)).paused).toBe(false);
        previous = await state(page);
        continue;
      }
    }
    previous = now;
  }
  expect(checked, "steps with drops were checked against the meter").toBeGreaterThan(20);
  expect(congested, "a link became congested").toBeDefined();

  // AC11: the run ends at a full meter with traffic delivered, time survived and the time-lapse.
  const end = await state(page);
  expect(end.over).toBe(true);
  expect(end.meter).toBe(end.meterSize);
  await expect(page.locator("#gameover")).toBeVisible();
  await expect(page.locator("#over-score")).toHaveText(end.score.toLocaleString("en-US"));
  const seconds = Math.floor(end.step / 20);
  await expect(page.locator("#over-time")).toHaveText(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`);
  await expect(page.locator("#over-seed")).toHaveText("stage-1");
  await expect(page.locator("#over-lapse")).toContainText("Time-lapse");
  // The time-lapse is the recorded run simulated again: it must arrive at the same score (R14).
  await expect.poll(async () => (await state(page)).lapse?.playing, { timeout: 30_000 }).toBe(false);
  const lapse = (await state(page)).lapse!;
  expect(lapse.step).toBe(end.step);
  expect(lapse.score).toBe(end.score);
  await expect(page.locator("#over-lapse")).toHaveText("Time-lapse finished. It is the recorded run simulated again, not a video.");
});

test("FR-016: changes made while a reward waits are shown as pending and apply with the choice", async ({ page }, info) => {
  // Found in code review: the map stays usable while the reward choice is open, and changes
  // made then were announced as done but reached the simulation only with the choice.
  await open(page, "autostart=1&seed=stage-1");
  await lay(page, info, 1, 2);
  await lay(page, info, 2, 3);
  for (let i = 0; i < 60 && !(await state(page)).rewardPending && !(await state(page)).over; i++) await advance(page, 40);
  await expect(page.locator("#reward")).toBeVisible();
  const before = await state(page);
  expect(before.rewardPending).toBe(true);

  // Open a link from the inspector and press "+" three times. At phone size the reward
  // choice lies over the link's options, so there the buttons are pressed with a key.
  const press = (selector: string): Promise<void> => (isPhone(info) ? page.locator(selector).press("Enter") : page.locator(selector).click());
  if (!(await page.locator("#inspector").isVisible())) await page.locator("#btn-inspector").click();
  await page.locator("#link-rows button").first().click();
  await expect(page.locator("#linkpanel")).toBeVisible();
  for (let n = 0; n < 3; n++) await press("#lp-plus");
  await expect(page.locator("#lp-cost")).toHaveValue("13");

  // Each press counted, nothing has reached the simulation, and the screen says so.
  const held = await state(page);
  expect(held.pending).toBe(3);
  expect(held.pendingCommands).toEqual(["setCost", "setCost", "setCost"]);
  expect(held.step).toBe(before.step);
  expect(held.rewardPending).toBe(true);
  await expect.poll(async () => (await links(page)).filter((l) => l.pendingCost === 13).length).toBe(1);
  const changed = (await links(page)).find((l) => l.pendingCost === 13)!;
  expect(changed.cost).toBe(10); // the cost in force is still shown
  await expect(page.locator("#status")).toHaveText("3 changes pending; they take effect together when you choose a reward.");
  expect((await messages(page)).at(-1)).toContain("Queued. It takes effect when play resumes.");
  await press("#lp-close");

  await takeReward(page, "fiber");
  await expect.poll(async () => (await state(page)).pending).toBe(0);
  await expect.poll(async () => (await links(page)).find((l) => l.id === changed.id)!.cost).toBe(13);
  const after = await state(page);
  expect(after.fiberKm).toBe(before.fiberKm + 3000);
  // The three changes and the choice reached the simulation together.
  expect(after.logLength).toBe(before.logLength + 4);
  expect(await messages(page)).toContain("Reward taken: 3,000 km of fiber. 3 pending changes applied together.");
  await expect(page.locator("#status")).toBeHidden();
});
