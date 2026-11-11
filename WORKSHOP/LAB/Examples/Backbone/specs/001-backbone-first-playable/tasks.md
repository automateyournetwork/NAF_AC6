---

description: "Task list for Backbone, first playable version (v1)"
---

# Tasks: Backbone, first playable version (v1)

**Input**: Design documents from `/specs/001-backbone-first-playable/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/simulation.md, contracts/content.md, contracts/ui.md, quickstart.md

**Tests**: Required. The constitution's Governance section says the checks named under each principle's Evidence are required work and that a template default marking tests as optional does not apply. For the simulation, tests are written first and must fail before the code exists (C1). For each story, its end-to-end checks are the last tasks of its phase.

**Organization**: Setup, then the simulation with no graphics (Foundational), then one phase per user story in the spec's order, then the four must-have effects, then packaging and evidence. Routing correctness and the core loop come before any visual effect (C7, plan P8). The plan's slices map to these phases as the plan's Implementation Order section says.

**A ticked task shows the task was worked. It is not evidence (C7).** Results are recorded as pass, fail or not run in `docs/verification/results.md`.

**Traceability**: every task names the requirement (FR), rule (R), acceptance criterion (AC), success criterion (SC), case or principle (C) it serves.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: The user story the task serves (US1–US5). Setup, Foundational, effects and packaging tasks have no story label.
- Paths are relative to the repository root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: An empty project that type-checks, tests and builds.

- [X] T001 Create `package.json` with exact versions and no runtime dependency (FR-039): typescript 7.0.2, vite 8.3.7, vitest 5.1.0, @playwright/test 1.65.0, @fontsource/ibm-plex-sans 5.3.0, @fontsource/ibm-plex-mono 5.3.0, @types/node 26.6.6; scripts `dev`, `build`, `test`, `test:e2e` (builds first), `verify:dist`, `record`. Run `npm install` to write `package-lock.json`, then `npm audit`, and record both results (SEC-26, SEC-27).
- [X] T002 [P] Create `tsconfig.json`: strict, ES2022, bundler module resolution, JSON modules, unchecked index access reported.
- [X] T003 [P] Create `vite.config.ts`: base `./`, output `dist/`, and the Vitest settings (Node environment, `tests/unit/**/*.test.ts`).
- [X] T004 [P] Create `playwright.config.ts`: Chromium, project `desktop` (1920×1080, mouse) and project `phone` (844×390, touch), a plain static server for `dist/` on port 8791, video off by default. Run `npx playwright install chromium` once.
- [X] T005 [P] Update `.gitignore` (dependencies, test output, the map-source cache) and create the folders `src/sim`, `src/content`, `src/render`, `src/ui`, `tests/unit`, `tests/e2e`, `tests/fixtures`, `docs/verification`.
- [X] T006 Create `index.html` (page shell, no color literal, no inline script) and a stub `src/main.ts`, and confirm `npm run build` and `npm test` both run.

---

## Phase 2: Foundational (the simulation, no graphics)

**Purpose**: Prove the routing and the run before anything is drawn. All twelve spec cases pass here (SC-001).

**⚠️ CRITICAL**: No user story work begins until this phase is complete and its checkpoint is recorded.

### Routing (C1)

- [X] T007 Copy topologies T1 and T2 and cases 1–12 from `specs/001-backbone-first-playable/spec.md` into `tests/fixtures/ospf-cases.json` as data. Expected values are typed from the spec, never produced by the engine (SC-001).
- [X] T008 [P] Write `src/sim/types.ts` with the records of `data-model.md`, quoting its rules in comments where a field has one: link `cost` "1 to 65535. 10 when laid"; `a` < `b`, "at most one link per pair"; `km` "whole number"; site `id` "1, 2, 3… in the order the run introduces its sites"; `nextHops` "sorted, at most `maxPaths` of them".
- [X] T009 [P] Write `src/sim/rng.ts` (seeded generator whose state is four whole numbers; seeded from text) and `tests/unit/rng.test.ts` (same seed gives the same sequence; whole numbers stay in range) (R13, FR-020).
- [X] T010 Write the failing routing tests in `tests/unit/spf.test.ts` from the fixtures: case 1 (A→C cost 20, next hops {B, D}), case 2, case 3 ({B, C, D}), case 4 (cost 19 via C; A→E 24), case 5 (B–C cut), case 6 (one route kept: B), and the route part of case 8 (R1, FR-001, FR-003).
- [X] T011 [P] Write the failing oracle test in `tests/unit/oracle.test.ts`: a depth-first search over every simple path on at least 300 seeded random graphs; the engine must agree on cost and first hops for every pair. The oracle shares no code with `src/sim/spf.ts` (SC-002, C1).
- [X] T012 Implement `computeRoutes` in `src/sim/spf.ts` until T010 and T011 pass (F1–F6). Then run the mutation check: disable the equal-cost branch, confirm tests fail, restore it, and record the counts in `docs/verification/results.md`.
- [X] T013 [P] Write the failing forwarding tests in `tests/unit/forwarding.test.ts`: case 7 (per-hop split on T2: S–A ½, A–T ½, S–B ½, B–C ¼, B–D ¼, C–T ¼, D–T ¼, over a multiple of 4 packets), case 3 (one third each), case 6, and hop-by-hop loop-freedom on the random graphs (R2, FR-002, F5).
- [X] T014 Implement `src/sim/forwarding.ts` (next-hop choice with one rotor per router and destination, in router-ID order) until T013 passes (R2, FR-002).

### The run

- [X] T015 [P] Write the failing queue tests in `tests/unit/linkq.test.ts`: case 9 exactly (capacity 4, queue 8, 6 offered per second for 10 s gives 40 served, 8 queued, 12 dropped, with service before arrival); an idle direction keeps at most one packet of credit; utilization over the window (R4, R5, FR-007, FR-008).
- [X] T016 Implement `src/sim/linkq.ts` (per-direction queue, service credit, wire, served and refused windows) until T015 passes (R4, FR-007).
- [X] T017 [P] Write the content data: `src/content/tuning.json` (the start values of `contracts/content.md`), `src/content/palette.json` (every color, by role, six-digit hex, taken from the approved mock in `mock/`), `src/content/text.json` (the briefing word for word, F1–F8 and S1–S11 in plain language, one sentence per reason code, control hints) (C6, FR-027, FR-028).
- [X] T018 [P] Write `tests/unit/palette.test.ts` before any drawing code exists: every color in `src/content/palette.json` is outside the green band (75° to 165°) and the red band (below 25° or above 340°) when strongly colored; no color literal appears in `src/` or `index.html` outside `palette.json`; every text color has a contrast ratio of at least 4.5 to 1 against the background roles it is used on (FR-032a, FR-037, SC-007).
- [X] T019 Write `tools/build-map.mjs`: read Natural Earth 1:50m populated places, land and lakes into a cache folder outside the commit, record their SHA-256 hashes, and write `src/content/region-na.json` (18 sites: three-letter codes, names, `lon`, `lat`, `weight` 1 to 3) and `src/content/coast-na.json`. The simplifier must handle closed rings (research R7; Q2).
- [X] T020 Write `src/content/load.ts`: validate tuning, region, palette and text against `contracts/content.md` ("`code` is three upper-case letters and unique", "`weight` is 1, 2 or 3", "at least `maxSites` sites", "six-digit hex only") and project `lon`, `lat` to kilometres. Add `tests/fixtures/region-trial.json` (C6).
- [X] T021 Write the failing world tests in `tests/unit/world.test.ts`:
  case 8 (C–E cut: E dark, "no route" drops, other routes unchanged; R6, R8, FR-009, FR-011);
  case 10 (cost 0 and 65536 rejected, hash unchanged; FR-004);
  case 11 (1,840 delivered at 6 min 05 s gives score 1,840 and time 6:05; R12, FR-019);
  case 12 (identical hash at every step, twice; R13, FR-020, SC-003);
  the worked interaction on T1 (AC3, AC4: A→C packets ride A–B–C only, then A–C only from the step after cost 19);
  the drop meter rule of FR-010 (size 100, drain delay 3 s, drain interval 1 s, a drop restarts the delay, the run ends at the step the meter reaches its size; R7);
  every command and reason code of `contracts/simulation.md` (R9, FR-012, FR-014);
  removal returns fiber in full, forfeits upgrades and drops the link's packets, and a cut link cannot be removed (FR-013, AC24, AC25);
  a cut drops the packets on the link and the link returns unchanged; no cut happens when no link is up (R11, FR-017);
  time does not advance while a reward is pending (R10, FR-016);
  routes are recomputed before the next packet is forwarded (R1, FR-001);
  the same seed offers the same traffic to two different networks (R3, FR-006);
  a new site with no link is dark when its grace period ends, and no more than `maxSites` sites ever appear (FR-018);
  a packet already on its way is dropped as "no route" at the first router with no route for it, and a cost change by itself drops nothing (spec Edge Cases).
- [X] T022 Implement `src/sim/world.ts` (`createWorld`, `step` in the contract's order of work, `validate`, `cloneWorld`, `hashWorld`, `isDark`; default link cost 10 as a named rule constant, FR-015) until T021 passes.
- [X] T023 [P] Implement `src/sim/replay.ts` and `tests/unit/replay.test.ts`: a run rebuilt from its command log equals the original at every step (R13, R14, FR-021; C3 evidence).
- [X] T024 [P] Implement `src/sim/bot.ts` (scripted player: connects new sites, adds redundancy, upgrades the busiest link, chooses rewards) and `tests/unit/bot.test.ts`: a headless run on a fixed seed ends with a score, and twice gives the same score (SC-003).
- [X] T025 [P] Write `tests/unit/purity.test.ts`: no file in `src/sim` imports from outside `src/sim`, and none contains `document`, `window`, `navigator`, `Date`, `performance`, `Math.random`, `setTimeout`, `setInterval`, `requestAnimationFrame` or `crypto` (C5, plan P2).
- [X] T026 [P] Write `tests/unit/content.test.ts`: the loader rejects bad files; `text.json` holds F1–F8 and S1–S11 exactly once each and the briefing equals the spec's sentence (FR-027, FR-028); the three meter numbers in `tuning.json` are 100, 3 and 1 (FR-010); the default cost is 10 (FR-015); the unchanged simulation runs on `tests/fixtures/region-trial.json` (C6).
- [X] T027 Write `tools/bot-runs.ts` and tune `src/content/tuning.json` on eight fixed seeds, aiming for a median scripted run of 4 to 8 minutes with queue drops as the largest cause of drops in at least six of the eight. Record the run lengths and causes before and after in `docs/verification/tuning.md` (SC-013 is a person's run and stays not run).
- [X] T028 Checkpoint: run `npm test`; record the counts in `docs/verification/results.md`; write `docs/verification/hand-trace.md`, tracing one packet by hand from `src/content/region-na.json` through the routing code (C6 evidence).

**Checkpoint**: The simulation is proven with no graphics. Story work can begin.

---

## Phase 3: User Story 1 - Shape the network and see traffic follow cost (Priority: P1) 🎯 MVP

**Goal**: Lay, cost, upgrade and remove links on the map, and watch every pulse take the lowest-cost path.

**Independent Test**: Start a seeded run, lay links, change one cost, and confirm with the test hook that pulses use only the paths the costs predict.

### Implementation for User Story 1

- [X] T029 [P] [US1] Write `src/render/camera.ts` (tilt, zoom, pan, map ↔ screen, hit-testing with targets of at least 44 CSS pixels) and `tests/unit/camera.test.ts` (round trip; hit radius) (FR-029).
- [X] T030 [US1] Write `src/render/viewmodel.ts`: turn the world, the pending copy and the interpolation fraction into a screen-space scene. One pulse per simulated packet, on the link where the packet is (FR-005, S8). Add `tests/unit/viewmodel.test.ts`: the number of pulses equals the packets on wires and each lies on its link's segment.
- [X] T031 [US1] Write `src/render/overlay.ts` (site codes, cost labels, icons; FR-030) and `src/render/canvas2d.ts` (grid, coastline, links, pulses, sites) drawing the shared scene.
- [X] T032 [P] [US1] Write `src/ui/styles.css` (no color literal; CSS variables set from `palette.json`; IBM Plex from the pinned @fontsource packages, with the licence text copied to `public/licenses/`), `src/ui/hud.ts` (fiber budget, upgrade stock, drop meter with its number, score, time, seed, pause button; FR-030, FR-022) and `src/ui/messages.ts` (text messages from `text.json`, announced politely; `textContent` only; FR-040, SEC-14).
- [X] T033 [US1] Write `src/ui/input.ts`: drag from one site to another lays a link; click or tap a link opens its options; wheel zooms; drag on empty map pans (FR-029, AC2, AC16).
- [X] T034 [US1] Write `src/ui/linkpanel.ts`: − and + and a typed cost ("whole number from 1 to 65535"), Upgrade, Remove; every refusal shown as text (AC5, AC24, AC25, FR-004, FR-012, FR-013, FR-014, FR-040).
- [X] T035 [P] [US1] Write `src/ui/reward.ts`: the reward choice (fiber or one upgrade), with no time limit (FR-016, R10).
- [X] T036 [US1] Write `src/ui/screens.ts` with a first welcome card (the briefing and Start; FR-027) and `src/main.ts`: load and validate content, the fixed-step loop with interpolation, the command queue, the URL switches `seed`, `autostart`, `speed`, `bot`, `hud`, `test` checked against fixed patterns (SEC-11, SEC-12), and the test hook of `contracts/ui.md`.

### Checks for User Story 1

- [X] T037 [US1] Write `tests/e2e/us1-shape.spec.ts`: AC1 (briefing, then the map with the first sites), AC2 (drag lays a link, fiber is spent, traffic flows), AC4 through the UI (after a cost change pulses use the new lowest-cost path), AC5 (three refusals, nothing spent, a message each), AC24 and AC25. AC3 is checked on topology T1 in T021.

**Checkpoint**: User Story 1 is playable and checked on its own.

---

## Phase 4: User Story 2 - Operate under load and failure (Priority: P1)

**Goal**: See congestion, cuts and dark sites with a second cue each; see drops fill the meter; reach game over with a score and a time-lapse.

**Independent Test**: Let the scripted player run a fixed seed to game over and compare the screen with the simulation's counts.

### Implementation for User Story 2

- [X] T038 [US2] Add load states and second cues to `src/render/viewmodel.ts`, `src/render/overlay.ts` and `src/render/canvas2d.ts`: congestion amber, thicker, patterned, warning icon; failure magenta, broken line, cut icon; dark site hollow ring, slashed icon; capacity rails beside a link; queued packets stacked at the sending end (FR-008, FR-011, FR-033, AC6, AC10).
- [X] T039 [US2] Add the cut spark and the reconvergence ripple to `src/render/viewmodel.ts` as view effects driven by step events, drawn in `src/render/canvas2d.ts` (AC9, FR-017).
- [X] T040 [US2] Add the game-over screen to `src/ui/screens.ts`: traffic delivered, time survived, seed, the time-lapse (the recorded run simulated again at high speed) and New run (AC11, FR-019, FR-021, FR-026).
- [X] T041 [P] [US2] Add event messages to `src/ui/messages.ts` and `src/ui/hud.ts`: fiber cut, repair, a site gone dark, a site appearing (AC7, AC10, FR-009, FR-018).

### Checks for User Story 2

- [X] T042 [US2] Write `tests/e2e/us2-operate.spec.ts`: a scripted run to game over; the drop meter equals the simulation's drops (AC7, FR-009, FR-010); an upgrade raises the tier and leaves the cost (AC8, FR-014); a cut link is shown cut and routes change at the next step (AC9); a dark site (AC10); the end screen with score, time and time-lapse (AC11); congestion shown with its number in the inspector (AC6).

**Checkpoint**: User Stories 1 and 2 work together.

---

## Phase 5: User Story 3 - Think without time pressure (Priority: P1)

**Goal**: Pause at any moment, read every number, queue changes, resume.

**Independent Test**: Play a run in which every decision is made while paused.

### Implementation for User Story 3

- [X] T043 [US3] Add pause to `src/main.ts`: Space, the pause button and a hidden page all pause; changes made while paused are checked against a copy of the world, shown as pending (dashed link, pending cost, budget after pending spends), and all sent in the first step after resume (FR-024, FR-025, AC12, AC14).
- [X] T044 [US3] Write `src/ui/inspector.ts`: the link table (two sites, cost, capacity, utilization in each direction, state, pending change), the site list (code, router ID, state), and the selected site's route table from the world in force, without pending changes (AC13, AC26, FR-031). Show utilization numbers on the map while paused in `src/render/overlay.ts` (FR-030).

### Checks for User Story 3

- [X] T045 [US3] Write `tests/e2e/us3-pause.spec.ts`: AC12, AC13, AC14, AC26, and a full run with every decision made while paused (C3 evidence).

**Checkpoint**: User Stories 1 to 3 work together.

---

## Phase 6: User Story 4 - Play on a phone, a laptop and a stage (Priority: P1)

**Goal**: Touch, mouse and keyboard-only play; no green and no red; reduced motion; readable controls at every size.

**Independent Test**: Complete a run by touch at phone size and by keyboard only; repeat with reduced motion; run the color, contrast, text-size and readable-name checks.

### Implementation for User Story 4

- [X] T046 [US4] Add touch gestures to `src/ui/input.ts`: pinch zooms, two-finger drag pans, tap opens a link's options (AC15, FR-029).
- [X] T047 [US4] Add keyboard play to `src/ui/inspector.ts` and `src/ui/input.ts`: site and link buttons, Enter to start and finish a link, number keys 1–4 for tools, I, Escape, + and −, arrow keys; the focused site or link outlined on the map; every control with a readable name (AC16, AC17, FR-029).
- [X] T048 [P] [US4] Write `src/ui/settings.ts`: reduced motion (`auto`, `on`, `off`), stored and validated; the `motion` and `renderer` URL switches; the renderer stops sweeps, parallax and trails when it is on (AC19, FR-034).
- [X] T049 [P] [US4] Finish the layouts in `src/ui/styles.css`: landscape as designed, portrait with a stacked HUD, no text smaller than 16 CSS pixels at 1920×1080 or 11 CSS pixels at 844×390; the layout adapts when the window is resized or rotated during a run (FR-037, spec Edge Cases).

### Checks for User Story 4

- [X] T050 [US4] Write `tests/e2e/census.ts` (decode a screenshot and report the share of strongly colored pixels in each band) and `tests/e2e/us4-access.spec.ts`: touch at 844×390 (AC15), mouse and keys at 1920×1080 (AC16), keyboard only (AC17), reduced motion (AC19), the census, reported as numbers (AC18, FR-032b), every control on every screen has a non-empty accessible name (FR-029), the smallest text size at both viewports (FR-037), and a resize during a run leaves the run unchanged. Together these are SC-008 and the C4 evidence.

**Checkpoint**: User Stories 1 to 4 work together.

---

## Phase 7: User Story 5 - Endless mode (Priority: P1)

**Goal**: Start from a typed or random seed, repeat a run, keep best scores.

**Independent Test**: Two runs from the same seed and inputs end with the same score; after a reload the best score is on the welcome screen.

### Implementation for User Story 5

- [X] T051 [US5] Finish the welcome screen in `src/ui/screens.ts`: a place for the hero art (the image itself arrives in T058; until then the live map shows behind the card), the briefing card, the seed field ("1 to 24 letters, digits or hyphens"; empty gives a random seed; anything else refused with a text message), Start, best scores, About the model, the reduced-motion switch (FR-022, FR-027, AC21).
- [X] T052 [P] [US5] Write `src/ui/scores.ts` and `tests/unit/scores.test.ts`: up to five entries of `{ score, steps, seed }`, "whole numbers ≥ 0", sorted by score then steps; anything invalid read back is dropped; a refused storage leaves the game playable and says scores are not kept (FR-019, FR-023, AC23, SEC-11).
- [X] T053 [P] [US5] Add the About the model panel to `src/ui/screens.ts` from `src/content/text.json`, reachable from the welcome and pause screens (FR-028).

### Checks for User Story 5

- [X] T054 [US5] Write `tests/e2e/us5-endless.spec.ts`: AC21 (typed and random seeds, seed shown), AC22 (same seed and inputs, same final score, in the browser), AC23 (best score shown after a reload).

**Checkpoint**: All five stories work.

---

## Phase 8: The four must-have effects (FR-036)

**Purpose**: The WebGL2 renderer and the effects, on top of a game that already plays correctly in the fallback renderer.

- [X] T055 Write `src/render/gl.ts`: draw the shared scene with instanced quads, glow and a half-resolution blur for bloom, with a final pass that scales a too-bright color down as a whole. Use it when a WebGL2 context can be created; otherwise fall back to the Canvas 2D renderer (FR-035, FR-036).
- [X] T056 Finish the four effects in `src/render/viewmodel.ts` and `src/render/gl.ts`: pulses with trails; link brightness and thickness that scale with load; the cut spark and reconvergence ripple; soft bloom; parallax on the grid, coastline and sweep only (FR-036).
- [X] T057 Write `tests/e2e/renderers.spec.ts`: with WebGL2 made unavailable the game falls back by itself and plays (AC20, FR-035); for the same seed and step both renderers report the same scene items through the test hook ("the same information"); the color census in each renderer, reported as numbers (FR-032b, SC-007).
- [X] T058 Write `tools/make-card.mjs`: capture a frame of the game's own renderer, convert it to `public/hero.webp`, check it is 16:9 and under 1 MB, and show it on the welcome screen (FR-038, SC-009, Q7).
- [X] T059 Compare the game with `mock/` at both sizes and measure desktop frame time; record both, and the census numbers, in `docs/verification/results.md`. The phone frame rate stays not run (SC-012).

---

## Phase 9: Package and evidence

**Purpose**: The build output, the recorded evidence and the documents that describe the same game (C7).

- [X] T060 Write `tools/verify-dist.mjs`, run `npm run build`, and commit `dist/` after `npm run verify:dist` passes (plan D1).
- [X] T061 [P] Write `tests/e2e/offline.spec.ts`: a run against `dist/` with every non-local request blocked and counted; zero expected (SC-006, FR-039, C5 evidence).
- [X] T062 Write `tools/record-run.mjs` and record the seeded-run videos at 844×390 and 1920×1080 into `docs/verification/` (SC-005, C7 evidence).
- [X] T063 [P] Write `tools/frr_check.py`: build T1 and T2 from FRR containers, refuse to compare unless every adjacency is Full and every router ID is as configured, and compare cost and next hops with `tests/fixtures/ospf-cases.json` (plan D4; C1). Record the result, or record it as not run with the reason.
- [X] T064 Rewrite `README.md` in the StarterKit shape: status, how to play, what the game models (F1–F8, S1–S11), how it was built with the Spec Kit paths, the verification table, limits, including browsers other than Chromium (SC-010, C7).
- [X] T065 Review every sentence of explanatory text that ships, namely `src/content/text.json` and the model section of `README.md`, against the spec's two model tables and the cited RFC sections; record the review in `docs/verification/text-review.md` (C1 evidence).
- [X] T066 Record every acceptance criterion AC1–AC26 and every success criterion SC-001–SC-013 as pass, fail or not run, with the check that produced it, in `docs/verification/results.md`. SC-011 (the C2 evidence), SC-012 and SC-013 need a person and are recorded as not run (SC-004).
- [X] T067 Update `ARCADE.md` (leave `consent_to_publish` exactly as it is; C7, K4), `docs/secure-build-checklist.md` and `docs/spec-map.html` so they describe the rebuilt game.
- [X] T068 Run `/code-review` at level `high` on the branch, fix the real findings, and record what was left and why (C5: AI output is reviewed like any other contribution).
- [X] T069 Fresh-copy check: clone the branch into an empty folder, serve `dist/`, then `npm ci`, `npm test`, `npm run build`, `npm run verify:dist` and `npm run test:e2e`; record the results in `docs/verification/results.md` (SC-010).
- [X] T070 Bring `PROVENANCE.md`, `docs/capture-log.md` and `docs/runbook.html` up to date (C7).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. Blocks every story.
- **User Stories (Phases 3–7)**: each depends on Foundational. They are built in the spec's order because they share `src/main.ts`, `src/ui/screens.ts` and the renderer.
- **Effects (Phase 8)**: depends on Stories 1 and 2 (the scene) and Story 4 (the switches and the census helper).
- **Package (Phase 9)**: depends on everything before it.

### User Story Dependencies

- **US1**: after Foundational. No dependency on another story.
- **US2**: needs US1's scene, HUD and main loop.
- **US3**: needs US1's main loop and US2's states for the inspector's state column.
- **US4**: needs US3's inspector for keyboard play.
- **US5**: needs US1's first welcome card and US2's game-over screen.

### Within Each Phase

- In Phase 2 every test task comes before the code it tests and must fail first.
- Data before logic, logic before screens.
- A story's end-to-end checks run against a fresh build, before the next story starts.

### Parallel Opportunities

- T002–T005 in Setup.
- In Phase 2: T008, T009 and T011 beside T010; T013 and T015 once `spf.ts` passes; T017 and T018 at any time; T023–T026 once `world.ts` passes.
- In the story phases, tasks marked [P] touch different files.
- One agent does this build (`docs/PID.md`, PIS-13), so the markers show what is independent, not what will run at the same moment.

---

## Parallel Example: Phase 2

```text
# After T012 (routes) passes, these touch different files:
Task: "Write the failing forwarding tests in tests/unit/forwarding.test.ts"
Task: "Write the failing queue tests in tests/unit/linkq.test.ts"
Task: "Write the content data in src/content/"
```

---

## Implementation Strategy

### MVP First

1. Phase 1: Setup.
2. Phase 2: the simulation, all twelve cases passing, no graphics. **Stop and record the checkpoint.**
3. Phase 3: User Story 1. **Stop and check it on its own.**

### Incremental Delivery

Stories 2 to 5 are added in order, each checked before the next. The four effects come after the game already plays correctly in the fallback renderer. Packaging and evidence come last.

### If time runs short

Cut from Phase 8 upward and say so in the spec and the README. Never cut from Phase 2.

---

## Notes

- Expected values in tests come from `spec.md` through `tests/fixtures/ospf-cases.json`. Changing one needs the owner.
- Commit after each task or small group of tasks.
- A failed or unrun check stays visible in `docs/verification/results.md` and the README.
