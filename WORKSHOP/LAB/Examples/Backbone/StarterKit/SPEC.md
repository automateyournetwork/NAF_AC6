# Backbone · First playable specification

**Status:** approved by the owner on 2026-11-09 with every default accepted (Q1–Q9, D1–D6). "Backbone" began as a working title; the owner confirmed it as the name on 2026-11-09.
This file describes observable behavior. Implementation choices are in `PLAN.md`.

## The pitch

**You build and operate a backbone network on a dark map; every packet takes OSPF's lowest-cost path, and your job is to predict where the congestion goes before it gets there.**

The player is the network architect for a growing region. Sites appear over time. The player drags between sites to lay fiber from a limited budget, sets link costs, and upgrades capacity. Each site sends traffic to the others as pulses of light. The player never steers a packet. A well-shaped network delivers traffic and scores; an overloaded link heats up and drops packets, filling a drop meter. The run ends when the drop meter is full, with a score and a short time-lapse replay.

## Who this is for

- **Learner:** working network engineers, including the expert audience at AutoCon 6.
- **Assumed knowledge:** what a router, a link and a routing metric are. No OSPF configuration experience is needed.
- **What the game teaches before the first decision:** one welcome card: "Traffic takes the lowest total cost. You shape the network; you never steer packets."
- **Why interaction helps:** engineers often reason about one path at a time. The game makes visible that one cost change reroutes *every* flow at once, and that congestion moves rather than disappears.
- **Session target:** a run lasts 5 to 10 minutes. Thinking time is unlimited because the game can be paused at any moment.

## Learning outcomes and evidence

| ID | After playing, the learner can… | The game asks them to… | Evidence of success |
| --- | --- | --- | --- |
| LO1 | Identify the lowest-cost path between two sites from link costs | Lay links and set costs, then watch which way pulses go | Pulses follow the path the inspector lists as lowest cost |
| LO2 | Predict where load moves after a cost change, a new link or a cut | Make a change while paused, resume, and see utilization shift | The link that heats up is the one the costs predict |
| LO3 | Design redundancy so one cut leaves no site without a path | Survive fiber cuts | No site goes dark after a single cut |
| LO4 (later release) | Use equal costs to share load, knowing the split happens at each hop | Enable equal-cost sharing and tune costs to equality | Utilization on parallel paths matches the per-hop split |

## The technical model

**Rule being taught:** every router forwards a packet to the neighbor on the path with the smallest sum of link costs to the destination. When several paths tie, the router may use all of the tied next hops. When the topology changes, every router recomputes.

**Context:** OSPFv2 as specified in RFC 2328, reduced to one area of routers joined by point-to-point links.

### Faithful to RFC 2328

| # | Behavior in the game | Source |
| --- | --- | --- |
| F1 | Each site is a router. It computes a shortest-path tree rooted at itself over the link-state graph. A path's cost is the sum of the costs of its links. A lower sum wins. | §16.1 ("Distance from root", steps 1–4) |
| F2 | Link cost is an integer from 1 to 65535. Zero is not allowed. | §C.3 "interface output cost must always be greater than 0"; §A.4.2 16-bit metric field |
| F3 | When two or more paths to a destination have equal cost, the router records every tied next hop. | §16.1 step 2(d), second bullet; §16.8 |
| F4 | A router may keep fewer than all equal-cost routes. Before equal-cost sharing is unlocked, each router keeps one. | §16.8 "An implementation may choose to keep only a fixed number of routes" |
| F5 | Forwarding is hop by hop. Each router along the way uses its own table, so traffic is divided at each router among that router's next hops, not divided evenly per end-to-end path. | §16.1 "List of next hops"; §16.1.1 |
| F6 | A link is used only if both ends report it. A cut removes it in both directions. | §16.1 step 2(b) "does not have a link back to vertex V" |
| F7 | When a link goes down or a cost changes, routers recompute their tables from the new link-state information and traffic follows the new tables. | §9.2 `InterfaceDown`; §13.2 (new router-LSA contents → routing table recalculated) |
| F8 | Cost is configuration. It does not react to load. A congested lowest-cost path stays the path until the player changes something. | §C.3 (cost is a configured interface parameter) |

### Simplified for play

| # | What the game does | What a real OSPF network does |
| --- | --- | --- |
| S1 | One area, point-to-point links only, one router per site | Areas, broadcast networks with Designated Routers, stub networks, external routes, virtual links |
| S2 | One cost per link, used in both directions | Cost is per interface, per direction (§C.3) |
| S3 | **Convergence is instant.** Failure detection, flooding and the path calculation all complete in one simulation step. The reconvergence ripple is a visual effect. | Detection by loss of signal or `RouterDeadInterval` (§C.3), reliable flooding (§13), then a scheduled calculation; routers disagree briefly and can loop packets |
| S4 | **Equal-cost sharing is per packet, round-robin**, so the split is exact and visible | Routers keep each flow on one path, usually by hashing, to avoid reordering (RFC 2991 §2–3) |
| S5 | **Congestion model.** Packets are one size. Each link direction serves a fixed number of packets per second from a short first-in-first-out queue; a packet that arrives at a full queue is dropped. Senders never slow down. | Variable packet sizes, TCP backing off under loss, QoS classes, active queue management |
| S6 | New links get cost 10. Upgrading capacity does not change cost. | RFC 2328 does not define how cost is chosen. Deriving it from bandwidth is a common vendor default, not part of the standard. |
| S7 | With one route kept (F4), a tie goes to the neighbor with the lowest router ID | RFC 2328 does not say which route to keep; implementations differ |
| S8 | One pulse is one simulated packet, an abstract unit of traffic | Billions of packets |
| S9 | Only links fail. Sites and routers never fail. | Routers fail too |
| S10 | Packets on a link, or queued for it, are lost when it is cut | Broadly true of a fiber cut; real loss also continues until convergence completes (see S3) |
| S11 | Travel time along a link is proportional to its length on the map, scaled for play | Propagation delay is real but far smaller than shown |

The player sees F1–F8 and S1–S11 in plain language in an "About the model" panel reachable from the welcome and pause screens.

**Excluded behavior:** adjacency formation, Hello and database exchange, LSA aging, authentication, areas, route summarization, external routes, BGP, MPLS, traffic engineering, and unequal-cost sharing.

**Authoritative references:** RFC 2328 (OSPF Version 2) and RFC 2991 (Multipath Issues in Unicast and Multicast Next-Hop Selection), sections as cited above. Hashes of the copies read are in `PROVENANCE.md`.

## The game loop

1. **A site appears.** It is marked as new and begins sending and receiving traffic after a short grace period.
2. **Shape.** The player lays a link by dragging from one site to another, spends fiber from the budget, taps a link to change its cost or upgrade its capacity.
3. **Watch.** Pulses flow along lowest-cost paths. Links grow brighter and thicker with load. A link near capacity turns amber and shows a congestion pattern; packets dropped from it fill the drop meter.
4. **Earn.** At intervals the game offers a choice between rewards (more fiber, or a capacity upgrade; later, equal-cost sharing). The game pauses for the choice.
5. **Events.** A fiber cut removes a link for a while. Traffic reconverges on what remains. A site with no path goes dark and its traffic is lost.
6. **End.** A full drop meter ends the run. The player sees traffic delivered, time survived, and a time-lapse replay.

**Pause.** The player can pause at any time. While paused, the map shows utilization on every link, the inspector lists every link as text, and every tool still works. Changes made while paused are queued, shown as pending, and all take effect together when play resumes, with one route calculation. The game does **not** preview the resulting loads: predicting them is the skill.

**Worked interaction.** Five sites: A, B, C, D, E. Links A–B, B–C, A–D, D–C all cost 10; A–C costs 25; C–E costs 5. A→C traffic uses A–B–C (cost 20); the direct link (25) carries none of it, and B–C turns amber. A plausible wrong move: the player upgrades A–C's capacity, expecting traffic to move to the bigger link. Nothing moves, because cost did not change (S6). The inspector shows A–C at 0%. The right move: lower A–C to 19. All A→C and A→E traffic shifts to the direct link, B–C cools, and now A–C is the link to watch.

## Rules of the simulation

These are rules. Numeric values marked *tunable* are play-balance constants set in `PLAN.md`, not rules.

- **R1 Routes.** After any topology or cost change, every router's table is recomputed per F1–F7 before the next packet is forwarded.
- **R2 Forwarding.** At each router a packet is sent to a next hop from that router's current table for the packet's destination. With several next hops (equal-cost sharing on), the router rotates through them in router-ID order, separately per destination.
- **R3 Traffic.** Each active site sends packets to other active sites at rates that grow over the run (*tunable*). Emission is deterministic from the seed.
- **R4 Capacity.** Each direction of a link is independent. It serves packets at its capacity (*tunable* tiers) from a queue of fixed length (*tunable*). A packet arriving at a full queue is dropped.
- **R5 Load display.** Utilization is packets served over capacity, averaged over a short window. States: nominal, busy, congested (amber, at or above a *tunable* threshold), dropping (amber plus drop indicator).
- **R6 Drops.** A drop is: a packet refused by a full queue; a packet on or queued for a link when it is cut; or a packet whose source has no path to its destination ("no route"). Every drop adds to the drop meter.
- **R7 Drop meter.** The meter fills with each drop and drains slowly while no packets are being dropped (*tunable*; see open question Q4). A full meter ends the run.
- **R8 Dark sites.** A site with no path to any other active site is dark. It is shown as dark with an icon, and its traffic counts as "no route" drops.
- **R9 Budget.** Laying a link spends fiber in proportion to its map length. A link cannot be laid without enough fiber, between a site and itself, or where a link already exists.
- **R10 Rewards.** At fixed intervals (*tunable*) the player chooses one of the offered rewards. The offer is deterministic from the seed.
- **R11 Fiber cuts.** At seeded times a link is cut for a period and then restored. The cut and the restore each trigger R1.
- **R12 Score.** Score is the number of packets delivered. Time survived is recorded beside it. The local high-score table sorts by score, then by time survived.
- **R13 Determinism.** The same seed and the same player commands at the same simulation steps produce the same run, drop for drop.
- **R14 Replay.** The end-of-run time-lapse is the recorded run re-simulated at high speed, not a video.

## Required stories and acceptance criteria (v1)

### US1 · Shape the network and see traffic follow cost — P1

- **AC1:** Given a fresh load, when I start, I see the one-card briefing, then the map with the first sites.
- **AC2:** Given two sites and enough fiber, when I drag from one to the other, a link appears, fiber is spent, and traffic between them starts flowing.
- **AC3:** Given the worked-interaction topology, A→C pulses use A–B–C and A–D–C only (see cases 1 and 6 for the split), and none use A–C.
- **AC4:** Given that topology, when I set A–C to 19, all A→C pulses use A–C from the moment play resumes.
- **AC5:** Given too little fiber, a self-link, or a duplicate, when I try to lay a link, nothing is spent and a text message says why.

### US2 · Operate under load and failure — P1

- **AC6:** Given a link at or above the congestion threshold, it is amber, thicker, and shows the congestion pattern and icon; the inspector shows its utilization as a number.
- **AC7:** Given a link dropping packets, the drop meter rises by exactly the number of packets dropped.
- **AC8:** Given a capacity upgrade applied to a link, its capacity rises one tier and its cost is unchanged.
- **AC9:** Given a fiber cut, the link shows the magenta snapped state with an icon, a reconvergence ripple plays, and pulses use the new lowest-cost paths from the next simulation step.
- **AC10:** Given a cut that leaves a site with no path, that site is shown dark with an icon and its traffic is counted as "no route" drops.
- **AC11:** Given a full drop meter, the run ends and I see traffic delivered, time survived and the time-lapse replay.

### US3 · Think without time pressure — P1

- **AC12:** Space (desktop) or the pause control (any device) pauses and resumes at any time during a run.
- **AC13:** While paused, every link's cost, capacity, utilization and state is readable on the map and in the inspector's text table.
- **AC14:** Changes made while paused are shown as pending and all apply together on resume.

### US4 · Play on a phone, a laptop and a stage — P1

- **AC15:** Phone: drag between sites lays a link; tap a link opens cost and upgrade options; pinch zooms; two-finger drag pans.
- **AC16:** Desktop: the same with a mouse and wheel; space pauses; number keys select tools.
- **AC17:** Keyboard only: I can select a site, start a link, choose its far end, open a link's options, change cost, upgrade, pause and choose a reward, with visible focus throughout.
- **AC18:** No color in the shipped game is green or red. Congestion is amber and failure is magenta, and each has a second cue.
- **AC19:** With reduced motion on, sweeps, parallax and trails stop; all state information remains.
- **AC20:** Without WebGL the game plays in a 2D renderer with the same information.

### US5 · Endless mode — P1

- **AC21:** I can start an endless run from a seed I type or a random one, and the seed is shown so a run can be repeated.
- **AC22:** The same seed and the same inputs give the same final score.
- **AC23:** My best scores are stored on the device and shown on the welcome screen.

## Version-one content

| Item | v1 |
| --- | --- |
| Mode | Endless, on one authored region map. The seed decides which sites appear and when, the traffic, the reward offers and the cuts. |
| Tools | Lay link, set cost, upgrade capacity. Cost tuning is available from the start of an endless run. |
| Events | Fiber cuts |
| Must-have effects | Packets as light pulses with trails; link brightness and thickness that scale with load; a fiber cut that snaps with a magenta spark, followed by a visible reconvergence ripple; soft bloom on everything lit |
| Around the run | Welcome screen with hero art, pause and inspector, reward choice, game over with score and time-lapse replay, local high scores, reduced-motion setting, 2D fallback |

## Later work (proposed staging)

| Release | Adds |
| --- | --- |
| v1.1 Stage polish | Self-playing attract mode when idle; sound (ambient hum that thickens with traffic, delivery tones, congestion chirp); monospace event ticker; radar ping for new sites; links that draw themselves in |
| v1.2 Sharing and maintenance | Equal-cost load sharing as an earned tool (the routing engine and its tests already cover it in v1); maintenance windows announced ahead of time; delivery bursts and drop sparks |
| v1.3 Campaign | Four regions in order: redundancy, cost tuning, equal-cost load sharing, surviving failures. Each has one clear goal. Cost tuning unlocks after the first region (default; Q1). |
| v1.4 Endless maps | Random maps generated from the seed; utilization gauges; the map dimming as failure nears |

If the owner wants attract mode or sound for the stage on day one, they move into v1 and something else moves out (Q8).

## Cases the implementation must satisfy

Worked by hand on 2026-11-09 from the rule in §16.1 of RFC 2328. They are the first unit tests. They have **not** yet been machine-checked; no code exists.

**Topology T1.** Routers A, B, C, D, E with router IDs 1–5 in that order. Links and costs: A–B 10, B–C 10, A–D 10, D–C 10, A–C 25, C–E 5.

**Topology T2.** Routers S, A, B, C, D, T with router IDs 1–6. Links and costs: S–A 1, S–B 1, A–T 2, B–C 1, B–D 1, C–T 1, D–T 1.

| # | Case | State | Expected | Why |
| --- | --- | --- | --- | --- |
| 1 | Lowest cost, with a tie | T1, sharing on | A→C: cost 20, next hops {B, D}. A–C carries no A→C traffic. | 10+10 = 20 twice; direct is 25. F1, F3 |
| 2 | Path through a transit router | T1, sharing on | A→E: cost 25, next hops {B, D} | 20 + 5; via A–C is 30 |
| 3 | Boundary: equal to the tie | T1 with A–C set to 20, sharing on | A→C: cost 20, next hops {B, C, D}; one third of A→C packets each | Three paths at 20. F3 |
| 4 | Boundary: one below | T1 with A–C set to 19 | A→C: cost 19, next hop {C} only. A→E: cost 24 via C. | 19 < 20. F1 |
| 5 | Reconvergence after a cut | T1, B–C cut | A→C: cost 20, next hop {D}. B→C: cost 30, next hop {A} (B–A–D–C). B→E: cost 35. | B–A–C would be 35. F6, F7 |
| 6 | One route kept | T1, sharing off | A→C: next hop B only | Tie goes to the lowest router ID. F4, S7 |
| 7 | Split is per hop, not per path | T2, sharing on | S→T: cost 3. Shares of S→T traffic: S–A ½, A–T ½, S–B ½, B–C ¼, B–D ¼, C–T ¼, D–T ¼ | Three equal paths, but S has two next hops. A–T carries ½, not ⅓. F5 |
| 8 | No path | T1, C–E cut | E is dark. Every packet to or from E is a "no route" drop. All other routes are unchanged. | R6, R8 |
| 9 | Overload | One link direction, capacity 4 packets/s, queue 8, offered a steady 6 packets/s for 10 s from an empty queue | 60 offered = 40 served + 8 queued + 12 dropped | Queue grows 2/s and fills at 4 s; then 2/s drop for 6 s. R4. Exact to the packet once step-edge semantics are fixed in the tasks. |
| 10 | Invalid cost | Set a cost to 0 or 65536 | Rejected with a text message; routes unchanged | F2 |
| 11 | Score | A run ends with 1,840 delivered, 212 dropped, at 6 min 05 s | Score 1,840; time 6:05 | R12 |
| 12 | Determinism | Same seed and commands, run twice | Identical state at every step and identical score | R13 |

## Experience direction

- **Visual metaphor:** a dark NOC wall map. Near-black navy, slightly tilted, with parallax layers: a faint grid, coastlines, and a slow scanning sweep.
- **Palette:** electric blue, cyan, indigo and ice white. Amber means congestion. Magenta means failure. No green and no red anywhere.
- **Second cues:** congestion is amber *and* thicker *and* patterned with a warning icon. Failure is magenta *and* a broken line with a cut icon. A dark site is a hollow ring with a slashed icon.
- **One memorable moment:** a fiber snaps with a magenta spark, and a ripple spreads as every pulse changes course.
- **Always visible:** site codes, link cost labels, the fiber budget, the drop meter, score and time. Utilization numbers when paused.
- **Stage use:** landscape layout, high contrast, large type.
- **Performance target:** 60 frames per second on a mid-range phone.
- **Hero art:** one 16:9 illustration of the lit network map on the welcome screen, reused under 1 MB as the Arcade card image.

## Non-goals

No accounts, multiplayer, backend, online leaderboard, runtime AI, level editor, or real device access. No preview of post-change loads. No simulation of anything on the excluded-behavior list.

## Decisions (resolved)

The owner accepted every default below on 2026-11-09.

| # | Question | Default |
| --- | --- | --- |
| Q1 | **Cost tuning unlock.** In the campaign (v1.3), cost tuning unlocks after the first region. v1 has no campaign, so in endless it is available from the start. Is that right? | Yes to both |
| Q2 | **Reading of v1 scope.** "One region map … and endless mode" is read as: endless mode on one authored map (North America, real city codes such as DEN and CHI), with the seed varying sites, traffic, rewards and cuts. Seed-generated maps and the campaign come later. | As stated |
| Q3 | **Equal-cost sharing before it is unlocked.** Each router keeps one route and ties go to the lowest router ID (F4, S7). The alternative is sharing always on, as most real routers default to, with no unlock. | One route until unlocked |
| Q4 | **Drop meter.** Drains slowly while nothing is dropping, so one bad cut is survivable and sustained congestion is not. The alternative never drains. | Slow drain |
| Q5 | **Removing a link.** Allowed, returns its fiber in full, and forfeits its upgrades. | As stated |
| Q6 | **Fiber budget unit.** Kilometres of fiber, so long links cost more. The alternative is a simple count of links. | Kilometres |
| Q7 | **Hero art.** The agent has no image generator in this session. Default: render the illustration with the game's own renderer from a composed scene and record that. The alternative is that the owner supplies an image from a tool of their choice, named in `PROVENANCE.md`. | Rendered by the game |
| Q8 | **Stage features in v1.** Attract mode and sound are staged for v1.1. If the stage demo needs either on day one, say which. | v1.1 |
| Q9 | **Phone orientation.** Both orientations work; landscape is the designed layout and portrait stacks the HUD. End-to-end tests and the video use 844×390 (phone landscape) and 1920×1080 (desktop). | As stated |

## Amendments

| Date | Change | Reason |
| --- | --- | --- |
| 2026-11-09 | Removed "mute control" from the v1 content table. | The owner accepted Q8, which stages all sound for v1.1. A mute button with nothing to mute would be a false control. It ships with sound. |
| 2026-11-09 | A link the player removes loses the packets on it, counted like a cut (S10 now reads "cut or removed" in the game's model notes). | R6 did not say what happens to packets on a removed link. Treating removal like a cut is the simplest consistent rule. |
| 2026-11-09 | A cut link cannot be removed until it is repaired. | Found in code review: removing a cut link refunded its fiber, and re-laying it gave a working link at once, which cancelled the cut for free. |
| 2026-11-09 | A link's capacity tier is shown by thin rails beside it, and queued packets are drawn stacked at the sending end. | Second cues for capacity and for queue build-up, added during the build. No rule changed. |

## Release evidence

Every v1 acceptance criterion has a recorded pass, fail or not-run. Cases 1–12 pass as unit tests with expected values taken from this file, not from the code under test. End-to-end tests complete a seeded run at phone and desktop sizes. A video of a seeded run from start to game over is saved in the repo at both sizes. The README states what is implemented, exact run and test commands, and remaining limits.
