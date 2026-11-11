import { expect, test } from "@playwright/test";
import { advance, drag, lay, links, linkLoads, messages, open, playTo, site, sites, state, tap, frame } from "./helpers";

// User Story 1: shape the network and see traffic follow cost.

test("AC1: a fresh load shows the one-card briefing, then the map with the first sites", async ({ page }) => {
  await open(page);
  await expect(page.locator("#welcome")).toBeVisible();
  await expect(page.locator("#welcome-briefing")).toHaveText("Traffic takes the lowest total cost. You shape the network; you never steer packets.");
  expect((await state(page)).screen).toBe("welcome");
  await page.locator("#start").click();
  await expect(page.locator("#welcome")).toBeHidden();
  await expect(page.locator("#hud")).toBeVisible();
  const s = await state(page);
  expect(s.screen).toBe("run");
  await expect.poll(async () => (await sites(page)).length).toBe(3);
  await expect(page.locator("#hud-seed")).toHaveText(s.seed!);
});

test("AC2: dragging between two sites lays a link, spends fiber, and traffic starts flowing", async ({ page }, info) => {
  await open(page, "autostart=1&seed=stage-1");
  const before = await state(page);
  await lay(page, info, 1, 2);
  const [link] = await links(page);
  expect(link).toMatchObject({ a: 1, b: 2, cost: 10, tier: 0, look: "nominal" });
  await expect.poll(async () => (await state(page)).fiberKm).toBe(before.fiberKm - link!.km);
  await expect(page.locator("#hud-fiber")).toHaveText(`${(before.fiberKm - link!.km).toLocaleString("en-US")} km`);
  // Traffic starts when the sites' grace period ends.
  await playTo(page, info, 700, { connect: false });
  expect((await state(page)).score).toBeGreaterThan(0);
  const loads = await linkLoads(page);
  const seen = new Set<string>();
  for (let i = 0; i < 20; i++) {
    for (const pair of Object.keys((await linkLoads(page))[0]!.pairs)) seen.add(pair);
    await advance(page, 5);
  }
  expect(loads.length).toBe(1);
  expect([...seen].sort()).toEqual(["1>2", "2>1"]);
});

test("AC5: too little fiber, a self-link and a duplicate are refused in words and spend nothing", async ({ page }, info) => {
  await open(page, "autostart=1&seed=stage-1");
  await lay(page, info, 1, 2);
  const fiber = (await state(page)).fiberKm;

  // A duplicate.
  await drag(page, info, await site(page, 2), await site(page, 1));
  await expect.poll(() => messages(page)).toContain("Those two sites already have a link.");

  // A self-link: drag away from a site and back onto it.
  const one = await site(page, 1);
  const away = { x: one.x + 70, y: one.y - 60 };
  if (info.project.name === "phone") {
    await drag(page, info, one, away);
    await drag(page, info, one, { x: one.x + 9, y: one.y });
  } else {
    await page.mouse.move(one.x, one.y);
    await page.mouse.down();
    await page.mouse.move(away.x, away.y, { steps: 4 });
    await page.mouse.move(one.x, one.y, { steps: 4 });
    await page.mouse.up();
  }
  // The same refusal is reachable from the inspector: choose a site, then the same site again.
  await page.locator("#btn-inspector").click();
  const first = page.locator("#site-list button").first();
  await first.click();
  await first.click();
  await expect.poll(() => messages(page)).toContain("A link needs two different sites.");
  await page.locator("#inspector-close").click();
  expect((await links(page)).length).toBe(1);
  expect((await state(page)).fiberKm).toBe(fiber);

  // Too little fiber: keep laying links between every pair until the budget runs out.
  await playTo(page, info, 2500, { reward: "upgrade" });
  let refused = false;
  for (let round = 0; round < 40 && !refused; round++) {
    const all = await sites(page);
    const have = new Set((await links(page)).map((l) => `${l.a}-${l.b}`));
    const pair = all.flatMap((p) => all.map((q) => [p, q] as const)).find(([p, q]) => p.id < q.id && !have.has(`${p.id}-${q.id}`));
    if (!pair) break;
    const s = await state(page);
    await drag(page, info, pair[0], pair[1]);
    await frame(page);
    const after = await state(page);
    if ((await links(page)).length === have.size) {
      refused = true;
      expect(after.fiberKm).toBe(s.fiberKm);
      expect((await messages(page)).some((m) => /^Not enough fiber for that link\. It needs [\d,]+ km and you have [\d,]+ km\.$/.test(m))).toBe(true);
    }
  }
  expect(refused, "the budget ran out and a link was refused").toBe(true);
});

test("AC4: after a cost change, pulses use the new lowest-cost path", async ({ page }, info) => {
  await open(page, "autostart=1&seed=stage-1");
  await lay(page, info, 1, 2);
  await lay(page, info, 2, 3);
  await lay(page, info, 1, 3);
  await playTo(page, info, 600, { connect: false });
  const direct = (await links(page)).find((l) => l.a === 1 && l.b === 3)!;

  const pairsOn = async (rounds: number): Promise<Map<number, Set<string>>> => {
    const seen = new Map<number, Set<string>>();
    for (let i = 0; i < rounds; i++) {
      for (const l of await linkLoads(page)) {
        const set = seen.get(l.id) ?? new Set<string>();
        for (const pair of Object.keys(l.pairs)) set.add(pair);
        seen.set(l.id, set);
      }
      await advance(page, 6);
    }
    return seen;
  };

  // With every cost at 10, traffic between sites 1 and 3 takes the direct link (10 against 20).
  const before = await pairsOn(30);
  expect(before.get(direct.id)!.has("1>3") || before.get(direct.id)!.has("3>1")).toBe(true);

  // Raise the direct link to 25 through its options panel: the path through site 2 now costs less.
  await tap(page, info, direct);
  await expect(page.locator("#linkpanel")).toBeVisible();
  // Typed and entered while the game runs. The field keeps what was set, so a second Enter
  // does not put the old cost back (found in the third review).
  await page.locator("#lp-cost").fill("25");
  await page.locator("#lp-cost").press("Enter");
  await expect(page.locator("#lp-cost")).toHaveValue("25");
  await expect.poll(async () => (await links(page)).find((l) => l.id === direct.id)!.cost).toBe(25);
  await page.locator("#lp-cost").press("Enter");
  await advance(page, 2);
  expect((await links(page)).find((l) => l.id === direct.id)!.cost).toBe(25);
  await expect(page.locator("#lp-cost")).toHaveValue("25");
  await page.locator("#lp-close").click();
  await advance(page, 80); // let the packets already on the direct link arrive

  const after = await pairsOn(40);
  expect([...after.get(direct.id)!]).toEqual([]);
  const viaTwo = (await links(page)).filter((l) => l.id !== direct.id).map((l) => after.get(l.id)!);
  expect(viaTwo.every((set) => set.has("1>3") || set.has("3>1"))).toBe(true);
  expect((await state(page)).dropped.queue + (await state(page)).dropped.noRoute).toBeGreaterThanOrEqual(0);
});

test("AC24: removing an up link returns its fiber in full and counts its packets as drops", async ({ page }, info) => {
  await open(page, "autostart=1&seed=stage-1");
  await lay(page, info, 1, 2);
  await lay(page, info, 2, 3);
  await playTo(page, info, 900, { connect: false });
  await page.keyboard.press("Space"); // pause, so the packets on the link can be counted exactly
  await expect.poll(async () => (await state(page)).paused).toBe(true);
  const target = (await links(page)).find((l) => l.a === 1 && l.b === 2)!;
  const held = Object.values((await linkLoads(page)).find((l) => l.id === target.id)!.pairs).reduce((n, v) => n + v, 0);
  expect(held).toBeGreaterThan(0);
  const before = await state(page);

  await tap(page, info, target);
  await page.locator("#lp-remove").click();
  await expect(page.locator("#linkpanel")).toBeHidden();
  expect((await state(page)).pending).toBe(1);
  expect((await state(page)).plannedFiberKm).toBe(before.fiberKm + target.km);
  await expect.poll(async () => (await links(page)).find((l) => l.id === target.id)!.pending).toBe("remove");

  await page.locator("#btn-pause").click(); // resume: the removal applies in the first step
  await expect.poll(async () => (await links(page)).some((l) => l.id === target.id)).toBe(false);
  const after = await state(page);
  expect(after.fiberKm).toBe(before.fiberKm + target.km);
  expect(after.dropped.cut).toBe(before.dropped.cut + held);
});

test("AC25: a cut link cannot be removed until it is repaired", async ({ page }, info) => {
  await open(page, "autostart=1&seed=stage-1");
  await lay(page, info, 1, 2);
  await lay(page, info, 2, 3);
  await lay(page, info, 1, 3);
  let cut: Awaited<ReturnType<typeof links>>[number] | undefined;
  for (let i = 0; i < 400 && !cut; i++) {
    await playTo(page, info, (await state(page)).step + 20);
    cut = (await links(page)).find((l) => l.look === "cut");
  }
  expect(cut, "a fiber cut happened").toBeDefined();
  await page.keyboard.press("Space"); // stop the clock so the link stays cut while we try
  const before = await state(page);
  await tap(page, info, cut!);
  await expect(page.locator("#lp-state")).toContainText("Cut.");
  await page.locator("#lp-remove").click();
  await expect(page.locator("#lp-message")).toHaveText("A cut link cannot be removed until it is repaired.");
  expect((await links(page)).some((l) => l.id === cut!.id && l.pending === null)).toBe(true);
  expect((await state(page)).plannedFiberKm).toBe(before.fiberKm);
  expect((await state(page)).pending).toBe(0);
});
