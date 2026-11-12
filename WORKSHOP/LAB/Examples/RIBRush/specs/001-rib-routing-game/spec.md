# Feature Specification: RIBRush RIB Routing Puzzle

**Feature Branch**: `001-rib-routing-game`  
**Created**: 2026-11-11  
**Status**: Implemented; formative playtest outstanding  
**Input**: User description: Create the RIBRush browser game specification from `initial-prompt.md`, using the user's answers to its clarification questions. The Cisco AD baseline supersedes the earlier neutral-table selection.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Learn route-selection basics (Priority: P1)

As a network engineer, I want to inspect a destination and candidate routes, then choose a next hop, so I can learn the longest-prefix, administrative-distance, and metric decision order through quick examples.

**Why this priority**: The first level introduces the complete decision order using simple examples; later levels isolate each rule and add more challenging route patterns.

**Independent Test**: Play the first IPv4 level and correctly route its longest-prefix, same-prefix AD, and same-protocol metric examples.

**Acceptance Scenarios**:

1. **Given** a fresh run, **When** I start, **Then** the game explains the route-selection order and shows a worked longest-prefix example before the first packet.
2. **Given** matching `/16` and `/24` routes for a destination, **When** I select the `/24` route's next hop and submit, **Then** the packet clears, the score increases by 100, and feedback identifies longest prefix match as the deciding rule.
3. **Given** the same candidate routes, **When** I select the `/16` route's next hop, **Then** I lose one life, lose 50 points, pressure increases, and feedback identifies the more-specific route and its prefix length.
4. **Given** two routes with an identical prefix, **When** I select the route with the lower Cisco AD, **Then** feedback identifies administrative distance as the deciding rule.
5. **Given** two routes with identical prefix, AD, and protocol, **When** I select the route with the lower metric, **Then** feedback identifies metric as the deciding rule.
6. **Given** no next hop is selected, **When** I submit, **Then** the game explains how to select a route without treating the input as a wrong routing decision.

### User Story 2 - Compare route sources and administrative distance (Priority: P1)

As a network engineer, I want to compare routes with identical prefixes and see when AD applies, so I do not mistake a preferred route source for a more-specific match.

**Why this priority**: This establishes the required “specific beats trusted” teaching moment and distinguishes route preference from prefix specificity.

**Independent Test**: Play an AD level containing identical-prefix candidates and the specific-versus-trusted trap; inspect the explanation for each decision.

**Acceptance Scenarios**:

1. **Given** routes with the same normalized prefix and prefix length, **When** I submit a decision, **Then** the lower numeric AD wins and the explanation names the compared AD values.
2. **Given** an OSPF `/24` route with AD 110 and a static `/16` route with AD 1 that both match the destination, **When** I select the `/24` next hop, **Then** the route wins on longest prefix match despite its higher AD.
3. **Given** the same-prefix routes from Story 2, **When** I select the higher-AD route, **Then** I receive a specific correction and the run records one wrong decision.

### User Story 3 - Apply metric and finish a run (Priority: P2)

As a network engineer, I want to apply metric only when the prefix, AD, and protocol are the same, then see my run results, so I can practice the complete RIB model without confusing it with BGP best-path selection.

**Why this priority**: Metric completes the MVP's stated rule sequence; the run summary lets the player review both performance and learning.

**Independent Test**: Play through the final IPv4 and IPv6 metric levels, then verify the summary reports level completion, correct decisions, wrong decisions, misses, score, and remaining lives.

**Acceptance Scenarios**:

1. **Given** routes with identical prefixes, AD, and protocol but different metrics, **When** I submit, **Then** the lower metric wins and feedback names both metrics.
2. **Given** the same metric values on routes from different protocols, **When** a packet is evaluated, **Then** the game does not compare those metrics; the earlier route-selection criteria determine the outcome.
3. **Given** five resolved packets in a level and at least one life remaining, **When** the level ends, **Then** the next level begins with its briefing and the accumulated run score and lives are preserved.
4. **Given** no lives remain, **When** the current decision is resolved, **Then** the run ends and the summary offers a new run without claiming that speed proves mastery.
5. **Given** all seven levels are completed with a life remaining, **When** the final packet is resolved, **Then** the game shows a completed-run summary and a replay action.

### Edge Cases

- IPv4 and IPv6 routes never match destinations from the other address family.
- A prefix at the minimum or maximum valid length is handled correctly (`/0` and `/32` for IPv4; `/0` and `/128` for IPv6).
- A route whose address has host bits set is normalized or rejected before it can be used; generated route prefixes are canonical.
- No matching route produces an explicit no-route result in the evaluator; production packets always have at least one matching route.
- A generated challenge with multiple equally winning routes to different next hops is rejected as invalid content; the game does not invent an ECMP or hidden tie-break rule.
- Invalid route data, an unknown protocol, an invalid metric, or an unsupported address format produces a visible content error and cannot be scored.
- A packet reaching the bottom without a decision costs one life and 50 points, then advances the run unless the player has no lives left.
- Repeated submit input after a packet has been resolved cannot score or penalize the run again.
- Refreshing the page starts a new run; no score or progress is restored.
- Audio blocked by browser policy does not block play or feedback; the player can mute sound at any time.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The game MUST provide seven sequential levels with five packets per level. The first four levels MUST use IPv4; the remaining three MUST use IPv6. The player starts at Level 1; levels cannot be skipped in a run.
- **FR-002**: Before a level's first packet, the game MUST brief the player on its focused rule or rule mix and show a worked example that is not one of that level's generated challenges.
- **FR-003**: For each packet, the game MUST show its destination address and the complete set of matching candidate routes with prefix, protocol, AD, metric, and next hop.
- **FR-004**: The evaluator MUST apply longest prefix match before AD or metric. A longer matching prefix MUST win regardless of its AD or metric.
- **FR-005**: AD MUST be compared only among routes with the same address family, normalized network prefix, and prefix length. The lower numeric AD MUST win.
- **FR-006**: Metric MUST be compared only among routes with the same address family, normalized network prefix, prefix length, AD, and protocol. The lower numeric metric MUST win.
- **FR-007**: The MVP MUST use Cisco IOS/IOS XE default AD values for the selected route sources: Connected 0, Static 1, eBGP 20, OSPF 110, and iBGP 200. These are Cisco platform defaults, not IETF-standard values or vendor-neutral values. The implementation plan MUST record the official Cisco reference and supported release.
- **FR-008**: The evaluator MUST support IPv4 and IPv6 destinations and prefixes, and MUST reject cross-family matches.
- **FR-009**: The MVP route sources MUST be Connected, Static, OSPF, eBGP, and iBGP. EIGRP, RIP, and other route sources are outside MVP scope.
- **FR-010**: The game MUST include the deliberate trap in which an OSPF `/24` with AD 110 beats a matching Static `/16` with AD 1 because longest prefix match is evaluated first.
- **FR-011**: The evaluator MUST return a no-route result when no route matches. The production generator MUST only show packets with at least one matching route.
- **FR-012**: The generator MUST create rule-valid scenarios deterministically from a run seed and level constraints. The same seed, level, and packet index MUST reproduce the same scenario.
- **FR-013**: Before display, each generated scenario MUST be validated for legal prefixes and fields, at least one matching route, one unambiguous winning route, and applicability of the level's taught rule.
- **FR-014**: If generation or validation fails, the game MUST show an explicit error and MUST NOT substitute mock, invented, or fallback challenges.
- **FR-015**: The player MUST be able to select among next hops with the left/right arrow keys and submit with Enter. The selection MUST have a visible focus/selected state and a textual label. Mouse-only input MUST NOT be required.
- **FR-016**: Touch and mobile interaction are out of MVP scope. The MVP layout MUST support a desktop browser viewport and remain usable at a narrow desktop window width.
- **FR-017**: A correct decision MUST add 100 points and clear the packet. A wrong decision MUST subtract 50 points, remove one life, increase pressure by one tier, and show the correct route and deciding rule.
- **FR-018**: A run MUST begin with five lives and zero points. A missed packet MUST subtract 50 points and one life and increase pressure by one tier.
- **FR-019**: Pressure MUST have six tiers, from 0 to 5. Each tier increases packet descent speed by 20% from the initial speed. Pressure increases by one tier after every five correctly routed packets and after every wrong or missed packet; it MUST NOT exceed tier 5.
- **FR-020**: The game MUST end when lives reach zero or after all 35 packets are resolved, whichever occurs first. A level advances after its five packets are resolved if at least one life remains.
- **FR-021**: Invalid input MUST NOT subtract points or lives or increase pressure. A resolved packet MUST NOT be scored or penalized more than once.
- **FR-022**: After each decision, feedback MUST state whether the selection was correct, identify the deciding rule, and show the relevant route values. Feedback MUST be available as text, not color or animation alone.
- **FR-023**: The run summary MUST report score, levels completed, correctly routed packets, wrong decisions, missed packets, and remaining lives. It MUST offer a new run.
- **FR-024**: Run state, score, lives, pressure, and level progress MUST remain in memory only. Reloading MUST start a fresh run; no browser storage or remote persistence is used in MVP.
- **FR-025**: The game MUST run entirely in a browser as static files, with no backend, account, database, external API, hosted service, multiplayer, or leaderboard. A local static server MAY be used to serve the files during preview.
- **FR-026**: The game MUST use the supplied Itential dark palette and surface conventions. It MUST NOT add unapproved colors or light backgrounds. The proposed mapping is blue for active route/actions, teal for correct decisions, pink for errors/pressure, purple for route-source badges, and citrine for rare milestones.
- **FR-027**: Every color-coded state MUST also have a label, icon, or text treatment. Shipped text and controls MUST be checked for WCAG AA contrast against their actual backgrounds.
- **FR-028**: The MVP MUST use system/local font fallbacks only; it MUST NOT fetch fonts from Google Fonts at runtime. Typography MUST retain clear hierarchy and distinguish IP addresses and prefixes without depending on an unavailable font.
- **FR-029**: Audio MUST use short original techno/MIDI-style cues for key events, offer a visible mute control, and never be required to understand an outcome. Audio MUST begin only after a user gesture and MUST NOT rely on external audio services.
- **FR-030**: Motion MUST be brief, must not delay input or feedback, and MUST respect reduced-motion preferences.
- **FR-031**: BGP best-path selection, accounts, shared leaderboards, multiplayer, and cross-session progress MUST remain outside the MVP.

### Key Entities

- **Route**: A candidate RIB entry with address family, canonical network prefix, protocol, AD, metric, and next-hop identifier.
- **Packet**: A generated IPv4 or IPv6 destination plus a stable identifier and packet order within a level.
- **Level**: A sequential learning unit with a rule focus, briefing, five generated packets, and constraints for valid route scenarios.
- **Scenario**: The route set and destination for one packet, together with the unique expected winning route and explanation evidence.
- **Run**: In-memory state for level, packet, score, lives, pressure tier, decisions, seed, and completion status.
- **Decision feedback**: The correctness result, selected and winning route, deciding criterion, and values used to explain the result.

### Success Criteria *(mandatory)*

#### Measurable Outcomes

- **SC-001**: 100% of hand-checked IPv4 and IPv6 reference cases select the expected route, including longest-prefix, same-prefix AD, same-protocol metric, no-match, boundary-prefix, and ambiguous-tie cases.
- **SC-002**: 100% of valid player decisions show a text explanation naming the deciding rule and the values that determine the winner.
- **SC-003**: A complete run contains seven levels and 35 packets; every generated packet has one valid, unambiguous winning route. The first four IPv4 levels use 20 different destination `/24` blocks within a run.
- **SC-004**: In a five-person formative playtest with network engineers, at least four players can explain why the more-specific OSPF route beats the less-specific Static route after completing the AD levels.
- **SC-005**: A first-time player can launch the game using the README's local preview instructions without installing game dependencies or creating an account.
- **SC-006**: A first-time player who completes the run can reach the final summary in 10 minutes or less, excluding pauses.
- **SC-007**: A keyboard-only reviewer can start, pause, select a next hop, submit, read feedback, and restart without using a pointer.

## Assumptions

- RIBRush uses Cisco IOS/IOS XE default AD values for the supported route sources. AD is platform-specific, not an IETF standard or a universal vendor ordering. The interface and README MUST identify the Cisco baseline. The specified metric comparison is part of the game's declared model and MUST be verified against its supported protocol context.
- eBGP and iBGP entries are already-eligible route candidates. The game does not perform BGP best-path selection, recursive next-hop resolution, FIB programming, or real packet forwarding.
- The seven-level progression is a mixed IPv4 LPM/AD/metric warmup, nested IPv4 LPM practice, IPv4 AD, IPv4 metric, IPv6 LPM, IPv6 AD, and IPv6 metric. Each level contains five packets. The first four IPv4 levels introduce and deepen route-selection concepts before transferring them to IPv6.
- The generator uses deterministic pools of reviewed prefix patterns and route-source combinations, with varied destination hosts. Each five-packet level rotates through distinct pools for a run seed, and the first four IPv4 levels use 20 different destination `/24` blocks in one run. Pools may include private, documentation, and other non-private IPv4 ranges; they are illustrative routes, not a live routing-table snapshot.
- Arrow keys move the selection between candidate next hops; Enter commits the choice. A visible pause control is available, with Escape as a keyboard shortcut. Touch controls are not required.
- Five starting lives, the 100/-50 score values, six pressure tiers, and 20% speed increase per tier are initial balancing choices delegated to the spec author. They require playtesting but are fixed acceptance behavior for the MVP.
- A run seed is created at the start of a run. Generation is reproducible from that seed; tests use fixed seeds and independently recorded expected results. Test fixtures are not runtime fallback content.
- There is no persistence. Refresh, closing the tab, or starting a new run clears the previous run state.
- The confirmed stack is vanilla static web content with no build step or runtime dependency. A local static server is used for preview because browser modules and local data need an HTTP origin; no hosted deployment is planned for MVP.
- Named Google font families are not loaded or bundled. Use system/local fallbacks, and keep gameplay independent of font availability.
- Audio is original, short, optional, and user-mutable. The game MUST remain fully usable with audio disabled or blocked.

## Technical Model and Reference Cases

### Route selection

For a packet destination, first discard routes from the other address family and routes whose prefix does not contain the destination. Among the remaining candidates:

1. Select the greatest prefix length.
2. Only if multiple candidates have the identical normalized prefix and length, select the lowest AD.
3. Only if candidates still share prefix, length, AD, and protocol, select the lowest metric.
4. If multiple distinct next hops still tie after the supported criteria, reject the scenario as ambiguous. The MVP does not model equal-cost multipath.
5. If no route matches, return `no-route`; production generation does not emit this as a playable packet.

The Cisco IOS/IOS XE default AD reference supplied for this project is:

| Route source | Default AD | Included in MVP |
| --- | ---: | --- |
| Connected | 0 | Yes |
| Static | 1 | Yes |
| EIGRP summary route | 5 | No |
| External Border Gateway Protocol (BGP) | 20 | Yes, as eBGP |
| Internal EIGRP | 90 | No |
| Interior Gateway Routing Protocol (IGRP) | 100 | No |
| OSPF | 110 | Yes |
| Intermediate System-to-Intermediate System (IS-IS) | 115 | No |
| Routing Information Protocol (RIP) | 120 | No |
| Exterior Gateway Protocol (EGP) | 140 | No |
| On Demand Routing (ODR) | 160 | No |
| External EIGRP | 170 | No |
| Internal BGP | 200 | Yes, as iBGP |
| Unknown* | 255 | No |

The MVP uses only the rows marked Yes. Other rows document Cisco's broader reference table; their route types are not playable in MVP. Cisco's 255 note explains that the route source is not considered reliable and the route is not installed; `Unknown*` remains excluded from gameplay. These are Cisco platform defaults, not IETF-standard values or a universal vendor ordering. AD MUST never override a longer prefix in the game's eligible-candidate model.

The table reproduces the Cisco defaults supplied by the user and is verified
against Cisco's
[Understand Administrative Distance](https://www.cisco.com/c/en/us/support/docs/ip/border-gateway-protocol-bgp/15986-admin-distance.html)
and the Cisco IOS XE 17.x
[IP Routing Configuration Guide](https://www.cisco.com/c/en/us/td/docs/routers/ios/config/17-x/ip-routing/b-ip-routing/m_iri-iprouting.html).
Cisco uses AD to choose a route source for installation when the destination
prefix is identical, then uses longest-prefix match during forwarding across
installed routes. For this game, displayed entries represent eligible
candidates: longest prefix is compared first and AD only breaks a tie between
identical prefixes. The game does not model route installation, next-hop
recursion, or the FIB.

### Hand-checked examples

| Case | Destination and candidates | Expected result |
| --- | --- | --- |
| IPv4 longest prefix | `192.0.2.42`; Static `192.0.0.0/16`, AD 1; OSPF `192.0.2.0/24`, AD 110 | OSPF `/24`; longest prefix wins despite higher AD |
| IPv6 longest prefix | `2001:db8:1234::42`; OSPF `2001:db8::/32`; Static `2001:db8:1234::/48` | Static `/48`; longest prefix wins |
| Same-prefix AD | `203.0.113.42`; Static `203.0.113.0/24`, AD 1; OSPF same `/24`, AD 110 | Static; lower AD wins |
| Same-protocol metric | `203.0.113.42`; two OSPF `203.0.113.0/24` entries, both AD 110, metrics 20 and 5 | Metric 5 route wins |
| No match | `198.51.100.7`; only `203.0.113.0/24` is present | `no-route` |
| Ambiguous tie | Same matching prefix, AD, protocol, metric, but different next hops | Scenario rejected before display |

IPv4 longest-match behavior is grounded in [RFC 1812, Section 5.2.4.3](https://www.rfc-editor.org/rfc/rfc1812#section-5.2.4.3); IPv6 longest-match forwarding is grounded in [RFC 7608](https://www.rfc-editor.org/rfc/rfc7608). AD values are Cisco IOS XE platform defaults rather than IETF standards, and the supported IOS XE 17.x reference is recorded above. The within-protocol metric rule is part of the specified game model, not a universal routing algorithm.

## Level Progression

| Level | Address family | New rule | Required learning challenge |
| --- | --- | --- | --- |
| 1 | IPv4 | Introductory LPM, AD, and metric examples | Route obvious scenarios using each decision rule; later levels isolate and deepen them |
| 2 | IPv4 | Nested longest prefix match | Repeat LPM using more varied prefixes and overlap patterns |
| 3 | IPv4 | AD among identical prefixes | Compare Cisco AD values and show the `/24`-over-`/16` trap |
| 4 | IPv4 | Metric within one protocol | Compare metrics only after prefix, AD, and protocol match |
| 5 | IPv6 | Longest prefix match | Transfer LPM to 128-bit addresses and IPv6 prefix lengths |
| 6 | IPv6 | AD among identical prefixes | Apply Cisco AD comparison and the specific-beats-trusted rule to IPv6 prefixes |
| 7 | IPv6 | Metric within one protocol | Transfer the complete RIB rule sequence to IPv6 |

Every level has five packets. Level 1 intentionally mixes simple examples of all three rules. Level 2 focuses on longest-prefix match without depending on AD or metric. Later levels may include earlier rules but MUST identify which rule decides each generated scenario.

## Data and Generation Contract

Each route includes a stable route ID, address family, canonical network address, prefix length, protocol, AD, metric, and next-hop ID/label. Each packet includes a stable packet ID, destination address, level ID, and order. Each level includes its rule focus, briefing, five-packet count, and constraints for protocol, prefix overlap, AD/metric relationships, and address family.

The client-side generator uses the level constraints and run seed to select a rule-compatible scenario pool, vary destination hosts, and produce candidate routes. Each level's five packets MUST draw from five distinct pools. Across Levels 1–4, all 20 IPv4 packets MUST use different destination `/24` blocks. A generated destination MUST fall within every displayed candidate prefix. The generator and validator MUST establish one unique winning route before display. The explanation is derived from the route comparison that actually decided the winner, not from a separately authored answer key.

The project MAY include fixed, hand-reviewed examples in test fixtures. Those fixtures are test-only and MUST NOT be used as substitute gameplay when generation fails. Any generation failure is shown as a content error; the player is not charged a life or score.

## User Experience and Screens

1. **Start and briefing**: game title, controls, run start, and the next level's short rule briefing with a worked example.
2. **Play**: persistent score/lives/pressure/level indicators; a falling destination packet; a labeled RIB table; and a visible next-hop selection. Arrow keys move among next hops; Enter submits; Escape or a visible control pauses.
3. **Decision feedback**: the packet outcome, selected route, correct route, deciding rule, and compared values. Feedback is available as text and is not conveyed by color alone. The next packet begins only after the feedback has been made available to read.
4. **Pause**: freezes packet movement and pressure; provides resume and restart actions.
5. **Run summary**: score, completed levels, correct decisions, wrong decisions, misses, lives remaining, and replay action. No persistent high score is stored.

At desktop widths, place the route table beside the packet lane and selection controls. At narrower widths, stack the route table, packet, and controls while keeping the selected next hop and submit action visible. Do not rely on hover for route details.

## Theme and Design Tokens

The palette and surface values in `initial-prompt.md` are authoritative:

| Token | Value | Use |
| --- | --- | --- |
| Background | `#00001E` | Page and game canvas |
| Primary text | `#FFFFFF` | Main labels and route values |
| Secondary text | `rgba(255,255,255,0.65)` | Supporting descriptions |
| Blue | `#0099FF` | Active route, selected next hop, primary action |
| Pink | `#FF0095` | Wrong decisions, danger, pressure |
| Teal | `#00F3DB` | Correct decisions and supporting states |
| Purple | `#AD0AFD` | Route-source badges and external route sources |
| Citrine | `#CCFF00` | Rare score/level-up callouts only |

Accent panels use roughly 10–15% accent fills, 1–1.5px solid accent borders, and 6–8px radii. Group containers use `rgba(255,255,255,0.04)` fill, a 1px dashed `rgba(255,255,255,0.15)` border, and 12px radii. Neutral elements use `rgba(255,255,255,0.06)` fill and a 1px `rgba(255,255,255,0.20)` border. No light background or unapproved color is allowed.

Use local/system sans-serif fallbacks with a clear title, control, and explanatory-text hierarchy. IP addresses and prefixes must remain visually distinguishable using spacing and labels; the interface must not require a downloaded monospace font. Use concise, original techno/MIDI-style sound cues for correct, incorrect, level-up, and game-over events, with a visible mute control. Motion is brief and optional.

## Client-Side Architecture and Local Run

RIBRush is a static browser application. Its conceptual boundaries are: presentation and keyboard input; pure route evaluation; deterministic scenario generation and validation; in-memory run state; and optional audio cues. The evaluator does not control rendering or scoring. The game makes no runtime API requests and requires no account or server-side component.

Proposed project structure:

```text
RIBRush/
├── index.html
├── styles.css
├── src/
│   ├── app.js
│   ├── routing/
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
│   └── route-cases.json
└── README.md
```

The confirmed MVP stack is native HTML, CSS, and JavaScript modules with no framework, build step, or runtime dependency. Preview locally from the RIBRush directory with:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8000`. Opening with `file://` is not the supported run path for module and data loading. MVP has no hosted deployment; the static files remain suitable for a later static host.

## Browser State and Persistence

The current run exists only in memory. It contains the run seed, level and packet indexes, selected next hop, score, lives, pressure tier, decision counts, and pause/completion state. Refresh, tab close, or a new-run action starts from Level 1 with zero points, five lives, and pressure tier 0. No settings, progress, seed, or high score is written to browser storage. Clearing browser storage therefore has no effect on a run already in progress.

## Verification Plan

- Unit-test IPv4/IPv6 family isolation, prefix containment, longest-prefix ordering, Cisco default AD values for MVP sources, and same-protocol metric comparison.
- Verify the fixed hand-checked examples above with expected winners recorded independently of the evaluator.
- Test `/0`, maximum prefix lengths, canonicalization, no-match, duplicate IDs, invalid protocol/AD/metric, and ambiguous equal-winner scenarios.
- With the same seed and level, assert identical generated routes, destinations, and winning route; vary the seed and verify every result remains valid and unambiguous.
- Verify a failed generation displays a content error and never charges score, life, or pressure or substitutes fixture data.
- Test scoring, lives, pressure tier caps, five-packet level advancement, wrong/missed packet behavior, zero-life termination, pause/resume, duplicate submit, and final summary.
- Manually play one run with keyboard only; verify focus visibility, labels, feedback text, narrow layout, reduced motion, contrast, mute behavior, and audio after a user gesture.
- Verify a reload starts a clean run and that no external network request is required for play.

## Milestones and Roadmap

### MVP Milestones

1. **Prove the RIB model**: implement the declared evaluator behavior and pass independent IPv4/IPv6 fixtures, including the specific-beats-trusted trap.
2. **Complete one playable loop**: show one packet, accept a keyboard route choice, score it, and explain the result for both correct and wrong choices.
3. **Add seven levels and generation**: add seeded, validated route/packet generation, the five-packet level progression, and all three rule tiers.
4. **Add pressure and presentation**: implement lives, points, speed tiers, pause, feedback, theme, reduced motion, and optional sound.
5. **Verify and document**: run the full case suite, perform keyboard and visual checks, and document local launch, known limits, and results.

### Later BGP Roadmap

BGP best-path selection is a separate future feature. It requires its own agreed vendor/model scope, authoritative source review, route attributes and tie-break definitions, fixtures, and progression. It MUST NOT be approximated by the MVP's RIB AD/metric rules or enabled implicitly.

## Open Questions and Risks

- The AD values follow Cisco IOS XE 17.x defaults for the selected route sources. AD is vendor-specific, not an IETF standard; every briefing and screen MUST identify the Cisco baseline and MUST NOT present it as universal. Official Cisco and IETF references are recorded above. The `Unknown*` row remains excluded from gameplay because AD 255 is not installed.
- The game models an eligible route set and must not imply it implements Cisco's complete RIB installation, next-hop resolution, and FIB forwarding pipeline.
- Pressure and lives are fixed for the initial MVP specification but require playtesting; tuning them later requires updating acceptance criteria and tests.
- Browser audio may be blocked until the first keyboard interaction. The game remains playable and understandable with audio muted or unavailable.
- The proposed color mapping follows the initial prompt. Contrast must be measured for the actual text and surface combinations before release.
