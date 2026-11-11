// Shared by the routing tests. Builds routers and links from the fixture file, whose
// values were typed from the spec.

import cases from "../fixtures/ospf-cases.json";
import type { RouteLink } from "../../src/sim/spf";

type TopologyName = keyof typeof cases.topologies;

export interface Topology {
  ids: Record<string, number>;
  names: Record<number, string>;
  routers: number[];
  links: RouteLink[];
}

export interface Change {
  setCost?: (string | number)[][];
  cut?: string[][];
}

export function topology(name: string, change: Change = {}): Topology {
  const source = cases.topologies[name as TopologyName];
  const ids: Record<string, number> = source.routers;
  const names: Record<number, string> = {};
  for (const [letter, id] of Object.entries(ids)) names[id] = letter;
  const same = (x: (string | number)[], a: string, b: string): boolean =>
    (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a);
  const links: RouteLink[] = [];
  for (const [a, b, cost] of source.links as [string, string, number][]) {
    if ((change.cut ?? []).some((c) => same(c, a, b))) continue;
    const changed = (change.setCost ?? []).find((c) => same(c, a, b));
    links.push({ a: ids[a]!, b: ids[b]!, cost: changed ? Number(changed[2]) : cost });
  }
  return { ids, names, routers: Object.values(ids).sort((x, y) => x - y), links };
}

export { cases };
