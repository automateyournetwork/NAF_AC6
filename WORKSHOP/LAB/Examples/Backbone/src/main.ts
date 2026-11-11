// Wire-up: content, screens, the frame loop and the URL switches. The rules live in src/sim;
// this file only reads the world and sends it commands.

import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "./ui/styles.css";

import { loadContent, type Content } from "./content";
import { Camera } from "./render/camera";
import { Canvas2dRenderer, type Renderer } from "./render/canvas2d";
import { GlRenderer } from "./render/gl";
import { drawOverlay, type OverlayReport } from "./render/overlay";
import { RIPPLE_MS, buildScene, type DrawReport, type Scene } from "./render/viewmodel";
import { advanceWithLog } from "./sim/replay";
import type { Command, Link, LinkId, Reason, SiteId, StepEvents, World } from "./sim/types";
import { activeSites, createWorld, formatTime, isDark, linkById, linkLength, presentSites } from "./sim/world";
import { el, fill, km, show } from "./ui/dom";
import { Game, type Tool } from "./ui/game";
import { updateHud, updateStatus } from "./ui/hud";
import { attachInput } from "./ui/input";
import { Inspector } from "./ui/inspector";
import { LinkPanel } from "./ui/linkpanel";
import { clearMessages, say } from "./ui/messages";
import { RewardDialog } from "./ui/reward";
import { loadScores, openStorage, saveScore } from "./ui/scores";
import { Screens } from "./ui/screens";
import { isMotionReduced, loadMotion, parseSwitches, randomSeed, saveMotion } from "./ui/settings";

type Screen = "welcome" | "run" | "over";

interface Lapse {
  world: World;
  next: number;
  total: number;
  playing: boolean;
}

function fatal(message: string): void {
  const box = el("fatal");
  box.textContent = `Backbone cannot start. ${message}`;
  box.hidden = false;
}

function boot(): void {
  let content: Content;
  try {
    content = loadContent();
  } catch (error) {
    fatal(error instanceof Error ? error.message : String(error));
    return;
  }
  const { tuning, region, coast, palette, text } = content;
  // Every color on the page comes from palette.json, as CSS variables.
  for (const [role, value] of Object.entries(palette)) document.documentElement.style.setProperty(`--c-${role}`, value);

  const switches = parseSwitches(window.location.search);
  const store = openStorage();
  let motion = loadMotion(store);
  const deviceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = (): boolean => isMotionReduced(motion, deviceMotion.matches, switches.motion);

  const app = el("app");
  const overlay = el<HTMLCanvasElement>("overlay");
  const overlayContext = overlay.getContext("2d");
  if (!overlayContext) {
    fatal("This browser cannot draw the map.");
    return;
  }
  const camera = new Camera();
  let mapCanvas = el<HTMLCanvasElement>("map");
  /** The fallback renderer on a fresh canvas: a canvas that has given out a WebGL context cannot give a 2D one. */
  const fallbackRenderer = (): Renderer => {
    const fresh = mapCanvas.cloneNode(false) as HTMLCanvasElement;
    mapCanvas.replaceWith(fresh);
    mapCanvas = fresh;
    return new Canvas2dRenderer(fresh, palette);
  };
  // WebGL2 when the browser has it; otherwise, or when asked, the Canvas 2D renderer (AC20).
  let renderer: Renderer = (switches.renderer !== "2d" ? GlRenderer.create(mapCanvas, palette) : null) ?? fallbackRenderer();
  if (!switches.hud) app.dataset.hud = "off";
  // The hero art is a frame of the game itself (tools/make-card.mjs).
  el("hero").style.backgroundImage = 'url("hero.webp")';

  let screen: Screen = "welcome";
  let game: Game | null = null;
  let lapse: Lapse | null = null;
  let scene: Scene | null = null;
  let report: DrawReport = { links: 0, pulses: 0, sites: 0, effects: 0, labels: 0, icons: 0 };
  let dark = new Set<SiteId>();
  let dpr = 1;
  let unit = 16;
  let userMoved = false;

  const xs = region.sites.map((s) => s.x);
  const ys = region.sites.map((s) => s.y);
  /** Frames the sites of the current run, or the whole region when no run is on screen. */
  const fitCamera = (): void => {
    const px = game ? game.world.sites.map((s) => s.x) : xs;
    const py = game ? game.world.sites.map((s) => s.y) : ys;
    // Leave the HUD at the top and the controls at the bottom out of the framing, so no site
    // hides behind them. A bar that is not shown has no height.
    const top = el("hud").offsetHeight;
    const bottom = el("controls").offsetHeight;
    camera.fit(Math.min(...px) - 250, Math.min(...py) - 250, Math.max(...px) + 250, Math.max(...py) + 250, top, bottom);
  };
  const resize = (): void => {
    const width = app.clientWidth;
    const height = app.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    unit = Math.min(20, Math.max(11, height * 0.0155));
    renderer.resize(width, height, dpr);
    overlay.width = Math.round(width * dpr);
    overlay.height = Math.round(height * dpr);
    camera.resize(width, height);
    if (!userMoved) fitCamera();
  };

  const code = (id: SiteId): string => game?.world.sites[id - 1]?.code ?? "?";
  const linkName = (link: Link): string => `${code(link.a)}–${code(link.b)}`;
  const event = (key: string, values: Record<string, string | number>): string => fill(text.events[key] ?? key, values);
  const reasonText = (reason: Reason): string => text.reasons[reason] ?? reason;
  const appliedTogether = (count: number): string => `${count} pending change${count === 1 ? "" : "s"} applied together.`;

  // --- the run --------------------------------------------------------------------------

  const onEvents = (events: StepEvents): void => {
    if (!game) return;
    const world = game.world;
    for (const id of events.siteAppeared) say(event("appeared", { site: code(id), seconds: tuning.graceSec }));
    for (const id of events.siteActivated) say(event("active", { site: code(id) }));
    if (events.linkCut !== null) {
      const link = linkById(world, events.linkCut);
      if (link) {
        say(event("cut", { link: linkName(link) }), "fail");
        const a = world.sites[link.a - 1]!;
        const b = world.sites[link.b - 1]!;
        const startMs = performance.now();
        game.effects = game.effects.filter((e) => startMs - e.startMs < RIPPLE_MS);
        const at = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, startMs, step: world.step };
        game.effects.push({ kind: "spark", ...at }, { kind: "ripple", ...at });
      }
    }
    if (events.linkRestored !== null) {
      const link = linkById(world, events.linkRestored);
      if (link) say(event("restored", { link: linkName(link) }));
    }
    if (events.routesChanged || events.siteActivated.length > 0) {
      const now = new Set(activeSites(world).filter((s) => isDark(world, s.id)).map((s) => s.id));
      for (const id of now) if (!dark.has(id)) say(event("dark", { site: code(id) }), "fail");
      dark = now;
    }
    if (events.over) endRun();
  };

  const onRejected = (reason: Reason, _command: Command): void => say(reasonText(reason), "warn");

  const startRun = (seed: string): void => {
    game = new Game(seed, region, tuning, { onEvents, onRejected });
    game.bot = switches.bot;
    game.speed = switches.speed;
    lapse = null;
    dark = new Set();
    userMoved = false;
    // The bars are shown and filled before the map is framed, because the framing leaves
    // their real height free.
    show(el("hud"), true);
    show(el("controls"), true);
    updateHud(game);
    fitCamera();
    inspector.reset();
    inspector.close(false);
    linkPanel.close();
    clearMessages();
    screens.hideWelcome();
    screens.hideGameOver();
    screen = "run";
    app.dataset.screen = "run";
    overlay.focus();
    say(event("start", { count: presentSites(game.world).length, seconds: tuning.graceSec }));
    refreshUi();
  };

  const lapseNote = (): string => {
    if (!lapse) return "Reduced motion is on, so the time-lapse waits until you start it.";
    const S = tuning.stepsPerSec;
    return lapse.playing
      ? `Time-lapse: ${formatTime(lapse.world.step, S)} of ${formatTime(lapse.total, S)}. It is the recorded run simulated again, not a video.`
      : "Time-lapse finished. It is the recorded run simulated again, not a video.";
  };

  const startLapse = (): void => {
    if (!game) return;
    lapse = { world: createWorld(game.seed, region, tuning), next: 0, total: game.world.step, playing: true };
  };

  const endRun = (): void => {
    if (!game || screen !== "run") return;
    screen = "over";
    app.dataset.screen = "over";
    linkPanel.close();
    reward.sync(false);
    game.drag = null;
    game.linkStart = null;
    // A run the scripted player played is not the player's score.
    if (!game.bot) {
      const saved = saveScore(store, { score: game.world.delivered, steps: game.world.step, seed: game.seed }).saved;
      if (!saved) say(reasonText("no-storage" as Reason), "warn");
    }
    if (!reduced()) startLapse();
    updateHud(game);
    screens.showGameOver(game, lapseNote());
  };

  const showWelcome = (seed: string | null): void => {
    screen = "welcome";
    app.dataset.screen = "welcome";
    game = null;
    lapse = null;
    show(el("hud"), false);
    show(el("controls"), false);
    show(el("status"), false);
    inspector.close(false);
    linkPanel.close();
    reward.sync(false);
    clearMessages();
    screens.hideGameOver();
    userMoved = false;
    fitCamera();
    screens.showWelcome(seed, loadScores(store), store !== null, motion);
  };

  // --- player actions -------------------------------------------------------------------

  const layLink = (a: SiteId, b: SiteId): void => {
    if (!game) return;
    const from = game.planned.sites[a - 1];
    const to = game.planned.sites[b - 1];
    const length = from && to ? linkLength(from, to) : 0;
    const reason = game.issue({ type: "layLink", a, b });
    if (reason === "not-enough-fiber") {
      say(`${reasonText(reason)} It needs ${km(length)} and you have ${km(game.planned.fiberKm)}.`, "warn");
    } else if (reason) {
      say(reasonText(reason), "warn");
    } else {
      const laid = event("laid", { link: `${code(Math.min(a, b))}–${code(Math.max(a, b))}`, km: length.toLocaleString("en-US") });
      say(game.holding ? `${laid} ${text.events.pending ?? ""}` : laid);
    }
    refreshUi();
  };

  const siteChosen = (id: SiteId): void => {
    if (!game || screen !== "run") return;
    if (game.linkStart === null) {
      game.linkStart = id;
      game.tableSite = id;
    } else {
      const from = game.linkStart;
      game.linkStart = null;
      layLink(from, id);
    }
    refreshUi();
  };

  const openLink = (id: LinkId): void => {
    if (!game || screen !== "run") return;
    linkPanel.open(id, game.tool);
  };

  const togglePause = (): void => {
    if (!game || screen !== "run" || game.world.rewardPending || screens.aboutOpen) return;
    const pausing = !game.paused;
    const waiting = game.pending.length;
    game.setPaused(pausing);
    if (pausing && window.innerWidth >= 900 && !inspector.isOpen) inspector.open(false);
    if (!pausing && waiting > 0) say(appliedTogether(waiting));
    refreshUi();
  };

  const toggleInspector = (moveFocus: boolean): void => {
    if (!game || screen === "welcome") return;
    if (inspector.isOpen) inspector.close(moveFocus);
    else inspector.open(moveFocus);
  };

  const setTool = (tool: Tool): void => {
    if (!game) return;
    game.tool = tool;
    if (linkPanel.linkId !== null) linkPanel.open(linkPanel.linkId, tool);
    refreshUi();
  };

  const escape = (): void => {
    if (screens.aboutOpen) screens.hideAbout();
    else if (linkPanel.isOpen) linkPanel.close();
    else if (game && game.linkStart !== null) game.linkStart = null;
    else if (inspector.isOpen) inspector.close(true);
    refreshUi();
  };

  // --- screens and panels ---------------------------------------------------------------

  const current = (): Game | null => game;
  const linkPanel = new LinkPanel(current, text, code);
  const inspector = new Inspector(current, {
    siteChosen,
    linkChosen: openLink,
    focusSite: (id) => {
      if (game) game.focusSite = id;
    },
    focusLink: (id) => {
      if (game && !linkPanel.isOpen) game.focusLink = id;
    },
  });
  const reward = new RewardDialog(tuning, (choice) => {
    if (!game) return;
    const waiting = game.pending.length;
    const reason = game.issue({ type: "chooseReward", choice });
    if (reason) {
      say(reasonText(reason), "warn");
      return;
    }
    const taken = choice === "fiber" ? `Reward taken: ${km(tuning.rewardFiberKm)} of fiber.` : "Reward taken: one capacity upgrade.";
    say(waiting > 0 ? `${taken} ${appliedTogether(waiting)}` : taken);
  });
  let pausedForAbout = false;
  const screens = new Screens(text, tuning.stepsPerSec, {
    start: startRun,
    motionChanged: (setting) => {
      motion = setting;
      saveMotion(store, setting);
    },
    aboutClosed: () => {
      if (pausedForAbout && game) game.setPaused(false);
      pausedForAbout = false;
    },
    newRun: () => showWelcome(game?.seed ?? null),
    again: () => {
      if (game) startRun(game.seed);
    },
    replay: startLapse,
  });
  el("btn-about-run").addEventListener("click", () => {
    // Reading about the model stops the clock.
    if (game && screen === "run" && !game.paused && !game.world.rewardPending) {
      game.setPaused(true);
      pausedForAbout = true;
    }
  });

  const pointerClick = (handler: () => void) => (e: MouseEvent): void => {
    handler();
    // After a click with a pointer, keys go back to the map, so Space pauses again.
    if (e.detail > 0) overlay.focus();
  };
  el("btn-pause").addEventListener("click", pointerClick(togglePause));
  el("btn-inspector").addEventListener("click", (e) => toggleInspector(e.detail === 0));
  for (const button of document.querySelectorAll<HTMLButtonElement>(".tool")) {
    button.addEventListener("click", pointerClick(() => setTool(button.dataset.tool as Tool)));
  }

  attachInput(overlay, {
    game: () => (screen === "run" ? game : null),
    scene: () => scene,
    camera,
    layLink,
    siteChosen,
    openLink,
    togglePause,
    toggleInspector: () => toggleInspector(true),
    setTool,
    escape,
    moved: () => {
      userMoved = true;
    },
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && game && screen === "run" && !game.paused && !game.world.rewardPending) {
      game.setPaused(true);
      say("Paused while the page was hidden.");
      refreshUi();
    }
  });
  window.addEventListener("resize", resize);
  // The framing leaves room for the HUD as measured. When a typeface arrives after that, the
  // HUD can wrap differently, so the map is framed again unless the player has moved it.
  document.fonts.addEventListener("loadingdone", () => {
    if (!userMoved) fitCamera();
  });

  // --- drawing and the frame loop -------------------------------------------------------

  function refreshUi(): void {
    if (!game || screen === "welcome") return;
    updateHud(game);
    updateStatus(game, code);
    // Once a choice is made the dialog goes at once, though the choice applies at the next step.
    reward.sync(screen === "run" && game.world.rewardPending && !game.rewardChosen && !game.bot);
    if (inspector.isOpen) inspector.refresh();
    if (linkPanel.isOpen) linkPanel.refresh();
    if (screen === "over") screens.setLapseNote(lapseNote());
  }

  const draw = (nowMs: number): void => {
    const running = screen === "run" && game !== null;
    const world = screen === "over" && lapse ? lapse.world : (game?.world ?? null);
    scene = buildScene(world, {
      camera,
      coast,
      alpha: running ? game!.alpha : 0,
      nowMs,
      unit,
      paused: running && game!.paused,
      reducedMotion: reduced(),
      projected: running ? game!.projected : null,
      drag: running ? game!.drag : null,
      focusSite: running ? game!.focusSite : null,
      focusLink: running ? game!.focusLink : null,
      linkStart: running ? game!.linkStart : null,
      effects: running ? game!.effects : [],
    });
    const drawn = renderer.draw(scene);
    const over: OverlayReport = drawOverlay(overlayContext, scene, palette, dpr);
    report = { ...drawn, ...over };
  };

  let last = 0;
  let lastUi = 0;
  const work: number[] = [];
  const gaps: number[] = [];
  const frame = (nowMs: number): void => {
    const began = performance.now();
    const elapsed = last === 0 ? 0 : nowMs - last;
    last = nowMs;
    if (elapsed > 0) {
      gaps.push(elapsed);
      if (gaps.length > 240) gaps.shift();
    }
    if (renderer.failed) {
      // The WebGL context was lost. Carry on in the fallback renderer.
      renderer = fallbackRenderer();
      resize();
    }
    if (screen === "run" && game) game.tick(elapsed);
    if (screen === "over" && game && lapse?.playing) {
      const stride = Math.max(1, Math.ceil(lapse.total / (60 * 8)));
      lapse.next = advanceWithLog(lapse.world, game.log, lapse.next, Math.min(lapse.total, lapse.world.step + stride));
      if (lapse.world.step >= lapse.total || lapse.world.over) lapse.playing = false;
    }
    draw(nowMs);
    if (nowMs - lastUi >= 100) {
      lastUi = nowMs;
      refreshUi();
    }
    work.push(performance.now() - began);
    if (work.length > 240) work.shift();
    window.requestAnimationFrame(frame);
  };

  // --- test hook (contracts/ui.md). It reads the world; it never changes rules. ---------

  if (switches.test) {
    const hook = {
      state: () => ({
        screen,
        seed: game?.seed ?? null,
        step: game?.world.step ?? 0,
        stepsPerSec: tuning.stepsPerSec,
        score: game?.world.delivered ?? 0,
        emitted: game ? game.world.nextPacketId - 1 : 0,
        dropped: game ? { ...game.world.dropped } : { queue: 0, cut: 0, noRoute: 0 },
        meter: game?.world.meter ?? 0,
        meterSize: tuning.meterSize,
        fiberKm: game?.world.fiberKm ?? 0,
        plannedFiberKm: game?.planned.fiberKm ?? 0,
        upgrades: game?.world.upgrades ?? 0,
        paused: game?.paused ?? false,
        pending: game?.pending.length ?? 0,
        pendingCommands: (game?.pending ?? []).map((c) => c.type),
        over: game?.world.over ?? false,
        rewardPending: game?.world.rewardPending ?? false,
        renderer: renderer.name,
        reducedMotion: reduced(),
        speed: game?.speed ?? 1,
        logLength: game?.log.length ?? 0,
        lapse: lapse ? { step: lapse.world.step, total: lapse.total, playing: lapse.playing, score: lapse.world.delivered } : null,
      }),
      sites: () => (scene?.sites ?? []).map((s) => ({ id: s.id, code: s.code, x: s.x, y: s.y, state: s.state })),
      scene: () => ({
        sweep: scene?.sweep !== null && scene?.sweep !== undefined,
        pulses: scene?.pulses.length ?? 0,
        trails: (scene?.pulses ?? []).filter((p) => p.tx !== p.x || p.ty !== p.y).length,
        effects: (scene?.effects ?? []).map((e) => e.kind),
        looks: (scene?.links ?? []).map((l) => `${l.id}:${l.look}:${l.cost}:${l.tier}:${l.pending ?? "-"}`),
        siteStates: (scene?.sites ?? []).map((s) => `${s.id}:${s.state}`),
        width: scene?.width ?? 0,
        height: scene?.height ?? 0,
      }),
      links: () =>
        (scene?.links ?? []).map((l) => {
          const live = game?.world.links.find((w) => w.id === l.id);
          return {
            id: l.id,
            a: l.aId,
            b: l.bId,
            x: (l.ax + l.bx) / 2,
            y: (l.ay + l.by) / 2,
            cost: l.cost,
            pendingCost: l.pendingCost,
            tier: l.tier,
            look: l.look,
            pending: l.pending,
            km: live?.km ?? 0,
            utilAB: l.utilAB,
            utilBA: l.utilBA,
          };
        }),
      /** For each link, how many packets it holds for each source and destination pair. */
      linkLoads: () =>
        (game?.world.links ?? []).map((l) => {
          const pairs: Record<string, number> = {};
          for (const dir of l.dirs) for (const p of [...dir.queue, ...dir.wire]) pairs[`${p.src}>${p.dst}`] = (pairs[`${p.src}>${p.dst}`] ?? 0) + 1;
          return { id: l.id, a: l.a, b: l.b, pairs };
        }),
      routes: (from: number) => (game ? (game.world.routes[from] ?? {}) : {}),
      report: () => ({ ...report }),
      /** Milliseconds of work per frame over the last frames: simulation, drawing and page updates. */
      frameWork: () => {
        const sorted = [...work].sort((a, b) => a - b);
        const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
        const gap = [...gaps].sort((a, b) => a - b);
        return {
          frames: sorted.length,
          mean: sorted.reduce((n, v) => n + v, 0) / Math.max(1, sorted.length),
          p95: at(0.95),
          worst: sorted.at(-1) ?? 0,
          /** Time from one frame to the next: 16.7 ms is 60 frames per second. */
          gapMean: gap.reduce((n, v) => n + v, 0) / Math.max(1, gap.length),
          gapP95: gap[Math.min(gap.length - 1, Math.floor(gap.length * 0.95))] ?? 0,
        };
      },
      advance: (steps: number) => {
        game?.advance(Math.max(0, Math.min(100_000, Math.floor(steps))));
        refreshUi();
      },
    };
    (window as unknown as { __backbone: typeof hook }).__backbone = hook;
  }

  resize();
  if (switches.autostart) startRun(switches.seed ?? randomSeed());
  else showWelcome(switches.seed);

  // Draw once the typeface is ready, so map labels never flash in a fallback face.
  let started = false;
  const begin = (): void => {
    if (started) return;
    started = true;
    window.requestAnimationFrame(frame);
  };
  void Promise.all([document.fonts.load('500 16px "IBM Plex Mono"'), document.fonts.load('400 16px "IBM Plex Sans"')]).then(begin, begin);
  window.setTimeout(begin, 1500);
}

boot();
