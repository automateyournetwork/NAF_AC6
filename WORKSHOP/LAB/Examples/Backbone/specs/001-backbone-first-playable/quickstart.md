# Quickstart: run and validate Backbone v1

How to play the build and how to check it. Commands are run from the repository root. They are proposals until the implementation exists; the README records the commands that were actually run and their results.

## Play (no install)

```sh
python3 -m http.server 8791 --bind 127.0.0.1 --directory dist
```

Open <http://127.0.0.1:8791>. Any free port works. The game needs no network once loaded.

## Develop and check

Prerequisites: Node 26 and npm 11. For the videos: ffmpeg. For the optional OSPF comparison: Docker.

```sh
npm ci                    # install the pinned build tools
npm test                  # unit tests (Vitest)
npm run build             # type-check, then build into dist/
npm run verify:dist       # committed dist/ equals a fresh build
npx playwright install chromium   # once
npm run test:e2e          # end-to-end tests against dist/ (Playwright, Chromium)
npm run record            # seeded-run videos at 844×390 and 1920×1080
python3 tools/frr_check.py        # optional: compare routing cases with FRR in Docker
```

## Validation scenarios

Each scenario names what it proves. Record every result as pass, fail or not run.

| # | Scenario | Expected | Proves |
| --- | --- | --- | --- |
| 1 | `npm test` | Cases 1–12 pass with values from `tests/fixtures/ospf-cases.json`; the oracle agrees on at least 300 graphs; hashes match across two runs; purity, palette and content checks pass | SC-001, SC-002, SC-003, C5, C6, FR-032a |
| 2 | Start a run with seed `stage-1`; drag between two sites | A link appears, fiber is spent, pulses flow | AC1, AC2 |
| 3 | Try a link with too little fiber, to the same site, and a duplicate | Nothing is spent; a text message says why | AC5 |
| 4 | Pause; change a cost; read the inspector; resume | The change is shown as pending, applies on resume, and pulses move to the new lowest-cost path | AC4, AC12–AC14 |
| 5 | Pause; select a site in the inspector | Its route table: every destination, total cost, next hop | AC26 |
| 6 | Remove an up link; try to remove a cut link | Fiber returns in full; the cut link is refused with a message | AC24, AC25 |
| 7 | Let the scripted player run to game over (`?bot=1&autostart=1`) | Congestion in amber with pattern and icon; a fiber cut in magenta with a ripple; the meter rises by the drops; the run ends with score, time and time-lapse | AC6–AC11 |
| 8 | Play by keyboard only | A link laid, a cost changed, an upgrade applied, a pause, a reward chosen, with focus visible | AC17 |
| 9 | Phone size by touch (844×390) | Drag lays a link, tap opens options, pinch zooms, two-finger drag pans | AC15 |
| 10 | `?renderer=2d`, and reduced motion on | Same information; no sweeps, parallax or trails | AC19, AC20 |
| 11 | Same seed and inputs twice; reload | Same final score; the best score is on the welcome screen | AC21–AC23 |
| 12 | End-to-end run with every non-local request blocked | The run completes; zero requests left the machine | SC-006 |
| 13 | Color census of screenshots in both renderers | The share of pixels in the green and red bands, as numbers | FR-032b |
| 14 | A person makes a deliberately bad cost change | They can say which link heated up and why from the screen alone | SC-011 (needs a person) |
| 15 | A person plays on a mid-range phone | 60 frames per second; a run of 5 to 10 minutes | SC-012, SC-013 (need a person) |

Details of the simulation interface are in [contracts/simulation.md](contracts/simulation.md), the data files in [contracts/content.md](contracts/content.md), and controls and switches in [contracts/ui.md](contracts/ui.md).
