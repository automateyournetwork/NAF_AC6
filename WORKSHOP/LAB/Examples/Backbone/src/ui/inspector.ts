// The inspector: every site, every link and one router's table, as text (AC13, AC26,
// FR-031). Its site and link entries are real buttons, which is how the game is played
// by keyboard (AC17). The map is never the only source of truth (C4).

import type { Link, LinkId, SiteId, World } from "../sim/types";
import { capacityOf, dirUtilization, isDark, loadState, presentSites } from "../sim/world";
import { el, percent, setText, show } from "./dom";
import type { Game } from "./game";

interface LinkRow {
  row: HTMLTableRowElement;
  button: HTMLButtonElement;
  cost: HTMLTableCellElement;
  capacity: HTMLTableCellElement;
  load: HTMLTableCellElement;
  state: HTMLTableCellElement;
}

export interface InspectorHooks {
  siteChosen(id: SiteId): void;
  linkChosen(id: LinkId): void;
  focusSite(id: SiteId | null): void;
  focusLink(id: LinkId | null): void;
}

export class Inspector {
  isOpen = false;
  private readonly siteButtons = new Map<SiteId, HTMLButtonElement>();
  private readonly linkRows = new Map<LinkId, LinkRow>();

  constructor(
    private readonly game: () => Game | null,
    private readonly hooks: InspectorHooks,
  ) {
    el("inspector-close").addEventListener("click", () => this.close(true));
  }

  open(moveFocus: boolean): void {
    this.isOpen = true;
    show(el("inspector"), true);
    el("btn-inspector").setAttribute("aria-expanded", "true");
    this.refresh();
    if (moveFocus) (this.siteButtons.values().next().value ?? el("inspector-close")).focus();
  }

  close(moveFocus: boolean): void {
    this.isOpen = false;
    show(el("inspector"), false);
    el("btn-inspector").setAttribute("aria-expanded", "false");
    if (moveFocus) el("btn-inspector").focus();
  }

  /** Forgets every row, for a new run. */
  reset(): void {
    for (const button of this.siteButtons.values()) button.parentElement?.remove();
    for (const row of this.linkRows.values()) row.row.remove();
    this.siteButtons.clear();
    this.linkRows.clear();
    el("route-rows").replaceChildren();
  }

  refresh(): void {
    const game = this.game();
    if (!game || !this.isOpen) return;
    const world = game.world;
    const code = (id: SiteId): string => world.sites[id - 1]?.code ?? "?";
    setText(
      el("inspector-hint"),
      game.linkStart !== null
        ? `Link from ${code(game.linkStart)}: choose the far site, or press Escape.`
        : "Choose a site to see its router's table and start a link from it. Choose a link for its options.",
    );
    this.refreshSites(game, world);
    this.refreshLinks(game, world, code);
    this.refreshRoutes(game, world, code);
  }

  private refreshSites(game: Game, world: World): void {
    const list = el("site-list");
    for (const site of presentSites(world)) {
      let button = this.siteButtons.get(site.id);
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        const id = site.id;
        button.addEventListener("click", () => this.hooks.siteChosen(id));
        button.addEventListener("focus", () => this.hooks.focusSite(id));
        button.addEventListener("blur", () => this.hooks.focusSite(null));
        const item = document.createElement("li");
        item.append(button);
        list.append(item);
        this.siteButtons.set(site.id, button);
      }
      const seconds = Math.ceil((site.activeStep - world.step) / world.tuning.stepsPerSec);
      const state = site.activeStep > world.step ? `new, traffic in ${seconds} s` : isDark(world, site.id) ? "dark, no path" : "active";
      setText(button, `${site.code} · ID ${site.id} · ${state}`);
      button.setAttribute("aria-label", `Site ${site.code}, ${site.name}, router ID ${site.id}, ${state}`);
      button.setAttribute("aria-pressed", String(game.tableSite === site.id || game.linkStart === site.id));
    }
  }

  private refreshLinks(game: Game, world: World, code: (id: SiteId) => string): void {
    const body = el("link-rows");
    const planned = game.planned;
    const all = new Map<LinkId, Link>();
    for (const link of world.links) all.set(link.id, link);
    for (const link of planned.links) if (!all.has(link.id)) all.set(link.id, link);
    for (const [id, entry] of this.linkRows) {
      if (!all.has(id)) {
        entry.row.remove();
        this.linkRows.delete(id);
      }
    }
    for (const link of [...all.values()].sort((p, q) => p.id - q.id)) {
      let entry = this.linkRows.get(link.id);
      if (!entry) {
        const row = document.createElement("tr");
        const button = document.createElement("button");
        button.type = "button";
        const id = link.id;
        button.addEventListener("click", () => this.hooks.linkChosen(id));
        button.addEventListener("focus", () => this.hooks.focusLink(id));
        button.addEventListener("blur", () => this.hooks.focusLink(null));
        const first = document.createElement("td");
        first.append(button);
        const cells = [0, 1, 2, 3].map(() => document.createElement("td")) as [HTMLTableCellElement, HTMLTableCellElement, HTMLTableCellElement, HTMLTableCellElement];
        row.append(first, ...cells);
        body.append(row);
        entry = { row, button, cost: cells[0], capacity: cells[1], load: cells[2], state: cells[3] };
        this.linkRows.set(link.id, entry);
      }
      const live = world.links.find((l) => l.id === link.id);
      const later = planned.links.find((l) => l.id === link.id);
      const name = `${code(link.a)}–${code(link.b)}`;
      setText(entry.button, name);
      entry.button.setAttribute("aria-label", `Link ${code(link.a)} to ${code(link.b)}, open options`);
      const cost = live?.cost ?? link.cost;
      setText(entry.cost, later && live && later.cost !== live.cost ? `${cost} → ${later.cost} pending` : String(cost));
      const perSec = (l: Link): string => `${capacityOf(world, l)}/s`;
      setText(entry.capacity, later && live && later.tier !== live.tier ? `${perSec(live)} → ${perSec(later)} pending` : perSec(live ?? link));
      setText(entry.load, live && live.up ? `${percent(dirUtilization(world, live, 0))} to ${code(live.b)} · ${percent(dirUtilization(world, live, 1))} to ${code(live.a)}` : "–");
      let state: string;
      if (!live) state = "pending: new link";
      else if (!live.up) state = `cut, repair in ${Math.ceil((live.restoreStep - world.step) / world.tuning.stepsPerSec)} s`;
      else {
        const load = loadState(world, live);
        state = `up, ${load === "dropping" ? "dropping packets" : load}`;
      }
      if (live && !later) state += " · pending: removal";
      setText(entry.state, state);
      const load = live?.up ? loadState(world, live) : null;
      entry.state.className = live && !live.up ? "is-cut" : load === "congested" || load === "dropping" ? "is-congested" : "";
    }
    show(el("link-empty"), all.size === 0);
    show(el("link-table"), all.size > 0);
  }

  /** The selected router's table in force: every destination, its total cost and next hop (AC26). */
  private refreshRoutes(game: Game, world: World, code: (id: SiteId) => string): void {
    const site = game.tableSite === null ? undefined : world.sites[game.tableSite - 1];
    show(el("route-table"), site !== undefined);
    if (!site) {
      setText(el("route-title"), "Router table");
      setText(el("route-note"), "Select a site to see its router's table.");
      return;
    }
    setText(el("route-title"), `Router table of ${site.code} (ID ${site.id})`);
    setText(el("route-note"), game.holding && game.pending.length > 0 ? "The table in force. Pending changes are not included until play resumes." : "The table in force: lowest total cost to every other site.");
    const rows: HTMLTableRowElement[] = [];
    for (const other of presentSites(world)) {
      if (other.id === site.id) continue;
      const route = world.routes[site.id]?.[other.id];
      const row = document.createElement("tr");
      for (const value of [`${other.code} (ID ${other.id})`, route ? String(route.cost) : "–", route ? route.nextHops.map(code).join(", ") : "no route"]) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      rows.push(row);
    }
    el("route-rows").replaceChildren(...rows);
  }
}
