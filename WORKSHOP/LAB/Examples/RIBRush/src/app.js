import { createAudioCues } from "./audio/cues.js";
import {
  beginPacket,
  continueAfterFeedback,
  createRun,
  missPacket,
  pauseRun,
  resolveDecision,
  resumeRun,
  selectNextHop,
  startRun,
} from "./game/session.js";
import { generateScenario } from "./routing/generate.js";
import { validateScenario } from "./routing/validate.js";
import {
  attachMuteControl,
  renderBriefing,
  renderError,
  renderFeedback,
  renderPaused,
  renderPlaying,
  renderStart,
  renderSummary,
} from "./ui/views.js";

const BASE_PACKET_TIME_MS = 10000;
const root = document.querySelector("#app");
if (!root) {
  throw new Error("The Rib Rush application root is missing");
}

const audio = createAudioCues();
let levels;
let run;
let scenario;
let evaluation;
let screen = "start";
let prompt = "";
let muted = false;
let packetDeadline = 0;
let packetTimerInterval = null;
let packetDuration = BASE_PACKET_TIME_MS;
let remainingPacketTime = BASE_PACKET_TIME_MS;

function currentLevel() {
  const level = levels[run.levelIndex];
  if (!level) {
    throw new Error(`No level definition exists at index ${run.levelIndex}`);
  }
  return level;
}

function attachSoundControl() {
  attachMuteControl(root, {
    muted,
    onToggle: (event) => {
      muted = !muted;
      audio.setMuted(muted);
      event.currentTarget.textContent = muted ? "Sound: off" : "Mute sound";
      event.currentTarget.setAttribute("aria-pressed", String(muted));
      event.currentTarget.setAttribute(
        "aria-label",
        muted ? "Unmute sound" : "Mute sound",
      );
    },
  });
}

function clearPacketTimer() {
  if (packetTimerInterval !== null) {
    clearInterval(packetTimerInterval);
    packetTimerInterval = null;
  }
  packetDeadline = 0;
}

function showError(error) {
  clearPacketTimer();
  screen = "error";
  renderError(
    root,
    `The game could not continue: ${error.message}`,
    () => window.location.reload(),
  );
  attachSoundControl();
}

function handleMiss() {
  clearPacketTimer();
  const result = missPacket(run, scenario.packet.id);
  if (result.status !== "missed") {
    showError(new Error(`Packet timeout could not be recorded (${result.status})`));
    return;
  }
  run = result.run;
  screen = "feedback";
  audio.play("missed");
  renderFeedback(root, {
    run,
    level: currentLevel(),
    scenario,
    selectedNextHopId: null,
    evaluation,
    decisionStatus: result.status,
    onContinue: advanceFromFeedback,
  });
  attachSoundControl();
}

function updatePacketTimer() {
  if (!packetDeadline || screen !== "playing") {
    return;
  }
  const remaining = Math.max(0, packetDeadline - Date.now());
  const progress = root.querySelector(".packet-progress");
  if (progress) {
    progress.value = (remaining / packetDuration) * 100;
  }
  if (remaining === 0) {
    handleMiss();
  }
}

function startPacketTimer(duration, resetDuration = true) {
  clearPacketTimer();
  if (resetDuration) {
    packetDuration = duration;
    remainingPacketTime = duration;
  }
  packetDeadline = Date.now() + remainingPacketTime;
  updatePacketTimer();
  packetTimerInterval = setInterval(updatePacketTimer, 100);
}

function renderCurrentPacket() {
  clearPacketTimer();
  const level = currentLevel();
  const generated = generateScenario({
    seed: run.seed,
    level,
    packetIndex: run.packetIndex,
  });
  const validation = validateScenario(generated, level);
  if (!validation.valid) {
    throw new Error(
      `Generated scenario failed validation: ${validation.errors.join("; ")}`,
    );
  }
  scenario = generated;
  evaluation = validation.evaluation;
  if (evaluation.status !== "winner") {
    throw new Error(`Generated scenario has no unique winner: ${evaluation.status}`);
  }
  prompt = "";
  screen = "playing";
  packetDuration = BASE_PACKET_TIME_MS / (1 + run.pressureTier * 0.2);
  remainingPacketTime = packetDuration;
  renderPlayingScreen();
  startPacketTimer(packetDuration);
}

function renderPlayingScreen() {
  const remainingPercent = packetDeadline
    ? Math.max(0, ((packetDeadline - Date.now()) / packetDuration) * 100)
    : 100;
  const elapsed = packetDeadline
    ? packetDuration - Math.max(0, packetDeadline - Date.now())
    : packetDuration - remainingPacketTime;
  renderPlaying(root, {
    run,
    level: currentLevel(),
    scenario,
    selectedNextHopId: run.selectedNextHopId,
    prompt,
    timerPercent: remainingPercent,
    fallDurationMs: packetDuration,
    fallElapsedMs: elapsed,
    onSelect: chooseNextHop,
    onSubmit: submitDecision,
    onPause: pauseCurrentRun,
  });
  if (!run.selectedNextHopId) {
    root.querySelector(".route-choice")?.focus();
  }
  attachSoundControl();
}

function beginRun() {
  clearPacketTimer();
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  run = startRun(createRun(seed));
  screen = "briefing";
  audio.play("start");
  renderBriefing(root, {
    level: currentLevel(),
    onBegin: beginLevel,
  });
  attachSoundControl();
}

function beginLevel() {
  try {
    run = beginPacket(run);
    renderCurrentPacket();
  } catch (error) {
    showError(error);
  }
}

function chooseNextHop(nextHopId) {
  try {
    run = selectNextHop(run, nextHopId);
    prompt = "";
    renderPlayingScreen();
  } catch (error) {
    showError(error);
  }
}

function submitDecision() {
  const decision = resolveDecision(run, {
    packetId: scenario.packet.id,
    selectedNextHopId: run.selectedNextHopId,
    winningNextHopId: scenario.routes.find(
      (route) => route.id === evaluation.winnerRouteId,
    ).nextHopId,
  });
  if (decision.status === "invalid-input") {
    prompt = "Choose a next hop before submitting; no points or lives changed.";
    renderPlayingScreen();
    return;
  }
  if (decision.status !== "correct" && decision.status !== "wrong") {
    showError(new Error(`Decision could not be resolved (${decision.status})`));
    return;
  }
  clearPacketTimer();
  run = decision.run;
  screen = "feedback";
  audio.play(decision.status);
  renderFeedback(root, {
    run,
    level: currentLevel(),
    scenario,
    selectedNextHopId: run.selectedNextHopId,
    evaluation,
    decisionStatus: decision.status,
    onContinue: advanceFromFeedback,
  });
  attachSoundControl();
}

function advanceFromFeedback() {
  try {
    run = continueAfterFeedback(run, currentLevel().packetCount, levels.length);
    if (run.currentView === "playing") {
      renderCurrentPacket();
      return;
    }
    if (run.currentView === "briefing") {
      screen = "briefing";
      audio.play("level-up");
      renderBriefing(root, {
        level: currentLevel(),
        onBegin: beginLevel,
      });
      attachSoundControl();
      return;
    }
    screen = "summary";
    audio.play(run.status === "failed" ? "game-over" : "run-complete");
    renderSummary(root, {
      run,
      onReplay: beginRun,
      totalLevels: levels.length,
    });
    attachSoundControl();
  } catch (error) {
    showError(error);
  }
}

function pauseCurrentRun() {
  try {
    remainingPacketTime = Math.max(0, packetDeadline - Date.now());
    clearPacketTimer();
    run = pauseRun(run);
    screen = "paused";
    renderPaused(root, {
      run,
      onResume: resumeCurrentRun,
      onRestart: beginRun,
    });
    attachSoundControl();
  } catch (error) {
    showError(error);
  }
}

function resumeCurrentRun() {
  try {
    run = resumeRun(run);
    screen = "playing";
    renderPlayingScreen();
    startPacketTimer(remainingPacketTime, false);
  } catch (error) {
    showError(error);
  }
}

function handleKeydown(event) {
  if (
    screen === "briefing" &&
    event.key === "Enter" &&
    event.target.tagName !== "BUTTON"
  ) {
    event.preventDefault();
    beginLevel();
    return;
  }
  if (
    screen === "playing" &&
    (event.key === "ArrowLeft" || event.key === "ArrowRight")
  ) {
    event.preventDefault();
    const routes = scenario.routes;
    const currentIndex = routes.findIndex(
      (route) => route.nextHopId === run.selectedNextHopId,
    );
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex =
      currentIndex === -1
        ? direction === 1
          ? 0
          : routes.length - 1
        : (currentIndex + direction + routes.length) % routes.length;
    chooseNextHop(routes[nextIndex].nextHopId);
    return;
  }
  if (screen === "playing" && event.key === "Enter") {
    event.preventDefault();
    submitDecision();
    return;
  }
  if (screen === "playing" && event.key === "Escape") {
    event.preventDefault();
    pauseCurrentRun();
    return;
  }
  if (
    screen === "paused" &&
    (event.key === "Escape" ||
      (event.key === "Enter" && event.target.tagName !== "BUTTON"))
  ) {
    event.preventDefault();
    resumeCurrentRun();
    return;
  }
  if (
    screen === "feedback" &&
    event.key === "Enter" &&
    event.target.tagName !== "BUTTON"
  ) {
    event.preventDefault();
    advanceFromFeedback();
  }
}

async function initialize() {
  const response = await fetch(new URL("../data/levels.json", import.meta.url));
  if (!response.ok) {
    throw new Error(`Could not load level data (${response.status})`);
  }
  const data = await response.json();
  if (!Array.isArray(data.levels) || data.levels.length !== 7) {
    throw new Error("Level data must contain exactly seven levels");
  }
  levels = data.levels;
  renderStart(root, beginRun);
  attachSoundControl();
  document.addEventListener("keydown", handleKeydown);
}

initialize().catch((error) => {
  showError(error instanceof Error ? error : new Error(String(error)));
});
