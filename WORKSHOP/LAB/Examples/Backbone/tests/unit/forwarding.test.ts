import { describe, expect, it } from "vitest";
import { pickNextHop } from "../../src/sim/forwarding";
import { nextInt, nextRange, seedRng } from "../../src/sim/rng";
import { computeRoutes, type RouteLink } from "../../src/sim/spf";
import type { Rotors, Routes } from "../../src/sim/types";
import { cases, topology } from "./helpers";

/** Walks one packet hop by hop, as each router's own table sends it (F5). Returns the links used. */
function walk(routes: Routes, rotors: Rotors, from: number, to: number, limit: number): string[] {
  const used: string[] = [];
  let at = from;
  while (at !== to) {
    const next = pickNextHop(routes, rotors, at, to);
    if (next === null) throw new Error(`no route at ${at} for ${to}`);
    used.push(`${at}>${next}`);
    at = next;
    if (used.length > limit) throw new Error("forwarding loop");
  }
  return used;
}

describe("hop-by-hop forwarding (R2, F5)", () => {
  it("case 7: the split is per hop, not per path", () => {
    const c = cases.split.find((s) => s.case === 7)!;
    const t = topology(c.topology);
    const routes = computeRoutes(t.routers, t.links, 16);
    expect(routes[t.ids[c.from]!]![t.ids[c.to]!]!.cost).toBe(c.cost);

    const packets = 4 * 250;
    const rotors: Rotors = {};
    const count = new Map<string, number>();
    for (let i = 0; i < packets; i++) {
      for (const hop of walk(routes, rotors, t.ids[c.from]!, t.ids[c.to]!, 10)) {
        const [x, y] = hop.split(">").map(Number) as [number, number];
        const key = `${t.names[x]}-${t.names[y]}`;
        count.set(key, (count.get(key) ?? 0) + 1);
      }
    }
    for (const [link, [num, den]] of Object.entries(c.shares!) as [string, [number, number]][]) {
      expect(count.get(link), `share of ${link}`).toBe((packets * num) / den);
    }
    // A–T carries a half, not the third that "three equal paths" would suggest.
    expect(count.get("A-T")).toBe(packets / 2);
    expect([...count.keys()].sort()).toEqual(Object.keys(c.shares!).sort());
  });

  it("case 3: three tied next hops carry one third each", () => {
    const c = cases.split.find((s) => s.case === 3)!;
    const t = topology(c.topology, c);
    const routes = computeRoutes(t.routers, t.links, 16);
    const packets = 3 * 200;
    const rotors: Rotors = {};
    const first = new Map<string, number>();
    for (let i = 0; i < packets; i++) {
      const hop = walk(routes, rotors, t.ids[c.from]!, t.ids[c.to]!, 10)[0]!;
      const name = t.names[Number(hop.split(">")[1])]!;
      first.set(name, (first.get(name) ?? 0) + 1);
    }
    for (const [name, [num, den]] of Object.entries(c.firstHopShares!) as [string, [number, number]][]) {
      expect(first.get(name), `first hop ${name}`).toBe((packets * num) / den);
    }
  });

  it("case 6: with one route kept every A→C packet leaves through B", () => {
    const t = topology("T1");
    const routes = computeRoutes(t.routers, t.links, 1);
    const rotors: Rotors = {};
    for (let i = 0; i < 20; i++) {
      expect(walk(routes, rotors, t.ids.A!, t.ids.C!, 10)).toEqual([`${t.ids.A}>${t.ids.B}`, `${t.ids.B}>${t.ids.C}`]);
    }
  });

  it("rotates in router-ID order, separately for each destination", () => {
    const links: RouteLink[] = [
      { a: 1, b: 2, cost: 1 },
      { a: 1, b: 3, cost: 1 },
      { a: 2, b: 4, cost: 1 },
      { a: 3, b: 4, cost: 1 },
      { a: 2, b: 5, cost: 1 },
      { a: 3, b: 5, cost: 1 },
    ];
    const routes = computeRoutes([1, 2, 3, 4, 5], links, 16);
    const rotors: Rotors = {};
    expect(pickNextHop(routes, rotors, 1, 4)).toBe(2);
    expect(pickNextHop(routes, rotors, 1, 5)).toBe(2); // its own rotor starts at the lowest ID
    expect(pickNextHop(routes, rotors, 1, 4)).toBe(3);
    expect(pickNextHop(routes, rotors, 1, 4)).toBe(2);
    expect(pickNextHop(routes, rotors, 1, 5)).toBe(3);
  });

  it("returns null when there is no route", () => {
    const routes = computeRoutes([1, 2, 3], [{ a: 1, b: 2, cost: 1 }], 16);
    expect(pickNextHop(routes, {}, 1, 3)).toBeNull();
    expect(pickNextHop(routes, {}, 3, 1)).toBeNull();
  });

  it("never loops and always moves closer, on 320 seeded random graphs", () => {
    let walks = 0;
    for (let g = 0; g < 320; g++) {
      const rng = seedRng(`loop-${g}`);
      const n = nextRange(rng, 3, 7);
      const routers = Array.from({ length: n }, (_, i) => i + 1);
      const links: RouteLink[] = [];
      for (let a = 1; a <= n; a++) {
        for (let b = a + 1; b <= n; b++) {
          if (nextInt(rng, 100) < 45) links.push({ a, b, cost: nextRange(rng, 1, 4) });
        }
      }
      for (const maxPaths of [1, 16]) {
        const routes = computeRoutes(routers, links, maxPaths);
        const rotors: Rotors = {};
        for (const from of routers) {
          for (const to of routers) {
            if (from === to || !routes[from]?.[to]) continue;
            for (let repeat = 0; repeat < 3; repeat++) {
              let at = from;
              let hops = 0;
              while (at !== to) {
                const remaining = routes[at]![to]!.cost;
                const next = pickNextHop(routes, rotors, at, to)!;
                const after = next === to ? 0 : routes[next]![to]!.cost;
                expect(after, `graph ${g}: ${at}→${next} toward ${to} moves closer`).toBeLessThan(remaining);
                at = next;
                expect(++hops).toBeLessThan(n);
              }
              walks++;
            }
          }
        }
      }
    }
    expect(walks).toBeGreaterThan(10000);
  });
});
