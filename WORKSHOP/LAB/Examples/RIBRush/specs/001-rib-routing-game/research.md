# Research: RIBRush RIB Routing Puzzle

**Date**: 2026-11-11  
**Feature**: [spec.md](./spec.md)

## Decisions

### 1. Browser delivery and toolchain

**Decision**: Use static HTML, CSS, and native JavaScript modules. Do not add a
framework, bundler, runtime package, backend, or external service. Preview with
a local static server.

**Rationale**: This matches the user's vanilla-static choice, allows the game
to run from a clone without installing game dependencies, and keeps all rule
evaluation and generation in the browser.

**Alternatives considered**: A TypeScript/Vite application was offered and
declined in favor of a no-build static project. Hosted deployment is deferred.

### 2. Route source and AD baseline

**Decision**: Use Cisco IOS/IOS XE defaults for the five MVP sources:
Connected 0, Static 1, eBGP 20, OSPF 110, and iBGP 200. Preserve the full table
provided by the user in the specification, but do not enable excluded sources
in MVP.

**Rationale**: The user selected Cisco after rejecting the neutral/custom
table. AD is platform-specific and is not an IETF-wide standard.

**Alternatives considered**: Juniper and a game-created neutral ordering were
not selected.

**Source verification**: The complete supplied table and `Unknown*` notation
match Cisco's [Understand Administrative Distance](https://www.cisco.com/c/en/us/support/docs/ip/border-gateway-protocol-bgp/15986-admin-distance.html)
(Document ID 15986, updated July 20, 2026). Cisco's
[IP Routing Configuration Guide, Cisco IOS XE 17.x - Basic IP Routing](https://www.cisco.com/c/en/us/td/docs/routers/ios/config/17-x/ip-routing/b-ip-routing/m_iri-iprouting.html)
also lists the same default distances. The 255 note means the route source is
not considered reliable and the route is not installed. The app will not use
the `Unknown*` entry as a playable route source.

### 3. Route-selection precedence

**Decision**: Implement the user-defined order exactly: longest matching prefix;
then lowest AD among identical normalized prefixes; then lowest metric only
among routes with the same prefix, AD, and protocol. Reject unresolved equal
winners; do not model ECMP.

**Rationale**: This directly teaches the specific-beats-trusted trap while
keeping the game distinct from vendor-specific RIB installation and BGP
best-path behavior.

**References**: [RFC 1812, Section 5.2.4.3](https://www.rfc-editor.org/rfc/rfc1812#section-5.2.4.3)
covers IPv4 forwarding behavior. [RFC 7608](https://www.rfc-editor.org/rfc/rfc7608)
recommends longest-match-first forwarding for IPv6 prefixes of any valid
length. Cisco's IOS XE 17.x guide and the administrative-distance support
document verify the supported AD sources and values.

**Model boundary**: Cisco uses AD to choose which route source is installed
for an identical destination prefix, then uses longest-prefix match during
forwarding across installed routes. The game simplifies this pipeline: its
displayed entries are eligible candidates, LPM decides among matching
prefixes, and AD is compared only among identical prefixes. The game does not
simulate RIB installation, next-hop recursion, the FIB, or BGP best-path.
Metric ordering after equal prefix, AD, and protocol is an explicit game rule
that reflects protocol-local metric comparison; it is not presented as a
universal Cisco route-selection algorithm.

### 4. Scenario generation and validation

**Decision**: Generate a run from a seed, level constraints, and packet index.
Treat generation as deterministic for those inputs. Select scenarios that
match the rule assigned to each packet; the Level 1 warmup includes
longest-prefix, AD, and metric cases. Across the four IPv4 levels, use 20
distinct destination `/24` blocks per run. Validate every generated scenario
before display; surface generation errors and never fall back to sample or
mock gameplay data.

**Rationale**: This provides replayable tests, avoids repeated IPv4 blocks
across the opening levels, and prevents invalid examples from teaching
incorrect route selection.

**Alternatives considered**: A fixed runtime deck or silent fallback fixtures
were rejected. Literal fixtures are used only in tests.

### 5. State, score, and pressure

**Decision**: Keep score, five lives, six pressure tiers, packet/level indexes,
and decisions in memory for one run. Apply the spec's +100 correct, -50 wrong
or missed, and +1 pressure rules without allowing pressure to affect evaluation.

**Rationale**: This realizes the requested time-pressure puzzle while
preserving deterministic technical correctness and the user's no-persistence
answer.

**Alternatives considered**: Browser persistence, leaderboards, and shared
scores were excluded.

### 6. Accessibility, fonts, and audio

**Decision**: Use keyboard-first controls, text feedback, approved palette,
local/system font fallbacks, reduced-motion behavior, and optional original
techno/MIDI-style sound that starts after user input and can be muted.

**Rationale**: These are direct user decisions and constitution requirements.
No remote font or audio service is required.

**Alternatives considered**: Touch/mobile controls, Google Fonts at runtime,
and external audio assets are outside MVP scope.

## Implementation Gates

- Source verification is complete for Cisco IOS XE 17.x: links and matching
  table values are recorded above.
- IPv4 and IPv6 longest-prefix references are recorded above.
- Keep the `Unknown*` AD row out of runtime logic; Cisco documents 255 as
  untrusted/not installed, and it is not an MVP source.
- Validate the proposed 2–5 matching routes per packet and pressure pacing in
  the first playable prototype; adjust the spec if playtesting changes scope.
