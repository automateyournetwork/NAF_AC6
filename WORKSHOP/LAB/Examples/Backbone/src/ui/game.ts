// One run on screen: the world, its command log, the fixed-step loop and pause.
// Every change the player makes is checked at once against a copy of the world as it will
// be, and waits there, pending, for the next simulation step. While the game runs that is
// at most one step away. While time stands still, because the game is paused or a reward
// is waiting to be chosen, the changes collect, are shown as pending, and all go in the
// step that starts time again (FR-016, FR-024, AC14). The copy is what the screen reads
// until that step has run, so a change is never neither pending nor applied, and two
// changes made within one step are checked one after the other, not both against the past.

import { botCommands } from "../sim/bot";
import { recordCommands } from "../sim/replay";
import type { Command, LinkId, LogEntry, Reason, Region, SiteId, StepEvents, Tuning, World } from "../sim/types";
import { applyCommand, cloneWorld, createWorld, step } from "../sim/world";
import type { Effect } from "../render/viewmodel";

export type Tool = "link" | "cost" | "upgrade" | "remove";

export interface GameHooks {
  onEvents(events: StepEvents): void;
  onRejected(reason: Reason, command: Command): void;
}

export class Game {
  readonly world: World;
  readonly log: LogEntry[] = [];
  paused = false;
  /** The world as it will be once the pending changes apply. Exists while there are any. */
  projected: World | null = null;
  pending: Command[] = [];
  speed = 1;
  bot = false;
  /** Fraction of the current step already shown. */
  alpha = 0;
  effects: Effect[] = [];
  tool: Tool = "link";
  focusSite: SiteId | null = null;
  focusLink: LinkId | null = null;
  /** The site a link is being started from. */
  linkStart: SiteId | null = null;
  /** The site whose router table the inspector shows. */
  tableSite: SiteId | null = null;
  drag: { from: SiteId; x: number; y: number } | null = null;

  private carry = 0;

  constructor(
    readonly seed: string,
    region: Region,
    readonly tuning: Tuning,
    private readonly hooks: GameHooks,
  ) {
    this.world = createWorld(seed, region, tuning);
  }

  get stepMs(): number {
    return 1000 / this.tuning.stepsPerSec;
  }

  /** The world the budget and link lists should be read from: with pending changes while time stands still. */
  get planned(): World {
    return this.projected ?? this.world;
  }

  /** Time is standing still for the player: the game is paused, or a reward is waiting to be chosen. */
  get holding(): boolean {
    return this.paused || this.world.rewardPending;
  }

  /**
   * Sends a command. Returns the reason when the rules refuse it, so the caller can say why.
   * An accepted command is pending until the next step applies it.
   */
  issue(command: Command): Reason | null {
    this.projected ??= cloneWorld(this.world);
    const reason = applyCommand(this.projected, command);
    if (!reason) this.pending.push(command);
    return reason;
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused || this.world.over || this.world.rewardPending) return;
    // What is pending stays pending either way: it is released by the next step, not here.
    this.paused = paused;
  }

  /** A reward has been chosen and is waiting, with the changes before it, for the next step. */
  get rewardChosen(): boolean {
    return this.pending.some((command) => command.type === "chooseReward");
  }

  /** Advances the simulation by the real time that has passed. Never while paused. */
  tick(elapsedMs: number): void {
    if (this.paused || this.world.over) return;
    if (this.world.rewardPending) {
      // Time stands still until a choice arrives.
      if (this.bot || this.rewardChosen) this.stepOnce();
      this.alpha = 0;
      return;
    }
    this.carry += Math.min(elapsedMs, 250) * this.speed;
    let guard = 0;
    while (this.carry >= this.stepMs && guard++ < 96) {
      this.carry -= this.stepMs;
      this.stepOnce();
      if (this.world.over || this.world.rewardPending) {
        this.carry = 0;
        break;
      }
    }
    this.alpha = this.carry / this.stepMs;
  }

  /** Runs whole steps at once. For tests and tools. Like `tick`, never while paused. */
  advance(steps: number): void {
    if (this.paused) return;
    for (let i = 0; i < steps && !this.world.over; i++) {
      if (this.world.rewardPending && !this.bot && !this.rewardChosen) break;
      this.stepOnce();
    }
  }

  private stepOnce(): void {
    // Everything held goes into this one step, in the order it was made, so there is one
    // route calculation. Only now does the copy of the world stop being the one to read.
    const commands = [...this.pending, ...(this.bot ? botCommands(this.world) : [])];
    this.pending = [];
    this.projected = null;
    recordCommands(this.log, this.world, commands);
    const events = step(this.world, commands);
    for (const refusal of events.rejected) this.hooks.onRejected(refusal.reason, refusal.command);
    this.hooks.onEvents(events);
  }
}
