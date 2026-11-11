# Tuning runs with the scripted player

Task T027. `node tools/run-ts.mjs tools/bot-runs.ts` plays `src/sim/bot.ts` on eight fixed seeds until the drop meter ends each run. The target set in the tasks was a median run of 4 to 8 minutes with queue drops as the largest cause of drops in at least six of the eight runs.

## Result with the starting values (2026-11-10T15:57Z)

The starting values are the ones the approved input plan ended with (`StarterKit/PLAN.md`). They met the target on the first run, so **no value was changed**.

| Seed | Time | Delivered | Queue drops | Cut drops | No-route drops | Links | Sites |
| --- | --- | --- | --- | --- | --- | --- | --- |
| stage-1 | 6:51 | 7,302 | 108 | 14 | 0 | 21 | 12 |
| loop | 6:54 | 8,092 | 109 | 9 | 0 | 21 | 12 |
| arcade | 6:32 | 5,755 | 111 | 3 | 0 | 21 | 12 |
| 2328 | 6:15 | 6,049 | 110 | 6 | 0 | 21 | 12 |
| autocon | 7:05 | 7,795 | 104 | 9 | 0 | 21 | 12 |
| denver | 7:14 | 7,538 | 140 | 7 | 0 | 21 | 12 |
| fiber | 7:00 | 7,701 | 119 | 10 | 0 | 21 | 12 |
| ospf | 6:35 | 6,427 | 142 | 4 | 0 | 21 | 12 |

Median 6:53, shortest 6:15, longest 7:14. Queue drops are the largest cause in 8 of 8.

## What this does and does not show

- The scripted player links every site twice and upgrades hot links. It never changes a cost, so it is a weaker player than the game is built to teach.
- These are the scripted player's run lengths. How long a person's run lasts (SC-013) has not been measured and is recorded as not run.
- Drop counts above 100 are possible because the drop meter drains between bursts (FR-010).
