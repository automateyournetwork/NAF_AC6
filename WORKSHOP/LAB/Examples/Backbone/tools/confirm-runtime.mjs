// Runs the game once exactly as ARCADE.md's Runtime section says, the way a player would,
// and checks each claim in that section. The Arcade's template asks the build agent to
// "run the game once yourself and confirm the Runtime section is correct".
//
//   node tools/confirm-runtime.mjs
//
// It takes `start`, `url_after_start` and `static_root` from ARCADE.md, runs the start
// command from the repository root, opens the URL with no test switches, starts a run,
// lets it end, and reloads. Nothing is installed by it and nothing is built. Exit status 0
// when every claim holds, 1 when one does not, 2 when the game could not be started.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const arcade = readFileSync(join(root, "ARCADE.md"), "utf8");
const runtime = arcade.slice(arcade.indexOf("\nruntime:"), arcade.indexOf("\nverification:"));
const field = (name) => {
  const match = runtime.match(new RegExp(`^  ${name}: *"?([^"\\n#]*)"? *(#.*)?$`, "m"));
  if (!match) throw new Error(`ARCADE.md has no runtime field "${name}"`);
  return match[1].trim();
};
const claims = {
  start: field("start"),
  url: field("url_after_start"),
  staticRoot: field("static_root"),
  requiresNetwork: field("requires_network"),
  requiresApiKey: field("requires_api_key"),
  usesAi: field("uses_ai_at_runtime"),
  saveState: field("save_state"),
};

const [command, ...args] = claims.start.split(" ");
const server = spawn(command, args, { cwd: root, stdio: "ignore" });
let exit = null;
server.once("exit", (code, signal) => {
  exit = code ?? signal ?? "unknown";
});
server.once("error", (error) => {
  exit = error.message;
});

const checks = [];
const check = (claim, ok, seen) => checks.push({ claim, ok, seen });
let status = 0;
let browser = null;
try {
  // The start command must bring up this build at the URL the file gives.
  const index = readFileSync(join(root, claims.staticRoot, "index.html"), "utf8");
  const deadline = Date.now() + 15_000;
  let body = null;
  while (body === null) {
    if (exit !== null) throw new Error(`the start command stopped (${exit}); is the port in use?`);
    if (Date.now() > deadline) throw new Error(`nothing answered at ${claims.url} within 15 s`);
    try {
      const response = await fetch(claims.url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) body = await response.text();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (exit !== null) throw new Error(`the start command stopped (${exit}); something else answered at ${claims.url}`);
  check("start and url_after_start: the command serves the game at the URL", body === index, body === index ? `${claims.url} returns ${claims.staticRoot}/index.html` : "a different page answered");

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const local = new URL(claims.url).origin;
  const outside = [];
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(local) || url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
    outside.push(url);
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  // A player's visit: the plain URL, a seed, Start.
  await page.goto(claims.url);
  await page.locator("#welcome").waitFor({ state: "visible" });
  // From here on there is no network at all.
  await context.setOffline(true);
  await page.locator("#seed").fill("arcade-check");
  await page.locator("#start").click();
  await page.locator("#hud").waitFor({ state: "visible" });
  const early = await page.locator("#hud-time").textContent();
  await page.waitForTimeout(2500);
  const later = await page.locator("#hud-time").textContent();
  check("the game runs: the clock moves after Start", early !== later, `${early} then ${later}`);

  // No link is laid, so the three first sites drop their traffic and the run ends by itself.
  await page.locator("#gameover").waitFor({ state: "visible", timeout: 180_000 });
  const time = await page.locator("#hud-time").textContent();
  check("the game runs: a run reaches game over", true, `run over at ${time}`);
  await page.locator("#over-new").click();
  await page.locator("#welcome").waitFor({ state: "visible" });
  const listed = await page.locator("#scores li").count();

  // save_state: what the browser kept, and whether it is still there after a reload.
  await context.setOffline(false);
  await page.reload();
  await page.locator("#welcome").waitFor({ state: "visible" });
  const afterReload = await page.locator("#scores li").count();
  const keys = await page.evaluate(() => Object.keys(window.localStorage));
  const cookies = (await context.cookies()).length;
  check(
    `save_state: "${claims.saveState}"`,
    listed === 1 && afterReload === 1 && keys.length > 0 && keys.every((key) => key.startsWith("backbone.")) && cookies === 0,
    `${afterReload} score listed after a reload; localStorage keys ${JSON.stringify(keys)}; ${cookies} cookies`,
  );
  check(`requires_network: ${claims.requiresNetwork}`, claims.requiresNetwork === "false" && outside.length === 0, `${outside.length} requests to another host; the run was played offline`);
  const asked = await page.locator('input[type="password"], input[name*="key" i], input[name*="token" i]').count();
  check(`requires_api_key: ${claims.requiresApiKey}`, claims.requiresApiKey === "false" && asked === 0, `${asked} fields asking for a key, a token or a password`);
  check(`uses_ai_at_runtime: ${claims.usesAi}`, claims.usesAi === "false" && outside.length === 0, "no request left the page, so no model was called");
  check("no page errors", errors.length === 0, errors.length === 0 ? "none" : errors.join(" | "));
  if (checks.some((item) => !item.ok)) status = 1;
} catch (error) {
  checks.push({ claim: "the game could be started", ok: false, seen: error instanceof Error ? error.message : String(error) });
  status = 2;
} finally {
  if (browser) await browser.close();
  server.kill();
}

console.log(JSON.stringify({ start: claims.start, url: claims.url, staticRoot: claims.staticRoot, verdict: status === 0 ? "confirmed" : status === 1 ? "a claim does not hold" : "could not start", checks }, null, 2));
process.exit(status);
