# Contract: controls, switches and stored data

What the game exposes to a player, to a tester and to the browser. Every input listed here is validated before use (SEC-11, SEC-12). All dynamic text reaches the page through `textContent` (SEC-14).

## Controls

| Action | Touch | Mouse | Keyboard |
| --- | --- | --- | --- |
| Lay a link | Drag from one site to another | Drag from one site to another | In the inspector: focus a site, Enter to start a link, focus the far site, Enter |
| Open a link's options | Tap the link | Click the link | In the inspector: focus the link, Enter |
| Change cost | − and + buttons, or type a number | Same | Same; Enter confirms a typed cost |
| Upgrade capacity | Upgrade button in the link's options | Same | Same |
| Remove a link | Remove button in the link's options | Same | Same |
| Pause and resume | Pause button | Pause button | Space |
| Choose a reward | Tap a choice | Click a choice | Tab to a choice, Enter |
| Select a tool | Tool buttons | Tool buttons | 1 lay link, 2 set cost, 3 upgrade, 4 remove |
| Open or close the inspector | Inspector button | Inspector button | I |
| Zoom | Pinch | Wheel | + and − |
| Pan | Two-finger drag | Drag on empty map | Arrow keys while the map has focus |
| Close a panel, cancel a link in progress | Close button | Close button | Escape |

Selecting a tool decides which control gets focus when a link's options open; dragging between two sites always lays a link. Focus is always visible. Every control has a readable name. No action has a time limit.

## Screens

Welcome (hero art, briefing card, seed field, Start, best scores, About the model, reduced-motion switch) → run (map, HUD, messages) ⇄ pause (inspector) or reward choice → game over (score, time, seed, time-lapse, New run).

HUD, always visible during a run: fiber budget, upgrade stock, drop meter with its number, score, time, seed, pause button.

## URL switches

For testing, recording and the fallback. Unknown switches and values that do not match are ignored.

| Switch | Values | Effect |
| --- | --- | --- |
| `seed` | 1 to 24 letters, digits or hyphens | Pre-fills the seed |
| `autostart` | `1` | Skips the welcome screen and starts the run |
| `renderer` | `gl` or `2d` | Forces a renderer |
| `motion` | `reduced` or `full` | Overrides the reduced-motion setting |
| `bot` | `1` | The scripted player plays |
| `speed` | `1`, `2`, `4`, `8` or `16` | Simulation steps per real step interval |
| `hud` | `0` | Hides the HUD (hero art capture) |
| `test` | `1` | Exposes the test hook below |

## Test hook

With `test=1` the page exposes `window.__backbone`, read-only except where noted:

- `state()`: step, score, meter, budget, paused, over, renderer name, reduced motion.
- `sites()` and `links()`: IDs, codes, state and screen positions, so a test can drag between real sites.
- `linkLoads()`: packets on each link direction, by source and destination.
- `advance(steps)`: runs steps at once (testing only).

The hook reads the world; it never changes rules.

## Stored data

| Key | Shape | Validation |
| --- | --- | --- |
| `backbone.scores.v1` | List of up to five `{ score, steps, seed }` | Whole numbers ≥ 0; seed pattern as above; anything else is dropped |
| `backbone.settings.v1` | `{ reducedMotion }` | `auto`, `on` or `off`; anything else becomes `auto` |

Nothing else is stored. Nothing is sent over the network.
