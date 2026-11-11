# Cross-artifact analysis (lab step 6)

`/speckit-analyze` compares `spec.md`, `plan.md` and `tasks.md` in `specs/001-backbone-first-playable/` with each other and with the constitution (version 1.1.0). The command itself is read-only. As the lab asks, the findings were then fixed and the analysis was run again. The owner was away; the build agent did both passes on 2026-11-10 and made the fixes without a review. Each fix is listed so the owner can check it.

## Pass 1: findings

| ID | Category | Severity | Where | Finding | Fix made |
| --- | --- | --- | --- | --- | --- |
| D1 | Constitution | CRITICAL | spec FR-032(b) | A rendered-frame share of green or red above zero was to be "listed as a known limit". C4 is absolute, and Governance says only the owner accepts a deviation. | FR-032(b) now says the target is zero and any share above zero is a deviation that is reported as a number and taken to the owner. The 1% line is kept only as a regression guard. |
| D2 | Constitution | HIGH | tasks T063 (old numbering) | C1 requires a review of all shipped explanatory text. The task covered `text.json` only, not the README's model section. | The review task now covers both and comes after the README is rewritten (T065). |
| F1 | Inconsistency | HIGH | tasks, Phase 6 | AC20 (play without WebGL) was checked before the WebGL renderer existed, so the check proved nothing. | New task T057 in Phase 8: WebGL2 made unavailable, automatic fallback, and both renderers reporting the same scene. |
| F2 | Inconsistency | MEDIUM | tasks T051, T057 (old) | The welcome screen used the hero image before the task that creates it. | T051 leaves a place for it; T058 creates it and shows it. |
| F3 | Inconsistency | MEDIUM | tasks T048 (old) | The no-color-literal test was written in Phase 6, after drawing code. | Moved to Phase 2 (T018), before any drawing code. |
| E1 | Coverage | MEDIUM | tasks | 17 of 40 requirements and 9 of 13 success criteria were covered by content but not named by ID in any task. The PID asks every task to name what it serves. | Every task now cites its FR, R, AC, SC, case or principle. |
| E2 | Coverage | MEDIUM | spec FR-029 | "Every control has a readable name" had no check. | Added to the User Story 4 checks (T050) and the plan's verification table. |
| E3 | Coverage | MEDIUM | plan R13 | Fonts and their licence text had no task. | Added to T032. |
| E4 | Coverage | LOW | spec Edge Cases | Six edge cases had no named test: a new site dark after its grace period, no cut when no link is up, a packet losing its route on the way, a cost change dropping nothing, the site limit, a resize during a run. | Added to T021 and T050. |
| B1 | Ambiguity | MEDIUM | spec FR-037 | "High contrast and large type" could not be measured. | Contrast of at least 4.5 to 1 for text; no text under 16 CSS pixels at 1920×1080 or 11 at 844×390. Set by the build agent from the approved mock's base unit; flagged for the owner in the spec's Assumptions. |
| B2 | Ambiguity | LOW | tasks T026 (old) | The tuning target was "mostly… a few minutes". | Median scripted run of 4 to 8 minutes, queue drops the largest cause in at least six of eight seeds. |
| B3 | Ambiguity | LOW | spec FR-012, FR-018 | Rounding of link length unstated; "a few sites" not marked tunable. | Both stated. |
| F4 | Terminology | LOW | spec, plan | "2D renderer", "fallback renderer" and "Canvas 2D renderer" name one thing; "bot" and "scripted player" name another. | The plan now defines both names once. |
| F5 | Inconsistency | LOW | plan, tasks | The plan has seven slices and the tasks nine phases, with no mapping. | The plan states the mapping. |
| G1 | Open decision | INFO | spec Clarifications | K6: v1 reward offers are the same every time, against the wording of the owner's decision Q2. | None. Waits for the owner. |

No duplicated or conflicting requirement was found. No placeholder was left.

## Pass 2: after the fixes

| Measure | Result |
| --- | --- |
| Functional requirements named by a task | 40 of 40 |
| Success criteria named by a task | 13 of 13 |
| Acceptance criteria named by a task | 26 of 26 |
| Simulation rules R1–R14 named by a task | 14 of 14 |
| Constitution principles named by a task | 7 of 7 |
| Tasks | 70, numbered in order, each with a path or command |
| Tasks naming no requirement | 5 setup tasks (T002–T006) and the type definitions (T008), which serve the whole build |
| Critical or high findings left | 0 |
| Placeholders | 0 |
| Preservation check against `StarterKit/SPEC.md` | Pass, 246 pieces |

Open after pass 2: K6 (owner's decision), and the three checks that need a person (SC-011, SC-012, SC-013), which are recorded as not run.

## How it was checked

A script counted, for every requirement, rule and criterion in the spec, the tasks that name it, and checked the task format and order. The build agent then read the three files against the constitution principle by principle. The script is not part of the game; the counts above are its output.
