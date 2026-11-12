# RIBRush

RIBRush is a static browser game for practicing route selection. It includes
seven levels and 35 deterministic IPv4/IPv6 packet scenarios. No package
installation, account, backend, or build step is required.

## Play

- Use Left/Right Arrow to select a next hop and Enter to submit.
- Press Escape to pause or resume. The visible pause button and route buttons
  also work with pointer input.
- Correct routes add 100 points. Wrong or missed packets subtract 50 points,
  cost one of five lives, and increase pressure. A run ends at zero lives.
- Sound is synthesized locally and can be muted. Run state is memory-only;
  refreshing starts a new run.

The first IPv4 level introduces easy longest-prefix, Cisco IOS/IOS XE
administrative-distance, and same-protocol metric decisions. The next three
levels deepen those skills before the final three transfer them to IPv6.
The evaluator applies longest prefix first, then lower AD only for identical
prefixes, then lower metric only when prefix, AD, and protocol match. The
selected AD values are Cisco defaults, not IETF standards or vendor-neutral
values. Each five-packet level deterministically rotates across five reviewed
prefix pools. The four IPv4 levels use 20 different destination /24 blocks in
one run, including private, documentation, and benchmarking address ranges;
these are illustrative route scenarios, not a live routing-table snapshot.
Cisco and IETF citations and the game's simplified eligible-candidate model
are documented in `specs/001-rib-routing-game/research.md`.

## Run locally

From this directory, start the static server:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000` in a modern browser. Run the browser checks at
`http://127.0.0.1:8000/tests/`; they report discovered, passed, and failed
counts and visibly fail if no fixtures are discovered.

## Validation notes

- The browser fixture page passed all 12 routing, generation, feedback, and
  run-state checks.
- A complete keyboard-only 35-packet browser run reached the seven-level
  summary with 3,500 points and five lives.
- Escape pause/resume, packet timeout penalties, sound mute, and the neutral
  no-selection behavior were checked in-browser.
- At a 320px viewport, the page had no horizontal overflow. Reduced-motion
  mode reduced packet animation to 0.01ms.
- Palette contrast was measured against the actual navy and translucent
  surfaces. The minimum measured text contrast was 5.05:1, meeting WCAG AA;
  purple is used only for borders/tinted badges with white label text.
- Browser network inspection observed only local app, module, stylesheet,
  and level-data requests; no external runtime requests were made.
- The required five-person formative network-engineer playtest has not been
  conducted and remains a release criterion.
