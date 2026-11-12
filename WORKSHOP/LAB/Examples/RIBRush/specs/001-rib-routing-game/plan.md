# Implementation Plan: RIBRush RIB Routing Puzzle

**Branch**: `001-rib-routing-game` | **Date**: 2026-11-11 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification in `specs/001-rib-routing-game/spec.md`

## Summary

Build a static, browser-only routing puzzle in which network engineers select
next hops for generated IPv4 and IPv6 destinations. A pure evaluator applies
longest prefix match, Cisco IOS/IOS XE administrative distance for identical
prefixes, and same-protocol metric comparison. A seeded generator produces
validated scenarios; the UI presents keyboard-driven play, time pressure,
rule-specific feedback, and a run summary.

The MVP is seven levels with five packets each, no persistence, no runtime
services, and no build step. User-provided Cisco AD values are the baseline.
The first IPv4 level is a warmup mixing simple longest-prefix, same-prefix AD,
and same-protocol metric examples. The next three IPv4 levels deepen those
rules before the IPv6 transfer levels.
The Cisco IOS XE 17.x reference and IPv4/IPv6 longest-prefix references have
been verified and are recorded in research.md.

## Technical Context

**Language/Version**: ECMAScript 2022+ browser modules, HTML5, CSS  
**Primary Dependencies**: None; browser APIs only  
**Storage**: In-memory run state; no persisted data  
**Testing**: Dependency-free browser test page plus manual keyboard, motion, and contrast checks  
**Target Platform**: Current desktop evergreen browsers, served from localhost or a static host  
**Project Type**: Static browser game  
**Performance Goals**: Keyboard decisions and route evaluation respond within one frame; packet motion targets 60 fps on a typical desktop  
**Constraints**: No backend, account, external service, runtime network request, remote font, persistence, touch/mobile requirement, or fallback challenge data  
**Scale/Scope**: One player, seven sequential levels (four IPv4 followed by three IPv6), five packets per level; 20 unique IPv4 destination `/24` blocks across one run; deterministic selection from varied prefix pools; 2–5 matching candidate routes per packet

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The governing constitution for this project is
[`WORKSHOP/LAB/Examples/RIBRush/CONSTITUTION.md`](../../CONSTITUTION.md).
The repository-root constitution is scoped to Per-Hop Works and is not applied
to RIBRush.

| Principle | Check |
| --- | --- |
| C1 · Route-selection truth | Pass: Cisco IOS XE 17.x AD references and IPv4/IPv6 longest-prefix references are recorded; the game-specific model boundary is explicit. |
| C2 · Decisions teach | Pass: every outcome reports the deciding rule and relevant values. |
| C3 · Pressure never changes correctness | Pass: evaluation is independent of score, lives, and pressure; penalties follow evaluation. |
| C4 · Access and visual meaning | Pass: keyboard controls, text feedback, reduced motion, and contrast checks are planned. |
| C5 · Browser-only | Pass: static files, local preview, no external runtime dependency or persistence. |
| C6 · Reviewable rules and content | Pass: pure evaluation, seeded generation, validation, and separate UI/session state. |
| C7 · Demonstrated completion | Pass: fixed reference cases, browser checks, and recorded results are part of release evidence. |

No constitution violations are accepted. Source verification is a release gate;
no unsupported Cisco or IPv6 claim may be added to authored game content.

## Project Structure

### Documentation (this feature)

```text
specs/001-rib-routing-game/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── ui.md
```

### Source Code (RIBRush project root)

```text
RIBRush/
├── index.html
├── styles.css
├── AGENTS.md
├── src/
│   ├── app.js
│   ├── routing/
│   │   ├── address.js
│   │   ├── evaluate.js
│   │   ├── generate.js
│   │   └── validate.js
│   ├── game/
│   │   └── session.js
│   ├── ui/
│   │   └── views.js
│   └── audio/
│       └── cues.js
├── data/
│   └── levels.json
├── tests/
│   ├── index.html
│   ├── fixtures.js
│   └── route-cases.json
└── README.md
```

**Structure Decision**: Keep one static application at the RIBRush project root.
The routing evaluator, address utilities, generator, and validator remain
separate from session state, UI rendering, and optional audio. Browser tests
reuse pure modules and independent literal fixtures. The first four IPv4 levels
use disjoint destination `/24` pools so a run does not repeat the same IPv4
block across its 20 warmup packets. The suggested 2–5 candidate-route limit is
a planning choice to keep each displayed decision reviewable; validate it
during the first playable loop.

## Design and Implementation Sequence

1. **Source and rule gate**: use the verified Cisco IOS XE 17.x AD references
   and IETF IPv4/IPv6 longest-prefix references in `research.md`. Keep
   `Unknown*` out of runtime data and preserve the documented game-model
   boundary between route installation and forwarding.
2. **Address and evaluator core**: implement IPv4/IPv6 prefix parsing and
   containment, route validation, the strict precedence rules, and explicit
   no-route/ambiguous results. Verify against independent fixed cases.
3. **One playable loop**: implement seeded LPM, AD, and metric warmup scenarios,
   a level briefing, falling packet, arrow-key next-hop selection, Enter
   submission, score/life change, and rule-specific feedback.
4. **Curriculum and session**: add all seven levels, 35 packets, 20 distinct
   IPv4 destination blocks, progression, pressure tiers, pause/resume, failure,
   replay, and final summary.
5. **Presentation and evidence**: add the approved palette, responsive desktop
   layout, reduced motion, optional original audio, browser tests, local run
   instructions, and human verification records.

Each slice has a browser-testable exit criterion. A failed data or source gate
stops content expansion; visual polish cannot bypass it.

## Constitution Check (Post-Design)

| Principle | Result |
| --- | --- |
| C1 · Route-selection truth | Pass: official Cisco IOS XE 17.x AD references and IETF IPv4/IPv6 longest-prefix references are recorded; authored content must retain the model boundary. |
| C2 · Decisions teach | Pass: every route choice returns the deciding rule and the values needed for explanation. |
| C3 · Pressure never changes correctness | Pass: route evaluation is pure; timing and penalties consume its result but cannot change it. |
| C4 · Access and visual meaning | Pass: keyboard selection, text feedback, reduced motion, palette limits, and contrast verification are included. |
| C5 · Browser-only | Pass: static delivery, no runtime service, no external request, and no persistence. |
| C6 · Reviewable rules and content | Pass: evaluator, scenario generator/validator, session state, and view/audio responsibilities are separated. |
| C7 · Demonstrated completion | Pass: independent route fixtures, browser tests, manual checks, and recorded results are required. |

No design change weakens a RIBRush principle. The verified source and model
boundary are mandatory constraints on authored content.

## Verification Strategy

- Keep evaluator inputs and outputs plain data; do not import DOM, audio,
  timing, or score state into route selection.
- Test reference outcomes from the spec using expected results written
  independently of the evaluator.
- For generation, test identical seed/level/packet inputs for identical output,
  then validate every output's family, prefix, AD, metric, match, and unique
  winner. Verify Level 1 covers LPM, AD, and metric; verify that its five
  packets and the next three IPv4 levels use 20 distinct destination `/24`
  blocks across one run.
- Test invalid and ambiguous generated data as content errors, not player
  mistakes; verify errors never charge lives, points, or pressure.
- Run the browser test page at `/tests/` from the local static server. It must
  display discovered, passed, and failed test totals and fail visibly if no
  tests are discovered.
- Record keyboard-only, narrow-window, reduced-motion, contrast, mute, reload,
  and external-request checks in the project README.

## Interfaces and Agent Context

The game exposes no network API, backend endpoint, or shared-state interface.
The keyboard and screen-state contract is documented in
[`contracts/ui.md`](./contracts/ui.md).

The repository's `update-agent-context.sh codex` writes the repository-root
`AGENTS.md`, outside the user's RIBRush-only change boundary. It is therefore
not run. A new project-scoped `RIBRush/AGENTS.md` records only this plan's
technology, structure, and local commands.

## Complexity Tracking

No constitution violations or additional runtime dependencies are introduced.
The address parser and deterministic generator are bounded to the supported
protocol set; future BGP best-path behavior requires a separate plan.
