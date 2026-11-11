import { describe, expect, it } from "vitest";
import { computeRoutes } from "../../src/sim/spf";
import { cases, topology } from "./helpers";

// Expected values come from tests/fixtures/ospf-cases.json, typed from the spec.
const ALL = 16;

describe("shortest paths and next hops (F1–F6, cases 1–6 and 8)", () => {
  for (const c of cases.routing) {
    it(`case ${c.case}: ${c.name}`, () => {
      const t = topology(c.topology, c);
      const routes = computeRoutes(t.routers, t.links, c.sharing ? ALL : 1);
      for (const e of c.expect as { from: string; to: string; cost: number; nextHops?: string[] }[]) {
        const route = routes[t.ids[e.from]!]?.[t.ids[e.to]!];
        expect(route, `${e.from}→${e.to} has a route`).toBeDefined();
        expect(route!.cost, `${e.from}→${e.to} cost`).toBe(e.cost);
        if (e.nextHops) {
          expect(route!.nextHops.map((id) => t.names[id]), `${e.from}→${e.to} next hops`).toEqual(e.nextHops);
        }
      }
      for (const [from, to] of (c as { unreachable?: string[][] }).unreachable ?? []) {
        expect(routes[t.ids[from!]!]?.[t.ids[to!]!], `${from}→${to} is unreachable`).toBeUndefined();
      }
      if ((c as { othersUnchanged?: boolean }).othersUnchanged) {
        const before = computeRoutes(t.routers, topology(c.topology).links, ALL);
        const gone = new Set(((c as { unreachable?: string[][] }).unreachable ?? []).map(([f, to]) => `${f}>${to}`));
        for (const from of t.routers) {
          for (const to of t.routers) {
            if (from === to || gone.has(`${t.names[from]}>${t.names[to]}`)) continue;
            expect(routes[from]?.[to], `${t.names[from]}→${t.names[to]} unchanged`).toEqual(before[from]?.[to]);
          }
        }
      }
    });
  }

  it("case 1: the direct link A–C is not a next hop for A→C", () => {
    const t = topology("T1");
    const routes = computeRoutes(t.routers, t.links, ALL);
    expect(routes[t.ids.A!]![t.ids.C!]!.nextHops).not.toContain(t.ids.C);
  });

  it("gives no route from a router to itself and none across a missing link", () => {
    const routes = computeRoutes([1, 2, 3], [{ a: 1, b: 2, cost: 5 }], ALL);
    expect(routes[1]![1]).toBeUndefined();
    expect(routes[1]![3]).toBeUndefined();
    expect(routes[3]).toEqual({});
    expect(routes[2]![1]).toEqual({ cost: 5, nextHops: [1] });
  });

  it("sorts next hops by router ID and keeps the lowest when one route is kept (S7)", () => {
    const links = [
      { a: 1, b: 4, cost: 1 },
      { a: 1, b: 3, cost: 1 },
      { a: 1, b: 2, cost: 1 },
      { a: 2, b: 5, cost: 1 },
      { a: 3, b: 5, cost: 1 },
      { a: 4, b: 5, cost: 1 },
    ];
    expect(computeRoutes([1, 2, 3, 4, 5], links, ALL)[1]![5]).toEqual({ cost: 2, nextHops: [2, 3, 4] });
    expect(computeRoutes([1, 2, 3, 4, 5], links, 1)[1]![5]).toEqual({ cost: 2, nextHops: [2] });
    expect(computeRoutes([1, 2, 3, 4, 5], links, 2)[1]![5]).toEqual({ cost: 2, nextHops: [2, 3] });
  });
});
