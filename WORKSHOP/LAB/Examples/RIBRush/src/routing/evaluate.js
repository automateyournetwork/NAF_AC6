import { parseAddress, parsePrefix, prefixContains } from "./address.js";

const administrativeDistances = Object.freeze({
  connected: 0,
  static: 1,
  ebgp: 20,
  ospf: 110,
  ibgp: 200,
});
const protocols = new Set(Object.keys(administrativeDistances));

function invalidScenario(message) {
  return {
    status: "invalid-scenario",
    winnerRouteId: null,
    ruleCode: "error",
    evidence: { error: message },
  };
}

function validateRoute(route, routeIds) {
  if (!route || typeof route !== "object" || Array.isArray(route)) {
    return "Route must be an object";
  }
  if (typeof route.id !== "string" || route.id.length === 0) {
    return "Route ID must be a non-empty string";
  }
  if (routeIds.has(route.id)) {
    return `Duplicate route ID: ${route.id}`;
  }
  routeIds.add(route.id);

  if (!protocols.has(route.protocol)) {
    return `Unsupported route protocol: ${route.protocol}`;
  }
  if (typeof route.nextHopId !== "string" || route.nextHopId.length === 0) {
    return `Route ${route.id} has no next-hop ID`;
  }
  if (
    !Number.isInteger(route.administrativeDistance) ||
    route.administrativeDistance !== administrativeDistances[route.protocol]
  ) {
    return `Route ${route.id} has an invalid Cisco default administrative distance for ${route.protocol}`;
  }
  if (
    route.metric !== null &&
    (!Number.isInteger(route.metric) || route.metric < 0)
  ) {
    return `Route ${route.id} has an invalid metric`;
  }

  let prefix;
  try {
    prefix = parsePrefix(route.networkAddress, route.prefixLength);
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      return `Route ${route.id}: ${error.message}`;
    }
    throw error;
  }
  if (route.addressFamily !== prefix.family) {
    return `Route ${route.id} address family does not match its prefix`;
  }
  return { ...route, prefix };
}

export function evaluateRoutes(destination, routes) {
  if (!Array.isArray(routes)) {
    return invalidScenario("Routes must be an array");
  }

  let target;
  try {
    target = parseAddress(destination);
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      return invalidScenario(`Invalid destination: ${error.message}`);
    }
    throw error;
  }

  const routeIds = new Set();
  const validRoutes = [];
  for (const route of routes) {
    const result = validateRoute(route, routeIds);
    if (typeof result === "string") {
      return invalidScenario(result);
    }
    validRoutes.push(result);
  }

  const matchingRoutes = validRoutes.filter(
    (route) =>
      route.prefix.family === target.family &&
      prefixContains(route.prefix, destination),
  );
  if (matchingRoutes.length === 0) {
    return {
      status: "no-route",
      winnerRouteId: null,
      ruleCode: "no-route",
      evidence: {
        destination: target.formatted,
        matchingRouteIds: [],
        routeComparisons: [],
      },
    };
  }

  const longestPrefixLength = Math.max(
    ...matchingRoutes.map((route) => route.prefix.prefixLength),
  );
  const prefixFinalists = matchingRoutes.filter(
    (route) => route.prefix.prefixLength === longestPrefixLength,
  );
  const evidence = {
    destination: target.formatted,
    matchingRouteIds: matchingRoutes.map((route) => route.id),
    longestPrefixLength,
    finalists: prefixFinalists.map((route) => ({
      routeId: route.id,
      networkAddress: route.prefix.networkAddress,
      prefixLength: route.prefix.prefixLength,
      administrativeDistance: route.administrativeDistance,
      protocol: route.protocol,
      metric: route.metric,
      nextHopId: route.nextHopId,
    })),
  };

  let finalists = prefixFinalists;
  let ruleCode = "longest-prefix";
  if (finalists.length > 1) {
    const winningDistance = Math.min(
      ...finalists.map((route) => route.administrativeDistance),
    );
    evidence.adComparison = {
      candidateDistances: finalists.map((route) => route.administrativeDistance),
      winningDistance,
    };
    finalists = finalists.filter(
      (route) => route.administrativeDistance === winningDistance,
    );
    ruleCode = "administrative-distance";
  }

  if (
    finalists.length > 1 &&
    finalists.every((route) => route.protocol === finalists[0].protocol) &&
    finalists.every((route) => Number.isInteger(route.metric))
  ) {
    const winningMetric = Math.min(...finalists.map((route) => route.metric));
    evidence.metricComparison = {
      candidateMetrics: finalists.map((route) => route.metric),
      winningMetric,
    };
    finalists = finalists.filter((route) => route.metric === winningMetric);
    if (finalists.length === 1) {
      ruleCode = "metric";
    }
  }

  if (finalists.length !== 1) {
    return {
      status: "ambiguous",
      winnerRouteId: null,
      ruleCode: null,
      evidence,
    };
  }

  const winner = finalists[0];
  return {
    status: "winner",
    winnerRouteId: winner.id,
    ruleCode,
    evidence: {
      ...evidence,
      winner: {
        routeId: winner.id,
        networkAddress: winner.prefix.networkAddress,
        prefixLength: winner.prefix.prefixLength,
        administrativeDistance: winner.administrativeDistance,
        protocol: winner.protocol,
        metric: winner.metric,
        nextHopId: winner.nextHopId,
      },
    },
  };
}
