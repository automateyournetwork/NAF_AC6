# Quickstart: RIBRush

RIBRush is implemented as static browser files with no package installation,
account, backend, or build step.

## Run locally

From the RIBRush project directory:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000` in a desktop browser. On macOS, the URL can be
opened from a second terminal with:

```sh
open http://127.0.0.1:8000
```

Keep the server running while playing; press Ctrl+C to stop it. If port 8000 is
in use, start the server on 8001 and open `http://127.0.0.1:8001`.

The local server only serves static files. It does not host game logic or
provide an API. Opening `index.html` through `file://` is not supported because
the application uses browser modules and local data files.

## Run browser tests

After implementation and while the same server is running, open
`http://127.0.0.1:8000/tests/`. The page reports discovered, passed, and failed
cases. A zero-test run is a failure.

## Verified checks and remaining release item

- The browser checks report 12 discovered, 12 passed, and 0 failed.
- A keyboard-only browser run completed all 35 packets and all seven levels.
- Escape pause/resume, timeout penalties, and the mute control were checked.
- At a 320px viewport, there was no horizontal page overflow; reduced-motion
  mode shortened the packet animation.
- Runtime requests remained local to the app and its static assets.
- The five-person network-engineer formative playtest remains outstanding.
- Preserve the Cisco IOS XE 17.x AD citations and IPv4/IPv6 longest-prefix
  references in `specs/001-rib-routing-game/research.md` when changing
  networking content.
- Keep `Unknown*` excluded from runtime routes and describe the game's
  route-installation/forwarding simplification accurately.
- Record any future failed or untested check in the README.
