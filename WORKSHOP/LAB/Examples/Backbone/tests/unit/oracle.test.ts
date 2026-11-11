import { describe, expect, it } from "vitest";
import { nextInt, nextRange, seedRng } from "../../src/sim/rng";
import { computeRoutes } from "../../src/sim/spf";

// Independent oracle (C1): lists every simple path by depth-first search and keeps the
// cheapest. It shares no code with src/sim/spf.ts.

interface Edge {
  a: number;
  b: number;
  cost: number;
}

function oracle(routers: number[], edges: Edge[], from: number, to: number): { cost: number; firstHops: number[] } | null {
  let best = Infinity;
  let firstHops = new Set<number>();
  const visited = new Set<number>([from]);
  const walk = (at: number, total: number, first: number | null): void => {
    if (at === to) {
      if (total < best) {
        best = total;
        firstHops = new Set([first!]);
      } else if (total === best) {
        firstHops.add(first!);
      }
      return;
    }
    for (const e of edges) {
      const next = e.a === at ? e.b : e.b === at ? e.a : null;
      if (next === null || visited.has(next)) continue;
      visited.add(next);
      walk(next, total + e.cost, first ?? next);
      visited.delete(next);
    }
  };
  walk(from, 0, null);
  void routers;
  return best === Infinity ? null : { cost: best, firstHops: [...firstHops].sort((x, y) => x - y) };
}

function randomGraph(seed: string): { routers: number[]; edges: Edge[] } {
  const rng = seedRng(seed);
  const n = nextRange(rng, 3, 7);
  const routers = Array.from({ length: n }, (_, i) => i + 1);
  const edges: Edge[] = [];
  for (let a = 1; a <= n; a++) {
    for (let b = a + 1; b <= n; b++) {
      if (nextInt(rng, 100) < 45) {
        // Small costs make ties common, which is where mistakes hide.
        edges.push({ a, b, cost: nextRange(rng, 1, 4) });
      }
    }
  }
  return { routers, edges };
}

describe("routing agrees with the brute-force oracle (SC-002)", () => {
  it("on every pair of 320 seeded random graphs", () => {
    let pairs = 0;
    let ties = 0;
    let unreachable = 0;
    for (let g = 0; g < 320; g++) {
      const { routers, edges } = randomGraph(`oracle-${g}`);
      const routes = computeRoutes(routers, edges, 16);
      for (const from of routers) {
        for (const to of routers) {
          if (from === to) continue;
          pairs++;
          const want = oracle(routers, edges, from, to);
          const got = routes[from]?.[to];
          if (want === null) {
            unreachable++;
            expect(got, `graph ${g} ${from}→${to}`).toBeUndefined();
            continue;
          }
          if (want.firstHops.length > 1) ties++;
          expect(got, `graph ${g} ${from}→${to}`).toEqual({ cost: want.cost, nextHops: want.firstHops });
        }
      }
    }
    // The comparison only means something if the graphs exercise ties and dead ends.
    expect(pairs).toBeGreaterThan(5000);
    expect(ties).toBeGreaterThan(300);
    expect(unreachable).toBeGreaterThan(50);
  });
});
