# Tasks: RIBRush RIB Routing Puzzle

**Input**: Design documents in
`WORKSHOP/LAB/Examples/RIBRush/specs/001-rib-routing-game/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/ui.md

**Organization**: Tasks are grouped by the three prioritized user stories.
The stories are sequential because each later story extends the playable loop
and evaluator delivered by the earlier one.

## Phase 1: Setup

**Purpose**: Create the static project skeleton and its browser verification
entry point without adding runtime dependencies.

- [X] T001 Create the `src/routing/`, `src/game/`, `src/ui/`, `src/audio/`, `data/`, and `tests/` directories under `WORKSHOP/LAB/Examples/RIBRush/`.
- [X] T002 [P] Add `WORKSHOP/LAB/Examples/RIBRush/.gitignore` with JavaScript build/dependency, local environment, log, editor, and OS-generated file patterns.
- [X] T003 [P] Create `WORKSHOP/LAB/Examples/RIBRush/index.html`, `styles.css`, and `README.md` as the static application shell and local-run documentation entry point.
- [X] T004 Create `WORKSHOP/LAB/Examples/RIBRush/tests/index.html` and `tests/fixtures.js` as a dependency-free browser test harness that reports discovered, passed, and failed test totals and visibly fails if no tests are discovered.

---

## Phase 2: Foundational

**Purpose**: Establish shared address handling and resolve the documented
network-source gate before adding authored factual teaching content.

- [X] T005 [P] Add IPv4/IPv6 address-family, prefix-boundary, canonical-prefix, and containment test fixtures in `WORKSHOP/LAB/Examples/RIBRush/tests/route-cases.json`.
- [X] T006 Implement IPv4 and IPv6 parsing, family checks, prefix validation, canonical network validation, and containment helpers in `WORKSHOP/LAB/Examples/RIBRush/src/routing/address.js`.
- [X] T007 Verify the Cisco IOS/IOS XE AD values and supported release against official Cisco documentation, verify IPv6 and included-protocol references, and record citations and the `Unknown*` disposition in `WORKSHOP/LAB/Examples/RIBRush/specs/001-rib-routing-game/research.md`; do not proceed with authored network-rule explanations until this gate passes.

**Checkpoint**: The browser test harness works, the shared address utilities
pass their independent fixtures, and the source-verification gate is resolved.

---

## Phase 3: User Story 1 - Learn route-selection basics (Priority: P1)

**Goal**: Deliver a first playable IPv4 level with simple longest-prefix,
administrative-distance, and metric decisions.

**Independent Test**: Start a fresh run, read the Level 1 briefing, route five
IPv4 packets, and verify correct, incorrect, and unselected-input behavior.

### Tests for User Story 1

- [X] T008 [P] [US1] Add independent IPv4 longest-prefix, no-route, and ambiguous-winner cases with expected results in `WORKSHOP/LAB/Examples/RIBRush/tests/route-cases.json`.
- [X] T009 [P] [US1] Add reproducibility and mixed LPM/AD/metric coverage for the Level 1 warmup, plus initial run-state cases for invalid input, correct/wrong decisions, and duplicate submission in `WORKSHOP/LAB/Examples/RIBRush/tests/fixtures.js`.

### Implementation for User Story 1

- [X] T010 [US1] Implement pure route evaluation for family filtering, prefix containment, longest-prefix selection, explicit no-route results, invalid data, and unresolved ties in `WORKSHOP/LAB/Examples/RIBRush/src/routing/evaluate.js`.
- [X] T011 [US1] Implement Level 1 scenario generation and pre-display validation in `WORKSHOP/LAB/Examples/RIBRush/src/routing/generate.js`, `WORKSHOP/LAB/Examples/RIBRush/src/routing/validate.js`, and `WORKSHOP/LAB/Examples/RIBRush/data/levels.json`; generated scenarios must be deterministic and have one matching, unambiguous winner.
- [X] T012 [US1] Implement the initial in-memory run state for start, Level 1 briefing, packet selection, submission, feedback, and one-time decision resolution in `WORKSHOP/LAB/Examples/RIBRush/src/game/session.js`.
- [X] T013 [US1] Connect the start screen, worked briefing, falling packet, route display, left/right selection, Enter submission, visible focus, and rule-specific text feedback in `WORKSHOP/LAB/Examples/RIBRush/src/app.js` and `WORKSHOP/LAB/Examples/RIBRush/src/ui/views.js`.
- [X] T014 [US1] Style the first playable loop with the supplied dark palette, readable route fields, visible keyboard focus, and reduced-motion behavior in `WORKSHOP/LAB/Examples/RIBRush/styles.css`.

**Checkpoint**: User Story 1 can be played independently and passes its
longest-prefix, AD, metric, scoring, feedback, and invalid-input scenarios.

---

## Phase 4: User Story 2 - Compare route sources and administrative distance (Priority: P1)

**Goal**: Teach Cisco AD only among identical prefixes and demonstrate that a
more-specific OSPF route beats a less-specific Static route.

**Independent Test**: Play the IPv4 and IPv6 AD levels, verify lower AD wins
for identical prefixes, and verify the OSPF `/24` beats the Static `/16`.

### Tests for User Story 2

- [X] T015 [P] [US2] Add independent same-prefix AD and specific-versus-trusted trap cases, including expected deciding values, to `WORKSHOP/LAB/Examples/RIBRush/tests/route-cases.json`.
- [X] T016 [P] [US2] Add IPv4/IPv6 AD-level applicability and correction-feedback cases to `WORKSHOP/LAB/Examples/RIBRush/tests/fixtures.js`.

### Implementation for User Story 2

- [X] T017 [US2] Extend `WORKSHOP/LAB/Examples/RIBRush/src/routing/evaluate.js` to compare Cisco default AD only for identical normalized prefixes, using the verified values in `WORKSHOP/LAB/Examples/RIBRush/data/levels.json`.
- [X] T018 [US2] Add the focused IPv4 Level 3 and IPv6 Level 6 AD scenarios, briefings, worked examples, and specific-versus-trusted teaching cases in `WORKSHOP/LAB/Examples/RIBRush/data/levels.json` and `WORKSHOP/LAB/Examples/RIBRush/src/routing/generate.js`.
- [X] T019 [US2] Extend `WORKSHOP/LAB/Examples/RIBRush/src/ui/views.js` and `WORKSHOP/LAB/Examples/RIBRush/src/game/session.js` to show the compared AD values, the deciding rule, and sequential progression into the AD levels.

**Checkpoint**: User Story 2 passes same-prefix AD and longest-prefix-before-AD
cases for both address families without changing User Story 1 behavior.

---

## Phase 5: User Story 3 - Apply metric and finish a run (Priority: P2)

**Goal**: Complete seven levels and 35 packets with metric decisions, pressure,
pause/resume, and a useful run summary.

**Independent Test**: Complete metric decisions and a full seven-level run;
verify same-protocol metric ordering, cross-protocol metric non-comparison,
progression, failure, and final summary.

### Tests for User Story 3

- [X] T020 [P] [US3] Add same-protocol metric, cross-protocol metric, IPv6 boundary, and metric-tie cases with independent expected results in `WORKSHOP/LAB/Examples/RIBRush/tests/route-cases.json`.
- [X] T021 [P] [US3] Add seeded seven-level generation, scoring, missed/wrong decisions, pressure caps, pause/resume, duplicate submission, and summary cases in `WORKSHOP/LAB/Examples/RIBRush/tests/fixtures.js`.

### Implementation for User Story 3

- [X] T022 [US3] Extend `WORKSHOP/LAB/Examples/RIBRush/src/routing/evaluate.js` to compare metrics only when family, normalized prefix, prefix length, AD, and protocol match.
- [X] T023 [US3] Add the IPv4 and IPv6 metric levels and complete the deterministic seven-level generator, varied scenario pools, and validator in `WORKSHOP/LAB/Examples/RIBRush/data/levels.json`, `WORKSHOP/LAB/Examples/RIBRush/src/routing/generate.js`, and `WORKSHOP/LAB/Examples/RIBRush/src/routing/validate.js`.
- [X] T024 [US3] Implement all seven level transitions, five-packet counts, score/life rules, six capped pressure tiers, packet misses, pause/resume, zero-life termination, replay, and summary fields in `WORKSHOP/LAB/Examples/RIBRush/src/game/session.js`.
- [X] T025 [US3] Integrate the complete run loop, packet timing, keyboard controls, content-error state, decision feedback, and summary/replay screens in `WORKSHOP/LAB/Examples/RIBRush/src/app.js` and `WORKSHOP/LAB/Examples/RIBRush/src/ui/views.js`.
- [X] T026 [US3] Add original optional sound cues and a visible mute control in `WORKSHOP/LAB/Examples/RIBRush/src/audio/cues.js` and connect them after user input in `WORKSHOP/LAB/Examples/RIBRush/src/app.js`.

**Checkpoint**: User Story 3 completes with deterministic valid scenarios,
correct scoring and pressure, and all required summary fields.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify the full feature, accessibility requirements, and local
delivery; preserve evidence and known limitations.

- [X] T027 [P] Verify all specified route, generator, validation, and session cases in `WORKSHOP/LAB/Examples/RIBRush/tests/route-cases.json` and `tests/fixtures.js`; ensure the browser test page reports accurate totals and fails visibly on errors.
- [X] T028 [P] Complete keyboard-only, narrow-desktop, reduced-motion, contrast, mute/audio-policy, reload-reset, and no-external-request checks; record outcomes and any limitations in `WORKSHOP/LAB/Examples/RIBRush/README.md`.
- [X] T029 Measure shipped text/control contrast against actual palette surfaces and correct any WCAG AA failures in `WORKSHOP/LAB/Examples/RIBRush/styles.css`.
- [ ] T030 Conduct the specified five-person network-engineer formative playtest, record whether at least four explain the specific-beats-trusted result, and document evidence or the uncompleted release criterion in `WORKSHOP/LAB/Examples/RIBRush/README.md`.
- [X] T031 Validate the local preview and browser test instructions from `WORKSHOP/LAB/Examples/RIBRush/README.md` and `specs/001-rib-routing-game/quickstart.md` using the documented Python static server.

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; T002 and T003 can run in parallel with
  T001. T004 requires the test directory from T001.
- **Foundational (Phase 2)**: Depends on Setup. T005 can run in parallel with
  T004; T006 follows its fixtures; T007 must pass before authored factual
  teaching content in any user story.
- **User Story 1 (Phase 3)**: Depends on the browser harness, address
  utilities, and source gate. Its tests precede evaluator and game-loop work.
- **User Story 2 (Phase 4)**: Depends on User Story 1; its tests precede AD
  behavior and level/UI extensions.
- **User Story 3 (Phase 5)**: Depends on User Story 2; its tests precede
  metric behavior and full-run integration.
- **Polish (Phase 6)**: Depends on all three user stories.

### User Story Dependencies

- **US1 (P1)**: Starts after Setup and Foundational; no route/game story
  dependency.
- **US2 (P1)**: Starts after US1 because it extends the evaluator and playable
  level progression.
- **US3 (P2)**: Starts after US2 because it completes the same run and
  evaluator.

### Parallel Opportunities

- T002 and T003 can proceed independently after the project directory exists.
- T004 and T005 can proceed independently after Setup.
- Each story's independent fixture-writing tasks can be authored in parallel
  with each other, but implementation tasks wait for their related fixtures.
- In the final phase, T027 can run independently from the manual review tasks.
  T028 and T030 both update README evidence and should be performed
  sequentially or merged carefully.

## Implementation Strategy

1. Complete Setup and Foundational tasks, including the official-source gate.
2. Deliver and validate the Level 1 IPv4 warmup covering LPM, AD, and metric (US1).
3. Add nested IPv4 LPM practice and focused IPv4/IPv6 AD levels (US2), then
   validate the specific-versus-trusted trap.
4. Add focused IPv4/IPv6 metric levels and the complete seven-level run (US3).
5. Complete accessibility, browser, playtest, and local-run evidence before
   calling the MVP complete.

## Notes

- All executable tasks remain under `WORKSHOP/LAB/Examples/RIBRush/`.
- Do not add a package manager, framework, backend, persistent storage, remote
  runtime dependency, or fallback gameplay data.
- The source-verification task is a content gate; unresolved citations must
  not be represented as verified facts.
- The browser tests use independent expected cases; test fixtures never
  substitute for failed runtime scenario generation.
