import { evaluateRoutes } from "./evaluate.js";

function hashString(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed, levelId, packetIndex) {
  let state =
    (seed ^ hashString(levelId) ^ Math.imul(packetIndex + 1, 0x9e3779b9)) >>> 0;
  if (state === 0) {
    state = 0x6d2b79f5;
  }

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInteger(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

function buildRoutes(routeTemplates, packetId, addressFamily) {
  return routeTemplates.map((template, index) => ({
    id: `${packetId}-route-${index + 1}`,
    addressFamily,
    networkAddress: template.networkAddress,
    prefixLength: template.prefixLength,
    protocol: template.protocol,
    administrativeDistance: template.administrativeDistance,
    metric: template.metric,
    nextHopId: `${packetId}-next-hop-${index + 1}`,
    nextHopLabel: template.nextHopLabel,
  }));
}

export function generateScenario({ seed, level, packetIndex }) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError("Seed must be an unsigned 32-bit integer");
  }
  if (
    !level ||
    typeof level.id !== "string" ||
    !Number.isInteger(level.packetCount)
  ) {
    throw new TypeError("A valid level definition is required");
  }
  if (
    !Number.isInteger(packetIndex) ||
    packetIndex < 0 ||
    packetIndex >= level.packetCount
  ) {
    throw new RangeError("Packet index is outside the level");
  }

  const constraints = level.generationConstraints;
  if (
    !constraints ||
    (!Array.isArray(constraints.scenarioPools) &&
      (!Number.isInteger(constraints.destinationPrefixLength) ||
        typeof constraints.destinationNetwork !== "string" ||
        (!Array.isArray(constraints.routes) &&
          !Array.isArray(constraints.routeSets)) ||
        !Number.isInteger(constraints.minHost) ||
        !Number.isInteger(constraints.maxHost) ||
        constraints.minHost > constraints.maxHost))
  ) {
    throw new TypeError(`Level ${level.id} has invalid generation constraints`);
  }

  const expectedRuleCode = level.expectedRuleCodes?.[packetIndex];
  let pool = constraints;
  if (constraints.scenarioPools) {
    const matchingPools = constraints.scenarioPools.filter((candidate) => {
      if (
        typeof candidate.destinationNetwork !== "string" ||
        !Number.isInteger(candidate.minHost) ||
        !Number.isInteger(candidate.maxHost) ||
        candidate.minHost > candidate.maxHost
      ) {
        throw new TypeError(`Level ${level.id} has invalid scenario pool constraints`);
      }
      const templates = candidate.routes;
      if (!Array.isArray(templates) || templates.length === 0) {
        throw new TypeError(`Level ${level.id} has a scenario pool without route templates`);
      }
      const destination =
        level.addressFamily === "ipv4"
          ? `${candidate.destinationNetwork}${candidate.minHost}`
          : `${candidate.destinationNetwork}${candidate.minHost.toString(16)}`;
      const previewRoutes = buildRoutes(
        templates,
        `${level.id}-pool-preview`,
        level.addressFamily,
      );
      const evaluation = evaluateRoutes(destination, previewRoutes);
      if (evaluation.status !== "winner") {
        throw new TypeError(
          `Level ${level.id} contains an invalid scenario pool: ${evaluation.status}`,
        );
      }
      return evaluation.ruleCode === expectedRuleCode;
    });
    if (matchingPools.length === 0) {
      throw new TypeError(
        `Level ${level.id} has no scenario pool for rule ${expectedRuleCode}`,
      );
    }
    const ruleOccurrence = level.expectedRuleCodes
      .slice(0, packetIndex)
      .filter((ruleCode) => ruleCode === expectedRuleCode).length;
    const poolIndex =
      (seed + hashString(level.id) + ruleOccurrence) % matchingPools.length;
    pool = matchingPools[poolIndex];
  }

  const random = createRandom(seed, level.id, packetIndex);
  if (
    !pool ||
    typeof pool.destinationNetwork !== "string" ||
    !Number.isInteger(pool.minHost) ||
    !Number.isInteger(pool.maxHost) ||
    pool.minHost > pool.maxHost
  ) {
    throw new TypeError(`Level ${level.id} has invalid destination pool constraints`);
  }
  const host = randomInteger(random, pool.minHost, pool.maxHost);
  const destinationNetwork =
    pool.destinationNetwork ??
    constraints.destinationNetworksByPacket?.[packetIndex] ??
    constraints.destinationNetwork;
  const destination =
    level.addressFamily === "ipv4"
      ? `${destinationNetwork}${host}`
      : `${destinationNetwork}${host.toString(16)}`;
  const packet = {
    id: `${level.id}-packet-${packetIndex + 1}`,
    destination,
    addressFamily: level.addressFamily,
    levelId: level.id,
    sequence: packetIndex + 1,
  };

  const routeTemplates =
    pool.routes ?? constraints.routeSets?.[packetIndex] ?? constraints.routes;
  if (!Array.isArray(routeTemplates) || routeTemplates.length === 0) {
    throw new TypeError(`Level ${level.id} has no route templates for this packet`);
  }
  const routes = buildRoutes(routeTemplates, packet.id, level.addressFamily);
  if (random() >= 0.5) {
    routes.reverse();
  }

  return {
    packet,
    routes,
    seed,
    levelId: level.id,
  };
}
