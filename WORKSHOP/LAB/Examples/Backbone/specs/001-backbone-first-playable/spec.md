# Feature Specification: Backbone, first playable version (v1)

**Feature Branch**: `speckit-rebuild` (no separate feature branch; the feature directory is `specs/001-backbone-first-playable`)

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "Read `StarterKit/SPEC.md`. Specify this game's first playable version, preserving the learning outcomes, non-goals, and acceptance criteria. Also apply the owner's decisions K1 and K3 and the carried points L1 and L2 recorded in `docs/capture-log.md`."

This file describes observable behavior. Implementation choices belong in `plan.md`. IDs from the approved input, `StarterKit/SPEC.md`, are kept so that every statement can be traced back to it: LO for learning outcomes, AC for acceptance criteria, F and S for the two model tables, R for simulation rules, Q for the owner's decisions, and case numbers 1–12. The constitution's principles are cited as C1–C7.

## Purpose and Learning Outcomes

**The pitch.** You build and operate a backbone network on a dark map; every packet takes OSPF's lowest-cost path, and your job is to predict where the congestion goes before it gets there.

The player is the network architect for a growing region. Sites appear over time. The player drags between sites to lay fiber from a limited budget, sets link costs, and upgrades capacity. Each site sends traffic to the others as pulses of light. The player never steers a packet. A well-shaped network delivers traffic and scores; an overloaded link heats up and drops packets, filling a drop meter. The run ends when the drop meter is full, with a score and a short time-lapse replay.

**Who this is for**

- **Learner:** working network engineers, including the expert audience at AutoCon 6.
- **Assumed knowledge:** what a router, a link and a routing metric are. No OSPF configuration experience is needed.
- **What the game teaches before the first decision:** one welcome card: "Traffic takes the lowest total cost. You shape the network; you never steer packets."
- **Why interaction helps:** engineers often reason about one path at a time. The game makes visible that one cost change reroutes *every* flow at once, and that congestion moves rather than disappears.
- **Session target:** a run lasts 5 to 10 minutes. Thinking time is unlimited because the game can be paused at any moment.

**Learning outcomes and evidence**

| ID | After playing, the learner can… | The game asks them to… | Evidence of success |
| --- | --- | --- | --- |
| LO1 | Identify the lowest-cost path between two sites from link costs | Lay links and set costs, then watch which way pulses go | Pulses follow the path the inspector lists as lowest cost |
| LO2 | Predict where load moves after a cost change, a new link or a cut | Make a change while paused, resume, and see utilization shift | The link that heats up is the one the costs predict |
| LO3 | Design redundancy so one cut leaves no site without a path | Survive fiber cuts | No site goes dark after a single cut |
| LO4 (later release) | Use equal costs to share load, knowing the split happens at each hop | Enable equal-cost sharing and tune costs to equality | Utilization on parallel paths matches the per-hop split |

## Clarifications

### Session 2026-11-10

The owner was away and had said to proceed without step-by-step review. Every answer below was given by the build agent, from the owner's approved decisions where one applies, and waits for the owner's review.

- Q: Does the pause inspector show the lowest-cost path between sites, as the evidence for learning outcome LO1 assumes, or only the table of links? → A: It shows both. Selecting a site lists that router's table in force: every destination with its total cost and next hop. Pending changes are not included until play resumes. (Build agent, from LO1's evidence line in the approved input: "Pulses follow the path the inspector lists as lowest cost".)
- Q: How does a site get its router ID, and where can the player see it? → A: Router IDs are whole numbers given in the order the run introduces its sites, starting at 1, and each site's ID is shown beside its code in the pause inspector. (Build agent. No approved decision covers it. The ID decides every tie while one route is kept, so C2 requires it to be visible.)
- Q: Inside one simulation step, does a link direction serve its queue before or after it accepts the packets arriving in that step? → A: It serves first, then accepts arrivals. (Build agent, from case 9: worked by hand, only this order gives exactly 40 served, 8 queued and 12 dropped. The other order gives 40, 7 and 13.)
- Q: In which browsers must v1 be verified? → A: Chromium only. Other browsers are not verified in v1 and are listed as a limit in the README. (Build agent, from the hand-built v1's recorded practice in `PROVENANCE.md`: "Not verified: any browser other than Chromium".)
- Q: Does a reward offer in v1 vary with the seed, or is it always the same two choices? → A: Always the same two choices: a fixed amount of fiber, or one capacity upgrade. The offer is still produced by the simulation's seeded rules, so it stays deterministic (R10). (Build agent. The approved input is not consistent here: R10, Q2 and its Mode row say the seed decides the offers, while the approved plan's tuning table gives a single offer, "+3,000 km of fiber or +1 upgrade", and v1 has only two rewards to offer. This answer follows the plan and is flagged for the owner as K6 in `docs/capture-log.md`.)

## User Scenarios & Testing *(mandatory)*

All five stories carry priority P1 in the approved input: v1 needs every one of them. Their order below is the order of work, so that routing correctness and the core loop exist before any visual effect (C7).

**The game loop the stories share**

1. **A site appears.** It is marked as new and begins sending and receiving traffic after a short grace period.
2. **Shape.** The player lays a link by dragging from one site to another, spending fiber from the budget, and taps a link to change its cost, upgrade its capacity or remove it.
3. **Watch.** Pulses flow along lowest-cost paths. Links grow brighter and thicker with load. A link near capacity turns amber and shows a congestion pattern; packets dropped from it fill the drop meter.
4. **Earn.** At intervals the game offers a choice between rewards: more fiber, or a capacity upgrade. The game pauses for the choice.
5. **Events.** A fiber cut removes a link for a while. Traffic reconverges on what remains. A site with no path goes dark and its traffic is lost.
6. **End.** A full drop meter ends the run. The player sees traffic delivered, time survived, and a time-lapse replay.

### User Story 1 - Shape the network and see traffic follow cost (Priority: P1)

As the architect, I lay links between sites, set their costs and remove them, and I watch every pulse take the lowest-cost path that results.

**Why this priority**: This is the skill the game exists to teach (LO1, LO2). Nothing else has meaning until traffic provably follows cost.

**Independent Test**: Build the worked-interaction topology from a fixed seed, read the costs, and confirm that pulses use only the paths the costs predict before and after one cost change.

**Worked interaction.** Five sites: A, B, C, D, E. Links A–B, B–C, A–D, D–C all cost 10; A–C costs 25; C–E costs 5. A→C traffic uses A–B–C (cost 20); the direct link (25) carries none of it, and B–C turns amber. A plausible wrong move: the player upgrades A–C's capacity, expecting traffic to move to the bigger link. Nothing moves, because cost did not change (S6). The inspector shows A–C at 0%. The right move: lower A–C to 19. All A→C and A→E traffic shifts to the direct link, B–C cools, and now A–C is the link to watch.

**Acceptance Scenarios**:

1. **AC1** — **Given** a fresh load, **When** I start, **Then** I see the one-card briefing, then the map with the first sites.
2. **AC2** — **Given** two sites and enough fiber, **When** I drag from one to the other, **Then** a link appears, fiber is spent, and traffic between them starts flowing.
3. **AC3** — **Given** the worked-interaction topology, **When** traffic flows, **Then** A→C pulses use A–B–C and A–D–C only (see cases 1 and 6 for the split), and none use A–C.
4. **AC4** — **Given** that topology, **When** I set A–C to 19, **Then** all A→C pulses use A–C from the moment play resumes.
5. **AC5** — **Given** too little fiber, a self-link, or a duplicate, **When** I try to lay a link, **Then** nothing is spent and a text message says why.
6. **AC24** — **Given** a link that is up, **When** I remove it, **Then** the link disappears, its fiber returns to the budget in full, the upgrades spent on it are forfeited, and the packets on it or queued for it are counted as drops.
7. **AC25** — **Given** a link that is cut, **When** I try to remove it, **Then** nothing changes and a text message says it cannot be removed until it is repaired.

AC24 and AC25 are new in this file. The owner's decision K1 asked for an acceptance criterion for link removal, which the input allowed (Q5 and two amendments) but never tested.

---

### User Story 2 - Operate under load and failure (Priority: P1)

As the operator, I see which links are congested or cut, I see exactly what each costs me in dropped traffic, and I respond with capacity and cost changes until the drop meter ends the run.

**Why this priority**: Congestion and failure are the consequences that make a routing prediction matter (LO2, LO3).

**Independent Test**: Run a fixed seed with a scripted player until a link congests, a fiber cut happens and the drop meter fills, and compare the meter and the end screen with the simulation's own counts.

**Acceptance Scenarios**:

1. **AC6** — **Given** a link at or above the congestion threshold, **When** I look at it, **Then** it is amber, thicker, and shows the congestion pattern and icon; the inspector shows its utilization as a number.
2. **AC7** — **Given** a link dropping packets, **When** packets are dropped, **Then** the drop meter rises by exactly the number of packets dropped.
3. **AC8** — **Given** a capacity upgrade applied to a link, **When** it takes effect, **Then** its capacity rises one tier and its cost is unchanged.
4. **AC9** — **Given** a fiber cut, **When** it happens, **Then** the link shows the magenta snapped state with an icon, a reconvergence ripple plays, and pulses use the new lowest-cost paths from the next simulation step.
5. **AC10** — **Given** a cut that leaves a site with no path, **When** it happens, **Then** that site is shown dark with an icon and its traffic is counted as "no route" drops.
6. **AC11** — **Given** a full drop meter, **When** it fills, **Then** the run ends and I see traffic delivered, time survived and the time-lapse replay.

---

### User Story 3 - Think without time pressure (Priority: P1)

As a learner, I stop the game whenever I want, read every number, make my changes, and only then let time run again.

**Why this priority**: Pressure comes from growth, never from reflexes (C3). Prediction needs time to think.

**Independent Test**: Play a full run in which every decision is made while paused, and confirm that the changes apply together on resume.

**Acceptance Scenarios**:

1. **AC12** — **Given** a run in progress, **When** I press Space (desktop) or the pause control (any device), **Then** the game pauses, and the same action resumes it, at any time during a run.
2. **AC13** — **Given** the game is paused, **When** I look at the map and the inspector, **Then** every link's cost, capacity, utilization and state is readable on the map and in the inspector's text table.
3. **AC14** — **Given** the game is paused, **When** I make changes, **Then** changes made while paused are shown as pending and all apply together on resume.
4. **AC26** — **Given** the game is paused, **When** I select a site in the inspector, **Then** I see that router's table in force: every destination with its total cost and next hop, not including pending changes.

AC26 is new in this file. It comes from the clarification of 2026-11-10 about learning outcome LO1.

---

### User Story 4 - Play on a phone, a laptop and a stage (Priority: P1)

As any player, I can play by touch, by mouse or by keyboard alone, on a phone or a projector, with or without motion, and never depend on telling green from red.

**Why this priority**: Access is part of the core game (C4), and the game is shown on a stage and played on phones.

**Independent Test**: Complete a run at phone size by touch, at desktop size by mouse, and by keyboard only; repeat with reduced motion and with the fallback renderer; run the color checks.

**Acceptance Scenarios**:

1. **AC15** — **Given** a phone, **When** I play by touch, **Then** drag between sites lays a link; tap a link opens cost and upgrade options; pinch zooms; two-finger drag pans.
2. **AC16** — **Given** a desktop, **When** I use a mouse and wheel, **Then** the same actions work; Space pauses; number keys select tools.
3. **AC17** — **Given** a keyboard only, **When** I play, **Then** I can select a site, start a link, choose its far end, open a link's options, change cost, upgrade, pause and choose a reward, with visible focus throughout.
4. **AC18** — **Given** the shipped game, **When** its colors are checked, **Then** no color is green or red. Congestion is amber and failure is magenta, and each has a second cue. FR-032 defines green, red and the check.
5. **AC19** — **Given** reduced motion is on, **When** I play, **Then** sweeps, parallax and trails stop; all state information remains.
6. **AC20** — **Given** a device without WebGL, **When** I play, **Then** the game plays in a 2D renderer with the same information.

---

### User Story 5 - Endless mode (Priority: P1)

As a returning player, I start an endless run from a seed, repeat a run exactly when I want to, and see my best scores.

**Why this priority**: Endless mode on one region is the whole of v1's content, and a repeatable seed is what makes a run checkable (C3, C5).

**Independent Test**: Start two runs from the same typed seed with the same recorded inputs and compare their final scores; reload and find the best score on the welcome screen.

**Acceptance Scenarios**:

1. **AC21** — **Given** the welcome screen, **When** I start an endless run from a seed I type or a random one, **Then** the run starts and the seed is shown so the run can be repeated.
2. **AC22** — **Given** a seed and a recorded list of inputs, **When** the run is played twice, **Then** the same seed and the same inputs give the same final score.
3. **AC23** — **Given** finished runs, **When** I return to the welcome screen, **Then** my best scores are stored on the device and shown there.

---

### Edge Cases

- **Laying a link** with too little fiber, from a site to itself, or where a link already exists: nothing is spent and a text message says why (AC5).
- **Cost** set to 0, to 65536, to a fraction or to text: rejected with a text message; routes unchanged (case 10).
- **Upgrade** with no upgrade in stock, or on a link already at the top tier: nothing changes and a text message says why.
- **Removing a cut link**: refused until it is repaired (AC25). Without this, removing and re-laying a cut link would cancel the cut for free.
- **A new site with no link** when its grace period ends is dark: its traffic, and traffic addressed to it, are "no route" drops. The grace period is the time the player has to connect it. The sites present at the start get the same grace period.
- **A cut that isolates a site**: the site is dark; every packet to or from it is a "no route" drop; all other routes are unchanged (case 8).
- **A packet already on its way** when its destination becomes unreachable is dropped as "no route" at the first router that has no route for it.
- **A packet on a link whose cost changes** stays on that link and is forwarded by the new tables at the next router. A cost change by itself drops nothing.
- **A fiber cut falls due when no link is up**: no cut happens.
- **Several changes made while paused**: each is checked when it is made against the state the earlier pending changes will produce, so the budget shown already includes them. They apply in the order made. Removing a link that is still pending cancels it and returns its fiber.
- **The page is hidden** (another tab, a locked phone): the game pauses itself, so a run cannot be lost while the player is away.
- **A typed seed** that is empty starts a random seed; one with other characters is refused with a text message.
- **The device refuses storage**: the game plays; best scores are not kept, and the welcome screen says so.
- **The window is resized or rotated** during a run: the layout adapts and the run continues unchanged.
- **Every site of the run has appeared**: no more sites appear; traffic keeps growing.

## Requirements *(mandatory)*

### Technical Model

**Rule being taught:** every router forwards a packet to the neighbor on the path with the smallest sum of link costs to the destination. When several paths tie, the router may use all of the tied next hops. When the topology changes, every router recomputes.

**Context:** OSPFv2 as specified in RFC 2328, reduced to one area of routers joined by point-to-point links.

#### Faithful to RFC 2328

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

#### Simplified for play

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
| S10 | Packets on a link, or queued for it, are lost when it is cut or removed | Broadly true of a fiber cut; real loss also continues until convergence completes (see S3) |
| S11 | Travel time along a link is proportional to its length on the map, scaled for play | Propagation delay is real but far smaller than shown |

The player sees F1–F8 and S1–S11 in plain language in an "About the model" panel reachable from the welcome and pause screens (FR-028).

**Excluded behavior:** adjacency formation, Hello and database exchange, LSA aging, authentication, areas, route summarization, external routes, BGP, MPLS, traffic engineering, and unequal-cost sharing.

**Authoritative references:** RFC 2328 (OSPF Version 2) and RFC 2991 (Multipath Issues in Unicast and Multicast Next-Hop Selection), sections as cited above. Hashes of the copies read are in `PROVENANCE.md`.

### Functional Requirements

Numeric values marked *tunable* are play-balance constants. They are not rules (C6) and their values are set in the plan, with one exception: the drop meter's three numbers are stated in FR-010, because the constitution requires the rule that ends a run to be exact in this file (C3).

**Routing and forwarding**

- **FR-001 (R1 Routes)**: After any change to a link's existence, up or down state, or cost, the game MUST recompute every router's routes per F1–F7 before the next packet is forwarded.
- **FR-002 (R2 Forwarding)**: At each router a packet MUST be sent to a next hop taken from that router's current table for the packet's destination. Where a router keeps several next hops, it MUST rotate through them in router-ID order, separately for each destination.
- **FR-003 (F4, S7, Q3 One route kept)**: In v1 play every router keeps one route per destination, and a tie goes to the neighbor with the lowest router ID. The routing logic MUST also be able to keep every equal-cost next hop. v1 uses that only in its tests (cases 1, 2, 3 and 7), ready for the equal-cost tool of v1.2.
- **FR-004 (F2 Cost range)**: A link cost MUST be a whole number from 1 to 65535. Any other value MUST be rejected with a text message that says why, leaving the cost and the routes unchanged.
- **FR-005 (C1 The display follows the simulation)**: Every pulse drawn MUST be one simulated packet on the link where it is drawn. Drawing MUST NOT choose, alter or invent a path.

**Traffic, capacity and drops**

- **FR-006 (R3 Traffic)**: Each active site MUST send packets to other active sites at rates that grow over the run (*tunable*). Emission MUST be decided by the seed alone.
- **FR-007 (R4 Capacity)**: Each direction of a link is independent. It MUST serve packets at its capacity (*tunable* tiers) from a first-in-first-out queue of fixed length (*tunable*). A packet that arrives at a full queue MUST be dropped. Senders never slow down. Inside one simulation step a link direction first serves from its queue and then accepts the packets arriving in that step.
- **FR-008 (R5 Load display)**: The utilization of a link direction is packets served divided by capacity, averaged over a short window (*tunable*). Each link MUST show one of four load states: nominal, busy (at or above a *tunable* threshold), congested (amber, at or above a higher *tunable* threshold) or dropping (amber plus a drop indicator, when a packet was refused within the window). The map shows the busier direction of a link. The inspector lists both directions.
- **FR-009 (R6 Drops)**: A drop is exactly one of: (a) a packet refused by a full queue; (b) a packet on a link, or queued for it, when that link is cut or removed; (c) a packet with no route to its destination, at its source or at a router along the way ("no route"). Every drop MUST be counted once and MUST add to the drop meter.
- **FR-010 (R7 Drop meter)**: The drop meter holds a whole number from 0 up to its size. Every drop adds 1. When a full drain delay of simulated time has passed since the last drop, the meter falls by 1, and by 1 again after each further drain interval, until the next drop or until it reaches 0. Any drop restarts the drain delay. Simulated time does not pass while the game is paused. The run ends at the simulation step in which the meter reaches its size. **v1 values: size 100 drops, drain delay 3 seconds, drain interval 1 second.** These three numbers are tuning constants: they may change for balance, and any change is recorded here so that the rule stays exact.
- **FR-011 (R8 Dark sites)**: A site with no path to any other active site is dark. It MUST be shown as dark with an icon, and its traffic MUST count as "no route" drops.

**Building the network**

- **FR-012 (R9 Budget, Q6)**: Fiber is measured in kilometres. Laying a link spends fiber equal to the link's length on the map, rounded to a whole kilometre. A link MUST NOT be laid without enough fiber, from a site to itself, or where a link between the two sites already exists. A refused attempt spends nothing.
- **FR-013 (Q5 Removing a link)**: The player can remove a link that is up. Removal returns the link's fiber in full, forfeits the upgrades spent on it, and drops the packets on it or queued for it (FR-009b). A link that is cut MUST NOT be removable until it is repaired.
- **FR-014 (Capacity upgrades)**: Capacity comes in tiers. Applying an upgrade spends one upgrade from the player's stock and raises the link one tier in both directions. Its cost is unchanged (S6). Without an upgrade in stock, or on a link at the top tier, the attempt changes nothing.
- **FR-015 (S6 Default cost)**: A new link has cost 10.
- **FR-016 (R10 Rewards)**: At fixed intervals of simulated time (*tunable*) the game pauses and the player chooses one of the offered rewards. In v1 every offer holds the same two choices: a fixed amount of fiber (*tunable*), or one capacity upgrade. The offer therefore does not vary with the seed, and stays deterministic. The choice has no time limit. While the choice is open the tools still work, and changes made then are pending, as in a pause (FR-024): they take effect together with the choice.
- **FR-017 (R11 Fiber cuts)**: At times decided by the seed, one link that is up is cut for a period and then restored. The cut and the restore each trigger FR-001.
- **FR-018 (Sites)**: A run starts with a few sites of the region and gains more over time (*tunable* counts and interval), as decided by the seed. A new site is marked as new and neither sends nor receives traffic until its grace period (*tunable*) ends. Router IDs are whole numbers given in the order the run introduces its sites, starting at 1.

**The run**

- **FR-019 (R12 Score)**: Score is the number of packets delivered. Time survived is recorded beside it. The best-score table sorts by score, then by time survived.
- **FR-020 (R13 Determinism)**: The same seed and the same player commands at the same simulation steps MUST produce the same run, drop for drop.
- **FR-021 (R14 Replay)**: The end-of-run time-lapse MUST be the recorded run simulated again at high speed, not a video.
- **FR-022 (Seeds)**: A run starts from a seed the player types or from a random one. The seed is shown during the run and at its end so the run can be repeated. A typed seed is 1 to 24 letters, digits or hyphens.
- **FR-023 (Best scores)**: The best five scores are stored on the device and shown on the welcome screen with their seeds.
- **FR-024 (Pause)**: The player can pause and resume at any moment of a run. While paused every tool works. Changes made while paused are queued, shown as pending, and all take effect together when play resumes, with one route calculation. The game also pauses when its page is hidden.
- **FR-025 (No preview)**: The game MUST NOT preview the loads or the routes that a pending change will produce. Predicting them is the skill.
- **FR-026 (End of run)**: A full drop meter ends the run. The end screen shows traffic delivered, time survived, the seed and the time-lapse, and offers a new run. Restarting is free.
- **FR-027 (Welcome)**: A fresh load shows the welcome screen with the hero art, the best scores, the seed field and the one-card briefing: "Traffic takes the lowest total cost. You shape the network; you never steer packets."
- **FR-028 (About the model)**: A panel reachable from the welcome and pause screens states F1–F8 and S1–S11 in plain language. Every sentence in it MUST agree with the two tables above.

**Access and presentation**

- **FR-029 (Input)**: Core play MUST work by touch, by mouse and by keyboard alone. Keyboard focus is always visible and every control has a readable name.
- **FR-030 (Always visible)**: Site codes, link cost labels, the fiber budget, the upgrade stock, the drop meter, score and time are always visible during a run. Utilization numbers are visible when paused. No value needed to reason about a path is available by hover alone.
- **FR-031 (Inspector)**: The pause inspector lists every link as text: its two sites, cost, capacity, utilization in each direction and state (up or cut, load state, and any pending change). It lists every site with its code, router ID and state. Selecting a site lists that router's table in force: every destination with its total cost and next hop (AC26).
- **FR-032 (No green, no red; AC18, K3)**: No color in the shipped game is green or red. A color's hue is its angle on the 0–360° color wheel, computed from its red, green and blue values. **Green is any hue from 75° to 165°. Red is any hue below 25° or above 340°.** A color is judged only if it is strongly colored: its saturation (largest channel minus smallest, divided by the largest) is at least 0.25 and its largest channel is at least 0.2 of full scale. Greys, whites and near-blacks have no meaningful hue.
  - **(a) Authored colors.** Every color value written in the game's palette, styles, markup and drawing code MUST lie outside both bands. The count inside is zero.
  - **(b) Rendered frames.** Glow and blending mix authored colors on screen. A scripted census of rendered frames, in both renderers, MUST report the share of strongly colored pixels in each band as a number. The target is zero. Any share above zero is a deviation from C4: it is reported as that number, never described as "none", and taken to the owner, who alone can accept it. As a guard against regressions the automated check also fails outright above 1% in either band.
- **FR-033 (Second cues)**: Every color state carries a second cue. Congestion is amber *and* thicker *and* patterned, with a warning icon. Failure is magenta *and* a broken line, with a cut icon. A dark site is a hollow ring with a slashed icon. A link's capacity tier is shown by thin rails beside it, and queued packets are drawn stacked at the sending end.
- **FR-034 (Reduced motion)**: A reduced-motion setting, on by default when the device asks for it, stops sweeps, parallax and trails. All state information remains.
- **FR-035 (Fallback drawing)**: Where WebGL is unavailable the game plays in a 2D renderer that shows the same information.
- **FR-036 (The four must-have effects)**: Packets as light pulses with trails; link brightness and thickness that scale with load; a fiber cut that snaps with a magenta spark, followed by a visible reconvergence ripple; soft bloom on everything lit.
- **FR-037 (Layouts, Q9)**: Landscape is the designed layout. Portrait works and stacks the HUD. For stage use the layout has high contrast and large type: every text color has a contrast ratio of at least 4.5 to 1 against the background it sits on, and no text is smaller than 16 CSS pixels at 1920×1080 or 11 CSS pixels at 844×390.
- **FR-038 (Hero art, Q7)**: One 16:9 illustration of the lit network map on the welcome screen, rendered by the game's own renderer from a composed scene, and reused under 1 MB as the Arcade card image.
- **FR-039 (Self-contained)**: The game is static files. While playing it needs no account, backend, network access, model or API key.
- **FR-040 (Messages)**: Every refused action explains itself in text, never by color or motion alone.

**Experience direction**

- **Visual metaphor:** a dark NOC wall map. Near-black navy, slightly tilted, with parallax layers: a faint grid, coastlines, and a slow scanning sweep.
- **Palette:** electric blue, cyan, indigo and ice white. Amber means congestion. Magenta means failure. No green and no red anywhere.
- **One memorable moment:** a fiber snaps with a magenta spark, and a ripple spreads as every pulse changes course.
- **Performance target:** 60 frames per second on a mid-range phone.

**Version-one content**

| Item | v1 |
| --- | --- |
| Mode | Endless, on one authored region map. The seed decides which sites appear and when, the traffic and the cuts. Reward offers are the same every time in v1. |
| Tools | Lay link, remove link, set cost, upgrade capacity. Cost tuning is available from the start of an endless run. |
| Events | Fiber cuts |
| Must-have effects | The four of FR-036 |
| Around the run | Welcome screen with hero art, pause and inspector, reward choice, game over with score and time-lapse replay, local best scores, reduced-motion setting, 2D fallback |

### Key Entities

- **Region**: the authored map. A pool of sites with codes and map positions, and a coastline to draw.
- **Site**: a router. Has a code, a position, a router ID, and a state: new, active or dark.
- **Link**: joins two sites. Has a length in kilometres, a cost, a capacity tier, a state (up or cut), and for each direction a queue and a utilization.
- **Packet**: one unit of traffic with a source site and a destination site. It is on one link, in one queue, delivered or dropped.
- **Route table**: for each router and each destination, the path cost and the next hops kept.
- **Budget**: kilometres of fiber and a stock of capacity upgrades.
- **Drop meter**: the count that ends the run (FR-010).
- **Reward offer**: the choices put to the player at an interval.
- **Fiber cut**: a link, the moment it is cut and the moment it is restored.
- **Run**: a seed plus the player's commands and the simulation steps at which they were made. It yields a score and a time survived, and can be replayed exactly.
- **Best-score entry**: a score, a time survived and the seed that produced them.

### Cases the Implementation Must Satisfy

Worked by hand on 2026-11-09 from the rule in §16.1 of RFC 2328 and copied unchanged from `StarterKit/SPEC.md`. In the rebuild they are again the first tests: they are written before the routing code, and their expected values come from this table, never from the code under test.

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
| 9 | Overload | One link direction, capacity 4 packets/s, queue 8, offered a steady 6 packets/s for 10 s from an empty queue | 60 offered = 40 served + 8 queued + 12 dropped | Queue grows 2/s and fills at 4 s; then 2/s drop for 6 s. R4. Exact to the packet with service before arrival in each step (FR-007). |
| 10 | Invalid cost | Set a cost to 0 or 65536 | Rejected with a text message; routes unchanged | F2 |
| 11 | Score | A run ends with 1,840 delivered, 212 dropped, at 6 min 05 s | Score 1,840; time 6:05 | R12 |
| 12 | Determinism | Same seed and commands, run twice | Identical state at every step and identical score | R13 |

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All twelve cases above pass as automated tests whose expected values are taken from this file, not from the code under test.
- **SC-002**: The routing logic agrees with an independent brute-force check on every pair of routers in every one of at least 300 seeded random networks.
- **SC-003**: The same seed and the same commands, run twice, give an identical state at every step and an identical score, every time it is tried.
- **SC-004**: Every v1 acceptance criterion, AC1–AC26, has a recorded result: pass, fail or not run.
- **SC-005**: A seeded run completes from start to game over at phone size (844×390) and at desktop size (1920×1080), and a video of each is saved in the repository.
- **SC-006**: The game plays from start to game over with no network connection, served as plain files, in a clean browser profile.
- **SC-007**: No authored color lies in the green or red band, and the rendered-frame share in each band is reported as a number (FR-032).
- **SC-008**: A run can be played start to finish by keyboard alone, by touch at phone size, with reduced motion, and with the fallback renderer.
- **SC-009**: The card image is 16:9 and under 1 MB.
- **SC-010**: The README states what is implemented, the exact run and test commands, and the remaining limits, and another engineer can follow it from a fresh copy.
- **SC-011** (needs a person): A tester can state, for a deliberately bad cost change, which link heated up and why, using only what the game shows. Recorded as not run until someone does it.
- **SC-012** (needs a person and a phone): The game holds 60 frames per second on a mid-range phone. Recorded as not run until the owner measures it.
- **SC-013** (needs a person): A person's run lasts 5 to 10 minutes. The scripted player's run lengths on fixed seeds are recorded separately and are not a substitute.

## Assumptions

**Decisions the owner has already made.** Accepted on 2026-11-09 in the approved input, and carried here unchanged.

| # | Decision |
| --- | --- |
| Q1 | In the campaign (v1.3), cost tuning unlocks after the first region. v1 has no campaign, so in endless mode it is available from the start. |
| Q2 | v1 is endless mode on one authored map: North America, with real city codes such as DEN and CHI. The seed varies sites, traffic, rewards and cuts. Seed-generated maps and the campaign come later. (On rewards, see the clarification of 2026-11-10 and K6.) |
| Q3 | Until equal-cost sharing is unlocked, each router keeps one route and ties go to the lowest router ID (F4, S7). |
| Q4 | The drop meter drains slowly while nothing is dropping, so one bad cut is survivable and sustained congestion is not. |
| Q5 | Removing a link is allowed, returns its fiber in full, and forfeits its upgrades. |
| Q6 | The fiber budget is in kilometres, so long links cost more. |
| Q7 | The hero art is rendered by the game's own renderer from a composed scene. No image generator is used. |
| Q8 | Attract mode and sound are staged for v1.1. v1 has no sound and therefore no mute control. |
| Q9 | Both orientations work; landscape is the designed layout and portrait stacks the HUD. End-to-end tests and the videos use 844×390 and 1920×1080. |

**Decided by the owner on 2026-11-10** (recorded in `docs/capture-log.md`)

- **K1**: Link removal and reward choice are player actions (constitution 1.1.0), and removal has acceptance criteria: AC24 and AC25.
- **K3**: Green and red are defined by hue bands, no authored color may lie inside them, and the rendered-frame share is reported as a number (FR-032).

**Amendments already in the input**, and where they are in this file: no mute control in v1 (Q8); a removed link loses its packets like a cut link (S10, FR-009b); a cut link cannot be removed (FR-013, AC25); capacity rails and stacked queued packets as second cues (FR-033).

**Reasonable defaults chosen here**, where the input was silent:

- Capacity upgrades are a counted stock: a reward adds one, applying one spends one (FR-014). The input implies this by offering "a capacity upgrade" as a reward.
- A packet that loses its route while on its way is a "no route" drop (FR-009c). The input defined "no route" only at the source.
- The inspector shows utilization in both directions, and the map shows the busier one (FR-008).
- The game pauses when its page is hidden (FR-024).
- A typed seed is 1 to 24 letters, digits or hyphens (FR-022), and five best scores are kept (FR-023).
- A change made while paused is checked when it is made, against the state the earlier pending changes will produce.
- A change made while a reward waits to be chosen is treated the same way: checked when made, shown as pending, and applied together with the choice (FR-016). The input says only that the game pauses for the choice. Set by the build agent after the code review of 2026-11-10; it waits for the owner's review.
- Automated checks run in Chromium. Other browsers are not verified in v1 and are listed as a limit in the README (clarified 2026-11-10).
- The contrast ratio and the two minimum text sizes in FR-037 were set by the build agent during the analysis of 2026-11-10 so that "high contrast and large type" can be checked. The sizes follow the base unit of the mock the owner approved. They wait for the owner's review.

**Dependencies**: the texts of RFC 2328 and RFC 2991 as recorded in `PROVENANCE.md`; a public-domain coastline for the region map; an openly licensed typeface shipped with the game.

## Non-Goals

No accounts, multiplayer, backend, online leaderboard, runtime AI, level editor, or real device access. No preview of post-change loads. No simulation of anything on the excluded-behavior list.

Not in v1: the campaign, equal-cost sharing as a player tool, maintenance windows, sound, attract mode and generated maps. They are staged below.

## Later Releases

| Release | Adds |
| --- | --- |
| v1.1 Stage polish | Self-playing attract mode when idle; sound (ambient hum that thickens with traffic, delivery tones, congestion chirp); monospace event ticker; radar ping for new sites; links that draw themselves in |
| v1.2 Sharing and maintenance | Equal-cost load sharing as an earned tool (the routing engine and its tests already cover it in v1); maintenance windows announced ahead of time; delivery bursts and drop sparks |
| v1.3 Campaign | Four regions in order: redundancy, cost tuning, equal-cost load sharing, surviving failures. Each has one clear goal. Cost tuning unlocks after the first region. |
| v1.4 Endless maps | Random maps generated from the seed; utilization gauges; the map dimming as failure nears |
