# Backbone · Implementation plan

**Status:** approved by the owner on 2026-11-09 with every default accepted (Q1–Q9, D1–D6). This is a design contract for code that does not exist yet. Files, commands and versions below are proposals until built and run.

## Build target

Implement `SPEC.md` v1. First deliver the simulation with the twelve spec cases passing and no graphics. Then one complete run in the browser. Then the four must-have effects. Polish goes through the same code path.

**Hardest behavior to get right:** hop-by-hop equal-cost forwarding after a topology change (spec cases 5 and 7), kept deterministic.

**First evidence we'll check:** spec case 1 (T1, A→C costs 20 with next hops {B, D}) and case 7 (the per-hop split), as failing tests before the routing code is written.

## Stack and serving

| Choice | Reason |
| --- | --- |
| **TypeScript, strict mode** | The simulation is a state machine with many small record types. Types catch unit and ID mix-ups at compile time. |
| **Vite** as dev server and bundler | Produces a small, hashed, relative-path static bundle that works from any sub-path. |
| **No runtime dependencies** | Nothing to vendor, license or audit. The whole game is the project's own code, which suits a provenance-first example. |
| **Own renderer: WebGL2**, with a **Canvas 2D fallback** | The scene is lines, discs and additive glow. A small purpose-built renderer (instanced quads, additive blending, half-resolution blur for bloom) is lighter on a phone than a general engine, and both renderers draw from one shared view model, so the fallback cannot drift from the main view. |
| **Web Audio, synthesized** (v1.1) | No audio files to source or license. |
| **Vitest** for unit tests | Runs the pure simulation in Node with no browser. |
| **Playwright** for end-to-end tests and video | Drives real pointer and touch input at set viewport sizes and records video natively. |
| **Seeded PRNG in the simulation; fixed simulation step** | Determinism (R13). Rendering interpolates between steps; the simulation never reads the clock. |

Considered and not chosen: **PixiJS** (good 2D engine, but adds a large dependency and a second code path for the tilt and bloom we want to control), **Three.js** (used by Per-Hop Works for 3D; more than a flat map needs), **no build step with plain ES modules** (matches the StarterKit default, but the owner asked for a build output folder, and TypeScript needs a compile step anyway).

Exact versions are pinned when installed, committed in the lockfile, and recorded in `PROVENANCE.md`. None is asserted here.

### How `static_root` is produced

```sh
npm ci            # developers only
npm run build     # type-check, then Vite build → dist/
```

`dist/` is the build output and the Arcade `static_root`. It contains `index.html`, hashed JS and CSS, fonts, the region data and the card image, all with relative URLs.

**`dist/` is committed** on release commits, so a player or the Arcade host needs no install:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

A `npm run verify:dist` check rebuilds into a temporary folder and fails if it differs from the committed `dist/`, so the committed output cannot silently drift from the source. (Alternative if the owner prefers: keep `dist/` out of git and publish it with GitHub Pages; then `hosted_url` is filled and `requires_install` stays false for players. Decision D1 below.)

## Proposed files and responsibilities

```text
StarterKit/CONSTITUTION.md SPEC.md PLAN.md   Spec artifacts (this shape, from the workshop StarterKit)
tasks.md                 Task list generated from the slices below after approval
ARCADE.md                Arcade submission, filled at the end from PROVENANCE.md
PROVENANCE.md            Kept from session one
README.md                StarterKit README shape; status kept honest
LICENSE                  Owner's choice (D3)
docs/PID.md              Owner's project initiation document
docs/capture-log.md      Build log: timeline, steps, gotchas, Q&A, open items
docs/runbook.html        Self-contained build book generated from the log at each milestone
docs/verification/       Test reports and the seeded-run videos
src/sim/                 PURE LOGIC. No DOM, clock, Math.random, or renderer imports.
  rng.ts                 Seeded generator
  topology.ts            Sites, links, costs, capacity tiers, up/down state
  spf.ts                 Shortest-path tree and next-hop sets per router (F1–F6)
  forwarding.ts          Per-router, per-destination next-hop choice (R2)
  linkq.ts               Per-direction service, queue, drop (R4–R6)
  world.ts               createWorld(seed, region, tuning); step(world, commands); traffic (R3), events
                         (R10, R11), drop meter and score (R7, R12), validated commands. As built, these
                         live in one file: they share the world state and were clearer together.
  replay.ts              Command log; re-simulation for the time-lapse (R14)
  bot.ts                 Simple scripted player for tests, video and (later) attract mode
src/content/             Region file (sites, coastline), tuning constants, palette, model-notes text
src/render/              viewmodel.ts (world → drawable list), camera.ts (tilt, zoom, pan, hit-testing),
                         gl/ (WebGL2), canvas2d/ (fallback)
src/ui/                  HUD, inspector table, link options, reward choice, screens, input (pointer, touch, keys)
src/main.ts              Wire-up and frame loop
tests/unit/              Spec cases, oracle comparison, determinism, meter, score, commands
tests/fixtures/ospf-cases.json   Spec cases 1–12 as data, copied from SPEC.md, never generated by the engine
tests/e2e/               Playwright runs at phone and desktop sizes
tools/                   build-coast (map data), record-run (videos), make-card (card image), verify-dist, frr_check (FRR comparison),
                         bot-runs (tuning aid), shot (screenshots). The palette check is a unit test, not a tool.
dist/                    Build output = static_root
```

## Simulation contract

```text
createWorld(seed, region, tuning) → World
step(world, commands[]) → StepEvents        advances exactly one fixed step
computeRoutes(topology, maxPaths) → for each router, for each destination:
    { cost, nextHops[] }                    or unreachable
hash(world) → string                        for determinism checks
```

- `step` is the only function that advances time. Same world and commands in, same world out.
- `computeRoutes` runs Dijkstra from each router with integer costs and collects every equal-cost next hop (F3). `maxPaths = 1` keeps the lowest router-ID next hop (F4, S7). All iteration is in router-ID order.
- Routes are recomputed inside `step` whenever a command or event changes a link's existence, state or cost, before any packet is forwarded in that step (R1).
- Player input reaches the world only as commands (`layLink`, `removeLink`, `setCost`, `upgrade`, `chooseReward`), validated against the rules. A rejected command returns a reason code that the UI turns into text (AC5, case 10).
- The renderer reads the world and the step events. It writes nothing back.

### Independent checks on routing (constitution C1)

1. **Hand-worked fixtures.** Spec cases 1–12, stored as data copied from the spec.
2. **Brute-force oracle.** A separate test-only function enumerates every simple path on small seeded random graphs and derives cost and first hops. The engine must agree on every pair. It shares no code with `spf.ts`.
3. **Per-hop split check.** Push N packets through T2 and count per link against case 7.
4. **Optional, decision D4: a real OSPF implementation.** Build T1 and T2 as FRR routers in ContainerLab, read `show ip route ospf json`, and compare next hops with the engine. This is a control-plane check against real software, recorded in `PROVENANCE.md` if run.

## Tuning constants (starting values, not rules)

Set in one data file and adjusted by playing seeded bot runs until a typical run lasts 5 to 10 minutes.

| Constant | Start value |
| --- | --- |
| Simulation step | 50 ms (20 steps per second) |
| Default link cost / UI range | 10 / stepper by ones, any 1–65535 by typing |
| Capacity tiers | 4, 8, 16 packets per second per direction |
| Queue length | 8 packets per direction |
| Congestion threshold | 90% utilization over a 2 s window |
| Drop meter | 100 drops to fill; drains 1 per second after 3 s without a drop |
| Reward interval | every 60 s; +3,000 km of fiber or +1 upgrade |
| New-site grace period | 20 s (was 15 s before tuning) |
| Sites | 3 at the start, one more every 40 s, 12 per run from a pool of 18 |
| Starting budget | 8,000 km of fiber, 1 upgrade |
| Traffic | 0.5 packets/s per site at weight 1, growing by 0.2 per minute |
| Fiber cuts | first after 150 s, then every 50–80 s; 12–25 s each (was 90 s and 20–40 s before tuning) |

The values above are the ones in `src/sim/world.ts` after tuning on eight seeds with the scripted player, which then lost in 2:50 to 6:26, mostly to congestion. How long a human run lasts has not been measured.

## Interaction and visual direction

- One camera model owns tilt, zoom and pan, and converts both ways between screen and map coordinates, so touch targets stay correct on the tilted map. Hit areas for sites and links are at least 44 CSS pixels.
- Layers back to front: grid, coastline, scanning sweep, links, pulses and trails, sites, labels, HUD. Parallax applies to the first three only.
- Link width and brightness are continuous functions of utilization. State cues follow the spec's second-cue list. A build-time script fails if any color in the palette file falls in a green or red hue band.
- HUD, inspector and menus are DOM elements over the canvas: real buttons, real focus, real text for assistive technology and for large stage type.
- Reduced motion: follows the system setting by default, with an in-game switch.
- Fallback: if a WebGL2 context cannot be created, the Canvas 2D renderer is used; a URL switch forces it for testing.
- Typeface: one openly licensed family with a monospace companion, self-hosted. The visual mock uses system fonts; the family is still to be chosen with the owner. Its license file is committed and recorded.
- Coastline: Natural Earth public-domain data, simplified by a build script into a small region file. Recorded in `PROVENANCE.md` when used.

## Implementation order

| Slice | Deliverable | Evidence before the next slice |
| --- | --- | --- |
| 0 · Approval gates | Owner approves these three files. Then a **static visual mock** of the play screen at phone and desktop sizes; owner approves it. | Owner's approval recorded in the capture log |
| 1 · Prove the routing | `spf.ts`, `forwarding.ts`, fixtures, oracle | Cases 1–8, 10 pass; oracle agrees on seeded random graphs |
| 2 · Prove the run | Traffic, links, drops, meter, events, score, commands, replay, bot | Cases 9, 11, 12 pass; a headless bot run ends with a score; determinism hash stable |
| 3 · One playable run | Canvas 2D renderer, input, HUD, pause and inspector, reward choice, game over | A seeded run played start to game over in a browser at both sizes |
| 4 · The four effects | WebGL2 renderer: pulses with trails, load-scaled links, cut spark and ripple, bloom | Side-by-side with the mock; frame-time measurement recorded |
| 5 · Around the run | Welcome screen, hero art and card image, high scores, time-lapse, reduced motion, model-notes panel, keyboard play | AC1–AC23 each recorded pass / fail / not run |
| 6 · Package | End-to-end tests, seeded-run videos at both sizes, `dist/`, README, `ARCADE.md` (consent left false) | Fresh-clone run from `dist/`; videos saved in `docs/verification/` |

`tasks.md` is generated from these slices and the acceptance criteria after approval. If time runs short, cut from the bottom of slice 5 upward, never from slices 1–2.

## Verification and reporting

| Check | Tool | Establishes |
| --- | --- | --- |
| Spec cases 1–12 | Vitest, fixtures from the spec | Path selection, equal-cost splits, reconvergence, overload, scoring |
| Oracle comparison | Vitest, brute-force enumeration | Routing is right beyond the hand cases |
| Determinism | Vitest, world hash per step across two runs | R13 |
| Purity | Lint rule and test: `src/sim` imports nothing from DOM, render, ui | C5 |
| Full run, phone 844×390 and desktop 1920×1080 | Playwright with real pointer and touch events | The game is playable start to game over |
| No-WebGL and reduced-motion runs | Playwright with the fallback switch and the reduced-motion media setting | AC19, AC20 |
| Keyboard-only run | Playwright | AC17 |
| Palette | `tools/check-palette` | AC18 |
| Frame time | In-page measurement on the owner's phone, recorded by hand | 60 fps target; **cannot be proven by the agent on a real mid-range phone** |
| Card image | Script checks 16:9 and size under 1 MB | Arcade requirement |
| `dist/` matches source | `npm run verify:dist` | The committed build is the real build |
| Seeded-run videos | `tools/record-run` (Playwright video, converted with ffmpeg) at both sizes | Final verification the owner can watch |

The seeded video uses a fixed seed and the scripted bot, at a faster simulation speed so that start to game over fits in about two minutes. The speed is a multiple of the same fixed step, so the run is identical to the real-time run.

Results are recorded in the README's verification table as pass, fail or not run, with date and environment, and each step is logged in `PROVENANCE.md`.

## Arcade field map

Every `ARCADE.md` field and where its truthful value will come from.

| Field | Source |
| --- | --- |
| `game.*` | `SPEC.md`; `levels: 1`; `category: routing`; `card_image` checked by script |
| `game.repo`, `license` | Owner (D2, D3) |
| `creator.*`, `consent_to_publish` | **Owner only.** The agent leaves consent `false`. |
| `build.started` | `unknown` unless the owner can supply it; the first recorded timestamp is noted in `PROVENANCE.md` |
| `build.finished`, `wall_time` | Recorded at the end; `unknown` if sessions are not continuous |
| `build.spec_driven` | `custom` in the StarterKit shape, or Spec Kit and its version if D5 chooses it; `artifacts` lists only files that exist |
| `build.model`, `harness`, `harness_version`, `helper_models` | `PROVENANCE.md` |
| `build.mcp_servers`, `rag_and_sources`, `skills_and_plugins`, `other_tools` | `PROVENANCE.md` tables |
| `build.human_prompts` | Counted in `PROVENANCE.md`; `unknown` if the count is lost |
| `build.usage` | `unknown` unless the harness reports it; never estimated |
| `build.ai_generated_assets` | `PROVENANCE.md` |
| `runtime.*` | Confirmed by running the game from `dist/` once before finishing |
| `verification.*` | Test command and count from the last run; RFCs from `PROVENANCE.md`; `known_limits` from the spec's simplified table |

## Decisions (resolved: the owner accepted every default on 2026-11-09)

| # | Decision | Default |
| --- | --- | --- |
| D1 | Commit `dist/` (with the drift check), or publish with GitHub Pages instead | Commit `dist/` |
| D2 | Repository: this folder is named `FrameStack`, has no remote and no commits, is on `master`, and holds a PyCharm Python stub (`pyproject.toml`, `.venv`, and `.idea/` files already staged). Proposed: public repo named `backbone`, branch `main`, `.idea/` and `.venv/` ignored and unstaged, `pyproject.toml` removed. The agent will not change git state or delete files until told. | As proposed |
| D3 | License | Apache-2.0, matching the workshop repo, with attribution for the adapted StarterKit files |
| D4 | Run the optional FRR/ContainerLab comparison | Yes, if Docker is available at that point |
| D5 | Spec framework: keep these three hand-written files plus `tasks.md` ("custom"), or run GitHub Spec Kit (CLI 1.2.2 is installed) over them as the workshop does, which needs the agent session restarted after `specify init` | Custom, to keep one continuous session and provenance record |
| D6 | `PROVENANCE.md` lists every connected MCP server by name, including unused ones such as the Nautobot and NetBox servers. Keep the names, or list unused servers as a count? | Keep the names |

## Scope controls

No backend, accounts, online leaderboard, runtime AI, editor, or analytics. No campaign, equal-cost tool, maintenance windows, sound, attract mode or generated maps in v1 unless the owner moves them in. If time runs short, propose the smallest coherent cut to the spec and update the tasks. Skipped checks stay visible.

Security review against the owner's secure-build standard happens when dependencies and any CI are added. The game has no backend, authentication, secrets or user data; the relevant areas are dependency pinning and the build pipeline.
