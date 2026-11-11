# Project Initiation Document

## Project
**Name:** Backbone (confirmed by the owner on 2026-11-09)
**Date:** 2026-11-09
**Author:** Elliot Conner, with Claude Code (`claude-fable-5-2`)

The detailed contract is in `StarterKit/CONSTITUTION.md`, `SPEC.md` and `PLAN.md`. This document answers PIS-01 to PIS-30 and points there instead of repeating them. The "agent" in this project is the build agent; the shipped game contains no agent and calls no model.

---

## Domain 1 — Intent Specification

**PIS-01 — One-sentence purpose:** Build a static browser game in which network engineers shape a backbone whose traffic always follows OSPF lowest-cost paths, as a spec-driven example for the AutoCon 6 workshop Arcade.

**PIS-02 — Capabilities at launch (v1):**
- Endless mode on one region map, deterministic from a seed.
- Lay a link by dragging between sites, spending fiber from a budget; rejected with a text reason when fiber is short, the ends are the same site, or the link exists.
- Set a link cost (integer 1–65535; 0 and 65536 rejected). Upgrade a link's capacity one tier.
- Routing by shortest path per RFC 2328 §16.1, with equal-cost next hops in the engine and tests.
- Per-direction link capacity, queue and tail drop; utilization display; drop meter; game over.
- Fiber cuts with instant reconvergence; sites with no path go dark.
- Pause at any time, inspector table, changes queued while paused.
- Reward choice at intervals. Score, time survived, time-lapse replay, local high scores.
- Four effects: pulses with trails, load-scaled links, cut spark with reconvergence ripple, bloom.
- Phone touch, desktop mouse and keys, keyboard-only play, reduced motion, 2D fallback without WebGL.
- `PROVENANCE.md`, `ARCADE.md`, a 16:9 card image under 1 MB, seeded-run videos at two sizes.

**PIS-03 — Explicit exclusions:** No backend, accounts, online leaderboard, analytics or runtime AI. No campaign, equal-cost player tool, maintenance windows, sound, attract mode or generated maps in v1. No OSPF areas, Designated Routers, adjacency or flooding simulation, timers, external routes, BGP or MPLS. No preview of loads after a change. The agent does not set `consent_to_publish`, does not push, publish or create a remote, and does not change git state without being asked.

**PIS-04 — Escalation path:** The agent stops and asks the owner: (1) before any game code, for approval of the three spec files; (2) before the full build, for approval of the static visual mock; (3) on any conflict between the spec and RFC 2328; (4) before any scope change; (5) before any commit, push, deletion or publication; (6) if a routing test cannot be made to pass without changing an expected value. The handoff carries the failing case or the question, the options, and the agent's recommendation.

**PIS-05 — Definition of functional correctness:** All twelve spec cases pass with expected values taken from the spec. The engine agrees with the brute-force oracle on every router pair of every seeded test graph. The same seed and commands give an identical world hash at every step. A seeded run completes from start to game over at 844×390 and 1920×1080 in end-to-end tests. The game plays from `dist/` on a plain static server with no network.

---

## Domain 2 — Evaluation Design

**PIS-06/07/08 — Eval cases** (full table of twelve in `SPEC.md`; the core set here):

| # | Input | Expected Output | Pass Condition | Edge Case? |
|---|---|---|---|---|
| 1 | T1, sharing on, route A→C | Cost 20, next hops {B, D} | Exact match | No |
| 2 | T1 with A–C = 20 | Next hops {B, C, D} | Exact match | Yes (boundary: equals the tie) |
| 3 | T1 with A–C = 19 | Next hop {C}, cost 19 | Exact match | Yes (boundary: one below) |
| 4 | T1, B–C cut, route B→C | Cost 30, next hop {A} | Exact match | No |
| 5 | T2, sharing on, S→T traffic | A–T carries ½; C–T and D–T carry ¼ each | Packet counts match the fractions exactly over a multiple of 4 packets | Yes (per-hop, not per-path) |
| 6 | T1, C–E cut | E dark; traffic to and from E counted as "no route" drops; other routes unchanged | Exact match | Yes (no path) |
| 7 | Capacity 4/s, queue 8, 6/s offered for 10 s | 40 served, 8 queued, 12 dropped | Exact counts once step-edge semantics are fixed | Yes (overload) |
| 8 | Same seed and commands, twice | Identical hash at every step | Byte-equal hashes | No |
| 9 | Cost set to 0 or 65536 | Rejected; routes unchanged | Reason code returned, world hash unchanged | Yes |

**PIS-09 — Eval execution method:** Automated. Vitest for the simulation, Playwright for browser runs and video. Optional comparison with FRR in ContainerLab (plan decision D4). The owner reviews the mock, the videos and frame rate on a real phone by hand.

**PIS-10 — Minimum pass threshold to ship:** 100% of routing, determinism and scoring tests. Zero tolerance for any wrong routing result. Visual or polish acceptance criteria may ship as "fail" or "not run" only if listed openly in the README.

---

## Domain 3 — Agent Decomposition

**PIS-11 — Task breakdown:** The plan's slices, each with one input and one output: (1) spec cases → routing engine with passing tests; (2) rules R3–R14 → full simulation with passing tests; (3) simulation → playable 2D run; (4) approved mock → WebGL effects; (5) acceptance criteria → surrounding screens and settings; (6) built game → packaged `dist/`, videos, README, `ARCADE.md`.

**PIS-12 — Dependency graph:**

```text
approve spec → approve mock ─────────────┐
approve spec → 1 routing → 2 simulation → 3 playable → 4 effects → 5 around the run → 6 package
```

**PIS-13 — Planner vs. single-shot:** One agent in one session does the work in order. No planner. Sub-agents are used only for independent code review before a pull request.

**PIS-14 — Context window sizing:** Each slice touches a few small modules. The simulation is specified by the spec's rules and cases, so a slice can be resumed from the three spec files, `tasks.md` and the capture log without the earlier conversation.

**PIS-15 — Handoff contracts:** Between slices the contract is the simulation interface in `PLAN.md` (`createWorld`, `step`, `computeRoutes`, `hash`) and the view model. Between sessions it is `tasks.md`, `docs/capture-log.md` and `PROVENANCE.md`.

---

## Domain 4 — Failure Mode Pre-Mortem

**PIS-16 — Context degradation:** The build may span sessions and context summaries. The capture log and `PROVENANCE.md` are updated at each step, not at the end, so nothing depends on the agent's memory.

**PIS-17 — Specification drift:** Every task in `tasks.md` names the acceptance criterion or rule it serves. Before each slice the agent re-reads the spec section for that slice. Test fixtures are copied from the spec; changing an expected value requires the owner.

**PIS-18 — Input data validation:** Ground truth is RFC 2328 text downloaded from rfc-editor.org with its hash recorded, not the agent's recollection. Every "faithful" claim cites a section that was read. The Arcade template is checked against the copy in the workshop repo before `ARCADE.md` is filled in. Region data is validated at load.

**PIS-19 — Tool audit:** Two browser-automation tool sets are connected (Chrome extension, Docker browser tools) and could be confused with the project's own Playwright tests. End-to-end tests and videos use the project's Playwright only, so they are reproducible from the repo. The network-inventory MCP servers (Nautobot, NetBox) are irrelevant to this project and are not used.

**PIS-20 — Cascading failure gates:** Routing tests gate the simulation slice. Simulation tests gate any rendering. The mock approval gates the effects. `verify:dist` gates packaging. A wrong routing result stops the build.

**PIS-21 — Silent failure:** The plausible-but-wrong output is a split that looks right: three equal paths drawn carrying a third each when per-hop forwarding gives ½, ¼, ¼ (case 7). Others: a renderer animating a path the engine did not choose; a tie-break that depends on insertion order. Evals: case 7, the oracle comparison, the determinism hash, and an end-to-end check that pulse positions come from simulation packets.

---

## Domain 5 — Trust and Guardrail Design

**PIS-22 — Action classification:**
- Read-only: reading files, fetching public documents, running tests.
- Reversible write: creating and editing files in this repo; installing dev dependencies in the project folder.
- Irreversible or outward-facing, owner approval each time: git commits and pushes, creating a GitHub repo, publishing anywhere, deleting existing files, setting `consent_to_publish`.

**PIS-23 — Blast radius:** Worst case for the shipped game is a wrong routing behavior shown on stage to expert engineers, which damages the credibility of the example and the workshop. It is contained by the zero-tolerance routing gate and the independent oracle. The game touches no network, device or user data.

**PIS-24 — Hard stops:** Never invent provenance; write `unknown`. Never estimate tokens or cost. Never set `consent_to_publish`. Never weaken an expected test value to get a pass. Never put the owner's name, email or other identifier in an outbound request. Never use green or red in the game.

---

## Domain 6 — Context Architecture

**PIS-25 — Context classification:** Persistent: the three spec files, this PID, the RFC texts. Per-session: `tasks.md`, the capture log, `PROVENANCE.md`, test output. Ephemeral: the agent's working reasoning.

**PIS-26 — Retrieval strategy:** No retrieval system. The agent reads named files and greps the downloaded RFC text by section number.

**PIS-27 — Dirty data risks:** The fetched Arcade template passed through a summarizing model and may not be byte-exact; it is diffed against the repo copy before use. The workshop repo may change; the commit hash read is recorded. The agent's memory of OSPF is not treated as a source. Library versions are read from the lockfile after install, never from memory.

---

## Domain 7 — Cost and Token Economics

**Token Economics Worksheet:**

The shipped game uses no model, so its cost per run is zero tokens and $0.

For the build, the Arcade rules forbid estimating tokens or cost, and the harness has not reported usage to the agent. The honest entries are:

System prompt tokens:              not measured
Average context tokens per run:    not measured
Average output tokens per run:     not measured
Total tokens per run:              not measured
With 1.5x buffer:                  not applicable

Model assignments:
- Planner / reasoning:  one build agent, `claude-fable-5-2`, for all tasks. The work is correctness-critical and done in a single session; splitting it across tiers would add handoffs without saving anything measurable.
- Structured tasks:     same agent
- Classification:       none

Blended cost per run:   $0 at runtime; build cost not metered by the agent
Runs per day (expected): not applicable (no model at runtime)
Monthly cost estimate:  $0 at runtime
Monthly value delivered: a reusable workshop example; not expressed in dollars
ROI justified:          [x] Yes  [ ] No  [ ] Needs redesign

If the owner's plan reports usage at the end, the measured figures go into `PROVENANCE.md` and `ARCADE.md` as reported.

---

## Amendments

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-11-09 | Initial PID, written with the spec drafts, before any code |
| 1.1 | 2026-11-09 | Spec amendments during the build: no mute control in v1; a cut link cannot be removed; packets on a removed link are lost. FRR comparison (PIS-09) run and passed. PIS-13: one `code-review` sub-agent run was used. |
| 1.2 | 2026-11-09 | PIS-24 says the agent never sets `consent_to_publish`. The owner said in the session, after playing the game, that he consents to publish; the agent then made the edit in `ARCADE.md` on his behalf. This is an exception to the hard stop, recorded here for the owner to confirm or to redo by hand. The owner confirmed it the same day: keep the edit. The rule itself is unchanged. |
| 1.3 | 2026-11-09 | The owner chose to rebuild v1 through the workshop lab's seven Spec Kit steps, because the lab requires Spec Kit and v1 was hand-written in the StarterKit shape. The rebuild is on branch `speckit-rebuild`, from a clean slate; the hand-built v1 stays on `main` and under tag `v1-handbuilt` until the owner approves the rebuilt game. Purpose, scope and guardrails in this PID are unchanged. The three `StarterKit/` files are the inputs; Spec Kit's own artifacts under `.specify/` and `specs/` become the working documents. Every check in Domain 2 is rerun on the rebuilt game. |
| 1.4 | 2026-11-10 | The rebuild was carried out through the seven Spec Kit steps on branch `speckit-rebuild`. The owner reviewed step 1, decided conflicts K1–K5 as the agent recommended, and asked for steps 2–7 to run without a review between them ("go, commit as you go, take your recommendations"). For this branch that sets aside PIS-04's stop before each commit and the lab's review between steps; nothing was pushed and `consent_to_publish` was not touched. The constitution moved to `.specify/memory/constitution.md`, version 1.1.0: C2 now names link removal and reward choice, and the learning sequence is the campaign's order. The checks of PIS-05, PIS-09 and PIS-10 were rerun on the rebuilt game; results are in `docs/verification/results.md`. PIS-13: the `code-review` skill was used as the only sub-agent, in three rounds: on the rebuilt code, on its fixes, and on those fixes. The owner then said to stop reviewing once findings stop mattering; no fourth round was run. Left for the owner: K4 (consent for the rebuilt game), K6 (reward offers), the agent's five clarify answers, the numbers in FR-037, the FR-016 rule for changes made while a reward waits, and the checks that need a person. |
| 1.5 | 2026-11-10 | The owner asked for the rebuilt game to be made ready for the Arcade, looked at the card and the videos, asked for a better card, and said in the session: "go ahead and push, and I consent". This is his consent for the rebuilt game (K4). `consent_to_publish` was already `true` and the agent did not edit the creator block; the consent is recorded in the file's header comment, here and in the capture log. Whether he had played the rebuilt game first is not recorded. The branch was pushed on his word. |
| 1.6 | 2026-11-10 | The owner said in the session: "merge the pull request". Amendment 1.3 kept the hand-built v1 on `main` "until the owner approves the rebuilt game"; the agent reads this instruction as that approval (the agent's reading, not his words). Pull request #2 (`speckit-rebuild` into `main`) is merged by the agent with a merge commit, right after the commit that holds this line. The hand-built v1 stays under tag `v1-handbuilt`. Whether he had played the rebuilt game first is not recorded. Sending the repository's URL to the Arcade stays with the owner. |
| 1.7 | 2026-11-10 | After the merge the owner said in the session: "we can also change the repo because I did play it and test it". Amendments 1.5 and 1.6 had left open whether he had played the rebuilt game; this is his statement that he has. Whether it was before his consent and the merge was not said. Asked for details, he said it was in a web browser for about 6 or 7 minutes, and a few minutes later that he was playing on an iPhone 17 Pro and "it feels smooth". The README, `ARCADE.md` and the results now give his report: SC-013 as his report, not timed; SC-011 and SC-012 stay not run, because one asks for a tester's explanation and the other for a measured frame rate on a mid-range phone. |
