# Contract: the simulation

The simulation is the only place the game's rules live. Everything else reads it and sends it commands. This contract is the handoff between the simulation and the rest of the game, and between work sessions.

## Functions

```text
createWorld(seed, region, tuning, options?) → World
    options.maxPaths: routes kept per destination. 1 unless a test asks for more.
step(world, commands[]) → StepEvents
    The only function that advances time. Advances at most one step. Changes the world in place.
computeRoutes(routerIds[], links[], maxPaths) → routes
    For each router and each reachable destination: { cost, nextHops[] }.
validate(world, command) → reason | null
    Says whether a command would be accepted, without changing the world.
cloneWorld(world) → World
hashWorld(world) → text
    Equal worlds give equal text. Used by the determinism checks.
replay(seed, region, tuning, log[], untilStep) → World
    Rebuilds a run from its command log.
isDark(world, siteId) → yes/no
```

The same world and commands in give the same world out. Nothing in `src/sim` reads the clock, the DOM, the renderer or `Math.random`.

## Commands

Player input reaches the world only as commands. A rejected command changes nothing and returns a reason code, which the UI turns into text (FR-040).

| Command | Accepted when | Effect | Reason codes |
| --- | --- | --- | --- |
| `layLink { a, b }` | Both sites have appeared; `a` ≠ `b`; no link joins them; `fiberKm` ≥ the length | New link: cost 10, tier 0, up. Fiber spent. | `no-such-site`, `same-site`, `duplicate-link`, `not-enough-fiber` |
| `removeLink { link }` | The link exists and is up | Link removed. Fiber returned in full. Upgrades forfeited. Its packets dropped (`cut`). | `no-such-link`, `link-is-cut` |
| `setCost { link, cost }` | The link exists; `cost` is a whole number from 1 to 65535 | Cost changed | `no-such-link`, `bad-cost` |
| `upgrade { link }` | The link exists; an upgrade is in stock; the link is below the top tier | Tier + 1 in both directions. One upgrade spent. Cost unchanged. | `no-such-link`, `no-upgrade`, `max-tier` |
| `chooseReward { choice }` | A reward is pending; `choice` is `fiber` or `upgrade` | Fiber or one upgrade added. The pending reward clears. | `no-reward-pending`, `bad-choice` |

Every command is refused with `run-over` once the run has ended.

## Order of work inside `step`

The order is fixed. It is part of the rules: the determinism check (R13) and case 9 depend on it.

1. If the run is over, return.
2. Apply each command in the order given. Record rejections.
3. If a reward is pending, return without advancing time.
4. Add 1 to `step`.
5. Timed events due at this step, in this order: sites that appear; a cut link whose repair is due is restored; a fiber cut that falls due takes one up link, chosen by the events stream.
6. If any link's existence, state or cost has changed since routes were last computed, recompute every router's routes (R1) and reset the rotors.
7. **Service.** For each link in ID order, direction `a`→`b` then `b`→`a`: add the capacity to the credit; while the credit covers a packet and the queue is not empty, move the head of the queue onto the wire. An empty queue keeps at most one packet of credit.
8. **Arrivals.** For each link in ID order, each direction: every packet whose travel ends at this step arrives at the far router. If that router is the destination, the packet is delivered. Otherwise the router chooses a next hop (R2) and the packet joins that direction's queue. A full queue drops it (`queue`). No route drops it (`no-route`).
9. **Emission.** For each active site in router-ID order: add its rate to its credit and create the packets that are due. Each packet's destination is drawn from the traffic stream among the other active sites, by weight. Each packet is then handled like an arrival at its source.
10. Advance the utilization windows.
11. **Meter.** Add this step's drops. If there were none, apply the drain rule of FR-010. If the meter has reached its size, the run is over.
12. If this step is a reward step and the run is not over, a reward becomes pending.

Service comes before arrivals (step 7 before steps 8 and 9), so a packet is never served in the step in which it joins a queue.

## Rules the code must hold

- **Routes (F1–F7).** Lowest total cost over links that are up. All equal-cost first hops are found, sorted by router ID, and the first `maxPaths` are kept. With `maxPaths` 1 the tie goes to the lowest router ID (S7).
- **Forwarding (R2).** A router with several next hops rotates through them in router-ID order, separately for each destination.
- **Travel.** A packet spends `max(1, round(km ÷ pulse speed × steps per second))` steps on a link (S11).
- **Fiber cut.** The link goes down in both directions. Everything on its wires and in its queues is dropped (`cut`). It comes back unchanged when the cut ends. A cut and a repair each mark the routes for recomputing.
- **Traffic is independent of the player.** The traffic stream is used only for destinations, and emission happens whether or not a route exists, so the same seed offers the same traffic whatever is built.
- **Utilization.** Packets served in the window divided by what the capacity allows in the window.
- **Score.** `delivered`. Time survived is `step ÷ steps per second`.

## Events returned by `step`

`advanced` (yes/no), `rejected[]` (command and reason), `delivered`, `dropped { queue, cut, noRoute }`, `siteAppeared[]`, `siteActivated[]`, `linkCut`, `linkRestored`, `routesChanged`, `rewardOffered`, `over`. The UI uses them for messages, the spark and the ripple. They never feed back into the simulation.
