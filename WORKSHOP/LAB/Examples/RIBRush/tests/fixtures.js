import {
  parseAddress,
  parsePrefix,
  prefixContains,
} from "../src/routing/address.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertThrows(action, message) {
  try {
    action();
  } catch {
    return;
  }
  throw new Error(message);
}

export const tests = [
  {
    name: "address parsing identifies families and formats canonically",
    run({ routeCases }) {
      for (const testCase of routeCases.addressCases) {
        const address = parseAddress(testCase.input);
        assert(address.family === testCase.family, `${testCase.name}: family`);
        assert(address.formatted === testCase.formatted, `${testCase.name}: format`);
      }
    },
  },
  {
    name: "address parsing rejects malformed addresses",
    run({ routeCases }) {
      for (const address of routeCases.invalidAddresses) {
        assertThrows(() => parseAddress(address), `${address} should be rejected`);
      }
    },
  },
  {
    name: "prefix parsing preserves boundaries and family isolation",
    run({ routeCases }) {
      for (const testCase of routeCases.prefixCases) {
        const prefix = parsePrefix(testCase.networkAddress, testCase.prefixLength);
        assert(prefix.family === testCase.family, `${testCase.name}: family`);
        assert(prefix.networkAddress === testCase.canonical, `${testCase.name}: canonical`);
        assert(prefixContains(prefix, testCase.inside), `${testCase.name}: inside`);
        if (testCase.outside !== null) {
          assert(!prefixContains(prefix, testCase.outside), `${testCase.name}: outside`);
        }
      }
    },
  },
  {
    name: "prefix parsing rejects host bits and invalid prefix lengths",
    run({ routeCases }) {
      for (const testCase of routeCases.invalidPrefixes) {
        assertThrows(
          () => parsePrefix(testCase.networkAddress, testCase.prefixLength),
          `${testCase.networkAddress}/${testCase.prefixLength} should be rejected`,
        );
      }
    },
  },
  {
    name: "route evaluator returns independent expected outcomes",
    async run({ routeCases }) {
      const { evaluateRoutes } = await import("../src/routing/evaluate.js");
      for (const testCase of routeCases.routeEvaluationCases) {
        const result = evaluateRoutes(testCase.destination, testCase.routes);
        for (const [field, expected] of Object.entries(testCase.expected)) {
          assert(
            result[field] === expected,
            `${testCase.name}: expected ${field}=${expected}, got ${result[field]}`,
          );
        }
        for (const [path, expected] of Object.entries(
          testCase.expectedEvidence ?? {},
        )) {
          const value = path
            .split(".")
            .reduce((current, key) => current?.[key], result.evidence);
          assert(
            JSON.stringify(value) === JSON.stringify(expected),
            `${testCase.name}: expected evidence ${path}=${JSON.stringify(expected)}, got ${JSON.stringify(value)}`,
          );
        }
      }
    },
  },
  {
    name: "Level 1 introduces longest prefix, AD, and metric basics",
    async run({ levels }) {
      const { generateScenario } = await import("../src/routing/generate.js");
      const { validateScenario } = await import("../src/routing/validate.js");
      const level = levels.levels.find((candidate) => candidate.id === "level-1");
      const observedRules = new Set();
      for (let packetIndex = 0; packetIndex < level.packetCount; packetIndex += 1) {
        const options = { seed: 20261111, level, packetIndex };
        const first = generateScenario(options);
        const second = generateScenario(options);
        assert(
          JSON.stringify(first) === JSON.stringify(second),
          `packet ${packetIndex + 1} must be reproducible`,
        );
        const validation = validateScenario(first, level);
        assert(
          validation.valid,
          `packet ${packetIndex + 1}: ${validation.errors.join("; ")}`,
        );
        assert(
          validation.evaluation.ruleCode === level.expectedRuleCodes[packetIndex],
          `packet ${packetIndex + 1} must exercise its configured rule`,
        );
        observedRules.add(validation.evaluation.ruleCode);
      }
      assert(
        ["longest-prefix", "administrative-distance", "metric"].every((rule) =>
          observedRules.has(rule),
        ),
        "Level 1 must include all three basic route-selection rules",
      );
    },
  },
  {
    name: "run decisions score once and invalid input has no penalty",
    async run() {
      const { beginPacket, createRun, resolveDecision, startRun } =
        await import("../src/game/session.js");
      const initial = createRun(20261111);
      assert(initial.score === 0, "fresh run starts with zero points");
      assert(initial.lives === 5, "fresh run starts with five lives");

      const playing = beginPacket(startRun(initial));
      const invalid = resolveDecision(playing, {
        packetId: "packet-one",
        selectedNextHopId: null,
        winningNextHopId: "right",
      });
      assert(invalid.status === "invalid-input", "empty selection is invalid input");
      assert(invalid.run.score === 0, "invalid input does not change score");
      assert(invalid.run.lives === 5, "invalid input does not change lives");
      const malformed = resolveDecision(playing, {
        packetId: "packet-malformed",
        selectedNextHopId: 42,
        winningNextHopId: "right",
      });
      assert(malformed.status === "invalid-input", "non-string selection is invalid");
      assert(malformed.run.score === 0, "malformed input does not change score");
      assert(malformed.run.lives === 5, "malformed input does not change lives");

      const correct = resolveDecision(playing, {
        packetId: "packet-one",
        selectedNextHopId: "right",
        winningNextHopId: "right",
      });
      assert(correct.status === "correct", "correct choice resolves correctly");
      assert(correct.run.score === 100, "correct choice adds 100 points");
      assert(correct.run.correctCount === 1, "correct choice is counted once");

      const wrong = resolveDecision(playing, {
        packetId: "packet-two",
        selectedNextHopId: "wrong",
        winningNextHopId: "right",
      });
      assert(wrong.status === "wrong", "wrong choice is identified");
      assert(wrong.run.score === -50, "wrong choice subtracts 50 points");
      assert(wrong.run.lives === 4, "wrong choice removes one life");
      assert(wrong.run.pressureTier === 1, "wrong choice raises pressure");

      const duplicate = resolveDecision(correct.run, {
        packetId: "packet-one",
        selectedNextHopId: "right",
        winningNextHopId: "right",
      });
      assert(duplicate.status === "already-resolved", "duplicate decision is ignored");
      assert(duplicate.run.score === 100, "duplicate decision cannot score twice");
    },
  },
  {
    name: "IPv4 and IPv6 curriculum levels generate valid rule-specific packets",
    async run({ levels }) {
      const { generateScenario } = await import("../src/routing/generate.js");
      const { validateScenario } = await import("../src/routing/validate.js");
      for (const id of ["level-2", "level-3", "level-5", "level-6"]) {
        const level = levels.levels.find((candidate) => candidate.id === id);
        assert(level, `${id} must be present`);
        for (let packetIndex = 0; packetIndex < level.packetCount; packetIndex += 1) {
          const scenario = generateScenario({
            seed: 20261111,
            level,
            packetIndex,
          });
          const validation = validateScenario(scenario, level);
          assert(validation.valid, `${id} packet ${packetIndex + 1} must be valid`);
          assert(
            validation.evaluation.ruleCode === level.expectedRuleCodes[packetIndex],
            `${id} packet ${packetIndex + 1} must exercise its configured rule`,
          );
          assert(
            scenario.packet.addressFamily === level.addressFamily,
            `${id} must generate ${level.addressFamily} packets`,
          );
        }
      }
    },
  },
  {
    name: "AD feedback explains compared values and advances sequentially",
    async run({ routeCases }) {
      const { evaluateRoutes } = await import("../src/routing/evaluate.js");
      const { decisionExplanation } = await import("../src/ui/views.js");
      const samePrefix = routeCases.routeEvaluationCases.find(
        (testCase) => testCase.name === "same-prefix AD chooses the lower Cisco value",
      );
      const trap = routeCases.routeEvaluationCases.find(
        (testCase) => testCase.name === "more-specific OSPF beats trusted broad Static",
      );
      const adText = decisionExplanation(
        evaluateRoutes(samePrefix.destination, samePrefix.routes),
        samePrefix.routes,
      );
      assert(adText.includes("AD 1"), "AD explanation must name the lower AD");
      assert(adText.includes("AD 110"), "AD explanation must name the higher AD");
      const trapText = decisionExplanation(
        evaluateRoutes(trap.destination, trap.routes),
        trap.routes,
      );
      assert(trapText.includes("/24 beats /16"), "trap must explain prefix precedence");
      assert(trapText.includes("AD 110"), "trap must show the OSPF AD");
      assert(trapText.includes("AD 1"), "trap must show the Static AD");

      const {
        beginPacket,
        continueAfterFeedback,
        createRun,
        resolveDecision,
        startRun,
      } = await import("../src/game/session.js");
      let run = beginPacket(startRun(createRun(20261111)));
      for (let packetIndex = 0; packetIndex < 5; packetIndex += 1) {
        const result = resolveDecision(run, {
          packetId: `level-one-${packetIndex}`,
          selectedNextHopId: "winner",
          winningNextHopId: "winner",
        });
        run = continueAfterFeedback(result.run, 5, 7);
      }
      assert(run.currentView === "briefing", "completed level enters the next briefing");
      assert(run.levelIndex === 1, "progression advances exactly one level");
      assert(run.packetIndex === 0, "the next level starts at its first packet");
      assert(run.completedLevels === 1, "the completed level is counted once");
    },
  },
  {
    name: "seven-level scenarios use varied, seeded route pools",
    async run({ levels }) {
      const { generateScenario } = await import("../src/routing/generate.js");
      const { validateScenario } = await import("../src/routing/validate.js");
      assert(levels.levels.length === 7, "the game must define seven levels");
      assert(
        levels.levels.slice(0, 4).every((level) => level.addressFamily === "ipv4"),
        "the first four levels must be IPv4",
      );
      assert(
        levels.levels.slice(4).every((level) => level.addressFamily === "ipv6"),
        "IPv6 must begin after four IPv4 levels",
      );
      for (const seed of [0, 1, 20261111, 0xffffffff]) {
        const ipv4SubnetBlocks = new Set();
        for (const [levelIndex, level] of levels.levels.entries()) {
          assert(level.packetCount === 5, `${level.id} must have five packets`);
          const scenarioPools = [];
          for (let packetIndex = 0; packetIndex < level.packetCount; packetIndex += 1) {
            const options = { seed, level, packetIndex };
            const first = generateScenario(options);
            const second = generateScenario(options);
            assert(
              JSON.stringify(first) === JSON.stringify(second),
              `${level.id} packet ${packetIndex + 1} must be reproducible`,
            );
            const validation = validateScenario(first, level);
            assert(
              validation.valid,
              `${level.id} packet ${packetIndex + 1}: ${validation.errors.join("; ")}`,
            );
            assert(
              validation.evaluation.ruleCode === level.expectedRuleCodes[packetIndex],
              `${level.id} packet ${packetIndex + 1} must exercise its expected rule`,
            );
            if (levelIndex < 4) {
              const subnetBlock = first.packet.destination
                .split(".")
                .slice(0, 3)
                .join(".");
              assert(
                !ipv4SubnetBlocks.has(subnetBlock),
                `IPv4 block ${subnetBlock}.0/24 must not repeat within the run`,
              );
              ipv4SubnetBlocks.add(subnetBlock);
            }
            scenarioPools.push(
              `${first.packet.destination.split(level.addressFamily === "ipv4" ? "." : ":")[0]}|` +
                first.routes
                  .map((route) => `${route.networkAddress}/${route.prefixLength}`)
                  .sort()
                  .join(","),
            );
          }
          assert(
            new Set(scenarioPools).size === 5,
            `${level.id} must sample a distinct scenario pool for each packet`,
          );
          if (levelIndex < 4) {
            assert(
              level.generationConstraints.scenarioPools.length >= 5,
              `${level.id} must include a varied IPv4 prefix pool`,
            );
          }
        }
        assert(
          ipv4SubnetBlocks.size === 20,
          "the four IPv4 levels must use 20 different /24 destination blocks",
        );
      }
    },
  },
  {
    name: "metric feedback names compared values and protocol boundary",
    async run({ routeCases }) {
      const { evaluateRoutes } = await import("../src/routing/evaluate.js");
      const { decisionExplanation } = await import("../src/ui/views.js");
      const metricCase = routeCases.routeEvaluationCases.find(
        (testCase) => testCase.name === "same-protocol OSPF metric chooses the lower value",
      );
      const explanation = decisionExplanation(
        evaluateRoutes(metricCase.destination, metricCase.routes),
        metricCase.routes,
      );
      assert(explanation.includes("metric 5"), "feedback must name the winning metric");
      assert(explanation.includes("beats 20"), "feedback must name the other metric");
      assert(
        explanation.includes("not compared across protocols"),
        "feedback must state the protocol boundary",
      );
    },
  },
  {
    name: "misses, pause, pressure cap, and full-run summary work",
    async run() {
      const {
        beginPacket,
        continueAfterFeedback,
        createRun,
        missPacket,
        pauseRun,
        resumeRun,
        resolveDecision,
        startRun,
      } = await import("../src/game/session.js");
      let run = beginPacket(startRun(createRun(20261111)));
      const paused = pauseRun(run);
      assert(paused.currentView === "paused", "pause changes the current view");
      run = resumeRun(paused);
      assert(run.currentView === "playing", "resume restores the playing view");

      const missed = missPacket(run, "missed-packet");
      assert(missed.status === "missed", "a timeout is recorded as a miss");
      assert(missed.run.score === -50, "a miss subtracts 50 points");
      assert(missed.run.lives === 4, "a miss removes one life");
      assert(missed.run.pressureTier === 1, "a miss raises pressure");
      assert(missed.run.missedCount === 1, "a miss increments only the miss count");
      const duplicateMiss = missPacket(missed.run, "missed-packet");
      assert(
        duplicateMiss.status === "already-resolved",
        "a missed packet cannot be penalized twice",
      );

      run = beginPacket(startRun(createRun(20261111)));
      let packetNumber = 0;
      for (let levelIndex = 0; levelIndex < 7; levelIndex += 1) {
        if (run.currentView === "briefing") {
          run = beginPacket(run);
        }
        for (let packetIndex = 0; packetIndex < 5; packetIndex += 1) {
          const result = resolveDecision(run, {
            packetId: `full-run-${packetNumber}`,
            selectedNextHopId: "winner",
            winningNextHopId: "winner",
          });
          run = continueAfterFeedback(result.run, 5, 7);
          packetNumber += 1;
        }
      }
      assert(run.currentView === "summary", "the complete run reaches its summary");
      assert(run.status === "complete", "the complete run is marked complete");
      assert(run.completedLevels === 7, "all seven levels are counted");
      assert(run.correctCount === 35, "all 35 correct decisions are counted");
      assert(run.score === 3500, "the final score reflects all correct decisions");
      assert(run.pressureTier === 5, "pressure caps at tier five");

      run = beginPacket(startRun(createRun(20261111)));
      for (let packetIndex = 0; packetIndex < 5; packetIndex += 1) {
        const result = resolveDecision(run, {
          packetId: `failed-run-${packetIndex}`,
          selectedNextHopId: "wrong",
          winningNextHopId: "winner",
        });
        run = result.run;
        if (packetIndex < 4) {
          run = continueAfterFeedback(run, 5, 7);
        }
      }
      assert(run.status === "failed", "zero lives ends the run");
      assert(run.currentView === "feedback", "final mistake feedback remains visible");
      assert(run.lives === 0, "lives do not go below zero");
      assert(run.pressureTier === 5, "wrong answers cannot raise pressure above five");
      run = continueAfterFeedback(run, 5, 7);
      assert(run.currentView === "summary", "failed run proceeds to its summary");
      assert(run.status === "failed", "failure status is preserved in the summary");
    },
  },
];
