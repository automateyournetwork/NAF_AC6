# Role

You are a specification agent. Your job is to produce a clear, buildable product and technical spec for a web game. Do NOT write implementation code yet. If anything is ambiguous or missing, ask me clarifying questions before writing the spec. Do not fill gaps with assumptions, and do not use mock or fake data as a fallback anywhere in the design unless I explicitly request it.

# Project

- **Name:** RIBRush (final)
- **Repo directory:** `RIBRush`
- **Type:** Browser-only, time-pressure puzzle game.
- **Audience:** Network engineers. It should be fun, and it should reinforce how a router's routing table (RIB) selects routes.

# Platform constraints

- The app runs entirely in the browser. There is no backend, server-side logic, database, or API calls to external services.
- It must be deployable as static files (e.g. any static host or opened from a local web server) with no server runtime required.
- All game logic, including route and packet generation and the rules engine, runs client-side.
- Any persistence (settings, progress, high scores) must use browser-side storage only. Propose the mechanism and ask me to confirm it.
- Do not design features that depend on accounts, networking, or shared state. Anything that would need a server (leaderboards, multiplayer) is out of scope.

# Core concept

The player acts as the forwarding decision. Destination IP addresses ("packets") fall toward a routing table. For each packet, the player must route it to the correct next hop by applying routing-table selection rules to overlapping candidate routes. Correct decisions clear packets and score points. Wrong decisions cost the player and raise pressure. Speed ramps up over time, in the spirit of Tetris.

# Rules the game must model (MVP scope: RIB only)

Route selection happens in this strict order:

1. **Longest prefix match:** the most specific route that matches the destination wins, regardless of admin distance or metric.
2. **Administrative distance:** applies only among routes with the identical prefix length and prefix, and the lowest AD wins.
3. **Metric:** applies only among routes from the same protocol with the same prefix and AD, and the lowest metric wins.

Required teaching moment (a deliberate gameplay trap): a more specific route from a less trusted source (e.g. an OSPF /24, AD 110) beats a less specific route from a more trusted source (e.g. a static /16, AD 1) for a matching destination.

# Refined difficulty progression

- Level 1: a warmup mixing simple longest-prefix, same-prefix AD, and same-protocol metric examples, in that order
- Level 2: deepen IPv4 longest-prefix-match practice without relying on AD or metric
- Levels 3–4: focus on IPv4 administrative distance (including the specific-beats-trusted trap) and metric tiebreaks
- Levels 5–7: transfer longest-prefix match, administrative distance, and metric tiebreaks to IPv6
- Sample varied prefixes from deterministic pools so the packets are not all from one subnet. Use a mix of private and non-private example ranges; these are illustrative routes, not a live routing-table snapshot.
- After each decision, show which rule decided it (e.g. "Won on longest prefix match: /24 over /16") so the player learns by repetition.

# Theme: Itential brand (dark mode only)

The game must look native to Itential's dark-mode design language: precise, technical, modern.

## Color palette

| Role | Hex |
|---|---|
| Background (Navy) | `#00001E` |
| Text, primary | `#FFFFFF` |
| Text, secondary | `rgba(255,255,255,0.65)` |
| Accent Blue (primary: key actions, active borders, primary flow) | `#0099FF` |
| Accent Pink (emphasis, highlights, badges) | `#FF0095` |
| Teal (supporting elements, alt borders) | `#00F3DB` |
| Purple (variety, external elements) | `#AD0AFD` |
| Citrine (rare: data callouts only) | `#CCFF00` |

Surface conventions from the brand:
- Panels and cards use translucent tints of an accent over the navy background (roughly 10–15% opacity fills with a 1–1.5px solid accent border), 6–8px corner radius.
- Container and group boxes use `rgba(255,255,255,0.04)` fill with a 1px dashed `rgba(255,255,255,0.15)` border, 12px radius.
- Neutral elements use `rgba(255,255,255,0.06)` fill with a 1px `rgba(255,255,255,0.20)` border.
- No white or gray backgrounds anywhere, and no dark text on the dark background.

## Typography (Google Fonts)

- Titles and headers: Bebas Neue
- UI labels and buttons: DM Sans (weights 400, 500, 600)
- Secondary and descriptive text: Open Sans (weights 400, 600)

Because the app is browser-only, ask me whether fonts should load from Google Fonts at runtime or be bundled with the app (relevant for offline use).

## Proposed color-to-game mapping (propose a final mapping and confirm it with me)

- Blue: active route, selected next hop, primary UI actions
- Teal: correct decision, cleared packets, supporting UI
- Pink: wrong decision, danger/pressure states, emphasis
- Purple: route-source badges or external elements (e.g. protocol tags)
- Citrine: reserved for rare callouts such as score milestones or level-up

Constraints on the mapping:
- Do not rely on color alone to convey meaning. Pair color with an icon, label, or animation.
- Verify text and UI contrast against `#00001E` meets WCAG AA.
- Do not invent colors outside this palette. If something seems to need one, raise it as a question.

# Out of scope for MVP (design so they can be added later)

- BGP best-path selection (planned as a later phase layered on top of the RIB tiers; keep the rules engine extensible for it)
- Multiplayer, accounts, leaderboards, and anything requiring a backend

# Questions you must ask me before finalizing the spec

1. Which admin distance defaults should the game use (Cisco, Juniper, or a neutral/custom table)?
2. IPv4 only, or IPv4 and IPv6?
3. Which protocols and route sources appear in the game (connected, static, OSPF, EIGRP, RIP, eBGP, iBGP, others)?
4. Exact interaction model: how does the player route a packet (drag onto a next hop, click, keyboard shortcuts), and should touch/mobile be supported?
5. Front-end tech stack and build tooling (framework vs vanilla, bundler, language such as TypeScript), and where the static build will be hosted.
6. Scoring, lives, and fail-state design.
7. Which data should persist in the browser (settings, progress, high scores), and which storage mechanism to use.
8. Visual style details beyond the brand palette and fonts (e.g. a monospace font for IP addresses and prefixes, since the brand fonts don't include one; animation style; overall look such as terminal vs network-diagram), plus audio direction.

# Deliverables

Produce a single spec document containing:

1. Product overview and goals
2. Gameplay loop and win/lose conditions
3. Formal rules engine definition (inputs, decision order, tiebreak edge cases, with worked examples)
4. Level and difficulty progression table
5. Data model (route entries, packets, level definitions) and how routes and packets are generated client-side. Generation must be deterministic and rule-valid, with no hardcoded fake fallback data
6. UI/UX description and screen list, plus wireframe descriptions
7. Theme and design token spec (colors, typography, component styles) based on the Itential palette above
8. Client-side technical architecture and proposed repo structure under `RIBRush/`, including build and static deployment approach
9. Browser persistence design (what is stored, where, and how it handles missing or cleared storage)
10. Test plan, including unit tests for the rules engine against known-correct routing outcomes
11. Milestones for MVP, followed by a roadmap for the BGP best-path expansion
12. Open questions and risks

Start by asking me the clarifying questions above. Do not write the spec until I've answered.