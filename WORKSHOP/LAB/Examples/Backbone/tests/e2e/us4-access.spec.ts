import { expect, test, type Page } from "@playwright/test";
import { census } from "./census";
import { advance, censusRun, drag, frame, isPhone, lay, links, open, playTo, scene, site, sites, snapshot, state, tap, toGameOver, twoFingers } from "./helpers";

// User Story 4: play on a phone, a laptop and a stage.

const spread = async (page: Page): Promise<number> => {
  const [a, b] = await Promise.all([site(page, 1), site(page, 2)]);
  return Math.hypot(a.x - b.x, a.y - b.y);
};

test("AC15: by touch, drag lays a link, tap opens a link's options, pinch zooms and two fingers pan", async ({ page }, info) => {
  test.skip(!isPhone(info), "touch is checked at phone size");
  await open(page, "autostart=1&seed=stage-1");
  await lay(page, info, 1, 2); // a finger dragged from one site to another
  const [link] = await links(page);
  await tap(page, info, link!);
  await expect(page.locator("#linkpanel")).toBeVisible();
  await expect(page.locator("#lp-cost")).toHaveValue("10");
  await expect(page.locator("#lp-upgrade")).toBeVisible();
  expect((await state(page)).pending + (await links(page)).length).toBe(1); // the tap pressed nothing in the panel
  await page.locator("#lp-close").click();

  // Pinch out: two fingers move apart, and the sites spread out on screen.
  const before = await spread(page);
  await twoFingers(page, [{ x: 380, y: 200 }, { x: 460, y: 200 }], [{ x: 300, y: 200 }, { x: 540, y: 200 }]);
  const zoomed = await spread(page);
  expect(zoomed).toBeGreaterThan(before * 1.8);

  // Two-finger drag: the map moves with the fingers and keeps its zoom.
  const start = await site(page, 1);
  await twoFingers(page, [{ x: 380, y: 180 }, { x: 460, y: 180 }], [{ x: 320, y: 220 }, { x: 400, y: 220 }]);
  const moved = await site(page, 1);
  expect(moved.x - start.x).toBeLessThan(-40);
  expect(moved.y - start.y).toBeGreaterThan(25);
  // The zoom is kept. On the tilted map a site drawn nearer is drawn a little larger, so the
  // spread on screen moves by a few percent with the pan, not by the factor a pinch gives.
  expect(await spread(page)).toBeGreaterThan(zoomed * 0.9);
  expect(await spread(page)).toBeLessThan(zoomed * 1.1);
  expect((await links(page)).length).toBe(1); // the gesture laid no link
});

test("AC16: with a mouse and keys, drag lays a link, the wheel zooms, Space pauses and number keys select tools", async ({ page }, info) => {
  test.skip(isPhone(info), "mouse and keys are checked at desktop size");
  await open(page, "autostart=1&seed=stage-1");
  await lay(page, info, 1, 2);
  const [link] = await links(page);
  await tap(page, info, link!);
  await expect(page.locator("#linkpanel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#linkpanel")).toBeHidden();

  const before = await spread(page);
  await page.mouse.move(960, 540);
  await page.mouse.wheel(0, -400);
  await frame(page);
  expect(await spread(page)).toBeGreaterThan(before * 1.3);

  const start = await site(page, 1);
  await drag(page, info, { x: 200, y: 700 }, { x: 320, y: 640 }); // drag on empty map pans
  const moved = await site(page, 1);
  // The map moves with the drag (120 right, 60 up). A site elsewhere on the tilted map moves
  // by a similar amount, not exactly the same.
  expect(moved.x - start.x).toBeGreaterThan(90);
  expect(moved.x - start.x).toBeLessThan(150);
  expect(moved.y - start.y).toBeLessThan(-35);

  await page.keyboard.press("Space");
  await expect.poll(async () => (await state(page)).paused).toBe(true);
  await page.keyboard.press("Space");
  await expect.poll(async () => (await state(page)).paused).toBe(false);

  for (const [key, id] of [["2", "tool-2"], ["3", "tool-3"], ["4", "tool-4"], ["1", "tool-1"]] as const) {
    await page.keyboard.press(key);
    await expect(page.locator(`#${id}`)).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".tool[aria-pressed='true']")).toHaveCount(1);
  }
});

test("AC17: the game can be played by keyboard alone, with focus visible throughout", async ({ page }, info) => {
  test.skip(isPhone(info), "the keyboard is checked at desktop size");
  await open(page, "autostart=1&seed=stage-1");
  const focused = (): Promise<{ id: string; within: string; visible: boolean; text: string }> =>
    page.evaluate(() => {
      const e = document.activeElement as HTMLElement;
      const style = getComputedStyle(e);
      return {
        id: e.id,
        within: e.closest("#site-list, #link-rows, #linkpanel, #reward, #controls")?.id ?? "",
        visible: e.matches(":focus-visible") && style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2,
        text: e.textContent ?? "",
      };
    });
  const press = async (key: string): Promise<void> => {
    await page.keyboard.press(key);
    await frame(page);
  };
  const tabTo = async (within: string, id = ""): Promise<void> => {
    for (let i = 0; i < 40; i++) {
      const f = await focused();
      if (f.within === within && (id === "" || f.id === id)) return;
      await press("Tab");
    }
    throw new Error(`focus never reached ${within} ${id}`);
  };

  expect((await focused()).id).toBe("overlay");
  await press("Tab"); // a first key press, so the browser treats focus as keyboard focus
  await press("Shift+Tab");
  expect(await focused()).toMatchObject({ id: "overlay", visible: true });

  // Select a site, start a link, choose its far end.
  await press("i");
  await expect(page.locator("#inspector")).toBeVisible();
  let f = await focused();
  expect(f).toMatchObject({ within: "site-list", visible: true });
  const firstCode = f.text.slice(0, 3);
  await press("Enter");
  await expect(page.locator("#status")).toHaveText(`Link from ${firstCode}: choose the far end, or press Escape.`);
  await press("Tab");
  expect(await focused()).toMatchObject({ within: "site-list", visible: true });
  await press("Enter");
  await expect.poll(async () => (await links(page)).length).toBe(1);
  await expect(page.locator("#status")).toBeHidden();
  // A second link, from the site just reached to the third site, so that no site is left dark.
  await press("Enter");
  await press("Tab");
  await press("Enter");
  await expect.poll(async () => (await links(page)).length).toBe(2);

  // Open the link's options, change its cost, upgrade it.
  await tabTo("link-rows");
  expect((await focused()).visible).toBe(true);
  await press("Enter");
  await expect(page.locator("#linkpanel")).toBeVisible();
  expect(await focused()).toMatchObject({ id: "lp-cost", visible: true });
  await page.keyboard.type("15");
  await press("Enter");
  await expect.poll(async () => (await links(page))[0]!.cost).toBe(15);
  await tabTo("linkpanel", "lp-upgrade");
  expect((await focused()).visible).toBe(true);
  await press("Enter");
  await expect.poll(async () => (await links(page))[0]!.tier).toBe(1);
  // A tool key pressed inside the open panel re-aims it. Focus must still return to where it
  // came from, not to a control of the panel that is about to be hidden (found in review).
  await press("4");
  await expect(page.locator("#tool-4")).toHaveAttribute("aria-pressed", "true");
  expect(await focused()).toMatchObject({ id: "lp-remove", within: "linkpanel", visible: true });
  await press("Escape");
  await expect(page.locator("#linkpanel")).toBeHidden();
  expect(await focused()).toMatchObject({ within: "link-rows", visible: true }); // focus returns to where it came from
  // Opened from one row and then aimed at another link from that link's own row, the panel
  // returns focus to the second row, not to the first (found in the second review).
  await press("Enter");
  await expect(page.locator("#linkpanel")).toBeVisible();
  await page.locator("#link-rows button").nth(1).focus();
  await press("Enter");
  await expect(page.locator("#linkpanel")).toBeVisible();
  await press("Escape");
  await expect(page.locator("#linkpanel")).toBeHidden();
  expect(await page.evaluate(() => document.activeElement === document.querySelectorAll("#link-rows button")[1])).toBe(true);

  // Number keys select tools from anywhere outside a text field.
  await press("3");
  await expect(page.locator("#tool-3")).toHaveAttribute("aria-pressed", "true");

  // Pause and resume.
  await press("Escape");
  await expect(page.locator("#inspector")).toBeHidden();
  expect(await focused()).toMatchObject({ id: "btn-inspector", visible: true });
  await tabTo("controls", "btn-pause");
  expect((await focused()).visible).toBe(true);
  await press("Enter");
  await expect.poll(async () => (await state(page)).paused).toBe(true);
  await press("Enter");
  await expect.poll(async () => (await state(page)).paused).toBe(false);

  // Choose a reward.
  for (let i = 0; i < 60 && !(await state(page)).rewardPending && !(await state(page)).over; i++) await advance(page, 40);
  await expect(page.locator("#reward")).toBeVisible();
  expect(await focused()).toMatchObject({ id: "reward-fiber", within: "reward", visible: true });
  const fiber = (await state(page)).fiberKm;
  await press("Tab");
  expect(await focused()).toMatchObject({ id: "reward-upgrade", visible: true });
  await press("Shift+Tab");
  await press("Enter");
  await expect.poll(async () => (await state(page)).fiberKm).toBe(fiber + 3000);
  await expect(page.locator("#reward")).toBeHidden();
});

test("AC19: reduced motion stops sweeps, parallax and trails, and all state information remains", async ({ page }) => {
  const icons = (looks: string[], siteStates: string[]): number =>
    looks.filter((l) => /:(congested|dropping):/.test(l)).length + looks.filter((l) => /:dropping:/.test(l)).length + looks.filter((l) => /:cut:/.test(l)).length + siteStates.filter((s) => s.endsWith(":dark")).length;

  await open(page, "autostart=1&seed=stage-1&bot=1&motion=reduced");
  await advance(page, 6500);
  await frame(page);
  expect((await state(page)).reducedMotion).toBe(true);
  const { scene: still, drawn: stillReport } = await snapshot(page);
  expect(still.sweep).toBe(false);
  expect(still.trails).toBe(0);
  expect(still.pulses).toBeGreaterThan(20); // pulses are information, not decoration: they stay
  expect(stillReport.pulses).toBe(still.pulses);
  expect(stillReport.links).toBe(still.looks.length);
  expect(stillReport.sites).toBe(still.siteStates.length);
  expect(stillReport.labels).toBe(still.looks.length + still.siteStates.length + still.siteStates.filter((s) => s.endsWith(":new")).length);
  expect(stillReport.icons).toBe(icons(still.looks, still.siteStates));
  expect(still.looks.some((l) => /:(congested|dropping):/.test(l))).toBe(true);

  // With full motion the same kinds of things are drawn, plus the sweep and the trails.
  await open(page, "autostart=1&seed=stage-1&bot=1&motion=full");
  await advance(page, 6500);
  await frame(page);
  const { scene: moving, drawn: movingReport } = await snapshot(page);
  expect(moving.sweep).toBe(true);
  expect(moving.trails).toBeGreaterThan(20);
  expect(movingReport.labels).toBe(moving.looks.length + moving.siteStates.length + moving.siteStates.filter((s) => s.endsWith(":new")).length);
  expect(movingReport.icons).toBe(icons(moving.looks, moving.siteStates));

  // The device's own setting is followed when the player has not chosen.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "autostart=1&seed=stage-1");
  expect((await state(page)).reducedMotion).toBe(true);
  expect((await scene(page)).sweep).toBe(false);
});

test("AC18: the color census of rendered frames, reported as numbers", async ({ page }, info) => {
  // The check itself catches green and red, and ignores colors with no meaningful hue.
  for (const [color, band] of [["#00c853", "green"], ["#e53935", "red"], ["#050a18", "none"], ["#2d7bff", "none"], ["#ffb020", "none"], ["#ff2bd6", "none"]] as const) {
    await page.setContent(`<body style="margin:0;background:${color}"></body>`);
    const c = census(await page.screenshot());
    expect(c.greenShare, `${color} green`).toBe(band === "green" ? 1 : 0);
    expect(c.redShare, `${color} red`).toBe(band === "red" ? 1 : 0);
  }

  // The census in the renderer the browser gets by default.
  const result = await censusRun(page, info, "");
  for (const shot of result.shots) expect(shot.colored, shot.moment).toBeGreaterThan(1000);
  // The regression guard of FR-032(b). The target is zero; the numbers are reported either way.
  expect(result.worst.green).toBeLessThanOrEqual(0.01);
  expect(result.worst.red).toBeLessThanOrEqual(0.01);
});

/** Controls on screen that have no readable name. */
const unnamed = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const visible = (e: Element): boolean => (e as HTMLElement).offsetParent !== null || e.id === "overlay";
    const name = (e: Element): string => {
      const label = e.getAttribute("aria-label");
      if (label?.trim()) return label.trim();
      const by = e.getAttribute("aria-labelledby");
      if (by) return by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
      if (e.id) {
        const forLabel = document.querySelector(`label[for="${e.id}"]`);
        if (forLabel?.textContent?.trim()) return forLabel.textContent.trim();
      }
      return (e.textContent ?? "").trim();
    };
    // Controls, and the regions a control lives in. Live regions for messages are not controls.
    return [...document.querySelectorAll("button, input, select, textarea, a[href], [tabindex], [role='application'], [role='meter'], [role='dialog'], [role='group']")]
      .filter(visible)
      .filter((e) => name(e) === "")
      .map((e) => `${e.tagName.toLowerCase()}#${e.id}`);
  });

/** The smallest text on screen, in CSS pixels. */
const smallestText = (page: Page): Promise<{ size: number; where: string }> =>
  page.evaluate(() => {
    let smallest = { size: Infinity, where: "" };
    for (const e of document.querySelectorAll<HTMLElement>("body *")) {
      if (e.offsetParent === null) continue;
      const own = [...e.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "");
      if (!own) continue;
      const size = parseFloat(getComputedStyle(e).fontSize);
      if (size < smallest.size) smallest = { size, where: `${e.tagName.toLowerCase()}#${e.id} "${(e.textContent ?? "").trim().slice(0, 30)}"` };
    }
    return smallest;
  });

test("FR-029, FR-037: every control has a readable name and no text is too small, on every screen", async ({ page }, info) => {
  const minimum = isPhone(info) ? 11 : 16;
  const check = async (where: string): Promise<void> => {
    expect(await unnamed(page), `unnamed controls on ${where}`).toEqual([]);
    const text = await smallestText(page);
    expect(text.size, `smallest text on ${where}: ${text.where}`).toBeGreaterThanOrEqual(minimum);
  };
  await open(page, "seed=stage-1");
  await check("welcome");
  await page.locator("#btn-about").click();
  await expect(page.locator("#about-faithful li")).toHaveCount(8);
  await expect(page.locator("#about-simplified li")).toHaveCount(11);
  await check("about");
  await page.locator("#about-close").click();
  await page.locator("#start").click();
  await lay(page, info, 1, 2);
  await lay(page, info, 2, 3); // no site is left dark, so the run lasts until the first reward
  await check("run");
  await page.locator("#btn-inspector").click();
  await page.locator("#site-list button").first().click();
  await page.keyboard.press("Escape");
  await check("inspector");
  await page.locator("#link-rows button").first().click();
  await check("link options");
  await page.locator("#lp-close").click();
  await page.locator("#inspector-close").click();
  for (let i = 0; i < 60 && !(await state(page)).rewardPending; i++) await advance(page, 40);
  await expect(page.locator("#reward")).toBeVisible();
  await check("reward");
  await page.locator("#reward-upgrade").click();
  await expect(page.locator("#reward")).toBeHidden();
  await toGameOver(page);
  await expect(page.locator("#gameover")).toBeVisible();
  await check("game over");
});

test("a resize or a rotation during a run leaves the run going", async ({ page }, info) => {
  test.skip(isPhone(info), "resizing is checked from desktop size");
  await open(page, "autostart=1&seed=stage-1");
  await lay(page, info, 1, 2);
  await lay(page, info, 2, 3);
  await playTo(page, info, 500, { connect: false });
  const before = await state(page);
  for (const size of [{ width: 1280, height: 720 }, { width: 720, height: 1280 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    await frame(page);
    const s = await scene(page);
    expect([s.width, s.height]).toEqual([size.width, size.height]);
    for (const p of await sites(page)) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(size.width);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(size.height);
    }
    await expect(page.locator("#hud")).toBeVisible();
    await expect(page.locator("#btn-pause")).toBeVisible();
    await advance(page, 60);
  }
  const after = await state(page);
  expect(after.step).toBeGreaterThanOrEqual(before.step + 180);
  expect(after.score).toBeGreaterThan(before.score);
  expect(after.over).toBe(false);
  expect((await links(page)).length).toBe(2);
});

test("AC19: with reduced motion the time-lapse waits to be started, and then replays the run", async ({ page }) => {
  await open(page, "autostart=1&seed=stage-1&bot=1&motion=reduced");
  await toGameOver(page);
  await expect(page.locator("#gameover")).toBeVisible();
  const end = await state(page);
  expect(end.lapse).toBeNull();
  await expect(page.locator("#over-lapse")).toHaveText("Reduced motion is on, so the time-lapse waits until you start it.");
  await page.locator("#over-replay").click();
  await expect.poll(async () => (await state(page)).lapse?.playing, { timeout: 30_000 }).toBe(false);
  const lapse = (await state(page)).lapse!;
  expect(lapse.step).toBe(end.step);
  expect(lapse.score).toBe(end.score);
});

test("FR-030: every site of a run is framed between the HUD and the controls, none behind a bar", async ({ page }) => {
  // Seen in the phone video: a site near the bottom edge sat under the control bar.
  await open(page, "autostart=1&seed=stage-1&bot=1");
  const check = async (count: number): Promise<void> => {
    const bars = await page.evaluate(() => ({
      top: document.getElementById("hud")!.getBoundingClientRect().bottom,
      bottom: document.getElementById("controls")!.getBoundingClientRect().top,
      width: window.innerWidth,
    }));
    expect(bars.bottom - bars.top).toBeGreaterThan(100);
    const all = await sites(page);
    expect(all.length).toBe(count);
    for (const s of all) {
      expect(s.y, `${s.code} is below the HUD`).toBeGreaterThan(bars.top);
      expect(s.y, `${s.code} is above the controls`).toBeLessThan(bars.bottom);
      expect(s.x, `${s.code} is inside the view`).toBeGreaterThan(0);
      expect(s.x, `${s.code} is inside the view`).toBeLessThan(bars.width);
    }
  };
  await check(3);
  // By six minutes and five seconds all twelve sites of the run have appeared.
  await advance(page, 7300);
  expect((await state(page)).over).toBe(false);
  await check(12);
});
