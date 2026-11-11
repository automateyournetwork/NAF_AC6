// Shortest-path trees and next-hop sets (F1–F6): RFC 2328 §16.1 reduced to one area of
// routers joined by point-to-point links.

import type { Routes, SiteId } from "./types";

export interface RouteLink {
  a: SiteId;
  b: SiteId;
  cost: number;
}

/**
 * For each router and each destination it can reach: the lowest total cost and the next
 * hops on every path of that cost, sorted by router ID, cut down to the first `maxPaths`.
 * Only links passed in are used, so the caller leaves out links that are down (F6).
 */
export function computeRoutes(routers: SiteId[], links: RouteLink[], maxPaths: number): Routes {
  const ids = [...routers].sort((x, y) => x - y);
  const neighbours = new Map<SiteId, { to: SiteId; cost: number }[]>();
  for (const id of ids) neighbours.set(id, []);
  for (const link of links) {
    neighbours.get(link.a)?.push({ to: link.b, cost: link.cost });
    neighbours.get(link.b)?.push({ to: link.a, cost: link.cost });
  }

  const routes: Routes = {};
  for (const root of ids) {
    const dist = new Map<SiteId, number>([[root, 0]]);
    const firstHops = new Map<SiteId, Set<SiteId>>();
    const done = new Set<SiteId>();

    for (;;) {
      // Closest router not yet settled; ties go to the lower ID so the order is fixed.
      let at: SiteId | null = null;
      for (const id of ids) {
        const d = dist.get(id);
        if (d === undefined || done.has(id)) continue;
        if (at === null || d < dist.get(at)!) at = id;
      }
      if (at === null) break;
      done.add(at);

      for (const edge of neighbours.get(at) ?? []) {
        if (done.has(edge.to)) continue;
        const total = dist.get(at)! + edge.cost;
        // Leaving the root, the first hop is the neighbour itself. Further out, a path
        // inherits the first hops of the router it comes through.
        const via = at === root ? [edge.to] : [...firstHops.get(at)!];
        const known = dist.get(edge.to);
        if (known === undefined || total < known) {
          dist.set(edge.to, total);
          firstHops.set(edge.to, new Set(via));
        } else if (total === known) {
          // Equal cost: record every tied next hop (F3).
          for (const hop of via) firstHops.get(edge.to)!.add(hop);
        }
      }
    }

    const table: Routes[number] = {};
    for (const id of ids) {
      if (id === root || !dist.has(id)) continue;
      const hops = [...firstHops.get(id)!].sort((x, y) => x - y);
      // A router may keep fewer than all equal-cost routes (F4); the lowest IDs stay (S7).
      table[id] = { cost: dist.get(id)!, nextHops: hops.slice(0, maxPaths) };
    }
    routes[root] = table;
  }
  return routes;
}
