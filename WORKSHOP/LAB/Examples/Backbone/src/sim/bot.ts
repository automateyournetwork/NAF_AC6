// A simple scripted player for tests, tuning runs and the recorded videos. It reads the
// world and returns commands, like a person would; it has no access a person lacks.

import type { Command, Link, Site, World } from "./types";
import { dirUtilization, findLink, linkLength as km, loadState, presentSites } from "./world";

function degrees(world: World): Map<number, number> {
  const degree = new Map<number, number>();
  for (const link of world.links) {
    degree.set(link.a, (degree.get(link.a) ?? 0) + 1);
    degree.set(link.b, (degree.get(link.b) ?? 0) + 1);
  }
  return degree;
}

/** The hottest link that can still be upgraded, if any is congested or dropping. */
function hotLink(world: World): Link | undefined {
  const top = world.tuning.tiers.length - 1;
  return world.links
    .filter((l) => l.up && l.tier < top && loadState(world, l) !== "nominal" && loadState(world, l) !== "busy")
    .sort((p, q) => {
      const load = (l: Link): number => Math.max(dirUtilization(world, l, 0), dirUtilization(world, l, 1));
      return load(q) - load(p) || p.id - q.id;
    })[0];
}

/** Commands the scripted player sends at this step. It acts at most once a second. */
export function botCommands(world: World): Command[] {
  if (world.over) return [];
  const present = presentSites(world);
  const degree = degrees(world);
  const expecting = present.length < world.sites.length;

  if (world.rewardPending) {
    const needsLinks = present.some((s) => (degree.get(s.id) ?? 0) < 2);
    const wantsUpgrade = hotLink(world) !== undefined && world.upgrades === 0 && !needsLinks;
    return [{ type: "chooseReward", choice: wantsUpgrade || world.fiberKm > 9000 ? "upgrade" : "fiber" }];
  }
  if (world.step % world.tuning.stepsPerSec !== 0) return [];

  // 1. A site with no link gets one to the nearest site, preferring sites already connected.
  for (const site of present) {
    if ((degree.get(site.id) ?? 0) > 0) continue;
    const others = present
      .filter((o) => o.id !== site.id)
      .sort((p, q) => {
        const connected = (o: Site): number => ((degree.get(o.id) ?? 0) > 0 ? 0 : 1);
        return connected(p) - connected(q) || km(site, p) - km(site, q) || p.id - q.id;
      });
    const target = others.find((o) => km(site, o) <= world.fiberKm);
    if (target) return [{ type: "layLink", a: site.id, b: target.id }];
  }

  // 2. A site hanging by one link gets a second, so one cut cannot leave it dark.
  const reserve = expecting ? 1500 : 0;
  if (present.length >= 3) {
    for (const site of present) {
      if ((degree.get(site.id) ?? 0) !== 1) continue;
      const target = present
        .filter((o) => o.id !== site.id && !findLink(world, site.id, o.id))
        .sort((p, q) => km(site, p) - km(site, q) || p.id - q.id)
        .find((o) => km(site, o) <= world.fiberKm - reserve);
      if (target) return [{ type: "layLink", a: site.id, b: target.id }];
    }
  }

  // 3. Spend an upgrade on the hottest link.
  if (world.upgrades > 0) {
    const hot = hotLink(world);
    if (hot) return [{ type: "upgrade", link: hot.id }];
  }
  return [];
}
