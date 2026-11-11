# Review of shipped explanatory text against the spec and RFC 2328 (C1 evidence)

Constitution C1 asks for an RFC section for every "faithful" claim and a review of all shipped explanatory text against those sections. This review was done by the build agent on 2026-11-10. It has not been checked by a person.

## Sources read for this review

| Source | How | Identifier |
| --- | --- | --- |
| RFC 2328, OSPF Version 2 | `curl` from `https://www.rfc-editor.org/rfc/rfc2328.txt` on 2026-11-10; sections read locally | SHA-256 `981690e297fbba9e8ef655802552b5529cb17f1ffe790ad2d55706cc522ff50c`, the same hash recorded for the hand-built v1 |
| RFC 2991, Multipath Issues in Unicast and Multicast Next-Hop Selection | Same | SHA-256 `7ed2e5951b4a31294333563c2829d7ba04b2e2d9e56362653bbd9d9311ad1e7f`, also the same |
| `specs/001-backbone-first-playable/spec.md`, the two model tables | Read in this repository | As committed |

Sections of RFC 2328 read in this session: 16.1 (through step 4), 16.1.1 (opening), 16.8, 9.2 (`InterfaceDown`), 13.2 (opening and the router-LSA case), C.3 (interface output cost), A.4.2 (the link layout of the router-LSA). RFC 2991 was searched for its statements on reordering and hashing; it was not read in full.

## The faithful notes: `src/content/text.json`, shown in About the model

| Note | Shipped sentence | RFC 2328 text it rests on | Verdict |
| --- | --- | --- | --- |
| F1 | Each site is a router. It works out the lowest-cost path to every other site. A path's cost is the sum of the costs of its links, and the lower sum wins. | §16.1: "A router calculates the shortest-path tree using itself as the root." "The link state cost of a path is calculated as the sum of the costs of the path's constituent links… One path is said to be 'shorter' than another if it has a smaller link state cost." | Agrees |
| F2 | A link cost is a whole number from 1 to 65535. Zero is not allowed. | §C.3: "The interface output cost must always be greater than 0." §A.4.2: in the router-LSA's link layout `metric` takes half of a 32-bit row, so 16 bits. | Agrees |
| F3 | When two or more paths to a destination cost the same, the router records every tied next hop. | §16.1 step 2(d), second bullet: when D is "Equal to the value that appears for vertex W… This set of hops should be added to the next hop values". §16.8: "The OSPF protocol maintains multiple equal-cost routes to all destinations." | Agrees |
| F4 | A router may keep fewer than all of its equal-cost routes. In this version each router keeps one. | §16.8: "There is no requirement that a router running OSPF keep track of all possible equal-cost routes… An implementation may choose to keep only a fixed number of routes". | Agrees |
| F5 | Forwarding is hop by hop. Every router on the way uses its own table, so traffic is divided at each router among that router's next hops, not evenly across whole paths. | §16.1 "List of next hops": "Each next hop indicates the outgoing router interface to use when forwarding traffic to the destination." §16.1.1: "Each next hop consists of the outgoing interface… together with the IP address of the next hop router". | Agrees, with a note below |
| F6 | A link is used only if both of its ends report it. A cut removes it in both directions. | §16.1 step 2(b): if W's LSA "does not have a link back to vertex V, examine the next link". | Agrees |
| F7 | When a link goes down or a cost changes, every router recomputes its table and traffic follows the new tables. | §9.2 `InterfaceDown`: "the new interface state will be Down." §13.2: for a changed router-LSA "The entire routing table must be recalculated". | Agrees |
| F8 | Cost is configuration. It does not react to load. A congested lowest-cost path stays the path until you change something. | §C.3 lists "Interface output cost" among the configured router interface parameters; nothing in the sections read makes it depend on load. | Agrees |

**Note on F5.** RFC 2328 gives each router its own list of next hops. It does not say how a router shares traffic among them; that is the game's choice and is listed as simplification S4. The sentence is faithful about where the division happens (at each router), which is the point case 7 teaches.

## The simplified notes

Each of S1–S11 in `text.json` was compared with its row in the spec's "Simplified for play" table: the first sentence against "What the game does", the "In a real network" sentence against "What a real OSPF network does".

| Notes | Verdict |
| --- | --- |
| S1, S2, S3, S5, S6, S7, S8, S9, S11 | Same meaning as the spec's row. S1 says "shared segments" where the spec says "broadcast networks". |
| S4 | Same meaning, with one added sentence: "It is not a player tool in this version, where each router keeps one route." True of v1 (FR-003). RFC 2991 says reordering "can be detrimental to network performance" and describes hashing over "the packet header fields that identify the flow". |
| S10 | Reads "cut or removed", as the input's amendment of 2026-11-09 requires. |

## Other text the player reads

| Text | Where | Checked against | Verdict |
| --- | --- | --- | --- |
| "Traffic takes the lowest total cost. You shape the network; you never steer packets." | Briefing card | The spec's briefing, word for word (a unit test compares them) | Agrees |
| "A whole number from 1 to 65535. Traffic takes the lowest total cost." | Link options | F1, F2 | Agrees |
| "The game models single-area OSPFv2 (RFC 2328) over point-to-point links." | About the model | Constitution C1 | Agrees |
| "The table in force: lowest total cost to every other site." and "Pending changes are not included until play resumes." | Inspector | AC26, FR-025 | Agrees |
| The twelve refusal sentences, such as "Cost must be a whole number from 1 to 65535." and "A cut link cannot be removed until it is repaired." | Messages | FR-004, FR-012 to FR-014, FR-016 | Agrees |
| "Fiber cut: … Traffic is rerouting.", "… has no path. Its traffic is being dropped.", "New site: … It starts sending traffic in 20 seconds." | Messages | FR-017, FR-011, FR-018 and the grace period in `tuning.json` | Agrees |
| "Changes made while paused all take effect together when you resume." | Help | FR-024 | Agrees |
| "It is the recorded run simulated again, not a video." | Game over | FR-021 | Agrees |
| "Capacity tier 1 of 3: 4 packets per second each way." | Link options | FR-007, FR-014 and the tiers in `tuning.json` | Agrees |
| Added after the code review: "Time is stopped. Take as long as you like. Changes you make now wait until you choose." and "3 changes pending; they take effect together when you choose a reward." and "Reward taken: 3,000 km of fiber. 3 pending changes applied together." | Reward choice, status line, messages | FR-016 (the game pauses for the choice, no time limit); the behaviour is checked by `tests/unit/game.test.ts` and the FR-016 end-to-end test. These describe the game's own rules and say nothing about OSPF. | Agrees |

## What this review does not cover

- It is one reviewer, the agent that wrote the text.
- RFC 2328 was not read in full. Sections not listed above were not read in the rebuild.

## The README's model section

Reviewed after the README was rewritten for the rebuilt game.

| Part | Checked against | Verdict |
| --- | --- | --- |
| The eight "Faithful to RFC 2328" rows | The sentences are the game's own, word for word (`tests/unit/content.test.ts` compares them), so the table above applies | Agrees |
| The eleven "Simplified for play" rows | Each compared with its row in the spec. S3, S4, S5 and S8 are shortened; none says more than the spec. | Agrees |
| "Every router forwards a packet to the neighbor on the path with the smallest sum of link costs to the destination. When the topology or a cost changes, every router recomputes." | The spec's "Rule being taught"; RFC 2328 §16.1, §13.2 | Agrees |
| "Outside the model" | The spec's excluded behavior, word for word | Agrees |
| The worked example under "The challenge" | The spec's worked interaction and cases 4 and 6: A→C at 20 through B; A–C at 19 takes it all | Agrees |
| "capacity does not change cost" | S6 | Agrees |
