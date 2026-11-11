# Implementation Plan: Backbone, first playable version (v1)

**Branch**: `speckit-rebuild` (feature directory `specs/001-backbone-first-playable`) | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-backbone-first-playable/spec.md`, and the approved input plan `StarterKit/PLAN.md`

**Note**: This file was filled in by the `/speckit-plan` command. It is a design contract for code that does not exist yet on this branch. Files and commands below are proposals until built and run.

## Summary

Build the game the spec describes as static files with no runtime dependency. First deliver the simulation, with the twelve spec cases passing and no graphics. Then one complete run in the browser. Then the four must-have effects. Polish goes through the same code path.

The simulation is pure, deterministic logic that advances in fixed steps from a seed and a list of player commands. Two renderers draw the same view model, so the fallback cannot drift from the main view. Every tuning number, color, region and piece of explanatory text lives in a data file.

**Hardest behavior to get right:** hop-by-hop equal-cost forwarding after a topology change (cases 5 and 7), kept deterministic.

**First evidence checked:** case 1 (T1, A→C costs 20 with next hops {B, D}) and case 7 (the per-hop split), as failing tests before the routing code is written.

## Technical Context

**Language/Version**: TypeScript 7.0.2, strict mode, compiled for browsers that support ES2022 modules. Node 26.3.1 and npm 11.16.0 for build and tests.

**Primary Dependencies**: none at run time. Build-time only, each pinned to an exact version: Vite 8.3.7 (dev server and bundler), Vitest 5.1.0 (unit tests), @playwright/test 1.65.0 (end-to-end tests and video), @fontsource/ibm-plex-sans and @fontsource/ibm-plex-mono 5.3.0 (font files copied into the build), @types/node 26.6.6. Versions were read from the npm registry on 2026-11-10 and are confirmed from the lockfile after install.

**Storage**: the browser's local storage, for the five best scores and the reduced-motion setting. Nothing else is stored and nothing is sent anywhere.

**Testing**: Vitest for the simulation and the data checks, in Node with no browser. Playwright with Chromium for full runs, input methods, the fallback renderer, reduced motion, the color census and the videos. An optional comparison with FRR routers in Docker for the routing cases.

**Target Platform**: browsers with ES2022 modules. WebGL2 when available, Canvas 2D otherwise. Verified in Chromium only (spec clarification of 2026-11-10).

**Project Type**: static single-page web application (a game). No server component.

**Performance Goals**: 60 frames per second on a mid-range phone (target; measured by the owner). The simulation runs at 20 fixed steps per second and the renderer interpolates between steps.

**Constraints**: plays offline from plain files; no account, backend, model or API key; simulation deterministic from seed and commands; no authored color in the green or red hue bands; every refusal explained in text.

**Scale/Scope**: 12 sites per run from a pool of 18, at most 66 links, a few hundred packets in flight. Five user stories, 26 acceptance criteria, 12 hand-worked cases.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution is `.specify/memory/constitution.md`, version 1.1.0. Each principle is listed with the evidence it requires and where this plan produces it.

| Principle | Evidence required | Produced by | Gate |
| --- | --- | --- | --- |
| C1 Technical truth | Hand-worked cases in the spec before code; independent brute-force oracle; an RFC section for every "faithful" claim; review of all shipped explanatory text | Cases 1–12 are in the spec and become `tests/fixtures/ospf-cases.json` before `spf.ts` exists. `tests/unit/oracle.test.ts` enumerates simple paths and shares no code with `spf.ts`. The spec's F table cites a section per row. `src/content/text.json` is reviewed row by row against the two tables and a test checks it covers F1–F8 and S1–S11. Optional: FRR comparison. | Pass |
| C2 Shaping, then watching | A tester states which link heated up and why, using only the game | Costs on the map, the pause inspector with link, site and route tables (AC13, AC26). The tester check needs a person and is recorded as not run until done (SC-011). | Pass; one item needs a person |
| C3 Growth, not reflexes | A full run with every decision made while paused; a determinism replay test | End-to-end run that pauses before every command. `tests/unit/world.test.ts` replays a recorded run to an identical hash at every step. | Pass |
| C4 Access | Keyboard-only run; phone-viewport run; reduced-motion run; forced no-WebGL run; scripted no-green/no-red check | Five Playwright scenarios. `tests/unit/palette.test.ts` for authored colors. A census of full-page screenshots in both renderers, reported as a number. | Pass |
| C5 Deterministic, self-contained | Build output plays offline from a plain static server in a clean profile; simulation uses nothing from the DOM, renderer, clock or `Math.random` | Playwright run against `dist/` with every non-local request blocked and counted. `tests/unit/purity.test.ts` scans `src/sim` for imports outside it and for the forbidden globals. | Pass |
| C6 Content and logic separate | Trace one packet by hand from a region file; add a trial region without editing the simulation | `src/content/*.json` holds region, tuning, palette and text. A written trace in `docs/verification/`. `tests/unit/content.test.ts` runs the unchanged simulation on `tests/fixtures/region-trial.json`. | Pass |
| C7 Done is demonstrated | Reproducible run and test commands; recorded results; seeded-run videos at both sizes in the repo; a README another engineer can follow | `quickstart.md` commands; results recorded as pass, fail or not run in the README and `docs/verification/`; `tools/record-run.mjs`; a fresh-clone check of the README. | Pass |

**Result before research:** no violation. Complexity Tracking is empty.

**Re-check after design (Phase 1):** no violation. Two design choices were made specifically to hold a principle: the tuning constants moved out of the simulation into a data file (C6), and the purity scan covers globals as well as imports (C5). Both are listed under contradictions below.

## Contradictions Resolved

The lab asks for contradictions to be resolved explicitly. Each row names the two statements and the choice made.

| # | Contradiction | Resolution |
| --- | --- | --- |
| P1 | The input plan's as-built note keeps the tuning values in `src/sim/world.ts`. Constitution C6 says tuning constants live in data files. | `src/content/tuning.json` holds every tunable. The simulation has no default tuning; `createWorld` requires it as an argument. |
| P2 | The input plan's purity check covers imports from DOM, render and ui. C5's evidence also names the clock and `Math.random`, which are globals an import check cannot see. | The purity test scans every file in `src/sim` for imports from outside `src/sim` and for the identifiers `document`, `window`, `navigator`, `Date`, `performance`, `Math.random`, `setTimeout`, `setInterval`, `requestAnimationFrame` and `crypto`. |
| P3 | The input plan calls the palette check both a build-time script (`tools/check-palette`) and "a unit test, not a tool". | It is a unit test, `tests/unit/palette.test.ts`, so it runs with every `npm test`. There is no separate tool. |
| P4 | The input plan lists the default link cost under tuning constants. The spec states "New links get cost 10" as part of the model shown to the player (S6, FR-015). | Cost 10 is a rule. It is a named constant in the simulation, not in `tuning.json`, and a test asserts it. |
| P5 | The input spec says the seed decides the reward offers. The input plan's tuning gives one offer. | Follows the spec's clarification: every v1 offer is the same two choices. Flagged for the owner as K6. |
| P6 | Input decision D5 chose "custom" spec files. The owner later chose Spec Kit (`docs/PID.md` amendment 1.3). | Spec Kit. `tasks.md` lives in this feature directory, not at the repository root. |
| P7 | The lab guide and the input plan serve the game on port 8000. On this machine port 8000 belongs to another service, and port 8765 still serves the hand-built v1 from the main checkout. | Commands in the README and `quickstart.md` use port 8791 and say any free port works. The end-to-end tests start their own server and refuse to reuse one that is already running. |
| P8 | Spec Kit's tasks template groups work by user story, and story 1 includes the pulses. C7 puts routing correctness and the core loop before any visual effect. | The simulation, with all twelve cases passing and no graphics, is the Foundational phase that blocks every story. The four effects are the last story-level work. |
| P9 | The input plan's frame-time check is done on the owner's phone. The agent cannot do it. | Recorded as not run (SC-012). The agent records a desktop frame-time figure separately and does not call it the phone result. |
| P10 | The input plan keeps the scripted player in `src/sim/`. It is not simulation logic. | `src/sim/bot.ts` stays there because it is pure, is covered by the purity test, and the simulation never imports it. |

## Project Structure

### Documentation (this feature)

```text
specs/001-backbone-first-playable/
├── spec.md              # Feature specification (steps 2 and 3)
├── plan.md              # This file
├── research.md          # Phase 0: decisions, reasons, alternatives
├── data-model.md        # Phase 1: entities, fields, state changes
├── quickstart.md        # Phase 1: how to run and validate
├── contracts/
│   ├── simulation.md    # Simulation interface, step order, commands, events
│   ├── content.md       # Data-file shapes: tuning, region, palette, model notes
│   └── ui.md            # Controls, keys, URL switches, test hook
├── checklists/requirements.md
└── tasks.md             # Step 5 (/speckit-tasks), not created here
```

### Source Code (repository root)

```text
index.html               Page shell; Vite entry
package.json, package-lock.json, tsconfig.json, vite.config.ts, playwright.config.ts
public/                  hero.webp (welcome art and Arcade card), font licence
src/
├── sim/                 PURE LOGIC. No DOM, clock, Math.random or renderer.
│   ├── types.ts         Record types shared by the simulation
│   ├── rng.ts           Seeded generator
│   ├── spf.ts           Shortest-path tree and next-hop sets per router (F1–F6)
│   ├── forwarding.ts    Per-router, per-destination next-hop choice (R2)
│   ├── linkq.ts         Per-direction service, queue, drop, utilization (R4–R6)
│   ├── world.ts         createWorld, step, commands, traffic, events, meter, score, hash
│   ├── replay.ts        Command log and re-simulation for the time-lapse (R14)
│   └── bot.ts           Scripted player for tests, video and tuning
├── content/             DATA, plus the loader that validates it
│   ├── tuning.json      Every play-balance number
│   ├── region-na.json   Site pool: codes, names, positions, traffic weights
│   ├── coast-na.json    Simplified coastline (generated by tools/build-map.mjs)
│   ├── palette.json     Every color the game uses
│   ├── text.json        Briefing, F1–F8 and S1–S11 in plain language, messages
│   └── load.ts          Validates the files and projects positions to kilometres
├── render/
│   ├── camera.ts        Tilt, zoom, pan; screen ↔ map; hit-testing
│   ├── viewmodel.ts     World → screen-space scene (links, pulses, sites, effects)
│   ├── overlay.ts       Labels, icons and patterns, drawn the same way for both renderers
│   ├── canvas2d.ts      Fallback renderer
│   └── gl.ts            WebGL2 renderer: instanced quads, glow, bloom
├── ui/                  hud.ts, inspector.ts, linkpanel.ts, reward.ts, screens.ts,
│                        input.ts, scores.ts, settings.ts, messages.ts, styles.css
└── main.ts              Wire-up, fixed-step loop, pause, URL switches
tests/
├── fixtures/            ospf-cases.json (cases 1–12, copied from the spec), region-trial.json
├── unit/                Cases, oracle, forwarding, queue, world, replay, purity, palette, content
└── e2e/                 Playwright runs at phone and desktop sizes; census helper
tools/                   build-map.mjs, record-run.mjs, make-card.mjs, verify-dist.mjs,
                         bot-runs.ts, frr_check.py, build_runbook.py
dist/                    Build output, committed. The Arcade static_root.
docs/verification/       Recorded results, the hand trace, the seeded-run videos
```

**Names used in these documents**: the *fallback renderer* is the Canvas 2D renderer (`src/render/canvas2d.ts`); the spec calls it "a 2D renderer". The *scripted player* is `src/sim/bot.ts`, switched on with `bot=1`.

**Structure Decision**: one project at the repository root, the "single project" option of the template with a browser front end and no back end. `src/sim` is the only place rules live. `src/content` is the only place numbers, colors, regions and explanatory text live. `src/render` and `src/ui` read the simulation and never write to it except through commands.

## Stack and Serving

The stack is the one the owner approved in `StarterKit/PLAN.md`, re-checked against today's versions.

| Choice | Reason |
| --- | --- |
| TypeScript, strict mode | The simulation is a state machine with many small record types. Types catch unit and ID mix-ups at compile time. |
| Vite as dev server and bundler | Produces a small, hashed, relative-path static bundle that works from any sub-path. |
| No runtime dependencies | Nothing to vendor, license or audit. The whole game is the project's own code. |
| Own renderer: WebGL2, with a Canvas 2D fallback | The scene is lines, discs and additive glow. Both renderers draw one shared screen-space scene. |
| Vitest for unit tests | Runs the pure simulation in Node with no browser. |
| Playwright for end-to-end tests and video | Drives real pointer, touch and key input at set viewport sizes and records video. |
| Seeded generator; fixed simulation step | Determinism (R13). Rendering interpolates between steps; the simulation never reads the clock. |

### How `dist/` is produced and served

```sh
npm ci            # developers only
npm run build     # type-check, then Vite build → dist/
python3 -m http.server 8791 --bind 127.0.0.1 --directory dist
```

`dist/` is the build output and the Arcade `static_root`. It holds `index.html`, hashed JS and CSS, fonts and the card image, all with relative URLs. `dist/` is committed (decision D1), so a player or the Arcade host needs no install. `npm run verify:dist` rebuilds into a temporary folder and fails if it differs from the committed `dist/`.

## Tuning Constants (starting values, not rules)

All in `src/content/tuning.json`. The starting values are the ones the approved input plan ended with. They are adjusted by playing seeded runs with the scripted player; final values are recorded in that file and reported in the README.

| Constant | Start value |
| --- | --- |
| Simulation step | 50 ms (20 steps per second) |
| Cost editing | Stepper by ones; any whole number 1–65535 by typing |
| Capacity tiers | 4, 8, 16 packets per second per direction |
| Queue length | 8 packets per direction |
| Utilization window | 2 s |
| Busy / congested thresholds | 50% / 90% utilization |
| Drop meter | Stated in the spec, FR-010: size 100, drain delay 3 s, drain interval 1 s |
| Reward | Every 60 s: +3,000 km of fiber, or +1 upgrade |
| New-site grace period | 20 s |
| Sites | 3 at the start, one more every 40 s, 12 per run from a pool of 18 |
| Starting budget | 8,000 km of fiber, 1 upgrade |
| Traffic | 0.5 packets/s per site at weight 1, growing by 0.2 per minute |
| Fiber cuts | First after 150 s, then every 50–80 s; each lasts 12–25 s |
| Pulse speed | 1,200 km of map per second |

The drop meter's three numbers are kept in `tuning.json` like the rest, and a test asserts that they equal the values in FR-010, so the spec and the data cannot drift apart.

## Independent Checks on Routing (C1)

1. **Hand-worked fixtures.** Cases 1–12, stored as data copied from the spec, never generated by the engine.
2. **Brute-force oracle.** A test-only function enumerates every simple path on at least 300 small seeded random graphs and derives cost and first hops. The engine must agree on every pair. It shares no code with `spf.ts`.
3. **Per-hop split check.** Push packets through T2 and count per link against case 7.
4. **Mutation check.** Disable the equal-cost branch once and confirm that tests fail.
5. **A real OSPF implementation (decision D4).** Build T1 and T2 as FRR routers in Docker, gate on every adjacency being Full and every router ID being as configured, read the routes as JSON, and compare cost and next hops with the fixtures, including after cost changes and link shutdowns.

## Interaction and Visual Direction

- One camera owns tilt, zoom and pan and converts both ways between screen and map coordinates, so touch targets stay correct on the tilted map. Hit areas for sites and links are at least 44 CSS pixels.
- Layers back to front: grid, coastline, scanning sweep, links, pulses and trails, sites, labels, HUD. Parallax applies to the first three only.
- Link width and brightness are continuous functions of utilization. State cues follow FR-033.
- HUD, inspector, link options, reward choice and screens are DOM elements over the canvas: real buttons, real focus, real text. All dynamic text is written with `textContent`.
- Keyboard play goes through the inspector's lists of sites and links, which are real buttons, with the focused item also outlined on the map.
- Reduced motion follows the system setting by default, with an in-game switch.
- Fallback: if a WebGL2 context cannot be created, the Canvas 2D renderer is used. A URL switch forces it for testing.
- Colors are never written in styles or drawing code. They come from `palette.json`, set as CSS variables at start-up and passed to the renderers.
- The approved visual mock in `mock/` is the reference for the look.

## Implementation Order

| Slice | Deliverable | Evidence before the next slice |
| --- | --- | --- |
| 1 · Prove the routing | Fixtures, oracle, `spf.ts`, `forwarding.ts` | Cases 1–7 pass; oracle agrees on seeded random graphs; mutation check fails as it should |
| 2 · Prove the run | `linkq.ts`, `world.ts`, `replay.ts`, `bot.ts`, content files and loader | Cases 8–12 pass; a headless scripted run ends with a score; hash stable across two runs; purity and content tests pass |
| 3 · One playable run | Camera, view model, Canvas 2D renderer, input, HUD, pause and inspector, reward choice, game over | A seeded run played start to game over in a browser at both sizes |
| 4 · Access | Keyboard play, touch gestures, reduced motion, messages, palette check | Keyboard-only, phone, reduced-motion and fallback runs pass |
| 5 · Endless mode around the run | Welcome screen, seeds, best scores, About the model, time-lapse | AC21–AC23 and AC26 recorded |
| 6 · The four effects | WebGL2 renderer: pulses with trails, load-scaled links, cut spark and ripple, bloom; hero art | Compared with the mock; color census recorded; desktop frame time recorded |
| 7 · Package | End-to-end suite, seeded-run videos, `dist/`, README, `ARCADE.md` (consent untouched), FRR comparison | Fresh-clone run from `dist/`; every AC recorded pass, fail or not run |

If time runs short, cut from slice 6 upward, never from slices 1–2.

In `tasks.md`, slices 1 and 2 are Phase 2 (Foundational); slice 3 is Phases 3 to 5 (User Stories 1 to 3); slice 4 is Phase 6 (User Story 4); slice 5 is Phase 7 (User Story 5); slice 6 is Phase 8; slice 7 is Phase 9.

## Verification and Reporting

| Check | Tool | Establishes |
| --- | --- | --- |
| Cases 1–12 | Vitest, fixtures from the spec | Path selection, equal-cost splits, reconvergence, overload, scoring (SC-001) |
| Oracle comparison | Vitest, brute-force enumeration | Routing is right beyond the hand cases (SC-002) |
| Determinism | Vitest, world hash per step across two runs | R13 (SC-003) |
| Purity | Vitest source scan of `src/sim` | C5 |
| Content | Vitest: region validation, trial region, model notes, tuning matches FR-010 | C6, C1 |
| Authored colors | Vitest: palette outside both bands; no color literal outside `palette.json` | FR-032a (SC-007) |
| Contrast and text size | Vitest: every text color at least 4.5 to 1 on its background. Playwright: smallest text at both sizes | FR-037 |
| Readable names | Playwright: every control on every screen has a non-empty accessible name | FR-029 |
| Full run, phone 844×390 and desktop 1920×1080 | Playwright with real touch and pointer events | The game is playable start to game over (SC-005) |
| Fallback and reduced-motion runs | Playwright with WebGL2 made unavailable (automatic fallback), with the `renderer=2d` switch, and with the reduced-motion media setting. Both renderers must report the same scene for the same step. | AC19, AC20 |
| Keyboard-only run | Playwright | AC17 |
| Offline | Playwright against `dist/` with non-local requests blocked and counted | SC-006 |
| Rendered-frame census | Playwright screenshots decoded in Node, both renderers | FR-032b, reported as a number |
| Card image | Script checks 16:9 and size under 1 MB | SC-009 |
| `dist/` matches source | `npm run verify:dist` | The committed build is the real build |
| Seeded-run videos | `tools/record-run.mjs` at both sizes | SC-005; evidence the owner can watch |
| FRR comparison | `tools/frr_check.py` with Docker | Control-plane agreement with real OSPF software |
| Frame time on a phone; tester check; a person's run length | The owner | SC-011 to SC-013; recorded as not run until done |

Results are recorded in the README's verification table as pass, fail or not run, with date and environment, and each step is logged in `PROVENANCE.md`.

## Security

The owner's secure-build standard applies in three places and is cited by rule ID in `docs/secure-build-checklist.md`: pinned dependency versions with a lockfile (SEC-27), a dependency audit after install (SEC-26), and validation of the three inputs the game accepts, namely URL switches, the typed seed and stored scores (SEC-11, SEC-12), with all dynamic text encoded at the sink (SEC-14). The game has no backend, authentication, secrets or user data. The three exceptions the owner accepted on 2026-11-09 stand.

## Scope Controls

No backend, accounts, online leaderboard, runtime AI, editor or analytics. No campaign, equal-cost tool, maintenance windows, sound, attract mode or generated maps in v1. If time runs short, the smallest coherent cut is proposed in the spec and the tasks are updated. Skipped checks stay visible.

## Complexity Tracking

No constitution violation. Nothing to justify.
