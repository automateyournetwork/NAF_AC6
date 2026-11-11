# One packet traced by hand from the region file (C6 evidence)

Constitution C6 asks that one packet's path can be traced by hand from a region file through the routing code. This trace was worked on paper from `src/content/region-na.json` and the code in `src/content/load.ts`, `src/sim/world.ts`, `src/sim/spf.ts`, `src/sim/forwarding.ts` and `src/sim/linkq.ts`. `tests/unit/handtrace.test.ts` then checks that the engine gives the same numbers.

## The data

Four sites from the region file, taken in file order so that a site's router ID is its position in the file (`createWorld` with `inOrder`):

| Site | Router ID | lon | lat |
| --- | --- | --- | --- |
| DEN Denver | 6 | −104.99 | 39.74 |
| MKC Kansas City | 9 | −94.61 | 39.11 |
| MSP Minneapolis | 10 | −93.25 | 44.98 |
| CHI Chicago | 11 | −87.64 | 41.85 |

The region's reference point is lon −96, lat 39.

## Step 1: positions in kilometres (`project` in `load.ts`)

`x = round(6371 × cos(39°) × (lon + 96) × π/180)` and `y = round(6371 × (lat − 39) × π/180)`. With cos(39°) = 0.77715, one degree of longitude is 86.4 km and one degree of latitude is 111.2 km.

| Site | x | y |
| --- | --- | --- |
| DEN | −8.99 × 86.4 = −777 | 0.74 × 111.2 = 82 |
| MKC | 1.39 × 86.4 = 120 | 0.11 × 111.2 = 12 |
| MSP | 2.75 × 86.4 = 238 | 5.98 × 111.2 = 665 |
| CHI | 8.36 × 86.4 = 722 | 2.85 × 111.2 = 317 |

## Step 2: four links (`layLink` in `world.ts`)

A link's length is the straight-line distance, rounded. Each new link has cost 10 and the lowest capacity tier.

| Link | Length | Cost | Steps on the wire: `round(km × 20 ÷ 1200)` |
| --- | --- | --- | --- |
| DEN–MKC | √(897² + 70²) = 900 km | 10 | 15 |
| MKC–CHI | √(602² + 305²) = 675 km | 10 | 11 |
| DEN–MSP | √(1015² + 583²) = 1,171 km | 10 | 20 |
| MSP–CHI | √(484² + 348²) = 596 km | 10 | 10 |

Fiber spent: 3,342 km of the 8,000 km starting budget.

## Step 3: Denver's routes (`computeRoutes` in `spf.ts`)

1. Start at DEN with distance 0. Settle DEN. Its neighbors: MKC at 10 with first hop {MKC}; MSP at 10 with first hop {MSP}.
2. MKC and MSP tie at 10. The lower ID settles first: MKC (9). From MKC, CHI is reached at 10 + 10 = 20, inheriting MKC's first hop: {MKC}.
3. Settle MSP (10). From MSP, CHI is reached at 10 + 10 = 20. That equals the known cost, so the first hops are merged: {MKC, MSP}.
4. Settle CHI. Nothing left.

Denver's entry for Chicago: cost 20, tied next hops MKC (9) and MSP (10). v1 keeps one route, and the tie goes to the lowest router ID (S7): **next hop MKC**.

Kansas City's entry for Chicago: the direct link costs 10; the way round through DEN and MSP costs 30. **Next hop CHI.**

## Step 4: the packet's journey (`step` in `world.ts`)

The packet is created at DEN for CHI at step *t*. The links have been idle, so each holds one packet of credit.

| Step | What happens | Code |
| --- | --- | --- |
| *t* | DEN looks up CHI: next hop MKC. The packet joins the DEN→MKC queue. | `injectPacket`, `forward`, `pickNextHop`, `offer` |
| *t* + 1 | Service: the queue's head goes onto the wire and will arrive 15 steps later. | `serve` |
| *t* + 16 | Arrival at MKC. Not the destination. MKC looks up CHI: next hop CHI. The packet joins the MKC→CHI queue. It is not served in this step, because service came first. | `forward` |
| *t* + 17 | Service: onto the MKC→CHI wire, 11 steps. | `serve` |
| *t* + 28 | Arrival at CHI, the destination. Delivered: the score rises by 1. | `forward` |

**Path: DEN–MKC–CHI, 28 steps (1.4 seconds of simulated time).** The link DEN–MSP carries nothing, although it is part of an equal-cost path.

## Step 5: one cost change

Raise DEN–MKC from 10 to 11. Denver's choices for Chicago become 11 + 10 = 21 through MKC and 10 + 10 = 20 through MSP. The tie is gone: **next hop MSP, cost 20.** The next packet from DEN to CHI rides DEN–MSP–CHI.

## Checked against the engine

`tests/unit/handtrace.test.ts` asserts every number above: the positions, the four lengths, the fiber spent, the two routing entries, the links visited, the 28 steps, and the route after the cost change.
