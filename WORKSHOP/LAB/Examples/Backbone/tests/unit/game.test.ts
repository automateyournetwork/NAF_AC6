import { describe, expect, it } from "vitest";
import { validateRegion, validateTuning } from "../../src/content/load";
import regionJson from "../../src/content/region-na.json";
import tuningJson from "../../src/content/tuning.json";
import type { Command, Reason } from "../../src/sim/types";
import { DEFAULT_LINK_COST, findLink, linkLength, presentSites } from "../../src/sim/world";
import { Game } from "../../src/ui/game";

// The run on screen: how commands reach the simulation while time stands still, because
// the game is paused (FR-024, AC14) or a reward is waiting to be chosen (FR-016).
// Every case below was found in code review.

const tuning = validateTuning(tuningJson);
const region = validateRegion(regionJson, tuning.maxSites);

function newGame(overrides: Partial<typeof tuning> = {}): { game: Game; refused: { reason: Reason; command: Command }[] } {
  const refused: { reason: Reason; command: Command }[] = [];
  const game = new Game("stage-1", region, { ...tuning, ...overrides }, {
    onEvents: () => {},
    onRejected: (reason, command) => refused.push({ reason, command }),
  });
  return { game, refused };
}

/** A game stopped at its first reward offer, one second in, before any site sends traffic. */
function atReward(): ReturnType<typeof newGame> {
  const made = newGame({ rewardEverySec: 1 });
  made.game.advance(10 * tuning.stepsPerSec);
  expect(made.game.world.rewardPending).toBe(true);
  expect(made.game.world.step).toBe(tuning.stepsPerSec);
  return made;
}

describe("commands while a reward waits to be chosen (FR-016)", () => {
  it("are held as pending, checked against the world as it will be, and applied with the choice", () => {
    const { game, refused } = atReward();
    const [a, b, c] = presentSites(game.world) as [(typeof game.world.sites)[number], (typeof game.world.sites)[number], (typeof game.world.sites)[number]];
    const first = linkLength(a, b);
    game.world.fiberKm = first + 1; // enough for one link, not for two

    expect(game.holding).toBe(true);
    expect(game.issue({ type: "layLink", a: a.id, b: b.id })).toBeNull();
    // Nothing has reached the simulation; the change shows as pending.
    expect(game.world.links).toHaveLength(0);
    expect(game.pending.map((command) => command.type)).toEqual(["layLink"]);
    expect(game.planned.links).toHaveLength(1);
    expect(game.planned.fiberKm).toBe(1);

    // The second link is refused now, in words, not accepted and dropped after the choice.
    expect(game.issue({ type: "layLink", a: a.id, b: c.id })).toBe("not-enough-fiber");
    expect(game.pending).toHaveLength(1);

    // Three presses of "+" on the pending link's cost move it three steps, not one.
    const pendingLink = game.planned.links[0]!;
    for (let press = 0; press < 3; press++) {
      const cost = findLink(game.planned, a.id, b.id)!.cost + 1;
      expect(game.issue({ type: "setCost", link: pendingLink.id, cost })).toBeNull();
    }
    expect(findLink(game.planned, a.id, b.id)!.cost).toBe(DEFAULT_LINK_COST + 3);

    // Time has not moved, and the wait is still on.
    game.tick(1000);
    expect(game.world.step).toBe(tuning.stepsPerSec);
    expect(game.world.links).toHaveLength(0);

    expect(game.issue({ type: "chooseReward", choice: "fiber" })).toBeNull();
    // The choice is held with the rest until the step runs, so the planned world stays the one to read.
    expect(game.rewardChosen).toBe(true);
    expect(game.pending.map((command) => command.type)).toEqual(["layLink", "setCost", "setCost", "setCost", "chooseReward"]);
    expect(game.planned.fiberKm).toBe(1 + tuning.rewardFiberKm);
    expect(findLink(game.planned, a.id, b.id)!.cost).toBe(DEFAULT_LINK_COST + 3);
    // A second press of the reward button is refused in words; it does not reach the simulation.
    expect(game.issue({ type: "chooseReward", choice: "upgrade" })).toBe("no-reward-pending");
    game.tick(0);
    expect(game.pending).toHaveLength(0);
    expect(game.projected).toBeNull();

    const laid = findLink(game.world, a.id, b.id)!;
    expect(laid.id).toBe(pendingLink.id);
    expect(laid.cost).toBe(DEFAULT_LINK_COST + 3);
    expect(game.world.fiberKm).toBe(1 + tuning.rewardFiberKm);
    expect(game.world.rewardPending).toBe(false);
    expect(game.world.step).toBe(tuning.stepsPerSec + 1);
    expect(refused).toEqual([]);
    // The held changes went first and the choice last, all in the step that ended the wait.
    expect(game.log.map((entry) => `${entry.step}:${entry.command.type}`)).toEqual([
      `${tuning.stepsPerSec}:layLink`,
      `${tuning.stepsPerSec}:setCost`,
      `${tuning.stepsPerSec}:setCost`,
      `${tuning.stepsPerSec}:setCost`,
      `${tuning.stepsPerSec}:chooseReward`,
    ]);
  });

  it("made between the choice and the step that applies it are checked against what is already held", () => {
    const { game, refused } = atReward();
    const [a, b, c] = presentSites(game.world);
    game.world.fiberKm = 1_000_000;
    expect(game.issue({ type: "layLink", a: a!.id, b: b!.id })).toBeNull();
    expect(game.issue({ type: "chooseReward", choice: "upgrade" })).toBeNull();
    // Before the next frame: the same link again is a duplicate of the held one, and is refused now.
    expect(game.issue({ type: "layLink", a: a!.id, b: b!.id })).toBe("duplicate-link");
    // Another link is accepted, gets the next ID, and a cost set on that ID lands on it.
    expect(game.issue({ type: "layLink", a: b!.id, b: c!.id })).toBeNull();
    const second = findLink(game.planned, b!.id, c!.id)!;
    expect(second.id).not.toBe(findLink(game.planned, a!.id, b!.id)!.id);
    expect(game.issue({ type: "setCost", link: second.id, cost: 77 })).toBeNull();
    game.tick(0);
    expect(findLink(game.world, b!.id, c!.id)).toMatchObject({ id: second.id, cost: 77 });
    expect(findLink(game.world, a!.id, b!.id)!.cost).toBe(DEFAULT_LINK_COST);
    expect(game.world.upgrades).toBe(tuning.startUpgrades + 1);
    expect(refused).toEqual([]);
  });

  it("go with the scripted player's choice too, so nothing stays held once time moves", () => {
    const { game, refused } = atReward();
    const [a, b] = presentSites(game.world);
    expect(game.issue({ type: "layLink", a: a!.id, b: b!.id })).toBeNull();
    game.bot = true;
    game.tick(0);
    expect(game.world.rewardPending).toBe(false);
    expect(findLink(game.world, a!.id, b!.id)).toBeDefined();
    expect(game.pending).toHaveLength(0);
    expect(game.projected).toBeNull();
    expect(refused).toEqual([]);
  });
});

describe("a command sent in the instant before a pause (AC14)", () => {
  it("joins the pending changes, so later pending changes land on the link they were made on", () => {
    const { game, refused } = newGame();
    game.advance(5);
    game.world.fiberKm = 1_000_000;
    const [a, b, c] = presentSites(game.world);

    // Sent while running, and not yet applied when the pause arrives.
    expect(game.issue({ type: "layLink", a: a!.id, b: b!.id })).toBeNull();
    game.setPaused(true);
    expect(game.world.links).toHaveLength(0);
    expect(game.pending.map((command) => command.type)).toEqual(["layLink"]);
    expect(game.planned.fiberKm).toBe(1_000_000 - linkLength(a!, b!));

    // A second link, and a cost set on that second link, while paused.
    expect(game.issue({ type: "layLink", a: b!.id, b: c!.id })).toBeNull();
    const second = findLink(game.planned, b!.id, c!.id)!;
    expect(game.issue({ type: "setCost", link: second.id, cost: 50 })).toBeNull();

    game.setPaused(false);
    game.advance(1);
    expect(findLink(game.world, b!.id, c!.id)).toMatchObject({ id: second.id, cost: 50 });
    expect(findLink(game.world, a!.id, b!.id)!.cost).toBe(DEFAULT_LINK_COST);
    expect(refused).toEqual([]);
  });

  it("stays in the planned world from resume until the step that applies it, with no gap", () => {
    const { game, refused } = newGame();
    game.advance(5);
    const [a, b, c] = presentSites(game.world);
    game.setPaused(true);
    expect(game.issue({ type: "layLink", a: a!.id, b: b!.id })).toBeNull();
    const held = findLink(game.planned, a!.id, b!.id)!;
    const budget = game.planned.fiberKm;

    game.setPaused(false);
    // Resumed, but no step has run yet: the link panel and the HUD read the planned world.
    expect(game.world.links).toHaveLength(0);
    expect(findLink(game.planned, a!.id, b!.id)).toMatchObject({ id: held.id });
    expect(game.planned.fiberKm).toBe(budget);
    // A change made in this instant is checked against the held ones and goes with them.
    expect(game.issue({ type: "layLink", a: a!.id, b: b!.id })).toBe("duplicate-link");
    expect(game.issue({ type: "layLink", a: b!.id, b: c!.id })).toBeNull();
    expect(game.issue({ type: "setCost", link: held.id, cost: 31 })).toBeNull();

    game.tick(game.stepMs);
    expect(game.pending).toHaveLength(0);
    expect(game.projected).toBeNull();
    expect(findLink(game.world, a!.id, b!.id)).toMatchObject({ id: held.id, cost: 31 });
    expect(findLink(game.world, b!.id, c!.id)).toBeDefined();
    expect(game.log.map((entry) => entry.step)).toEqual([5, 5, 5]);
    expect(refused).toEqual([]);
  });

  it("time does not move while paused, by the frame loop or by the test hook, so a pause cannot meet a reward", () => {
    const { game } = newGame({ rewardEverySec: 1 });
    game.advance(5);
    game.setPaused(true);
    game.advance(10 * tuning.stepsPerSec);
    game.tick(10_000);
    expect(game.world.step).toBe(5);
    expect(game.world.rewardPending).toBe(false);
    game.setPaused(false);
    game.advance(10 * tuning.stepsPerSec);
    expect(game.world.rewardPending).toBe(true);
    expect(game.world.step).toBe(tuning.stepsPerSec);
  });

  it("is checked against the changes made just before it, so the second of two that cannot both be paid for is refused at once", () => {
    const { game, refused } = newGame();
    game.advance(5);
    const [a, b, c] = presentSites(game.world);
    game.world.fiberKm = Math.max(linkLength(a!, b!), linkLength(a!, c!));
    // Each is affordable alone; together they are not. The second hears so when it is made.
    expect(game.issue({ type: "layLink", a: a!.id, b: b!.id })).toBeNull();
    expect(game.issue({ type: "layLink", a: a!.id, b: c!.id })).toBe("not-enough-fiber");
    game.setPaused(true);
    expect(game.pending).toHaveLength(1);
    expect(refused).toEqual([]);
  });
});

describe("changes made while the game runs (found in the third review)", () => {
  it("show at once in the planned world, which is what a link's options read", () => {
    const { game } = newGame();
    game.advance(5);
    game.world.fiberKm = 1_000_000;
    const [a, b] = presentSites(game.world);
    expect(game.issue({ type: "layLink", a: a!.id, b: b!.id })).toBeNull();
    game.tick(game.stepMs);
    const link = findLink(game.world, a!.id, b!.id)!;
    expect(game.pending).toHaveLength(0);

    // Type a cost and press Enter: before the next step, the options must already show 25.
    expect(game.holding).toBe(false);
    expect(game.issue({ type: "setCost", link: link.id, cost: 25 })).toBeNull();
    expect(findLink(game.planned, a!.id, b!.id)!.cost).toBe(25);
    expect(findLink(game.world, a!.id, b!.id)!.cost).toBe(DEFAULT_LINK_COST);
    game.tick(game.stepMs);
    expect(findLink(game.world, a!.id, b!.id)!.cost).toBe(25);
    expect(game.projected).toBeNull();
  });

  it("are checked one after the other when two fall inside one step: every press of + counts, and a second upgrade with one in stock is refused at once", () => {
    const { game, refused } = newGame();
    game.advance(5);
    game.world.fiberKm = 1_000_000;
    const [a, b] = presentSites(game.world);
    expect(game.issue({ type: "layLink", a: a!.id, b: b!.id })).toBeNull();
    game.tick(game.stepMs);
    const id = findLink(game.world, a!.id, b!.id)!.id;
    const before = game.world.step;

    // Three presses of "+" within one step, each reading the cost the options show.
    for (let press = 0; press < 3; press++) {
      const shown = findLink(game.planned, a!.id, b!.id)!.cost;
      expect(game.issue({ type: "setCost", link: id, cost: shown + 1 })).toBeNull();
    }
    expect(game.world.upgrades).toBe(1);
    expect(game.issue({ type: "upgrade", link: id })).toBeNull();
    expect(game.issue({ type: "upgrade", link: id })).toBe("no-upgrade");
    expect(game.world.step).toBe(before);

    game.tick(game.stepMs);
    expect(game.world.step).toBe(before + 1);
    expect(findLink(game.world, a!.id, b!.id)).toMatchObject({ cost: DEFAULT_LINK_COST + 3, tier: 1 });
    expect(game.world.upgrades).toBe(0);
    expect(refused).toEqual([]);
  });
});
