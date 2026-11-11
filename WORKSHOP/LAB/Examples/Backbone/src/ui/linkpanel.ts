// A link's options: change its cost, upgrade its capacity, remove it. Every refusal is
// shown as text (AC5, AC24, AC25, FR-040).

import type { Text } from "../content/load";
import type { Link, LinkId, Reason } from "../sim/types";
import { MAX_COST, MIN_COST, capacityOf, dirUtilization, loadState } from "../sim/world";
import { el, km, percent, setText, show } from "./dom";
import type { Game, Tool } from "./game";
import { say } from "./messages";

export class LinkPanel {
  linkId: LinkId | null = null;
  private returnFocus: HTMLElement | null = null;

  constructor(
    private readonly game: () => Game | null,
    private readonly text: Text,
    private readonly siteCode: (id: number) => string,
  ) {
    el("lp-close").addEventListener("click", () => this.close());
    el("lp-minus").addEventListener("click", () => this.nudge(-1));
    el("lp-plus").addEventListener("click", () => this.nudge(1));
    el("lp-set").addEventListener("click", () => this.setTyped());
    el<HTMLInputElement>("lp-cost").addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.setTyped();
      }
    });
    el("lp-upgrade").addEventListener("click", () => this.send({ type: "upgrade", link: this.linkId! }, "Capacity upgraded one tier."));
    el("lp-remove").addEventListener("click", () => {
      const link = this.link();
      if (!link) return;
      const sent = this.send({ type: "removeLink", link: link.id }, `Link ${this.name(link)} removed. ${km(link.km)} of fiber returned.`);
      if (sent) this.close();
    });
  }

  get isOpen(): boolean {
    return this.linkId !== null;
  }

  private name(link: Link): string {
    return `${this.siteCode(link.a)}–${this.siteCode(link.b)}`;
  }

  private link(): Link | undefined {
    const game = this.game();
    return game && this.linkId !== null ? game.planned.links.find((l) => l.id === this.linkId) : undefined;
  }

  open(id: LinkId, tool: Tool): void {
    const game = this.game();
    if (!game) return;
    // Focus goes back to where it was when the panel was opened or aimed at another link.
    // A tool key pressed inside the open panel re-aims it too, and must not make one of the
    // panel's own controls, which are about to be hidden, that place.
    const from = document.activeElement;
    if (from instanceof HTMLElement && !el("linkpanel").contains(from)) this.returnFocus = from;
    this.linkId = id;
    game.focusLink = id;
    setText(el("lp-message"), "");
    show(el("linkpanel"), true);
    this.refresh(true);
    // The selected tool decides which control gets focus (contracts/ui.md).
    const target = tool === "upgrade" ? "lp-upgrade" : tool === "remove" ? "lp-remove" : "lp-cost";
    const control = el<HTMLButtonElement | HTMLInputElement>(target);
    (control.disabled ? el("lp-close") : control).focus();
    if (target === "lp-cost") el<HTMLInputElement>("lp-cost").select();
  }

  close(): void {
    if (this.linkId === null) return;
    const game = this.game();
    if (game) game.focusLink = null;
    this.linkId = null;
    show(el("linkpanel"), false);
    (this.returnFocus?.isConnected ? this.returnFocus : el("overlay")).focus();
  }

  /** Brings the panel up to date with the world. Closes it if the link is gone. */
  refresh(resetCost = false): void {
    const game = this.game();
    const link = this.link();
    if (!game || !link) {
      this.close();
      return;
    }
    const world = game.world;
    const live = world.links.find((l) => l.id === link.id);
    setText(el("lp-title"), `Link ${this.name(link)} · ${km(link.km)}`);
    const state = !live
      ? "Pending: this link is laid when play resumes."
      : !live.up
        ? `Cut. Repair in ${Math.ceil((live.restoreStep - world.step) / world.tuning.stepsPerSec)} s. A cut link cannot be removed.`
        : `Up, ${loadState(world, live)}. Utilization ${percent(dirUtilization(world, live, 0))} toward ${this.siteCode(live.b)}, ${percent(dirUtilization(world, live, 1))} toward ${this.siteCode(live.a)}.`;
    setText(el("lp-state"), state);
    const input = el<HTMLInputElement>("lp-cost");
    if (resetCost || document.activeElement !== input) input.value = String(link.cost);
    const top = link.tier >= world.tuning.tiers.length - 1;
    setText(el("lp-capacity"), `Capacity tier ${link.tier + 1} of ${world.tuning.tiers.length}: ${capacityOf(world, link)} packets per second each way.`);
    const upgrade = el<HTMLButtonElement>("lp-upgrade");
    setText(upgrade, top ? "Top tier reached" : `Upgrade capacity (${game.planned.upgrades} in stock)`);
    upgrade.disabled = top;
    setText(el("lp-remove"), `Remove link (returns ${km(link.km)})`);
  }

  private send(command: Parameters<Game["issue"]>[0], done: string): boolean {
    const game = this.game();
    if (!game) return false;
    const reason = game.issue(command);
    const message = reason ? this.reasonText(reason) : game.holding ? `${done} ${this.text.events.pending ?? ""}` : done;
    setText(el("lp-message"), reason ? message : "");
    say(message, reason ? "warn" : "info");
    this.refresh(true);
    return reason === null;
  }

  private reasonText(reason: Reason): string {
    return this.text.reasons[reason] ?? reason;
  }

  private nudge(by: number): void {
    const link = this.link();
    if (!link) return;
    this.send({ type: "setCost", link: link.id, cost: link.cost + by }, `Cost of ${this.name(link)} set to ${link.cost + by}.`);
  }

  private setTyped(): void {
    const link = this.link();
    if (!link) return;
    const raw = el<HTMLInputElement>("lp-cost").value.trim();
    // Only digits are a cost. Anything else is refused here, before it reaches the rules.
    const cost = /^\d{1,7}$/.test(raw) ? Number(raw) : Number.NaN;
    if (!(cost >= MIN_COST && cost <= MAX_COST)) {
      const message = this.reasonText("bad-cost");
      setText(el("lp-message"), message);
      say(message, "warn");
      return;
    }
    this.send({ type: "setCost", link: link.id, cost }, `Cost of ${this.name(link)} set to ${cost}.`);
  }
}
