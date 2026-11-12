# Data Model: RIBRush RIB Routing Puzzle

**Feature**: [spec.md](./spec.md)  
**Plan**: [plan.md](./plan.md)

## Entities

### Route

One already-eligible candidate entry in a scenario's displayed RIB.

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | string | Unique within the scenario; stable for feedback and tests |
| `addressFamily` | `ipv4 \| ipv6` | Must match the prefix and packet family |
| `networkAddress` | string | Canonical network address; host bits must be zero |
| `prefixLength` | integer | 0–32 for IPv4; 0–128 for IPv6 |
| `protocol` | enum | `connected`, `static`, `ebgp`, `ospf`, or `ibgp` |
| `administrativeDistance` | integer | Must match selected Cisco IOS/IOS XE default for the protocol |
| `metric` | non-negative integer or null | Numeric for OSPF metric scenarios; otherwise not compared and may be null |
| `nextHopId` | string | Stable identifier for keyboard selection |
| `nextHopLabel` | string | Readable value shown to the player |

The active AD map is Connected 0, Static 1, eBGP 20, OSPF 110, and iBGP 200.
The broader Cisco table in the spec is reference-only for sources excluded
from MVP. The `Unknown*` row is not a valid MVP protocol.

### Packet

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | string | Unique within the run |
| `destination` | string | Valid IPv4 or IPv6 address |
| `addressFamily` | `ipv4 \| ipv6` | Consistent with destination |
| `levelId` | string | References one of seven sequential levels |
| `sequence` | integer | 1–5 within its level |

### Scenario

The complete route-candidate set for one packet. It contains at least one route
that matches the destination. The displayed selection is between the candidate
routes' next hops.

| Field | Type | Constraints |
| --- | --- | --- |
| `packet` | Packet | Exactly one packet |
| `routes` | Route[] | Proposed generator limit: 2–5 matching candidates |
| `seed` | unsigned 32-bit integer | Captured for deterministic reproduction |
| `levelId` | string | Must agree with packet level |

The runtime scenario does not carry a separately authored expected answer. The
route evaluator returns the winner and evidence used to compose feedback. Test
fixtures store literal expected results independently.

### Level

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | string | `level-1` through `level-7` |
| `addressFamily` | `ipv4 \| ipv6` | Levels 1–4 use IPv4; Levels 5–7 use IPv6 |
| `ruleFocus` | enum | `mixed`, `longest-prefix`, `administrative-distance`, `metric` |
| `briefing` | string | Explains the rule or rule mix and one worked example |
| `packetCount` | integer | Exactly 5 |
| `generationConstraints` | object | Contains deterministic, rule-compatible scenario pools that vary prefixes, destinations, sources, and AD/metric values while guaranteeing a unique winner; IPv4 Levels 1–4 use 20 distinct destination `/24` blocks per run |

### Run State

Transient state for a single play session:

- seed, current level, current packet, and selected next-hop ID
- score (initially 0), lives (initially 5), and pressure tier (0–5)
- correct, wrong, and missed counts
- current view (`start`, `briefing`, `playing`, `feedback`, `paused`, `summary`, `error`)
- resolved packet IDs and run completion status

No run field is persisted beyond the current page lifetime.

### Evaluation Result

The evaluator returns a structured outcome:

| Field | Type | Meaning |
| --- | --- | --- |
| `status` | enum | `winner`, `no-route`, `invalid-scenario`, or `ambiguous` |
| `winnerRouteId` | string or null | Unique selected route, if one exists |
| `ruleCode` | enum or null | `longest-prefix`, `administrative-distance`, `metric`, `no-route`, or error |
| `evidence` | object | Candidate prefix lengths, ADs, protocol, and metrics needed for explanation |

Evaluation has no access to the DOM, timer, score, lives, pressure, audio, or
random source.

## Relationships

- A Level contains five ordered Packets per run.
- Each Packet belongs to exactly one Scenario.
- Each Scenario contains multiple Route candidates and one unique Evaluation
  winner, except for explicit error outcomes.
- A Run progresses through Levels and owns transient Packets, Decisions, and
  score/life/pressure counters.

## Validation Rules

1. Parse the address family and prefix length before comparison; reject family
   mismatches and invalid bit ranges.
2. Require canonical route network addresses; reject host bits rather than
   silently normalizing authored/generated data.
3. Require a supported protocol and its configured Cisco AD value.
4. Require a valid metric for OSPF metric challenges. A null metric is never
   used as a numeric tie-break.
5. Require at least one route to match each playable packet destination.
6. Require one unique winning next hop after longest prefix, AD, and metric
   rules. Do not invent a tie-break or ECMP behavior.
7. Require each level's generated scenarios to exercise its learning focus.
8. Reject invalid content before play and report a content error; do not charge
   score, lives, pressure, or attempts.

## State Transitions

```text
start → briefing → playing
playing → feedback → playing (next packet)
playing → briefing (next level)
playing → paused → playing
playing → summary (all levels complete or lives exhausted)
any generation/validation failure → error
error → retry generation or return to start
summary → new run → briefing
```

Invalid input remains in `playing` and does not resolve a packet. A wrong or
missed decision resolves that packet once, applies its penalty, and then
continues unless lives reach zero.
