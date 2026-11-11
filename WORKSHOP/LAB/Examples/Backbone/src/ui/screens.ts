// The screens around a run: welcome, About the model, and game over.

import type { Text } from "../content/load";
import { formatTime } from "../sim/world";
import { el, num, setText, show } from "./dom";
import type { Game } from "./game";
import { SEED_PATTERN, type ScoreEntry } from "./scores";
import { randomSeed, type MotionSetting } from "./settings";

export interface ScreenHooks {
  start(seed: string): void;
  motionChanged(setting: MotionSetting): void;
  aboutClosed(): void;
  newRun(): void;
  again(): void;
  replay(): void;
}

export class Screens {
  private aboutOpener: HTMLElement | null = null;

  constructor(
    private readonly text: Text,
    private readonly stepsPerSec: number,
    private readonly hooks: ScreenHooks,
  ) {
    setText(el("welcome-pitch"), text.pitch);
    setText(el("welcome-briefing"), text.briefing);
    const help = el("help");
    for (const line of text.help) {
      const item = document.createElement("li");
      item.textContent = line;
      help.append(item);
    }
    this.fillAbout();

    el("seed-random").addEventListener("click", () => {
      el<HTMLInputElement>("seed").value = randomSeed();
      setText(el("seed-error"), "");
    });
    el<HTMLFormElement>("start-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const typed = el<HTMLInputElement>("seed").value.trim();
      // An empty field means a random seed. Anything else must match the seed pattern (FR-022).
      const seed = typed === "" ? randomSeed() : typed;
      if (!SEED_PATTERN.test(seed)) {
        setText(el("seed-error"), text.reasons["bad-seed"] ?? "");
        el("seed").focus();
        return;
      }
      setText(el("seed-error"), "");
      hooks.start(seed);
    });
    el<HTMLSelectElement>("motion").addEventListener("change", (event) => {
      const value = (event.target as HTMLSelectElement).value;
      hooks.motionChanged(value === "on" || value === "off" ? value : "auto");
    });
    el("btn-about").addEventListener("click", () => this.showAbout());
    el("btn-about-run").addEventListener("click", () => this.showAbout());
    el("about-close").addEventListener("click", () => this.hideAbout());
    el("over-new").addEventListener("click", () => hooks.newRun());
    el("over-again").addEventListener("click", () => hooks.again());
    el("over-replay").addEventListener("click", () => hooks.replay());
  }

  /** F1–F8 and S1–S11 in plain language (FR-028). */
  private fillAbout(): void {
    const note = (tag: string, body: string, aside: string): HTMLLIElement => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.className = "tag";
      label.textContent = tag;
      const extra = document.createElement("span");
      extra.className = "aside";
      extra.textContent = aside;
      item.append(label, document.createTextNode(body), extra);
      return item;
    };
    el("about-faithful").replaceChildren(...this.text.faithful.map((n) => note(n.id, n.text, n.source)));
    el("about-simplified").replaceChildren(...this.text.simplified.map((n) => note(n.id, n.text, `In a real network: ${n.real}`)));
  }

  get aboutOpen(): boolean {
    return !el("about").hidden;
  }

  showWelcome(seed: string | null, scores: ScoreEntry[], storageOk: boolean, motion: MotionSetting): void {
    if (seed !== null) el<HTMLInputElement>("seed").value = seed;
    el<HTMLSelectElement>("motion").value = motion;
    const list = el("scores");
    list.replaceChildren(
      ...scores.map((entry) => {
        const item = document.createElement("li");
        item.textContent = `${num(entry.score)} delivered · ${formatTime(entry.steps, this.stepsPerSec)} · seed ${entry.seed}`;
        return item;
      }),
    );
    setText(el("scores-note"), !storageOk ? (this.text.reasons["no-storage"] ?? "") : scores.length === 0 ? "No finished runs yet." : "");
    show(el("welcome"), true);
    el("start").focus();
  }

  hideWelcome(): void {
    show(el("welcome"), false);
  }

  showAbout(): void {
    this.aboutOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    show(el("about"), true);
    el("about-close").focus();
  }

  hideAbout(): void {
    if (!this.aboutOpen) return;
    show(el("about"), false);
    this.hooks.aboutClosed();
    if (this.aboutOpener?.isConnected && this.aboutOpener.offsetParent !== null) this.aboutOpener.focus();
  }

  showGameOver(game: Game, note: string): void {
    const world = game.world;
    setText(el("over-score"), num(world.delivered));
    setText(el("over-time"), formatTime(world.step, world.tuning.stepsPerSec));
    setText(el("over-seed"), game.seed);
    const d = world.dropped;
    setText(el("over-drops"), `${num(d.queue + d.cut + d.noRoute)}: ${num(d.queue)} at full queues, ${num(d.cut)} on cut or removed links, ${num(d.noRoute)} with no route`);
    setText(el("over-lapse"), note);
    show(el("gameover"), true);
    el("over-new").focus();
  }

  setLapseNote(note: string): void {
    setText(el("over-lapse"), note);
  }

  hideGameOver(): void {
    show(el("gameover"), false);
  }
}
