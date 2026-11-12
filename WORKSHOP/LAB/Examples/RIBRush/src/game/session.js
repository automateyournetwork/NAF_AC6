function copyRun(run) {
  return {
    ...run,
    resolvedPacketIds: [...run.resolvedPacketIds],
  };
}

function requireRun(run) {
  if (
    !run ||
    !Array.isArray(run.resolvedPacketIds) ||
    !Number.isInteger(run.packetIndex) ||
    !Number.isInteger(run.lives)
  ) {
    throw new TypeError("A valid run state is required");
  }
}

export function createRun(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError("Run seed must be an unsigned 32-bit integer");
  }

  return {
    seed,
    levelIndex: 0,
    packetIndex: 0,
    score: 0,
    lives: 5,
    pressureTier: 0,
    correctCount: 0,
    wrongCount: 0,
    missedCount: 0,
    completedLevels: 0,
    selectedNextHopId: null,
    resolvedPacketIds: [],
    currentView: "start",
    status: "in-progress",
  };
}

export function startRun(run) {
  requireRun(run);
  if (run.currentView !== "start" && run.currentView !== "summary") {
    throw new Error(`Cannot start a run from ${run.currentView}`);
  }
  return {
    ...createRun(run.seed),
    currentView: "briefing",
  };
}

export function beginPacket(run) {
  requireRun(run);
  if (run.currentView !== "briefing" && run.currentView !== "feedback") {
    throw new Error(`Cannot begin a packet from ${run.currentView}`);
  }
  if (run.lives === 0) {
    throw new Error("Cannot begin a packet with no lives remaining");
  }
  return {
    ...copyRun(run),
    selectedNextHopId: null,
    currentView: "playing",
  };
}

export function selectNextHop(run, nextHopId) {
  requireRun(run);
  if (run.currentView !== "playing") {
    throw new Error(`Cannot select a next hop from ${run.currentView}`);
  }
  if (typeof nextHopId !== "string" || nextHopId.length === 0) {
    throw new TypeError("Next-hop ID must be a non-empty string");
  }
  return {
    ...copyRun(run),
    selectedNextHopId: nextHopId,
  };
}

export function resolveDecision(run, { packetId, selectedNextHopId, winningNextHopId }) {
  requireRun(run);
  if (typeof packetId !== "string" || packetId.length === 0) {
    throw new TypeError("Packet ID must be a non-empty string");
  }
  if (run.resolvedPacketIds.includes(packetId)) {
    return { status: "already-resolved", run };
  }
  if (run.currentView !== "playing") {
    return { status: "invalid-state", run };
  }
  if (typeof selectedNextHopId !== "string" || selectedNextHopId.length === 0) {
    return { status: "invalid-input", run };
  }
  if (typeof winningNextHopId !== "string" || winningNextHopId.length === 0) {
    throw new TypeError("Winning next-hop ID must be a non-empty string");
  }

  const isCorrect = selectedNextHopId === winningNextHopId;
  const next = copyRun(run);
  next.resolvedPacketIds.push(packetId);
  next.selectedNextHopId = selectedNextHopId;
  next.currentView = "feedback";
  if (isCorrect) {
    next.correctCount += 1;
    next.score += 100;
    if (next.correctCount % 5 === 0) {
      next.pressureTier = Math.min(5, next.pressureTier + 1);
    }
    return { status: "correct", run: next };
  }

  next.wrongCount += 1;
  next.score -= 50;
  next.lives = Math.max(0, next.lives - 1);
  next.pressureTier = Math.min(5, next.pressureTier + 1);
  if (next.lives === 0) {
    next.status = "failed";
  }
  return { status: "wrong", run: next };
}

export function missPacket(run, packetId) {
  requireRun(run);
  if (typeof packetId !== "string" || packetId.length === 0) {
    throw new TypeError("Packet ID must be a non-empty string");
  }
  if (run.resolvedPacketIds.includes(packetId)) {
    return { status: "already-resolved", run };
  }
  if (run.currentView !== "playing") {
    return { status: "invalid-state", run };
  }

  const next = copyRun(run);
  next.resolvedPacketIds.push(packetId);
  next.selectedNextHopId = null;
  next.missedCount += 1;
  next.score -= 50;
  next.lives = Math.max(0, next.lives - 1);
  next.pressureTier = Math.min(5, next.pressureTier + 1);
  next.currentView = "feedback";
  if (next.lives === 0) {
    next.status = "failed";
  }
  return { status: "missed", run: next };
}

export function pauseRun(run) {
  requireRun(run);
  if (run.currentView !== "playing") {
    throw new Error(`Cannot pause a run from ${run.currentView}`);
  }
  return {
    ...copyRun(run),
    currentView: "paused",
  };
}

export function resumeRun(run) {
  requireRun(run);
  if (run.currentView !== "paused") {
    throw new Error(`Cannot resume a run from ${run.currentView}`);
  }
  return {
    ...copyRun(run),
    currentView: "playing",
  };
}

export function continueAfterFeedback(run, packetCount = 5, levelCount = 1) {
  requireRun(run);
  if (run.currentView !== "feedback") {
    throw new Error(`Cannot continue from ${run.currentView}`);
  }
  if (!Number.isInteger(packetCount) || packetCount < 1) {
    throw new RangeError("Packet count must be a positive integer");
  }
  if (!Number.isInteger(levelCount) || levelCount < 1) {
    throw new RangeError("Level count must be a positive integer");
  }

  const next = copyRun(run);
  if (next.lives === 0) {
    next.status = "failed";
    next.currentView = "summary";
    return next;
  }
  if (next.packetIndex + 1 >= packetCount) {
    next.completedLevels = Math.max(next.completedLevels, next.levelIndex + 1);
    if (next.levelIndex + 1 < levelCount) {
      next.levelIndex += 1;
      next.packetIndex = 0;
      next.status = "in-progress";
      next.currentView = "briefing";
      next.selectedNextHopId = null;
      return next;
    }
    next.status = "complete";
    next.currentView = "summary";
    return next;
  }

  next.packetIndex += 1;
  next.currentView = "playing";
  next.selectedNextHopId = null;
  return next;
}
