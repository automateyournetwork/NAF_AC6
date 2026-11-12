<!--
Sync Impact Report
Version: none → 1.0.0 (initial adoption)
Modified principles: none; established C1–C7 for the new RIBRush project.
Added sections: project purpose; C1–C7; amendment and review policy.
Removed sections: none.
Templates requiring updates: none in this change; no RIBRush spec or plan exists yet.
  The workshop input template was used without modification.
Follow-up: settle the open product and platform choices in initial-prompt.md during
  specification clarification before treating them as implementation requirements.
-->
# RIBRush · Project constitution

**Purpose:** help network engineers practice how a router selects a route from its
Routing Information Base (RIB) by deciding where each destination packet should go.

**First release:** a browser-only, static web game about RIB route selection. Time
pressure may shape play, but must never change the technically correct route.
The specification must define the exact level count, scoring, pressure, and
failure behavior before implementation.

## C1 · Route-selection truth is a release requirement

The rules engine MUST choose routes in this order: longest prefix match first;
administrative distance (AD) only among identical prefixes; then metric only
among routes with the same prefix, AD, and protocol. A more-specific matching
route MUST beat a less-specific route even when the latter has a lower AD.
Platform-specific AD values and any tie behavior not defined by the agreed model
MUST be settled and documented before they are used. BGP best-path selection is
out of scope for the RIB MVP.

Every answer MUST be reproducible from the displayed routes, destination, and
documented rules. Ambiguous, unsupported, or invalid challenges are authoring
errors: the game MUST explain that the challenge cannot be graded and MUST NOT
award or penalize a route decision. Networking claims and examples MUST cite an
authoritative source and identify the supported context.

**Evidence:** independently checked correct, incorrect, and boundary cases cover
each enabled rule and the specific-route-over-trusted-route trap. Tests verify
that changing AD cannot defeat a longer matching prefix.

## C2 · Every decision teaches a routing rule

Each round MUST show the destination and all decision-relevant route fields.
After a decision, the game MUST identify the rule that selected the winning
route, with enough values to make the comparison understandable. Incorrect
decisions MUST explain the specific mistake and allow the player to learn the
correct result; correct decisions MUST explain why the route wins. Instructions
and examples MUST teach a rule before the game relies on it.

The learning progression MUST introduce longest prefix match before AD, then
introduce metric within the stated same-protocol constraints. Challenge data
MUST NOT require unstated networking knowledge.

**Evidence:** a reviewer can trace each answer explanation to the evaluated
routes and connect each level to a defined learning outcome.

## C3 · Pressure never changes correctness

The specification MUST define how speed, score, penalties, and any fail state
work. Pressure MAY change pacing or the player's game state, but MUST NOT alter
route selection, turn a wrong decision into a correct one, or obscure which
rule decided the route. Invalid input MUST be distinguished from an incorrect
route. The game MUST give clear, timely feedback after every valid decision.

Progress, score, pressure, and correctness MUST remain distinct concepts in
both game logic and feedback. A speed bonus MUST NOT be presented as evidence
of routing mastery.

**Evidence:** tests cover correct and incorrect decisions at different pressure
states, invalid input, and any configured penalty or terminal state.

## C4 · Access and visual meaning are part of the game

Every core action MUST be available by keyboard, with visible focus and
descriptive labels. Color MUST NOT be the only indication of route source,
selection, success, or error. Essential route and packet information MUST
remain available as text, and motion MUST respect the user's reduced-motion
preference without delaying controls or feedback.

The visual theme MUST use the approved Itential dark palette and surface
conventions in `initial-prompt.md`; it MUST NOT introduce unapproved colors or
light backgrounds. Text and controls MUST meet WCAG AA contrast requirements.
Typography choices, including font delivery, MUST be clarified before planning;
gameplay MUST remain usable if an optional font cannot load.

**Evidence:** record keyboard-only and reduced-motion playthroughs, a narrow
viewport check, and measured contrast for shipped text and controls.

## C5 · The game is browser-only and self-contained

All game logic, route and packet generation, and evaluation MUST run in the
browser. The deliverable MUST be static web files with no backend, server-side
game logic, database, external API, account, multiplayer, or shared state.
Browser storage MAY be used only after its purpose and behavior are specified.
Core gameplay MUST NOT depend on an external runtime service.

Generated routes and packets MUST be deterministic, valid under the selected
model, and reproducible from documented generation inputs. The game MUST NOT
silently substitute mock, invented, or fallback challenges when generation or
content validation fails; it MUST show an explicit error instead.

**Evidence:** play and test from static files using only browser-side logic;
repeat generation with the same inputs and verify identical valid cases.

## C6 · Rules, generated content, and presentation remain reviewable

Keep route-selection logic separate from rendering, timing, scoring, and
progress. Store rule-relevant route and challenge data in an inspectable form,
and validate it before play. The rules engine MUST be the single authority for
the winning route; animations, answer positions, and display code MUST NOT
decide correctness.

Every generated challenge MUST have a unique, rule-supported result under the
declared model, or be rejected before it reaches the player. Adding a challenge
within the existing rules MUST NOT require a separate hidden scoring rule.

**Evidence:** trace representative generated challenges through validation and
the evaluator; test malformed and ambiguous inputs; verify the interface
displays the evaluator's result without changing it.

## C7 · Done is demonstrated

Requirements, design, implementation, and README MUST describe the same
agreed scope. A feature is complete only when its required acceptance criteria
have recorded results. The project MUST distinguish passed, failed, and
untested checks; a completion message or checked task box is not evidence.

When time is limited, reduce scope explicitly and preserve route correctness,
clear explanations, and usable core controls before adding visual effects.

**Evidence:** another person can launch the static game, complete a fresh
session, and inspect reproducible rule-engine test results and documented
limitations.

## How we change these rules

Amendments require an agreed rationale, an updated version and date, and a
sync impact report. Major versions indicate incompatible changes to principles
or governance; minor versions add principles or materially expand obligations;
patch versions clarify wording without changing obligations. Before release
and after any material amendment, review the specification, plan, tests, and
README for compliance. The build agent MUST surface conflicts and unresolved
decisions rather than weakening a principle to make an implementation pass.

**Version**: 1.0.0 | **Ratified**: 2026-11-11 | **Last Amended**: 2026-11-11
