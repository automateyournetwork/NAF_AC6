// Per-router, per-destination choice of next hop (R2). Each router uses its own table,
// so traffic divides at each router among that router's next hops (F5).

import type { Rotors, Routes, SiteId } from "./types";

/**
 * The next hop `router` uses for a packet to `dst`, or null when it has no route.
 * With several next hops the router rotates through them in router-ID order, with one
 * rotor per destination (S4).
 */
export function pickNextHop(routes: Routes, rotors: Rotors, router: SiteId, dst: SiteId): SiteId | null {
  const route = routes[router]?.[dst];
  if (!route || route.nextHops.length === 0) return null;
  if (route.nextHops.length === 1) return route.nextHops[0]!;
  const own = (rotors[router] ??= {});
  const index = (own[dst] ?? 0) % route.nextHops.length;
  own[dst] = (index + 1) % route.nextHops.length;
  return route.nextHops[index]!;
}
