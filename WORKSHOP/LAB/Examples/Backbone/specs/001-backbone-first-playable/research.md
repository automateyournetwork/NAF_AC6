# Research: Backbone v1

Phase 0 of the plan. Each entry records a decision, why it was made and what else was considered. The Technical Context had no open "NEEDS CLARIFICATION" item: the stack was approved in `StarterKit/PLAN.md` and the remaining unknowns below are design choices inside it. Nothing here was delegated to a research agent; the build runs as one agent (`docs/PID.md`, PIS-13).

Versions were read on 2026-11-10 with `node --version`, `npm --version`, `docker version` and `npm view <package> version`. They are confirmed from the lockfile after install.

## R1 · Stack

- **Decision**: TypeScript 7.0.2 (strict), Vite 8.3.7, Vitest 5.1.0, @playwright/test 1.65.0, Node 26.3.1. No runtime dependency.
- **Rationale**: The owner approved this stack. Types catch ID and unit mix-ups in a state machine. Vite gives a hashed, relative-path bundle. Vitest runs the pure simulation without a browser. Playwright sends real touch, pointer and key events and records video.
- **Alternatives considered**: PixiJS (a large dependency and a second code path for the tilt and bloom); Three.js (more than a flat map needs); no build step with plain ES modules (the owner asked for a build output folder, and TypeScript needs a compile step).

## R2 · Determinism

- **Decision**: The simulation advances only through `step`, in a fixed order of work written in `contracts/simulation.md`. Rates use whole-number accumulators, not elapsed time. Three separate seeded streams drive site selection, traffic and events.
- **Rationale**: Whole-number accumulators give exact counts (case 9 needs 40, 8 and 12 to the packet). Separate streams keep traffic identical whatever the player builds, so "emission is decided by the seed alone" (FR-006) is true and testable. A fixed order of work makes the hash at every step reproducible (R13).
- **Alternatives considered**: One shared stream (the player's topology would then change the traffic); time-based rates with floating point (exact counts would depend on rounding).

## R3 · Random number generator

- **Decision**: A small 32-bit generator (sfc32) whose state is four whole numbers stored in the world, seeded from the seed text with a string hash.
- **Rationale**: The state is plain data, so it clones, hashes and replays with the rest of the world. No dependency.
- **Alternatives considered**: `Math.random` (forbidden by C5 and not seedable); a single 32-bit state generator such as mulberry32 (shorter period, no benefit).

## R4 · Shortest paths and next hops

- **Decision**: Dijkstra from every router over the links that are up, with whole-number costs. For each destination it keeps the set of first hops on all lowest-cost paths, sorted by router ID, and then keeps the first `maxPaths` of them (1 in v1 play).
- **Rationale**: This is §16.1 of RFC 2328 reduced to point-to-point links. Costs are at least 1, so every predecessor on a lowest-cost path is final before its successor is reached, and first-hop sets can be merged as edges are relaxed. Twelve routers make speed irrelevant.
- **Alternatives considered**: Floyd–Warshall (gives costs but not next-hop sets as directly); recomputing only affected routers (an optimisation with no need at this size and a risk to correctness).

## R5 · Independent oracle

- **Decision**: A test-only depth-first search lists every simple path between two routers on small random graphs, takes the lowest total cost, and collects the first hops of the paths that reach it.
- **Rationale**: It reaches the same answers by a different method and shares no code with `spf.ts`, so a mistake in one is unlikely to be repeated in the other.
- **Alternatives considered**: A second Dijkstra (same method, same blind spots); only the hand cases (too few to catch tie-handling mistakes).

## R6 · Queue and step order

- **Decision**: In each step a link direction first serves from its queue, then accepts arrivals (spec clarification of 2026-11-10). Service uses a credit that grows by the capacity each step and is spent one packet at a time; an idle direction keeps at most one packet of credit.
- **Rationale**: Worked by hand, this order gives case 9 exactly 40 served, 8 queued and 12 dropped; arrivals first gives 40, 7 and 13. Capping idle credit stops a quiet link from releasing a burst later.
- **Alternatives considered**: Arrivals before service (contradicts the hand-worked case); unlimited banked credit (bursts above capacity).

## R7 · Map, distances and data sources

- **Decision**: Site positions are longitude and latitude in `region-na.json`. The loader projects them to kilometres with an equirectangular projection at the region's reference latitude. A link's length is the straight-line distance between its ends on that map. Site coordinates and the coastline come from Natural Earth 1:50m public-domain data (populated places, land, lakes), reduced by `tools/build-map.mjs`.
- **Rationale**: The player pays for the length they see. The projection is two lines of arithmetic and is good enough across one continent. Natural Earth is public domain and its files can be hashed for the provenance record.
- **Alternatives considered**: Great-circle distance (differs from the drawn length); an equal-area conic projection (more code, no visible gain); coordinates from the model's memory (not a source).
- **Known gotcha, from the hand-built v1's capture log**: a line simplifier that measures distance from a chord fails on closed rings, where the chord has no length. The simplifier here measures from the point when the chord is degenerate.

## R8 · Rendering

- **Decision**: The view model turns the world into a screen-space scene: line segments with width and brightness, discs, labels, icons and effects. The camera does the projection on the CPU. The WebGL2 renderer draws that scene as instanced quads with glow and a half-resolution blur for bloom. The Canvas 2D renderer draws the same scene with strokes and fills. Labels, icons and patterns are drawn by one overlay routine on a 2D canvas above either renderer.
- **Rationale**: One scene for two renderers means the fallback shows the same information by construction (AC20). A few hundred primitives per frame are cheap to project in JavaScript. Text in one place avoids two text paths.
- **Alternatives considered**: Projection in the vertex shader (the fallback would need its own projection code); DOM or SVG for the map (too slow for trails and bloom on a phone).
- **Known gotcha, from the hand-built v1's capture log**: additive bloom that clips each channel separately turns amber into yellow. The final pass scales a too-bright color down as a whole so its hue is kept.

## R9 · Color safety

- **Decision**: Every color is in `palette.json`. Styles and drawing code hold no color literal; a unit test enforces both that and the hue bands. Pulses are ice white, which stays near neutral when it adds to any link color. A congested or cut link is drawn in its state color instead of on top of its normal color. The rendered-frame census decodes full-page screenshots in Node.
- **Rationale**: Blending is where green and red can appear without anyone writing them: cyan added to amber lands in the green band, and amber over magenta lands in the red band. Keeping state colors exclusive and pulses neutral removes the common cases. Decoding screenshots outside the page checks the DOM and the canvas together and does not rely on the game to measure itself.
- **Alternatives considered**: A census run inside the page (covers the canvas only and trusts the code under test); no rendered check (FR-032b requires the number).

## R10 · Input and keyboard play

- **Decision**: Pointer events for mouse and touch on the map. For the keyboard, the inspector holds real buttons for every site and link; choosing one outlines it on the map. Link options, the reward choice and the screens are ordinary DOM controls.
- **Rationale**: Real buttons bring focus handling, readable names and activation keys for free (C4), and they are what a screen reader meets. Hit areas of at least 44 CSS pixels keep touch reliable on the tilted map.
- **Alternatives considered**: A keyboard cursor drawn on the canvas (focus and names would have to be rebuilt by hand).

## R11 · Pause and pending changes

- **Decision**: While paused, each command is checked against a copy of the world that already holds the earlier pending commands. Accepted commands are shown as pending and are all sent in the first step after resume, so there is one route calculation. The route table in the inspector reads the real world, not the copy.
- **Rationale**: This is AC14 and FR-024 as written, and it keeps FR-025: nothing computed from a pending change is shown except the budget it will spend.
- **Alternatives considered**: Applying changes at once while paused and freezing time (the routes would be visible before resume, which is a preview).
- **As built** (after the code reviews of 2026-11-10): the same path is used at all times, not only while paused. Every command is checked at once against the copy and is pending until the next simulation step applies it: at most one step while the game runs, until resume while paused, and until the choice while a reward waits (FR-016). The copy stays the planned world, which the budget and a link's options read, until that step has run. "After pending" is shown only while time stands still. The view's centre is also kept inside the box the map was fitted to, so the map cannot be panned out of sight.

## R12 · Storage

- **Decision**: Best scores and the reduced-motion setting are kept in the browser's local storage under versioned keys. Everything read back is validated field by field; anything that fails is ignored. If storage is refused the game plays and says scores are not kept.
- **Rationale**: FR-023 and the secure-build rules on input validation (SEC-11, SEC-12).
- **Alternatives considered**: IndexedDB (more than five numbers need); no validation (stored data is input like any other).

## R13 · Typeface

- **Decision**: IBM Plex Sans and IBM Plex Mono, SIL Open Font License 1.1, shipped inside the build from the pinned @fontsource packages, with the licence text.
- **Rationale**: Openly licensed, self-hosted (no network at run time), and the face the owner accepted for the hand-built v1.
- **Alternatives considered**: System fonts (the hand-built v1's mock rendered in an unexpected italic face in headless Chrome).

## R14 · Build output

- **Decision**: `dist/` is committed (decision D1) and `npm run verify:dist` rebuilds into a temporary folder and compares every file.
- **Rationale**: A player or the Arcade host needs no install, and the committed build cannot drift from the source unnoticed.
- **Alternatives considered**: Publishing with GitHub Pages only (offered to the owner as D1's alternative and not chosen).

## R15 · Comparison with a real OSPF implementation

- **Decision**: `tools/frr_check.py` builds T1 and T2 from FRR containers (`quay.io/frrouting/frr:10.7.1`, native arm64) joined by one Docker network per link. It refuses to compare until every adjacency is Full and every router ID is as configured, then reads the OSPF routes as JSON and compares cost and next hops with the fixtures.
- **Rationale**: Decision D4. The image and the health gate come from the owner's lab notes: the Docker Hub image is an emulated amd64 build in which an adjacency once failed to form, and a comparison made against a half-formed topology proves nothing.
- **Alternatives considered**: ContainerLab (not installed on this machine); parsing text output (the owner's rule is structured data for verification).

## R16 · Hero art, videos and the time-lapse

- **Decision**: The hero image is a frame of the game's own renderer, captured with Playwright and converted to WebP. The seeded-run videos are Playwright recordings of the scripted player, converted to MP4 with ffmpeg. The end-of-run time-lapse replays the recorded commands through the simulation at high speed.
- **Rationale**: Decision Q7 (no image generator). Videos of a fixed seed are evidence the owner can watch and repeat. R14 requires the time-lapse to be a re-simulation.
- **Alternatives considered**: A hand-drawn illustration (not the game); a recorded video for the time-lapse (forbidden by R14).
