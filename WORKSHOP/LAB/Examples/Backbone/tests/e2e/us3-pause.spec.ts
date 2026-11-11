import { expect, test } from "@playwright/test";
import { advance, drag, frame, isPhone, lay, links, open, playTo, routes, site, sites, snapshot, state, takeReward, tap } from "./helpers";

// User Story 3: think without time pressure.

async function pause(page: import("@playwright/test").Page, paused: boolean): Promise<void> {
  await page.locator("#btn-pause").click();
  await expect.poll(async () => (await state(page)).paused).toBe(paused);
}

test("AC12: Space and the pause control pause and resume at any time", async ({ page }, info) => {
  await open(page, "autostart=1&seed=stage-1");
  await playTo(page, info, 60, { connect: false });
  if (!isPhone(info)) {
    await page.keyboard.press("Space");
    await expect.poll(async () => (await state(page)).paused).toBe(true);
    await expect(page.locator("#status")).toHaveText("Paused. Every tool works. Space resumes.");
    const frozen = (await state(page)).step;
    await page.waitForTimeout(400);
    expect((await state(page)).step).toBe(frozen);
    await page.keyboard.press("Space");
    await expect.poll(async () => (await state(page)).paused).toBe(false);
    await expect.poll(async () => (await state(page)).step).toBeGreaterThan(frozen);
  }
  await pause(page, true);
  await expect(page.locator("#btn-pause")).toHaveText("Resume");
  await expect(page.locator("#btn-pause")).toHaveAttribute("aria-pressed", "true");
  const frozen = (await state(page)).step;
  await page.waitForTimeout(400);
  expect((await state(page)).step).toBe(frozen);
  await pause(page, false);
  await expect(page.locator("#btn-pause")).toHaveText("Pause");
  await expect.poll(async () => (await state(page)).step).toBeGreaterThan(frozen);
});

test("AC13: while paused every link's cost, capacity, utilization and state is on the map and in the inspector's table", async ({ page }, info) => {
  await open(page, "autostart=1&seed=stage-1");
  await lay(page, info, 1, 2);
  await lay(page, info, 2, 3);
  await lay(page, info, 1, 3);
  await playTo(page, info, 900, { connect: false });
  // On the map: a cost label per link, a code per site and a NEW tag per new site, always.
  const labelsFor = (s: { looks: string[]; siteStates: string[] }): number => s.looks.length + s.siteStates.length + s.siteStates.filter((x) => x.endsWith(":new")).length;
  await frame(page);
  const running = await snapshot(page);
  expect(running.drawn.labels).toBe(labelsFor(running.scene));
  await pause(page, true);
  await frame(page);
  // While paused there is also a utilization number per link.
  const paused = await snapshot(page);
  expect(paused.drawn.labels).toBe(labelsFor(paused.scene) + paused.scene.looks.length);
  const all = await links(page);
  const shown = await sites(page);
  expect(all.length).toBe(3);

  // In the inspector: one row per link with its cost, capacity, utilization and state.
  if ((await page.locator("#inspector").isHidden())) await page.locator("#btn-inspector").click();
  const rows = page.locator("#link-rows tr");
  await expect(rows).toHaveCount(all.length);
  const code = new Map(shown.map((s) => [s.id, s.code]));
  for (const link of all) {
    const row = rows.filter({ hasText: `${code.get(link.a)}–${code.get(link.b)}` });
    await expect(row.locator("td").nth(1)).toHaveText(String(link.cost));
    await expect(row.locator("td").nth(2)).toHaveText("4/s");
    await expect(row.locator("td").nth(3)).toHaveText(`${Math.round(link.utilAB * 100)}% to ${code.get(link.b)} · ${Math.round(link.utilBA * 100)}% to ${code.get(link.a)}`);
    await expect(row.locator("td").nth(4)).toHaveText(/^up, (nominal|busy|congested|dropping packets)$/);
  }
  // And every site with its code, router ID and state.
  for (const s of shown) await expect(page.locator("#site-list")).toContainText(`${s.code} · ID ${s.id} · `);
});

test("AC14: changes made while paused are shown as pending and all apply together on resume", async ({ page }, info) => {
  await open(page, "autostart=1&seed=stage-1");
  await lay(page, info, 1, 2);
  await lay(page, info, 2, 3);
  await playTo(page, info, 600, { connect: false });
  await pause(page, true);
  if (await page.locator("#inspector").isVisible()) await page.locator("#inspector-close").click();
  const before = await state(page);
  const first = (await links(page)).find((l) => l.a === 1 && l.b === 2)!;

  // Three changes: a cost, a new link, an upgrade.
  await tap(page, info, first);
  await page.locator("#lp-cost").fill("37");
  await page.locator("#lp-set").click();
  await page.locator("#lp-upgrade").click();
  await page.locator("#lp-close").click();
  await drag(page, info, await site(page, 1), await site(page, 3));

  const paused = await state(page);
  expect(paused.pending).toBe(3);
  expect(paused.step).toBe(before.step);
  expect(paused.fiberKm).toBe(before.fiberKm); // nothing has been spent yet
  expect(paused.upgrades).toBe(before.upgrades);
  await expect(page.locator("#status")).toHaveText("Paused. 3 changes pending; they take effect together on resume.");
  await expect.poll(async () => (await links(page)).find((l) => l.id === first.id)!.pendingCost).toBe(37);
  const shown = await links(page);
  expect(shown.find((l) => l.id === first.id)!.cost).toBe(10); // the cost in force is still shown
  const pendingLink = shown.find((l) => l.pending === "new")!;
  expect([pendingLink.a, pendingLink.b]).toEqual([1, 3]);
  await expect(page.locator("#hud-fiber")).toHaveText(`${paused.plannedFiberKm.toLocaleString("en-US")} km after pending`);
  // The router table in force does not include the pending link (FR-025).
  expect((await routes(page, 1))[3]!.nextHops).toEqual([2]);

  await pause(page, false);
  await expect.poll(async () => (await state(page)).pending).toBe(0);
  await expect.poll(async () => (await links(page)).find((l) => l.id === first.id)!.cost).toBe(37);
  const after = await links(page);
  expect(after.find((l) => l.id === first.id)!.tier).toBe(1);
  expect(after.some((l) => l.a === 1 && l.b === 3 && l.pending === null)).toBe(true);
  const resumed = await state(page);
  expect(resumed.fiberKm).toBe(paused.plannedFiberKm);
  expect(resumed.upgrades).toBe(before.upgrades - 1);
  // All three reached the simulation in one step: the log holds them against the same step.
  expect(resumed.logLength).toBe(before.logLength + 3);
  expect((await routes(page, 1))[3]!.nextHops).toEqual([3]);
});

test("AC26: selecting a site in the inspector shows that router's table in force", async ({ page }, info) => {
  await open(page, "autostart=1&seed=stage-1");
  await lay(page, info, 1, 2);
  await lay(page, info, 2, 3);
  await lay(page, info, 1, 3);
  await playTo(page, info, 500, { connect: false });
  await pause(page, true);
  if (await page.locator("#inspector").isHidden()) await page.locator("#btn-inspector").click();
  const shown = await sites(page);
  const code = new Map(shown.map((s) => [s.id, s.code]));

  const table = async (): Promise<string[][]> => {
    const rows = await page.locator("#route-rows tr").all();
    return Promise.all(rows.map((r) => r.locator("td").allTextContents()));
  };
  const expected = async (from: number): Promise<string[][]> => {
    const r = await routes(page, from);
    return shown.filter((s) => s.id !== from).map((s) => [`${s.code} (ID ${s.id})`, r[s.id] ? String(r[s.id]!.cost) : "–", r[s.id] ? r[s.id]!.nextHops.map((h) => code.get(h)).join(", ") : "no route"]);
  };

  await page.locator("#site-list button").first().click();
  await expect(page.locator("#route-title")).toHaveText(`Router table of ${code.get(1)} (ID 1)`);
  await expect.poll(table).toEqual(await expected(1));
  expect(await table()).toEqual([
    [`${code.get(2)} (ID 2)`, "10", code.get(2)!],
    [`${code.get(3)} (ID 3)`, "10", code.get(3)!],
  ]);
  await page.keyboard.press("Escape"); // the site stays selected; the link in progress is dropped

  // A pending change is not in the table: raise 1–3 to 50 and the table still says 10 through site 3.
  const direct = (await links(page)).find((l) => l.a === 1 && l.b === 3)!;
  await page.locator("#link-rows button").filter({ hasText: `${code.get(1)}–${code.get(3)}` }).click();
  await page.locator("#lp-cost").fill("50");
  await page.locator("#lp-set").click();
  await page.locator("#lp-close").click();
  await expect(page.locator("#route-note")).toHaveText("The table in force. Pending changes are not included until play resumes.");
  expect(await table()).toEqual(await expected(1));
  expect((await table())[1]).toEqual([`${code.get(3)} (ID 3)`, "10", code.get(3)!]);

  await pause(page, false);
  await expect.poll(async () => (await links(page)).find((l) => l.id === direct.id)!.cost).toBe(50);
  await expect.poll(async () => (await table())[1]).toEqual([`${code.get(3)} (ID 3)`, "20", code.get(2)!]);
});

test("C3: a full run can be played with every decision made while the clock is stopped", async ({ page }, info) => {
  await open(page, "autostart=1&seed=stage-1");
  let decisions = 0;
  for (let round = 0; round < 400; round++) {
    const s = await state(page);
    if (s.over) break;
    if (s.rewardPending) {
      await takeReward(page, "fiber"); // the reward dialog stops the clock by itself
      decisions++;
      continue;
    }
    // Stop the clock, look, decide, resume.
    await pause(page, true);
    if (await page.locator("#inspector").isVisible()) await page.locator("#inspector-close").click();
    const stoppedAt = (await state(page)).step;
    const all = await sites(page);
    const linked = new Set((await links(page)).filter((l) => l.pending !== "remove").flatMap((l) => [l.a, l.b]));
    for (const lonely of all.filter((x) => !linked.has(x.id))) {
      const anchor = all.find((x) => linked.has(x.id)) ?? all.find((x) => x.id !== lonely.id)!;
      await drag(page, info, lonely, anchor);
      linked.add(lonely.id);
      linked.add(anchor.id);
      decisions++;
    }
    expect((await state(page)).step).toBe(stoppedAt); // no time passed while deciding
    await pause(page, false);
    await advance(page, 200);
  }
  const end = await state(page);
  expect(end.over).toBe(true);
  expect(decisions).toBeGreaterThan(8);
  expect(end.score).toBeGreaterThan(500);
  await expect(page.locator("#gameover")).toBeVisible();
});

test("FR-024: the game pauses itself when its page is hidden", async ({ page }, info) => {
  await open(page, "autostart=1&seed=stage-1");
  await playTo(page, info, 60, { connect: false });
  expect((await state(page)).paused).toBe(false);
  // The browser reports the page as hidden: another tab, or a locked phone.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(async () => (await state(page)).paused).toBe(true);
  const frozen = (await state(page)).step;
  await page.waitForTimeout(400);
  expect((await state(page)).step).toBe(frozen);
  await expect(page.locator("#messages")).toContainText("Paused while the page was hidden.");
  await expect(page.locator("#btn-pause")).toHaveText("Resume");
});

test("AC14: a pending link's options stay open across resume and show the link once it is laid", async ({ page }, info) => {
  // Found in code review: between resume and the step that applies the pending changes, a
  // pending link was in neither the world nor the plan, so its options closed by themselves.
  await open(page, "autostart=1&seed=stage-1");
  await lay(page, info, 1, 2);
  await playTo(page, info, 60, { connect: false });
  await pause(page, true);
  if (await page.locator("#inspector").isVisible()) await page.locator("#inspector-close").click();
  await drag(page, info, await site(page, 2), await site(page, 3));
  await expect.poll(async () => (await links(page)).filter((l) => l.pending === "new").length).toBe(1);
  const pendingLink = (await links(page)).find((l) => l.pending === "new")!;

  await tap(page, info, pendingLink);
  await expect(page.locator("#linkpanel")).toBeVisible();
  await expect(page.locator("#lp-state")).toHaveText("Pending: this link is laid when play resumes.");
  const title = await page.locator("#lp-title").textContent();

  // Resume by key, so that nothing else is touched.
  await page.locator("#btn-pause").press("Enter");
  await expect.poll(async () => (await state(page)).paused).toBe(false);
  await expect.poll(async () => (await state(page)).pending).toBe(0);
  await expect(page.locator("#linkpanel")).toBeVisible();
  await expect(page.locator("#lp-title")).toHaveText(title!);
  await expect(page.locator("#lp-state")).toContainText("Up, ");
  const laid = (await links(page)).find((l) => l.id === pendingLink.id)!;
  expect(laid.pending).toBeNull();
});
