# Data Model: Backbone v1

Phase 1 of the plan. Entities come from the spec's Key Entities. The world is plain data: numbers, strings, arrays and records, with no functions and no shared references, so it can be copied, hashed and replayed.

Simulated time is counted in steps. With 20 steps per second, 1 second is 20 steps.

## Region (content)

| Field | Type | Rule |
| --- | --- | --- |
| `id` | text | Lower-case letters, digits, hyphens |
| `name` | text | Shown on the welcome screen |
| `lon0`, `lat0` | number | Centre of the projection |
| `sites` | list of SiteDef | At least as many as `maxSites` in the tuning; codes unique |

**SiteDef**: `code` (three upper-case letters), `name`, `lon` (−180 to 180), `lat` (−90 to 90), `weight` (whole number 1 to 3, the site's share of traffic). The loader adds `x` and `y` in kilometres.

## Tuning (content)

One record of whole numbers and short lists, named in `contracts/content.md`. The simulation requires it; it has no built-in values.

## Site (a router)

| Field | Type | Rule |
| --- | --- | --- |
| `id` | whole number | The router ID. 1, 2, 3… in the order the run introduces its sites |
| `code`, `name`, `x`, `y`, `weight` | from SiteDef | Fixed for the run |
| `appearStep` | step | When the site appears on the map |
| `activeStep` | step | `appearStep` plus the grace period. Traffic starts here |
| `credit` | whole number | Emission accumulator |

**States.** *Scheduled* (before `appearStep`; not in the world's graph) → *new* (appeared, in its grace period; can be linked; sends and receives nothing) → *active*. *Dark* is derived, not stored: an active site with no route to any other active site.

## Link

| Field | Type | Rule |
| --- | --- | --- |
| `id` | whole number | 1, 2, 3… in the order links are laid; never reused |
| `a`, `b` | site IDs | `a` < `b`; at most one link per pair |
| `km` | whole number | Straight-line length on the map, rounded; the fiber it cost |
| `cost` | whole number | 1 to 65535. 10 when laid |
| `tier` | whole number | Index into the capacity tiers. 0 when laid |
| `up` | yes/no | No while cut |
| `restoreStep` | step | When a cut ends; 0 when up |
| `dirs` | two Direction records | `dirs[0]` carries `a`→`b`, `dirs[1]` carries `b`→`a` |

**States.** *Up* ⇄ *cut* (by a fiber cut and its repair). *Removed* (by the player, only from *up*): the link leaves the world and its fiber returns.

**Direction**: `queue` (packets waiting, first in first out, at most the queue length), `wire` (packets travelling, each with its start and arrival step), `credit` (service accumulator), `served` and `refused` (counts per step over the utilization window).

## Packet

`id` (whole number, in order of creation), `src`, `dst` (site IDs), `born` (step). On a wire it also has `t0` and `t1`, the steps at which it left one router and reaches the next.

**States.** *Queued* → *on the wire* → (*queued* at the next router → …) → *delivered* at `dst`, or *dropped* for one of three reasons: `queue` (refused by a full queue), `cut` (on or queued for a link that was cut or removed), `no-route`.

## Route table

For every router and every destination it can reach: `cost` (whole number) and `nextHops` (site IDs, sorted, at most `maxPaths` of them). A destination that cannot be reached has no entry. Each router also has one rotor per destination, the index of the next hop to use next (R2). Rotors return to zero when routes are recomputed.

## Budget

`fiberKm` (whole number, never negative) and `upgrades` (whole number, never negative).

## Drop meter

`meter` (0 up to the meter size) and `lastDropStep`. The rule is FR-010.

## Run (the world)

| Field | Meaning |
| --- | --- |
| `seed` | The seed text |
| `step` | Steps completed |
| `rngSites`, `rngTraffic`, `rngEvents` | The three generator states |
| `sites`, `links`, `routes`, `rotors` | As above |
| `fiberKm`, `upgrades` | Budget |
| `meter`, `lastDropStep` | Drop meter |
| `delivered` | The score |
| `dropped` | Counts by reason: `queue`, `cut`, `noRoute` |
| `nextRewardStep`, `rewardPending` | Reward schedule |
| `nextCutStep` | Fiber-cut schedule |
| `routesDirty` | A link changed since routes were computed |
| `over` | The run has ended |
| `maxPaths` | Routes kept per destination: 1 in v1 play |

**States.** *Running* ⇄ *reward pending* (time does not advance until `chooseReward`) → *over* (the meter reached its size). Pause is not a simulation state: the caller simply stops calling `step`.

## Command log and replay

A list of `{ step, command }`, where `step` is the world's step count when the command was sent. Replaying the same seed, region, tuning and log gives the same world at every step (R13, R14).

## Best-score entry (browser storage)

`score` (whole number ≥ 0), `steps` (whole number ≥ 0, the time survived), `seed` (1 to 24 letters, digits or hyphens). Five entries at most, sorted by score, then by steps. Anything read back that does not fit these rules is ignored.

## Settings (browser storage)

`reducedMotion`: `auto`, `on` or `off`.
