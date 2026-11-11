# Backbone Constitution

## Core Principles

### C1 · Technical truth is a release requirement

A wrong routing result is a failed build. Every packet's next hop MUST be reproducible from the
documented rule and the current topology: lowest total cost, as OSPF (RFC 2328) computes it.
Rendering never decides or alters a path; it displays what the simulation computed.

The model taught is single-area OSPFv2 over point-to-point links. The spec lists, in two tables,
which behaviors are faithful to RFC 2328 and which are simplified for play. The simplifications
are shown to the player in the game's "About the model" panel and in the README. Animation may
illustrate a rule; it MUST NOT change it.

**Evidence:** hand-worked routing cases recorded in the spec before any code exists; an
independent brute-force oracle that the shortest-path code is checked against; an RFC section for
every "faithful" claim; a review of all shipped explanatory text against those sections.

### C2 · The player learns by shaping, then watching

The player's only actions are the ones that exercise the skill: add or remove a link, change a
cost, upgrade capacity, choose a reward, and later enable equal-cost sharing. The player never
steers a packet. Every value
needed to reason about a path (cost, capacity, utilization, up/down) is visible on the map or in
the pause inspector, never hidden behind hover alone. After any change, the game shows where
traffic moved, so a wrong prediction is visible and explained by the numbers.

Learning sequence: **redundancy → cost tuning → equal-cost sharing → surviving failures**. This is
the order of the campaign's regions, planned for v1.3. Endless mode does not enforce it.

**Evidence:** a tester can state, for a deliberately bad cost change, which link heated up and
why, using only what the game shows.

### C3 · Pressure comes from growth, never from reflexes

The game can be paused at any moment, with unlimited thinking time. Every tool works while paused.
No action depends on speed or pointer precision under time pressure. A run ends only through the
drop meter, whose rules are stated exactly in the spec. Score counts only what the simulation
delivered; the same seed and the same inputs always give the same score.

**Evidence:** a full run played with every decision made while paused; a determinism test that
replays a recorded run to an identical final state.

### C4 · Access is part of the core game

Core play works by touch, mouse and keyboard. Focus is visible and controls have readable names.
**No green and no red anywhere.** Every color state carries a second cue: thickness, pattern or an
icon. The pause inspector gives a text table of every link's cost, capacity, utilization and
state, so the map is never the only source of truth. A reduced-motion setting removes sweeps,
parallax and trails without removing information. When WebGL is unavailable the game falls back to
a 2D renderer with the same information.

**Evidence:** a keyboard-only run; a phone-viewport run; a reduced-motion run; a forced no-WebGL
run; a scripted check that no shipped color is green or red. Record what was checked; do not claim
accessibility certification.

### C5 · Deterministic and self-contained

The game is static files. It needs no account, backend, network access, model or API key while
playing. The simulation is pure logic, separate from rendering, and deterministic from a seed and
a list of player commands. AI helped write the code and assets during development; that output is
reviewed and tested like any other contribution, and is recorded in `PROVENANCE.md`.

**Evidence:** the build output folder served by a plain static server plays offline in a clean
browser profile; simulation modules import nothing from the DOM, renderer, clock or `Math.random`.

### C6 · Content and logic can be reviewed separately

Region maps, site lists, tuning constants and palette live in data files. Routing, load, drops,
events and scoring live in the simulation. Adding a region is a data change plus its checks, not a
new code path. Tuning constants (rates, capacities, intervals) are not rules: they may change for
play balance without touching the routing rule.

**Evidence:** trace one packet's path through the routing code by hand from a region file; add a
trial region without editing the simulation.

### C7 · Done is demonstrated

Ship only the agreed scope. Spec, plan, tasks and README describe the same game. A feature is
complete when its acceptance criteria pass and its real status is recorded. A screenshot, a ticked
box or the agent saying "done" is not evidence. When time is short, scope is cut openly; routing
correctness and the core loop are fixed before any visual effect is added. Failed and unrun checks
stay visible.

`PROVENANCE.md` is kept from the first session and records only what happened.
`consent_to_publish` in `ARCADE.md` is set by the owner, never by the agent.

**Evidence:** reproducible run and test commands; recorded results; seeded run videos at phone and
desktop sizes saved in the repo; a README another engineer can follow.

## Purpose and Scope

**Purpose:** help working network engineers practice predicting where traffic and congestion move
in a link-state network, by building and operating a backbone whose packets always follow OSPF's
lowest-cost paths.

**First release (v1):** one region map, endless mode, link laying, link costs, link capacity,
fiber cuts, and the four must-have effects. Built in a few days as an example for the AutoCon 6
workshop Arcade. This budget changes only by updating the agreed scope in the spec.

**Documents named here.** On 2026-11-09 the owner chose to rebuild v1 through Spec Kit
(`docs/PID.md`, amendment 1.3). From that point the names in this constitution mean:

| Name | File | Role |
| --- | --- | --- |
| the spec | `specs/<feature>/spec.md` | Working specification, written from `StarterKit/SPEC.md` |
| the plan | `specs/<feature>/plan.md` | Working plan, written from `StarterKit/PLAN.md` |
| tasks | `specs/<feature>/tasks.md` | Task list generated from the spec and the plan |
| README, `PROVENANCE.md`, `ARCADE.md` | Repository root | Unchanged |

The three files under `StarterKit/` are the inputs the owner approved on 2026-11-09. The build
agent reads them and does not edit them. Where a working document departs from its input, that is
a material change under Governance.

## Lineage and Adaptations

This file restates `StarterKit/CONSTITUTION.md` in the Spec Kit structure. That source was adapted
from the NAF AC6 StarterKit constitution (commit `b77da71`). The seven principles and their
evidence are kept. Where the template assumes a quiz with rounds, hints and Submit, the wording is
adapted to a continuous simulation; each adaptation is listed below.

**Adaptations from the StarterKit template** (carried over unchanged from the source)

| Template text | Here | Why |
| --- | --- | --- |
| C1 "never reward an incorrect answer", graded submissions | Packets always follow the computed lowest-cost path; there is no answer to grade | The game is a simulation, not a quiz |
| C2 briefings, hints, worked solutions | Visible values, pause inspector, and visible consequences of each change | Feedback is the traffic itself |
| C3 "no lives, countdown or speed bonus"; retry is free | A drop meter can end a run; pause is always available; restart is free | The owner's brief requires a fail state and a score |
| C4 keyboard and narrow window | Kept, plus phone touch, the no-green/no-red rule, and a no-WebGL fallback | The owner's brief |
| First release "three short levels, 60-minute build" | One region, endless mode, a build of a few days | The owner's v1 scope |

**Changes made in this restatement**

| Source text | Here | Why |
| --- | --- | --- |
| Headings `## C1 · …` to `## C7 · …` | `### C1 · …` to `### C7 · …` under `## Core Principles` | Spec Kit structure. Titles, rule text and evidence are unchanged. |
| `SPEC.md` in C1 and in the first-release budget | "the spec" | The working specification is now the Spec Kit one; see Purpose and Scope. |
| "must", "must not" | "MUST", "MUST NOT" | Convention for binding rules. No change in meaning. |
| "Status: approved by the owner on 2026-11-09" | **Ratified** date in the version line | Spec Kit version line |
| "How we change these rules" | Kept word for word in Governance. Added: precedence, who approves, versioning, compliance review, force of wording. | Spec Kit asks for an amendment procedure, a versioning policy and compliance review. |
| "each adaptation is listed at the end" | "listed below" | Position in the new structure |

**Amendments**

| Version | Date | Change | Reason |
| --- | --- | --- | --- |
| 1.1.0 | 2026-11-10 | C2: "add a link" becomes "add or remove a link", and "choose a reward" joins the player's actions. | The approved spec allows both (Q5, R10, AC17). Decided by the owner (K1 in `docs/capture-log.md`). |
| 1.1.0 | 2026-11-10 | C2: the learning sequence is stated to be the order of the campaign's regions; endless mode does not enforce it. | v1 ships fiber cuts and defers equal-cost sharing to v1.2. Decided by the owner (K2). |

## Governance

This constitution governs Backbone from the Spec Kit rebuild on. Where the spec, the plan, the
tasks, a Spec Kit template default or the build agent's own judgment disagrees with it, the
constitution applies until the owner amends it.

**How we change these rules.** For any material change, record the reason, update the affected
spec and plan, and re-check them against each other. A conflict with this constitution is resolved
openly with the owner. The build agent MUST NOT weaken a principle to make its implementation
pass.

**Who approves.** Only the owner approves an amendment or accepts a deviation. The build agent
proposes and records; it does not ratify.

**Versioning.** The version line follows semantic versioning. MAJOR: a principle or its evidence
is removed or redefined. MINOR: a principle or section is added, or one is materially expanded.
PATCH: wording is clarified with no change in meaning. Every amendment updates the version and the
**Last Amended** date.

**Compliance review.**

- Every plan's Constitution Check lists C1 to C7 with the evidence each one requires, before
  research and again after design.
- A conflict found by that check, by `/speckit-analyze` or during the build is recorded and taken
  to the owner. An entry in a plan's Complexity Tracking table records a conflict; it does not
  waive a principle.
- The checks named under each principle's **Evidence** are required work. A template default that
  marks tests as optional does not apply to them.
- Each evidence item and acceptance criterion is recorded as pass, fail or not run. A ticked task
  in `tasks.md` shows the task was worked; it is not evidence.

**Force of wording.** MUST and MUST NOT are absolute. A plain statement about the game in a
principle, such as "The game is static files", binds with the same force.

**Version**: 1.1.0 | **Ratified**: 2026-11-09 | **Last Amended**: 2026-11-10
