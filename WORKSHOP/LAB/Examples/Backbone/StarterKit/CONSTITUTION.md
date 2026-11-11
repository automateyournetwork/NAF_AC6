# Backbone · Project constitution

**Status:** approved by the owner on 2026-11-09.

**Purpose:** help working network engineers practice predicting where traffic and congestion move in a link-state network, by building and operating a backbone whose packets always follow OSPF's lowest-cost paths.

**First release (v1):** one region map, endless mode, link laying, link costs, link capacity, fiber cuts, and the four must-have effects. Built in a few days as an example for the AutoCon 6 workshop Arcade. This budget changes only by updating the agreed scope in `SPEC.md`.

Adapted from the NAF AC6 StarterKit constitution (commit `b77da71`). The seven principles and their evidence are kept. Where the template assumes a quiz with rounds, hints and Submit, the wording is adapted to a continuous simulation; each adaptation is listed at the end.

## C1 · Technical truth is a release requirement

A wrong routing result is a failed build. Every packet's next hop must be reproducible from the documented rule and the current topology: lowest total cost, as OSPF (RFC 2328) computes it. Rendering never decides or alters a path; it displays what the simulation computed.

The model taught is single-area OSPFv2 over point-to-point links. `SPEC.md` lists, in two tables, which behaviors are faithful to RFC 2328 and which are simplified for play. The simplifications are shown to the player in the game's "About the model" panel and in the README. Animation may illustrate a rule; it must not change it.

**Evidence:** hand-worked routing cases recorded in the spec before any code exists; an independent brute-force oracle that the shortest-path code is checked against; an RFC section for every "faithful" claim; a review of all shipped explanatory text against those sections.

## C2 · The player learns by shaping, then watching

The player's only actions are the ones that exercise the skill: add a link, change a cost, upgrade capacity, and later enable equal-cost sharing. The player never steers a packet. Every value needed to reason about a path (cost, capacity, utilization, up/down) is visible on the map or in the pause inspector, never hidden behind hover alone. After any change, the game shows where traffic moved, so a wrong prediction is visible and explained by the numbers.

Learning sequence: **redundancy → cost tuning → equal-cost sharing → surviving failures**.

**Evidence:** a tester can state, for a deliberately bad cost change, which link heated up and why, using only what the game shows.

## C3 · Pressure comes from growth, never from reflexes

The game can be paused at any moment, with unlimited thinking time. Every tool works while paused. No action depends on speed or pointer precision under time pressure. A run ends only through the drop meter, whose rules are stated exactly in the spec. Score counts only what the simulation delivered; the same seed and the same inputs always give the same score.

**Evidence:** a full run played with every decision made while paused; a determinism test that replays a recorded run to an identical final state.

## C4 · Access is part of the core game

Core play works by touch, mouse and keyboard. Focus is visible and controls have readable names. **No green and no red anywhere.** Every color state carries a second cue: thickness, pattern or an icon. The pause inspector gives a text table of every link's cost, capacity, utilization and state, so the map is never the only source of truth. A reduced-motion setting removes sweeps, parallax and trails without removing information. When WebGL is unavailable the game falls back to a 2D renderer with the same information.

**Evidence:** a keyboard-only run; a phone-viewport run; a reduced-motion run; a forced no-WebGL run; a scripted check that no shipped color is green or red. Record what was checked; do not claim accessibility certification.

## C5 · Deterministic and self-contained

The game is static files. It needs no account, backend, network access, model or API key while playing. The simulation is pure logic, separate from rendering, and deterministic from a seed and a list of player commands. AI helped write the code and assets during development; that output is reviewed and tested like any other contribution, and is recorded in `PROVENANCE.md`.

**Evidence:** the build output folder served by a plain static server plays offline in a clean browser profile; simulation modules import nothing from the DOM, renderer, clock or `Math.random`.

## C6 · Content and logic can be reviewed separately

Region maps, site lists, tuning constants and palette live in data files. Routing, load, drops, events and scoring live in the simulation. Adding a region is a data change plus its checks, not a new code path. Tuning constants (rates, capacities, intervals) are not rules: they may change for play balance without touching the routing rule.

**Evidence:** trace one packet's path through the routing code by hand from a region file; add a trial region without editing the simulation.

## C7 · Done is demonstrated

Ship only the agreed scope. Spec, plan, tasks and README describe the same game. A feature is complete when its acceptance criteria pass and its real status is recorded. A screenshot, a ticked box or the agent saying "done" is not evidence. When time is short, scope is cut openly; routing correctness and the core loop are fixed before any visual effect is added. Failed and unrun checks stay visible.

`PROVENANCE.md` is kept from the first session and records only what happened. `consent_to_publish` in `ARCADE.md` is set by the owner, never by the agent.

**Evidence:** reproducible run and test commands; recorded results; seeded run videos at phone and desktop sizes saved in the repo; a README another engineer can follow.

## How we change these rules

For any material change, record the reason, update the affected spec and plan, and re-check them against each other. A conflict with this constitution is resolved openly with the owner. The build agent must not weaken a principle to make its implementation pass.

## Adaptations from the StarterKit template

| Template text | Here | Why |
| --- | --- | --- |
| C1 "never reward an incorrect answer", graded submissions | Packets always follow the computed lowest-cost path; there is no answer to grade | The game is a simulation, not a quiz |
| C2 briefings, hints, worked solutions | Visible values, pause inspector, and visible consequences of each change | Feedback is the traffic itself |
| C3 "no lives, countdown or speed bonus"; retry is free | A drop meter can end a run; pause is always available; restart is free | The owner's brief requires a fail state and a score |
| C4 keyboard and narrow window | Kept, plus phone touch, the no-green/no-red rule, and a no-WebGL fallback | The owner's brief |
| First release "three short levels, 60-minute build" | One region, endless mode, a build of a few days | The owner's v1 scope |
