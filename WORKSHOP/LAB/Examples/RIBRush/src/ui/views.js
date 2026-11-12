function node(tagName, className = "", text = "") {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text) {
    element.textContent = text;
  }
  return element;
}

function button(label, className, onClick) {
  const control = node("button", className, label);
  control.type = "button";
  control.addEventListener("click", onClick);
  return control;
}

function page(title, subtitle) {
  const section = node("section", "game-screen");
  const header = node("header", "screen-header");
  header.append(node("p", "eyebrow", "RIBRush"));
  header.append(node("h1", "", title));
  if (subtitle) {
    header.append(node("p", "screen-subtitle", subtitle));
  }
  section.append(header);
  return section;
}

function setPage(root, section) {
  root.replaceChildren(section);
}

function protocolName(protocol) {
  const names = {
    connected: "Connected",
    static: "Static",
    ebgp: "External BGP",
    ospf: "OSPF",
    ibgp: "Internal BGP",
  };
  return names[protocol] ?? protocol;
}

function levelNumber(level) {
  return level.number ?? level.id.slice("level-".length);
}

function routeTable(
  routes,
  selectedNextHopId,
  onSelect,
  winnerRouteId = null,
  readOnly = false,
) {
  const table = node("table", "route-table");
  const caption = node("caption", "visually-hidden", "Candidate route choices");
  table.append(caption);

  const head = node("thead");
  const headerRow = node("tr");
  for (const label of ["Prefix", "Source", "AD", "Metric", "Next hop"]) {
    headerRow.append(node("th", "", label));
  }
  head.append(headerRow);
  table.append(head);

  const body = node("tbody");
  for (const route of routes) {
    const row = node("tr", route.id === winnerRouteId ? "winning-route" : "");
    row.append(node("td", "", `${route.networkAddress}/${route.prefixLength}`));
    const sourceCell = node("td");
    sourceCell.append(node("span", "protocol-badge", protocolName(route.protocol)));
    row.append(sourceCell);
    row.append(node("td", "", String(route.administrativeDistance)));
    row.append(
      node("td", "", route.metric === null ? "—" : String(route.metric)),
    );

    const nextHopCell = node("td");
    if (readOnly) {
      nextHopCell.append(node("span", "", route.nextHopLabel));
    } else {
      const choice = button(
        route.nextHopLabel,
        "route-choice",
        () => onSelect(route.nextHopId),
      );
      choice.dataset.nextHopId = route.nextHopId;
      choice.setAttribute("aria-pressed", String(route.nextHopId === selectedNextHopId));
      nextHopCell.append(choice);
    }
    row.append(nextHopCell);
    body.append(row);
  }
  table.append(body);
  return table;
}

function statusPanel(text, className = "") {
  const panel = node("p", `status-panel ${className}`.trim(), text);
  panel.setAttribute("role", "status");
  panel.setAttribute("aria-live", "polite");
  return panel;
}

export function decisionExplanation(evaluation, routes) {
  const winningRoute = routes.find(
    (route) => route.id === evaluation.winnerRouteId,
  );
  if (!winningRoute) {
    throw new Error("A winning route is required to explain a decision");
  }
  const longestPrefixCompetitor = routes
    .filter(
      (route) =>
        route.id !== winningRoute.id &&
        route.prefixLength < winningRoute.prefixLength,
    )
    .sort((left, right) => right.prefixLength - left.prefixLength)[0];
  const samePrefixCompetitor = routes.find(
    (route) =>
      route.id !== winningRoute.id &&
      route.networkAddress === winningRoute.networkAddress &&
      route.prefixLength === winningRoute.prefixLength,
  );

  if (evaluation.ruleCode === "metric" && samePrefixCompetitor) {
    return (
      `The routes share the same prefix, AD ${winningRoute.administrativeDistance}, and ${protocolName(winningRoute.protocol)} protocol. ` +
      `The lower ${protocolName(winningRoute.protocol)} metric ${winningRoute.metric} beats ${samePrefixCompetitor.metric}; metrics are not compared across protocols.`
    );
  }
  if (evaluation.ruleCode === "administrative-distance" && samePrefixCompetitor) {
    return (
      `The prefixes are identical (${winningRoute.networkAddress}/${winningRoute.prefixLength}), so Cisco IOS/IOS XE default AD decides: ` +
      `${protocolName(winningRoute.protocol)} AD ${winningRoute.administrativeDistance} beats ` +
      `${protocolName(samePrefixCompetitor.protocol)} AD ${samePrefixCompetitor.administrativeDistance}.`
    );
  }
  if (longestPrefixCompetitor) {
    let distanceNote;
    if (
      winningRoute.administrativeDistance >
      longestPrefixCompetitor.administrativeDistance
    ) {
      distanceNote =
        `It wins despite ${protocolName(winningRoute.protocol)} AD ${winningRoute.administrativeDistance} being higher than ` +
        `${protocolName(longestPrefixCompetitor.protocol)} AD ${longestPrefixCompetitor.administrativeDistance}.`;
    } else if (
      winningRoute.administrativeDistance ===
      longestPrefixCompetitor.administrativeDistance
    ) {
      distanceNote = `Both routes have AD ${winningRoute.administrativeDistance}; prefix length decides.`;
    } else {
      distanceNote =
        `The compared AD values are ${winningRoute.administrativeDistance} and ${longestPrefixCompetitor.administrativeDistance}; prefix length is evaluated first.`;
    }
    return (
      `Longest prefix match wins first: /${winningRoute.prefixLength} beats /${longestPrefixCompetitor.prefixLength}. ${distanceNote}`
    );
  }
  return `Longest-prefix match applies: the /${winningRoute.prefixLength} route is the most-specific matching candidate.`;
}

export function renderStart(root, onStart) {
  const screen = page(
    "Choose the route that carries the packet",
    "A keyboard-first routing puzzle about how routers select a next hop.",
  );
  const card = node("div", "intro-card");
  card.append(node("h2", "", "Your challenge"));
  card.append(
    node(
      "p",
      "",
      "Route 35 packets across seven levels: four IPv4 practice levels followed by three IPv6 levels. Compare each destination with the candidate routes and select the winning next hop. Runs reset when you reload.",
    ),
  );
  card.append(
    node(
      "p",
      "control-hint",
      "Use Left and Right Arrow keys to choose a route, Enter to submit, and Escape to pause.",
    ),
  );
  card.append(button("Start run", "primary-button", onStart));
  screen.append(card);
  setPage(root, screen);
  root.querySelector("button")?.focus();
}

export function renderBriefing(root, { level, onBegin }) {
  const screen = page(
    `Level ${levelNumber(level)}: ${level.briefingTitle}`,
    "Briefing",
  );
  const card = node("div", "briefing-card");
  card.append(node("p", "", level.briefing));
  const example = level.workedExample;
  card.append(node("h2", "", "Worked example"));
  card.append(node("p", "destination-line", `Destination: ${example.destination}`));
  card.append(
    routeTable(
      example.routes.map((route, index) => ({
        ...route,
        id: `example-route-${index + 1}`,
        nextHopId: `example-hop-${index + 1}`,
      })),
      null,
      () => {},
      `example-route-${example.winnerIndex + 1}`,
      true,
    ),
  );
  card.append(node("p", "explanation", example.explanation));
  card.append(
    node(
      "p",
      "model-note",
      "This exercise compares the listed eligible candidates; it does not simulate route installation or next-hop recursion.",
    ),
  );
  card.append(
    button(`Begin Level ${levelNumber(level)}`, "primary-button", onBegin),
  );
  screen.append(card);
  setPage(root, screen);
  root.querySelector("button")?.focus();
}

export function renderPlaying(
  root,
  {
    run,
    level,
    scenario,
    selectedNextHopId,
    prompt,
    timerPercent,
    fallDurationMs,
    fallElapsedMs,
    onSelect,
    onSubmit,
    onPause,
  },
) {
  const screen = page(
    `Level ${levelNumber(level)}: ${level.briefingTitle}`,
    `Packet ${run.packetIndex + 1} of ${level.packetCount}`,
  );
  const hud = node("div", "run-hud");
  for (const [label, value] of [
    ["Score", run.score],
    ["Lives", run.lives],
    ["Pressure", `${run.pressureTier}/5`],
  ]) {
    const metric = node("div", "hud-metric");
    metric.append(node("span", "hud-label", label));
    metric.append(node("strong", "hud-value", String(value)));
    hud.append(metric);
  }
  screen.append(hud);

  const packet = node("section", "packet-panel");
  packet.setAttribute("aria-labelledby", "packet-heading");
  packet.append(node("h2", "", "Incoming packet"));
  packet.querySelector("h2").id = "packet-heading";
  const flight = node("div", "packet-flight");
  const packetCard = node("div", "packet-card");
  packetCard.style.setProperty("--fall-duration", `${fallDurationMs}ms`);
  packetCard.style.setProperty("--fall-delay", `-${fallElapsedMs}ms`);
  packetCard.append(node("span", "packet-label", "Destination"));
  packetCard.append(node("strong", "packet-destination", scenario.packet.destination));
  packetCard.append(node("span", "packet-family", scenario.packet.addressFamily.toUpperCase()));
  flight.append(packetCard);
  packet.append(flight);
  const timer = node("progress", "packet-progress");
  timer.max = 100;
  timer.value = timerPercent;
  timer.setAttribute("aria-label", "Time remaining for this packet");
  packet.append(timer);
  screen.append(packet);

  const routes = node("section", "routes-panel");
  routes.setAttribute("aria-labelledby", "routes-heading");
  routes.append(node("h2", "", "Candidate routes"));
  routes.querySelector("h2").id = "routes-heading";
  routes.append(
    routeTable(scenario.routes, selectedNextHopId, onSelect),
  );
  routes.append(
    statusPanel(
      prompt || "Choose a next hop with the Left or Right Arrow key.",
      prompt ? "status-warning" : "",
    ),
  );
  routes.append(button("Submit route (Enter)", "primary-button", onSubmit));
  routes.append(button("Pause (Escape)", "secondary-button", onPause));
  screen.append(routes);
  setPage(root, screen);
  if (selectedNextHopId) {
    root
      .querySelector(`[data-next-hop-id="${CSS.escape(selectedNextHopId)}"]`)
      ?.focus();
  }
}

export function renderFeedback(
  root,
  { run, level, scenario, selectedNextHopId, evaluation, decisionStatus, onContinue },
) {
  const isCorrect = decisionStatus === "correct";
  const isMissed = decisionStatus === "missed";
  const screen = page(
    isMissed ? "Packet missed" : isCorrect ? "Correct route" : "That route does not win",
    `Level ${levelNumber(level)} · Packet ${run.packetIndex + 1}`,
  );
  const result = node(
    "div",
    `feedback-card ${isCorrect ? "feedback-correct" : "feedback-wrong"}`,
  );
  result.setAttribute("role", "status");
  result.setAttribute("aria-live", "polite");
  result.append(
    node(
      "p",
      "feedback-outcome",
      isCorrect
        ? "+100 points"
        : isMissed
          ? "−50 points · 1 life lost"
          : "−50 points · 1 life lost",
    ),
  );

  const winningRoute = scenario.routes.find(
    (route) => route.id === evaluation.winnerRouteId,
  );
  const chosenRoute = scenario.routes.find(
    (route) => route.nextHopId === selectedNextHopId,
  );
  result.append(
    node(
      "p",
      "",
      `Winning next hop: ${winningRoute.nextHopLabel} (${winningRoute.networkAddress}/${winningRoute.prefixLength}).`,
    ),
  );
  if (chosenRoute && !isCorrect) {
    result.append(
      node(
        "p",
        "",
        `You selected ${chosenRoute.nextHopLabel} (${chosenRoute.networkAddress}/${chosenRoute.prefixLength}).`,
      ),
    );
  }
  result.append(
    node("p", "explanation", decisionExplanation(evaluation, scenario.routes)),
  );
  result.append(
    node(
      "p",
      "model-note",
      `Destination: ${scenario.packet.destination}. The most-specific matching route wins in this exercise.`,
    ),
  );
  result.append(
    node(
      "p",
      "score-line",
      `Score ${run.score} · Lives ${run.lives} · Pressure ${run.pressureTier}/5`,
    ),
  );
  result.append(
    button(
      run.lives === 0 ? "View run summary (Enter)" : "Continue (Enter)",
      "primary-button",
      onContinue,
    ),
  );
  screen.append(result);
  setPage(root, screen);
  root.querySelector("button")?.focus();
}

export function renderPaused(root, { run, onResume, onRestart }) {
  const screen = page("Run paused", "The packet timer is stopped.");
  const card = node("div", "summary-card");
  card.append(node("p", "", `Score ${run.score} · Lives ${run.lives}`));
  card.append(button("Resume (Escape)", "primary-button", onResume));
  card.append(button("Restart run", "secondary-button", onRestart));
  screen.append(card);
  setPage(root, screen);
  root.querySelector("button")?.focus();
}

export function attachMuteControl(root, { muted, onToggle }) {
  const header = root.querySelector(".screen-header");
  if (!header) {
    return;
  }
  const control = button(muted ? "Sound: off" : "Mute sound", "mute-control", onToggle);
  control.setAttribute("aria-pressed", String(muted));
  control.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
  header.append(control);
}

export function renderSummary(root, { run, onReplay, totalLevels }) {
  const screen = page(run.status === "failed" ? "Run over" : "Run complete", "Run summary");
  const card = node("div", "summary-card");
  card.append(
    node("h2", "", `Final score: ${run.score}`),
    node("p", "", `Levels completed: ${run.completedLevels} of ${totalLevels}`),
  );
  card.append(
    node(
      "p",
      "",
      `Correct ${run.correctCount} · Wrong ${run.wrongCount} · Missed ${run.missedCount}`,
    ),
  );
  card.append(node("p", "", `Lives remaining: ${run.lives}`));
  card.append(button("Play again", "primary-button", onReplay));
  screen.append(card);
  setPage(root, screen);
  root.querySelector("button")?.focus();
}

export function renderError(root, message, onReload) {
  const screen = page("Unable to load RIBRush", "Content error");
  const card = node("div", "error-card");
  card.append(node("p", "", message));
  card.append(button("Reload", "primary-button", onReload));
  screen.append(card);
  setPage(root, screen);
}
