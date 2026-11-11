import { expect, test } from "@playwright/test";
import { advance, open, state } from "./helpers";

// SC-006 and C5: the build output, served as plain files, plays with no network connection
// in a clean browser profile. Every request that is not to the local file server is blocked
// and counted; none is expected.

test("the game plays to game over with no request leaving the machine", async ({ page, context, baseURL }) => {
  const local = new URL(baseURL!).origin;
  const outside: string[] = [];
  const local404: string[] = [];
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(local) || url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
    outside.push(url);
    return route.abort();
  });
  page.on("response", (response) => {
    if (response.status() >= 400) local404.push(`${response.status()} ${response.url()}`);
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await open(page);
  await expect(page.locator("#welcome")).toBeVisible();
  // The typeface and the hero art are part of the build, not fetched from elsewhere.
  expect(await page.evaluate(() => document.fonts.check('500 16px "IBM Plex Mono"') && document.fonts.check('400 16px "IBM Plex Sans"'))).toBe(true);
  expect(await page.evaluate(() => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth * 9 === image.naturalHeight * 16);
    image.onerror = () => resolve(false);
    image.src = "hero.webp";
  }))).toBe(true);

  // Now cut the network entirely and play a whole run.
  await context.setOffline(true);
  await page.locator("#seed").fill("offline-run");
  await page.locator("#start").click();
  await page.evaluate(() => {
    const hook = window.__backbone;
    for (let i = 0; i < 400 && !hook.state().over; i++) {
      // Take the reward, then let one step pass so the choice is applied before looking again.
      if (hook.state().rewardPending) (document.getElementById("reward-fiber") as HTMLButtonElement).click();
      hook.advance(hook.state().rewardPending ? 1 : 100);
    }
  });
  await advance(page, 1);
  const end = await state(page);
  expect(end.over).toBe(true);
  await expect(page.locator("#gameover")).toBeVisible();
  await page.locator("#over-new").click();
  await expect(page.locator("#scores li")).toHaveCount(1);

  expect(outside, "requests to anywhere but the local file server").toEqual([]);
  expect(local404, "local requests that failed").toEqual([]);
  expect(errors).toEqual([]);
});

test("the build has no reference to another host", async ({ request, baseURL }) => {
  const index = await (await request.get(baseURL!)).text();
  const assets = [...index.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]!);
  expect(assets.length).toBeGreaterThan(1);
  const bodies = [index];
  for (const asset of assets) {
    expect(asset.startsWith("./") || !/^[a-z]+:|^\/\//i.test(asset), `${asset} is a relative path`).toBe(true);
    if (/\.(js|css)$/.test(asset)) bodies.push(await (await request.get(new URL(asset, baseURL!).href)).text());
  }
  // The only absolute addresses allowed are namespaces and licence notices, which are never fetched.
  const hosts = new Set<string>();
  for (const body of bodies) for (const match of body.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) hosts.add(match[1]!.toLowerCase());
  expect([...hosts].filter((host) => !["www.w3.org"].includes(host))).toEqual([]);
});
