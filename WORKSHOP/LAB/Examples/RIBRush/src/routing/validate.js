import { parsePrefix, prefixContains } from "./address.js";
import { evaluateRoutes } from "./evaluate.js";

export function validateScenario(scenario, level) {
  const errors = [];
  if (!scenario || typeof scenario !== "object" || Array.isArray(scenario)) {
    return { valid: false, errors: ["Scenario must be an object"] };
  }
  if (!level || typeof level.id !== "string") {
    return { valid: false, errors: ["A valid level definition is required"] };
  }

  if (
    !Number.isInteger(scenario.seed) ||
    scenario.seed < 0 ||
    scenario.seed > 0xffffffff
  ) {
    errors.push("Scenario seed must be an unsigned 32-bit integer");
  }
  if (scenario.levelId !== level.id) {
    errors.push("Scenario level ID does not match the level definition");
  }
  if (
    !scenario.packet ||
    scenario.packet.levelId !== level.id ||
    scenario.packet.addressFamily !== level.addressFamily ||
    !Number.isInteger(scenario.packet.sequence) ||
    scenario.packet.sequence < 1 ||
    scenario.packet.sequence > level.packetCount
  ) {
    errors.push("Packet fields do not match the level definition");
  }
  if (
    !Array.isArray(scenario.routes) ||
    scenario.routes.length < 2 ||
    scenario.routes.length > 5
  ) {
    errors.push("Scenario must contain 2–5 candidate routes");
    return { valid: false, errors };
  }

  const evaluation = evaluateRoutes(
    scenario.packet?.destination,
    scenario.routes,
  );
  if (evaluation.status === "invalid-scenario") {
    errors.push(evaluation.evidence.error);
  } else if (evaluation.status !== "winner") {
    errors.push(`Scenario evaluation returned ${evaluation.status}`);
  }
  if (
    !Array.isArray(level.expectedRuleCodes) ||
    level.expectedRuleCodes.length !== level.packetCount
  ) {
    errors.push(`Level ${level.id} must define one expected rule code per packet`);
  } else if (
    evaluation.status === "winner" &&
    evaluation.ruleCode !== level.expectedRuleCodes[scenario.packet.sequence - 1]
  ) {
    errors.push(
      `Packet rule ${evaluation.ruleCode} does not match the level's expected rule`,
    );
  }
  if (
    evaluation.status === "winner" &&
    evaluation.evidence.matchingRouteIds.length !== scenario.routes.length
  ) {
    errors.push("Every displayed candidate route must match the packet");
  }

  const packetSequence = scenario.packet?.sequence;
  const expectedRuleCode = Number.isInteger(packetSequence)
    ? level.expectedRuleCodes?.[packetSequence - 1]
    : undefined;
  if (
    expectedRuleCode === "longest-prefix" &&
    evaluation.status === "winner"
  ) {
    const prefixes = new Set();
    try {
      for (const route of scenario.routes) {
        const prefix = parsePrefix(route.networkAddress, route.prefixLength);
        if (prefix.family !== scenario.packet.addressFamily) {
          errors.push(`Route ${route.id} family does not match the packet`);
          continue;
        }
        if (prefixContains(prefix, scenario.packet.destination)) {
          prefixes.add(prefix.prefixLength);
        }
      }
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) {
        errors.push(error.message);
      } else {
        throw error;
      }
    }
    if (prefixes.size < 2) {
      errors.push("Longest-prefix level must compare different prefix lengths");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    evaluation,
  };
}
