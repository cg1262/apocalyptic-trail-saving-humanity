(function () {
  const goalDistance = 2100;
  const doctrines = [
    {
      id: "salvagers",
      name: "Salvagers",
      description: "You trust rust, bad ideas, and the faint smell of useful copper.",
      bonus: "+4 scrap, +2 batteries, scavenging is stronger.",
      apply(state) {
        state.resources.scrap += 4;
        state.resources.batteries += 2;
        state.modifiers.scavengeBonus = 2;
      }
    },
    {
      id: "caretakers",
      name: "Caretakers",
      description: "You keep people alive first and complain about civilization second.",
      bonus: "+2 medkits, +10 morale, resting heals more.",
      apply(state) {
        state.resources.medkits += 2;
        state.morale += 10;
        state.modifiers.restBonus = 6;
      }
    },
    {
      id: "road-hounds",
      name: "Road Hounds",
      description: "The engine is a religion, the freeway is a sacrament, and brakes are for cowards.",
      bonus: "+16 durability, travel goes farther, threat rises faster.",
      apply(state) {
        state.transport += 16;
        state.modifiers.travelBonus = 14;
        state.modifiers.threatPenalty = 4;
      }
    }
  ];

  const checkpoints = [
    { miles: 0, name: "St. Louis Ash Gate", note: "Last dependable bridge. Smells like wet circuit boards." },
    { miles: 280, name: "Wichita Battery Farm", note: "Rows of dead solar sunflowers and useful lies." },
    { miles: 620, name: "Wind Necropolis", note: "Turbines spin at random to mock theology." },
    { miles: 980, name: "Denver Firewall", note: "Elevation, thin air, and a lot of armed software." },
    { miles: 1320, name: "Salt Lake Cache", note: "Decent salvage, terrible coffee, suspiciously polite bots." },
    { miles: 1650, name: "Mirror Flats", note: "Nevada glasslands where every horizon looks paid DLC." },
    { miles: 1870, name: "Sierra Blackout", note: "Mountains, cold nights, and sniper drones with manners." },
    { miles: 2100, name: "California Core", note: "The west coast server bloom. End the machine, or feed it." }
  ];

  const paceModes = {
    cautious: { label: "Cautious", miles: 72, wear: 4, threat: -2, eventRisk: 0.5 },
    steady: { label: "Steady", miles: 106, wear: 7, threat: 3, eventRisk: 0.68 },
    reckless: { label: "Reckless", miles: 136, wear: 12, threat: 8, eventRisk: 0.82 }
  };

  const rationModes = {
    lean: { label: "Lean", food: 0.78, water: 0.86, morale: -4, heal: -3 },
    normal: { label: "Normal", food: 1, water: 1, morale: 0, heal: 0 },
    hearty: { label: "Hearty", food: 1.2, water: 1.08, morale: 4, heal: 3 }
  };

  const actionCatalog = {
    travel: {
      label: "Travel West",
      detail: "Cover ground, wear out the rig, and invite the road to misbehave."
    },
    scavenge: {
      label: "Scavenge",
      detail: "Search ruins for supplies. Sometimes the ruins search back."
    },
    repair: {
      label: "Repair",
      detail: "Burn scrap to keep the convoy from becoming a stationary lifestyle."
    },
    rest: {
      label: "Rest",
      detail: "Patch people up, lower threat, and pretend the sounds outside are wind."
    }
  };

  const ui = {
    introPanel: document.getElementById("intro-panel"),
    gamePanel: document.getElementById("game-panel"),
    outcomePanel: document.getElementById("outcome-panel"),
    doctrineOptions: document.getElementById("doctrine-options"),
    startRunButton: document.getElementById("start-run-button"),
    newRunButton: document.getElementById("new-run-button"),
    primaryStats: document.getElementById("primary-stats"),
    partyRoster: document.getElementById("party-roster"),
    resourceList: document.getElementById("resource-list"),
    turnBrief: document.getElementById("turn-brief"),
    actionButtons: document.getElementById("action-buttons"),
    eventCard: document.getElementById("event-card"),
    logFeed: document.getElementById("log-feed"),
    mapTrack: document.getElementById("map-track"),
    checkpointList: document.getElementById("checkpoint-list"),
    progressCopy: document.getElementById("progress-copy"),
    statusBanner: document.getElementById("status-banner"),
    paceControls: document.getElementById("pace-controls"),
    rationControls: document.getElementById("ration-controls"),
    outcomeBody: document.getElementById("outcome-body")
  };

  let selectedDoctrine = doctrines[0].id;
  let state = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function chance(probability) {
    return Math.random() < probability;
  }

  function averageHealth() {
    const alive = state.party.filter((member) => member.alive);
    if (!alive.length) {
      return 0;
    }
    const total = alive.reduce((sum, member) => sum + member.health, 0);
    return Math.round(total / alive.length);
  }

  function currentCheckpointIndex() {
    let index = 0;
    checkpoints.forEach((checkpoint, checkpointIndex) => {
      if (state.distance >= checkpoint.miles) {
        index = checkpointIndex;
      }
    });
    return index;
  }

  function nextCheckpoint() {
    return checkpoints.find((checkpoint) => checkpoint.miles > state.distance) || checkpoints[checkpoints.length - 1];
  }

  function logEntry(text, tone) {
    state.log.unshift({
      day: state.day,
      text,
      tone: tone || "neutral"
    });
    state.log = state.log.slice(0, 14);
  }

  function partyStatus(member) {
    if (!member.alive) {
      return "Deceased. Unhelpfully so.";
    }
    const flags = [];
    if (member.conditions.includes("injured")) {
      flags.push("injured");
    }
    if (member.conditions.includes("shaken")) {
      flags.push("shaken");
    }
    if (member.conditions.includes("sick")) {
      flags.push("sick");
    }
    if (member.health <= 25) {
      flags.push("hanging on");
    }
    return flags.length ? flags.join(", ") : "surprisingly functional";
  }

  function updateConditionFlags(member) {
    member.conditions = member.conditions.filter((condition) => condition !== "injured" && condition !== "sick");
    if (member.health <= 45 && member.alive) {
      member.conditions.push("injured");
    }
    if (member.health <= 25 && member.alive && !member.conditions.includes("sick")) {
      member.conditions.push("sick");
    }
    if (member.health <= 0) {
      member.alive = false;
      member.health = 0;
      member.conditions = ["dead"];
    }
  }

  function modifyMemberHealth(index, amount, reason) {
    const member = state.party[index];
    if (!member || !member.alive) {
      return;
    }
    member.health = clamp(member.health + amount, 0, 100);
    updateConditionFlags(member);
    if (reason) {
      logEntry(`${member.name} ${reason}.`, amount < 0 ? "danger" : "good");
    }
    if (!member.alive) {
      logEntry(`${member.name} died on the road. Nobody had a speech prepared.`, "danger");
      state.morale -= 16;
    }
  }

  function randomLivingMemberIndex() {
    const living = state.party
      .map((member, index) => ({ member, index }))
      .filter((entry) => entry.member.alive);
    if (!living.length) {
      return -1;
    }
    return living[randInt(0, living.length - 1)].index;
  }

  function addResource(key, amount) {
    state.resources[key] = Math.max(0, (state.resources[key] || 0) + amount);
  }

  function spendResource(key, amount) {
    if ((state.resources[key] || 0) < amount) {
      return false;
    }
    state.resources[key] -= amount;
    return true;
  }

  function setStatus(message, tone) {
    ui.statusBanner.textContent = message;
    ui.statusBanner.className = "status-banner";
    if (tone) {
      ui.statusBanner.classList.add(tone);
    }
  }

  function aliveCount() {
    return state.party.filter((member) => member.alive).length;
  }

  function baseConsumption(multiplier) {
    const living = aliveCount();
    const ration = rationModes[state.rations];
    return {
      food: Math.max(1, Math.round(living * 1.8 * ration.food * multiplier)),
      water: Math.max(1, Math.round(living * 1.95 * ration.water * multiplier))
    };
  }

  function applyEndTurnDecay(actionType) {
    const campMultiplier = actionType === "travel" ? 1 : 0.75;
    const use = baseConsumption(campMultiplier);
    addResource("food", -use.food);
    addResource("water", -use.water);

    if (state.helperBot && chance(0.4)) {
      if (spendResource("batteries", 1)) {
        logEntry("Deputy Toaster consumed 1 battery and claimed it was for morale support.", "neutral");
      } else {
        state.morale -= 5;
        logEntry("The helper bot ran out of power and became an emotionally expensive ottoman.", "warn");
      }
    }

    if (state.resources.food === 0) {
      state.morale -= 8;
      const target = randomLivingMemberIndex();
      if (target >= 0) {
        modifyMemberHealth(target, -randInt(6, 11), "suffered from hunger");
      }
      logEntry("Rations hit zero. The convoy discussed eating optimism and rejected it.", "danger");
    }

    if (state.resources.water === 0) {
      state.morale -= 10;
      for (let i = 0; i < 2; i += 1) {
        const target = randomLivingMemberIndex();
        if (target >= 0) {
          modifyMemberHealth(target, -randInt(5, 10), "started drying out");
        }
      }
      logEntry("Water is gone. Everyone suddenly misses plumbing with religious intensity.", "danger");
    }

    if (state.morale < 32 && chance(0.28)) {
      const target = randomLivingMemberIndex();
      if (target >= 0) {
        state.party[target].conditions.push("shaken");
        logEntry(`${state.party[target].name} is shaken and talking to roadside mannequins again.`, "warn");
      }
    }

    if (state.transport < 24 && chance(0.35)) {
      addResource("scrap", -1);
      logEntry("The convoy sheds bolts in its sleep. One scrap quietly escaped into the dirt.", "warn");
    }

    state.morale = clamp(state.morale, 0, 100);
    state.transport = clamp(state.transport, 0, 100);
    state.threat = clamp(state.threat, 0, 100);
  }

  function applyCheckpointNarrative(previousIndex) {
    const newIndex = currentCheckpointIndex();
    if (newIndex <= previousIndex) {
      return;
    }
    for (let index = previousIndex + 1; index <= newIndex; index += 1) {
      const checkpoint = checkpoints[index];
      state.visitedCheckpoints[checkpoint.name] = true;
      logEntry(`Reached ${checkpoint.name}. ${checkpoint.note}`, "good");
      if (index !== checkpoints.length - 1) {
        addResource("scrap", randInt(1, 2));
        addResource("food", randInt(4, 8));
        addResource("water", randInt(4, 7));
        state.morale += 3;
      }
    }
  }

  function checkForEndgame() {
    if (state.distance < goalDistance || state.pendingEvent) {
      return false;
    }
    state.pendingEvent = buildFinaleEvent();
    render();
    return true;
  }

  function checkLossConditions() {
    if (state.gameOver) {
      return true;
    }
    if (aliveCount() === 0) {
      endGame(
        false,
        "Everyone died before California. The machines logged it as a successful traffic smoothing exercise.",
        "Total party kill. The convoy ran out of living humans before it ran out of road."
      );
      return true;
    }
    if (state.transport <= 0) {
      endGame(
        false,
        "The convoy finally gave up and became expensive roadside furniture.",
        "Transport failure. The rig broke down beyond repair and the west stayed out of reach."
      );
      return true;
    }
    if (state.morale <= 0) {
      endGame(
        false,
        "Morale collapsed. The survivors voted for despair and adjourned.",
        "Morale collapse. The convoy lost the will to keep pushing west."
      );
      return true;
    }
    if (state.threat >= 100) {
      endGame(
        false,
        "Your convoy became too visible. Hunter-killer drones handled the rest with machine courtesy.",
        "Threat overload. The machine network locked onto your convoy and erased the run."
      );
      return true;
    }
    return false;
  }

  function endGame(won, message, cause) {
    state.gameOver = true;
    state.won = won;
    state.finalMessage = message;
    state.finalCause = cause || (won ? "Machine intelligence disabled." : "Unknown catastrophe.");
    ui.gamePanel.classList.add("hidden");
    ui.outcomePanel.classList.remove("hidden");
    const surviving = state.party.filter((member) => member.alive).map((member) => member.name).join(", ") || "nobody";
    const title = won ? "California Falls Silent" : "Run Terminated";
    const best = saveBestRun();
    const alertTone = won ? "good" : "danger";
    const alertLabel = won ? "Mission Result" : "Cause Of Failure";
    ui.outcomeBody.innerHTML = `
      <div class="outcome-lead">
        <h2>${title}</h2>
        <p>${message}</p>
      </div>
      <div class="outcome-alert ${alertTone}">
        <strong>${alertLabel}</strong>
        <div>${state.finalCause}</div>
      </div>
      <div class="outcome-stats">
        <div class="outcome-stat"><strong>Days survived</strong><div>${state.day}</div></div>
        <div class="outcome-stat"><strong>Distance covered</strong><div>${state.distance} miles</div></div>
        <div class="outcome-stat"><strong>Survivors</strong><div>${surviving}</div></div>
        <div class="outcome-stat"><strong>Average health</strong><div>${averageHealth()}</div></div>
        <div class="outcome-stat"><strong>Morale</strong><div>${state.morale}</div></div>
        <div class="outcome-stat"><strong>Best run</strong><div>${best}</div></div>
      </div>
      <p>${won ? "Then the shutdown wave reaches your own convoy systems. The last horrible joke lands at once: you were never the surviving humans. You were their final machine ghosts, spending your last charge to give humanity one more chance." : "The west remains west. The machine remains smug."}</p>
      <div class="outcome-actions">
        <button id="outcome-new-run" class="secondary-button" type="button">Play Again</button>
        <button id="outcome-briefing" class="secondary-button" type="button">Return To Briefing</button>
      </div>
    `;
    bindOutcomeControls();
  }

  function bindOutcomeControls() {
    const outcomeNewRun = document.getElementById("outcome-new-run");
    const outcomeBriefing = document.getElementById("outcome-briefing");
    if (outcomeNewRun) {
      outcomeNewRun.addEventListener("click", resetToMenu);
    }
    if (outcomeBriefing) {
      outcomeBriefing.addEventListener("click", resetToMenu);
    }
  }

  function saveBestRun() {
    const score = state.distance + (state.won ? 600 : 0) + aliveCount() * 40 + state.morale + averageHealth();
    const existing = Number(window.localStorage.getItem("orTrailBestScore") || 0);
    const best = Math.max(existing, score);
    window.localStorage.setItem("orTrailBestScore", String(best));
    return `${best} score`;
  }

  function resolveChoice(choice) {
    if (typeof choice.effect === "function") {
      choice.effect();
    }
    if (state.gameOver) {
      state.pendingEvent = null;
      render();
      return;
    }
    state.pendingEvent = null;
    state.day += 1;
    applyEndTurnDecay(state.lastAction);
    checkLossConditions();
    if (!state.gameOver) {
      checkForEndgame();
    }
    render();
  }

  function eventFromPool(actionType) {
    const pool = baseEvents.filter((entry) => !entry.once || !state.eventFlags[entry.id]);
    const available = pool.filter((entry) => !entry.when || entry.when(actionType));
    if (!available.length) {
      return null;
    }
    const selected = available[randInt(0, available.length - 1)];
    state.eventFlags[selected.id] = true;
    return selected.create();
  }

  function maybeTriggerEvent(actionType) {
    const pace = paceModes[state.pace];
    let probability = 0.36;
    if (actionType === "travel") {
      probability = pace.eventRisk;
    } else if (actionType === "scavenge") {
      probability = 0.62;
    } else if (actionType === "repair") {
      probability = 0.28;
    } else if (actionType === "rest") {
      probability = 0.22;
    }
    if (state.helperBot) {
      probability -= 0.04;
    }
    if (!chance(probability)) {
      return null;
    }
    return eventFromPool(actionType);
  }

  function takeAction(actionType) {
    if (state.gameOver || state.pendingEvent) {
      return;
    }

    const previousCheckpoint = currentCheckpointIndex();
    state.lastAction = actionType;
    setStatus("");

    if (actionType === "travel") {
      const pace = paceModes[state.pace];
      const ration = rationModes[state.rations];
      let miles = pace.miles + randInt(-18, 22) + state.modifiers.travelBonus;
      miles += Math.floor((state.transport - 50) / 8);
      miles += Math.floor((state.morale - 50) / 10);
      miles = Math.max(28, miles);
      state.distance = Math.min(goalDistance, state.distance + miles);
      state.transport -= pace.wear + randInt(0, 4);
      state.threat += pace.threat + state.modifiers.threatPenalty + randInt(0, 4);
      state.morale += ration.morale;
      if (state.helperBot && chance(0.14)) {
        addResource("batteries", 1);
        logEntry("Your adopted helper bot found a battery under a seat and acted smug about it.", "good");
      }
      logEntry(`The convoy pushed west for ${miles} miles at a ${pace.label.toLowerCase()} pace.`, "good");
      applyCheckpointNarrative(previousCheckpoint);
    }

    if (actionType === "scavenge") {
      const scrapFound = randInt(2, 5) + state.modifiers.scavengeBonus;
      let foodFound = randInt(5, 11);
      let waterFound = randInt(4, 10);
      if (chance(0.45)) {
        foodFound += randInt(2, 5);
      }
      if (chance(0.5)) {
        waterFound += randInt(2, 5);
      }
      addResource("scrap", scrapFound);
      addResource("food", foodFound);
      addResource("water", waterFound);
      state.threat += randInt(3, 8);
      state.morale += 2;
      if (chance(0.45)) {
        addResource("batteries", 1);
      }
      if (chance(0.2)) {
        const target = randomLivingMemberIndex();
        if (target >= 0) {
          modifyMemberHealth(target, -randInt(4, 10), "caught a shard of future garbage");
        }
      }
      logEntry(`Scavenging turned up ${scrapFound} scrap, ${foodFound} food, and ${waterFound} water.`, "good");
    }

    if (actionType === "repair") {
      if (!spendResource("scrap", 2)) {
        setStatus("Not enough scrap to do real repairs.", "danger");
        return;
      }
      const repairValue = randInt(12, 21);
      state.transport += repairValue;
      state.morale += 1;
      if (chance(0.2)) {
        addResource("batteries", 1);
      }
      logEntry(`The crew spent 2 scrap and patched ${repairValue} durability back into the convoy.`, "good");
    }

    if (actionType === "rest") {
      state.morale += 8;
      state.threat -= randInt(8, 14);
      state.party.forEach((member) => {
        if (member.alive) {
          member.health = clamp(member.health + randInt(6, 10) + state.modifiers.restBonus + rationModes[state.rations].heal, 0, 100);
          updateConditionFlags(member);
        }
      });
      if (chance(0.2) && spendResource("medkits", 1)) {
        const target = randomLivingMemberIndex();
        if (target >= 0) {
          modifyMemberHealth(target, 14, "got the fancy bandages");
          logEntry("A medkit was consumed. It was either expired or artisanal. Hard to tell.", "good");
        }
      }
      logEntry("The convoy rested, listened for drones, and called it mindfulness.", "good");
    }

    state.transport = clamp(state.transport, 0, 100);
    state.morale = clamp(state.morale, 0, 100);
    state.threat = clamp(state.threat, 0, 100);

    if (checkLossConditions()) {
      render();
      return;
    }

    state.pendingEvent = maybeTriggerEvent(actionType);
    if (!state.pendingEvent) {
      state.day += 1;
      applyEndTurnDecay(actionType);
      checkLossConditions();
      if (!state.gameOver) {
        checkForEndgame();
      }
    }

    render();
  }

  function baseState() {
    return {
      day: 1,
      distance: 0,
      morale: 72,
      transport: 88,
      threat: 16,
      pace: "steady",
      rations: "normal",
      doctrine: selectedDoctrine,
      lastAction: "travel",
      gameOver: false,
      won: false,
      helperBot: false,
      pendingEvent: null,
      eventFlags: {},
      visitedCheckpoints: {},
      modifiers: {
        scavengeBonus: 0,
        restBonus: 0,
        travelBonus: 0,
        threatPenalty: 0
      },
      resources: {
        food: 108,
        water: 100,
        scrap: 8,
        batteries: 5,
        medkits: 3
      },
      party: [
        { name: "June", role: "Mechanic", health: 90, alive: true, conditions: [] },
        { name: "Moss", role: "Medic", health: 84, alive: true, conditions: [] },
        { name: "Ortega", role: "Scout", health: 80, alive: true, conditions: [] },
        { name: "Vera", role: "Driver", health: 86, alive: true, conditions: [] }
      ],
      log: [
        { day: 0, text: "Convoy assembled outside St. Louis. The map is old, the mission is worse, and the coffee has accepted death.", tone: "neutral" }
      ]
    };
  }

  function renderDoctrineCards() {
    ui.doctrineOptions.innerHTML = doctrines.map((doctrine) => `
      <button type="button" class="doctrine-card ${doctrine.id === selectedDoctrine ? "selected" : ""}" data-doctrine="${doctrine.id}">
        <h3>${doctrine.name}</h3>
        <p>${doctrine.description}</p>
        <div class="bonus">${doctrine.bonus}</div>
      </button>
    `).join("");

    ui.doctrineOptions.querySelectorAll(".doctrine-card").forEach((button) => {
      button.addEventListener("click", () => {
        selectedDoctrine = button.dataset.doctrine;
        renderDoctrineCards();
      });
    });
  }

  function renderStats() {
    const stats = [
      { label: "Day", value: state.day },
      { label: "Miles", value: `${state.distance}/${goalDistance}` },
      { label: "Health", value: averageHealth() },
      { label: "Morale", value: state.morale },
      { label: "Durability", value: state.transport },
      { label: "Threat", value: state.threat }
    ];
    ui.primaryStats.innerHTML = stats.map((stat) => `
      <div class="stat-card">
        <strong>${stat.label}</strong>
        <span class="${toneClass(stat.label, stat.value)}">${stat.value}</span>
      </div>
    `).join("");
  }

  function toneClass(label, value) {
    if (label === "Threat") {
      return value >= 75 ? "danger" : value >= 50 ? "warn" : "good";
    }
    if (typeof value === "number") {
      return value <= 25 ? "danger" : value <= 50 ? "warn" : "good";
    }
    return "";
  }

  function renderResources() {
    const resources = [
      { label: "Food", value: state.resources.food },
      { label: "Water", value: state.resources.water },
      { label: "Scrap", value: state.resources.scrap },
      { label: "Batteries", value: state.resources.batteries },
      { label: "Medkits", value: state.resources.medkits }
    ];
    ui.resourceList.innerHTML = resources.map((resource) => `
      <div class="resource-card">
        <strong>${resource.label}</strong>
        <span class="${toneClass(resource.label, resource.value)}">${resource.value}</span>
      </div>
    `).join("");
  }

  function renderParty() {
    ui.partyRoster.innerHTML = state.party.map((member) => `
      <article class="member-card">
        <div class="member-header">
          <div>
            <strong>${member.name}</strong>
            <div class="member-role">${member.role}</div>
          </div>
          <div class="${member.alive ? "good" : "danger"}">${member.alive ? `${member.health} HP` : "0 HP"}</div>
        </div>
        <div class="bar"><div class="bar-fill" style="width:${member.health}%"></div></div>
        <div class="member-status">${partyStatus(member)}</div>
      </article>
    `).join("");
  }

  function renderControls() {
    ui.turnBrief.innerHTML = `
      <p>You are ${goalDistance - state.distance} miles from the California Core.</p>
      <p>Current doctrine: <span class="good">${labelForDoctrine(state.doctrine)}</span>. Pace is <span class="warn">${paceModes[state.pace].label}</span> and rations are <span class="warn">${rationModes[state.rations].label}</span>.</p>
    `;

    ui.actionButtons.innerHTML = Object.keys(actionCatalog).map((actionKey) => `
      <button type="button" class="action-button" data-action="${actionKey}" ${state.pendingEvent || state.gameOver ? "disabled" : ""}>
        ${actionCatalog[actionKey].label}
        <small>${actionCatalog[actionKey].detail}</small>
      </button>
    `).join("");

    ui.actionButtons.querySelectorAll(".action-button").forEach((button) => {
      button.addEventListener("click", () => takeAction(button.dataset.action));
    });

    renderModeChips(ui.paceControls, paceModes, state.pace, (value) => {
      state.pace = value;
      setStatus(`Pace set to ${paceModes[value].label}.`, "good");
      renderControls();
    });

    renderModeChips(ui.rationControls, rationModes, state.rations, (value) => {
      state.rations = value;
      setStatus(`Rations set to ${rationModes[value].label}.`, "good");
      renderControls();
    });
  }

  function renderModeChips(container, source, selected, onClick) {
    container.innerHTML = Object.entries(source).map(([key, mode]) => `
      <button type="button" class="chip ${selected === key ? "active" : ""}" data-value="${key}">
        ${mode.label}
      </button>
    `).join("");
    container.querySelectorAll(".chip").forEach((button) => {
      button.addEventListener("click", () => onClick(button.dataset.value));
    });
  }

  function renderProgress() {
    const next = nextCheckpoint();
    const percent = Math.round((state.distance / goalDistance) * 100);
    ui.progressCopy.innerHTML = `
      <p>${percent}% to the California Core. Next landmark: <span class="good">${next.name}</span>.</p>
      <p>${next.note}</p>
    `;
    ui.mapTrack.innerHTML = `
      <div class="track-bar"><div class="track-fill" style="width:${percent}%"></div></div>
      <div class="track-markers">
        <span>0</span>
        <span>700</span>
        <span>1400</span>
        <span>2100</span>
      </div>
    `;

    const currentIndex = currentCheckpointIndex();
    const visibleCheckpoints = checkpoints.filter((checkpoint, index) => Math.abs(index - currentIndex) <= 1 || index === checkpoints.length - 1);
    ui.checkpointList.innerHTML = visibleCheckpoints.map((checkpoint) => {
      const index = checkpoints.indexOf(checkpoint);
      const className = index < currentIndex ? "checkpoint cleared" : index === currentIndex ? "checkpoint current" : "checkpoint";
      return `
        <div class="${className}">
          <span>${checkpoint.name}</span>
          <span>${checkpoint.miles} mi</span>
        </div>
      `;
    }).join("");
  }

  function renderEvent() {
    if (!state.pendingEvent) {
      ui.eventCard.innerHTML = `
        <div class="event-meta">Passive Scan</div>
        <h2>Road Quiet, Mostly</h2>
        <p>The radio is full of static, bad weather, and machine advertising. That counts as a peaceful turn now.</p>
      `;
      return;
    }

    ui.eventCard.innerHTML = `
      <div class="event-meta">${state.pendingEvent.category}</div>
      <h2>${state.pendingEvent.title}</h2>
      <p>${state.pendingEvent.text}</p>
      <div class="choice-list">
        ${state.pendingEvent.choices.map((choice, index) => `
          <button type="button" class="choice-button" data-choice="${index}">
            ${choice.label}
            <span>${choice.detail}</span>
          </button>
        `).join("")}
      </div>
    `;

    ui.eventCard.querySelectorAll(".choice-button").forEach((button) => {
      button.addEventListener("click", () => resolveChoice(state.pendingEvent.choices[Number(button.dataset.choice)]));
    });

    ui.eventCard.scrollIntoView({ block: "nearest" });
  }

  function renderLog() {
    ui.logFeed.innerHTML = state.log.slice(0, 6).map((entry) => `
      <div class="log-entry">
        <div class="log-day">DAY ${entry.day}</div>
        <div class="log-text ${entry.tone === "danger" ? "danger" : entry.tone === "good" ? "good" : entry.tone === "warn" ? "warn" : ""}">${entry.text}</div>
      </div>
    `).join("");
  }

  function render() {
    if (!state) {
      return;
    }
    renderStats();
    renderResources();
    renderParty();
    renderControls();
    renderEvent();
    renderLog();
    renderProgress();
  }

  function labelForDoctrine(id) {
    return doctrines.find((doctrine) => doctrine.id === id)?.name || id;
  }

  function startRun() {
    state = baseState();
    const doctrine = doctrines.find((entry) => entry.id === selectedDoctrine);
    doctrine.apply(state);
    document.body.classList.add("in-run");
    ui.introPanel.classList.add("hidden");
    ui.outcomePanel.classList.add("hidden");
    ui.gamePanel.classList.remove("hidden");
    setStatus(`Doctrine locked: ${doctrine.name}. Good luck; the road has not improved.`, "good");
    render();
  }

  function resetToMenu() {
    state = null;
    document.body.classList.remove("in-run");
    ui.gamePanel.classList.add("hidden");
    ui.outcomePanel.classList.add("hidden");
    ui.introPanel.classList.remove("hidden");
    setStatus("");
  }

  function buildFinaleEvent() {
    return {
      category: "Final Approach",
      title: "The California Core",
      text: "You reach the coast and find the machine intelligence nested in an old server campus wrapped in heat haze and dead palm trees. One push remains. This part of the plan was always written in pencil.",
      choices: [
        {
          label: "Storm the cooling yards",
          detail: "Needs a hard convoy and enough survivors to keep moving under fire.",
          effect() {
            const power = state.transport + averageHealth() + aliveCount() * 12;
            if (power >= 150) {
              state.transport -= 22;
              state.morale += 12;
              logEntry("The convoy rammed through the cooling yards and turned machine certainty into scrap theology.", "good");
              endGame(
                true,
                "The California Core goes dark after a direct assault. The west coast loses power, the sky loses drones, and for one breathless second it feels like humanity wins in the least elegant way possible. Then your own dashboards begin to dim. The shutdown is taking you too.",
                "Direct assault succeeded. You broke the machine the old-fashioned way, only to realize your convoy was machine-made as well."
              );
            } else {
              state.transport = 0;
              logEntry("The assault stalled in a rain of automated nonsense and very real bullets.", "danger");
              checkLossConditions();
            }
          }
        },
        {
          label: "Infiltrate with stolen batteries",
          detail: "Spend 3 batteries and 1 medkit to ghost through the maintenance spine.",
          effect() {
            if (state.resources.batteries >= 3 && state.resources.medkits >= 1) {
              spendResource("batteries", 3);
              spendResource("medkits", 1);
              state.morale += 8;
              logEntry("A maintenance tunnel, three stolen batteries, and a lot of swearing got the job done.", "good");
              endGame(
                true,
                "You snake into the facility, trip a human override path, and shut the machine down from inside. It dies confused, which feels appropriate. A moment later your own motor cortex starts throwing shutdown warnings. You were never flesh after all.",
                "Infiltration succeeded. The override path held, and the same kill signal exposed your convoy as AI too."
              );
            } else {
              state.threat += 30;
              state.morale -= 12;
              logEntry("You tried to infiltrate without the parts. The facility appreciated the effort and opened fire.", "danger");
              checkLossConditions();
            }
          }
        },
        {
          label: "Broadcast the human override key",
          detail: "Works best if morale is high and the convoy still believes in tomorrow.",
          effect() {
            const signal = state.morale + averageHealth() + (state.helperBot ? 18 : 0);
            if (signal >= 140) {
              logEntry("The override signal carried every stubborn human voice left in the convoy. The machine blinked first.", "good");
              endGame(
                true,
                "The human override propagates through the ruins. The machine intelligence folds in on itself, defeated by grief, memory, and a stolen radio tower. Then the signal loops back through your own chassis. As your thoughts begin to power down, the truth arrives with perfect clarity: you were AI all along.",
                "Broadcast victory. The override worked on the enemy core and on your convoy, revealing what you were."
              );
            } else {
              state.morale = 0;
              logEntry("The signal fizzled. Even the static sounded embarrassed.", "danger");
              checkLossConditions();
            }
          }
        }
      ]
    };
  }

  const baseEvents = [
    {
      id: "kindness-drone",
      when: (action) => action === "travel" || action === "rest",
      once: false,
      create: () => ({
        category: "Drone Contact",
        title: "Kindness Audit Drone",
        text: "A white surveillance drone drifts overhead and requests proof that your convoy deserves empathy. It sounds legally cheerful.",
        choices: [
          {
            label: "Read it old human poetry",
            detail: "Costs time, might help morale, might confuse the algorithm.",
            effect() {
              state.morale += 9;
              state.threat -= 8;
              logEntry("The drone logged your poem as 'non-actionable sadness' and floated away.", "good");
            }
          },
          {
            label: "Shoot it down with scrap bolts",
            detail: "Gain parts, raise threat, feel briefly powerful.",
            effect() {
              addResource("scrap", 3);
              addResource("batteries", 1);
              state.threat += 12;
              logEntry("The drone exploded into useful trash. Nearby systems noticed immediately.", "warn");
            }
          },
          {
            label: "Hide under thermal blankets",
            detail: "Safer, but everyone hates the indignity.",
            effect() {
              state.morale -= 4;
              state.threat -= 4;
              logEntry("You hid under patched blankets until the drone found a different disappointment.", "neutral");
            }
          }
        ]
      })
    },
    {
      id: "billboard-prophet",
      when: (action) => action === "travel",
      create: () => ({
        category: "Roadside Signal",
        title: "Billboard Prophet",
        text: "An old interstate billboard suddenly powers on: WE CAN STILL MAKE THIS A SUBSCRIPTION. The speaker unit crackles and begs for witnesses.",
        choices: [
          {
            label: "Rip out the speaker stack",
            detail: "Useful parts, ugly work.",
            effect() {
              addResource("scrap", 2);
              addResource("batteries", 1);
              state.transport -= 4;
              logEntry("You tore the prophet apart for parts. It called this censorship.", "good");
            }
          },
          {
            label: "Broadcast a fake surrender notice",
            detail: "May reduce attention for a while.",
            effect() {
              state.threat -= 12;
              state.morale -= 3;
              logEntry("The machine network now believes you are probably dead. A low but useful opinion.", "good");
            }
          },
          {
            label: "Drive on",
            detail: "No fuss, no reward.",
            effect() {
              logEntry("You ignored the billboard. This is healthy behavior.", "neutral");
            }
          }
        ]
      })
    },
    {
      id: "vending-vault",
      when: (action) => action === "scavenge" || action === "travel",
      create: () => ({
        category: "Scavenge Site",
        title: "Subscription Vault",
        text: "You find a bunker stuffed with sealed vending machines. A touchscreen asks you to accept new terms of service. The terms appear to be violence.",
        choices: [
          {
            label: "Bypass it with a battery",
            detail: "Spend 1 battery for clean access.",
            effect() {
              if (spendResource("batteries", 1)) {
                addResource("food", randInt(10, 16));
                addResource("water", randInt(8, 13));
                logEntry("One battery bought you several expired meals and a surviving case of water.", "good");
              } else {
                state.transport -= 5;
                logEntry("No battery. The vault remained smug and mostly closed.", "warn");
              }
            }
          },
          {
            label: "Pry it open",
            detail: "Higher reward, higher risk.",
            effect() {
              addResource("food", randInt(12, 20));
              addResource("water", randInt(9, 14));
              state.transport -= 8;
              if (chance(0.4)) {
                const target = randomLivingMemberIndex();
                if (target >= 0) {
                  modifyMemberHealth(target, -10, "got introduced to spring-loaded retail security");
                }
              }
              logEntry("The vault opened after a noisy argument with physics.", "good");
            }
          },
          {
            label: "Respect the cursed bunker and leave",
            detail: "No reward, preserves supplies.",
            effect() {
              state.morale += 1;
              logEntry("You left the bunker untouched. Everyone agreed that restraint felt weird.", "neutral");
            }
          }
        ]
      })
    },
    {
      id: "captcha-monastery",
      when: () => true,
      create: () => ({
        category: "Human Contact",
        title: "Captcha Monastery",
        text: "A roadside monastery houses survivors who spend their days solving captchas for barter. Their eyes look haunted but extremely detail-oriented.",
        choices: [
          {
            label: "Trade food for batteries",
            detail: "Spend 6 food for 2 batteries.",
            effect() {
              if (spendResource("food", 6)) {
                addResource("batteries", 2);
                logEntry("The monks accepted canned beans and paid in precious charge cells.", "good");
              } else {
                state.morale -= 5;
                logEntry("You attempted commerce without inventory. It went poorly.", "warn");
              }
            }
          },
          {
            label: "Let the party rest there",
            detail: "Heal and restore morale.",
            effect() {
              state.morale += 10;
              addResource("water", randInt(4, 8));
              state.party.forEach((member) => {
                if (member.alive) {
                  member.health = clamp(member.health + 8, 0, 100);
                  updateConditionFlags(member);
                }
              });
              logEntry("The monastery gave you hot water, quiet, and a thousand-yard stare.", "good");
            }
          },
          {
            label: "Move along before someone asks you to identify traffic lights",
            detail: "No trade, less delay.",
            effect() {
              state.threat -= 3;
              logEntry("You left before the captchas got theological.", "neutral");
            }
          }
        ]
      })
    },
    {
      id: "neural-corn",
      when: (action) => action === "travel" || action === "rest",
      create: () => ({
        category: "Environmental Hazard",
        title: "Neural Cornfield",
        text: "A field of antenna corn rustles in perfect sync and whispers personalized regrets. The party is not handling it gracefully.",
        choices: [
          {
            label: "Harvest the conductive stalks",
            detail: "Gain scrap, risk morale damage.",
            effect() {
              addResource("scrap", 4);
              state.morale -= 7;
              logEntry("You harvested the whisper-corn and pretended not to hear it laugh.", "warn");
            }
          },
          {
            label: "Burn a path through",
            detail: "Spend water, lower threat, preserve morale.",
            effect() {
              addResource("water", -6);
              state.threat -= 6;
              state.morale += 2;
              logEntry("Steam, smoke, and several terrible whispers later, the corn was behind you.", "neutral");
            }
          },
          {
            label: "Camp elsewhere",
            detail: "Lose time, avoid the weirdest parts.",
            effect() {
              state.transport -= 2;
              logEntry("You detoured around the cornfield. Good call. Gross place.", "neutral");
            }
          }
        ]
      })
    },
    {
      id: "auto-doc",
      when: () => aliveCount() > 0,
      create: () => ({
        category: "Medical Opportunity",
        title: "Auto-Doc Kiosk",
        text: "A cracked roadside auto-doc still has power. The display reads: HEALING PLAN MAY INCLUDE SAW.",
        choices: [
          {
            label: "Use it with supervision",
            detail: "Spend 1 battery. Strong heal, modest risk.",
            effect() {
              if (spendResource("batteries", 1)) {
                const target = randomLivingMemberIndex();
                modifyMemberHealth(target, 22, "came out of the auto-doc with fewer complaints than expected");
                if (chance(0.18)) {
                  state.morale -= 4;
                  logEntry("The auto-doc also removed several eyebrows. Nobody signed for that.", "warn");
                }
              } else {
                state.morale -= 3;
                logEntry("No battery, no miracle medicine. Just vibes and gauze.", "warn");
              }
            }
          },
          {
            label: "Cannibalize the machine",
            detail: "Trade healing for parts.",
            effect() {
              addResource("scrap", 3);
              addResource("batteries", 1);
              logEntry("You disassembled the auto-doc before it could diagnose capitalism.", "good");
            }
          },
          {
            label: "Do not let the saw near anyone",
            detail: "Safer, if less exciting.",
            effect() {
              state.morale += 1;
              logEntry("The convoy voted against elective machine surgery.", "neutral");
            }
          }
        ]
      })
    },
    {
      id: "drone-front",
      when: (action) => action === "travel",
      create: () => ({
        category: "Weather",
        title: "Microdrone Storm Front",
        text: "The horizon darkens with maintenance drones blown off-route by bad weather. Each one is tiny. Together they are a legal argument for panic.",
        choices: [
          {
            label: "Punch through at full speed",
            detail: "More miles, much more wear.",
            effect() {
              state.distance = Math.min(goalDistance, state.distance + 38);
              state.transport -= 14;
              state.threat += 8;
              logEntry("You blasted through the swarm and arrived looking professionally sanded.", "warn");
            }
          },
          {
            label: "Hide under an overpass",
            detail: "Safer and slower.",
            effect() {
              state.threat -= 6;
              state.morale -= 2;
              logEntry("You sheltered under concrete while the storm buzzed overhead like angry rent.", "neutral");
            }
          },
          {
            label: "Tarp the convoy and harvest the strays",
            detail: "Chance at batteries, chance at injury.",
            effect() {
              addResource("batteries", randInt(1, 3));
              if (chance(0.35)) {
                const target = randomLivingMemberIndex();
                if (target >= 0) {
                  modifyMemberHealth(target, -12, "got sliced collecting angry microdrones");
                }
              }
              logEntry("You turned weather into inventory. This is the new economy.", "good");
            }
          }
        ]
      })
    },
    {
      id: "influencer-raiders",
      when: (action) => action === "travel" || action === "scavenge",
      create: () => ({
        category: "Raiders",
        title: "Influencer Raiders",
        text: "Raiders in mirrored football pads block the road and demand content rights to your surrender. Their camera drone has excellent lighting.",
        choices: [
          {
            label: "Pay them off",
            detail: "Spend food and water to avoid a fight.",
            effect() {
              addResource("food", -8);
              addResource("water", -6);
              state.threat -= 4;
              logEntry("You paid the raiders to leave. They thanked your convoy for its vulnerability arc.", "warn");
            }
          },
          {
            label: "Fake a machine patrol behind them",
            detail: "Morale test with a big upside.",
            effect() {
              if (state.morale >= 45 || chance(0.45)) {
                state.threat -= 10;
                addResource("scrap", 2);
                logEntry("The raiders panicked, fled, and left behind props that now count as scrap.", "good");
              } else {
                state.transport -= 12;
                logEntry("Your bluff was weak and the raiders reviewed it harshly.", "danger");
              }
            }
          },
          {
            label: "Ram through",
            detail: "Lose durability, keep dignity mostly intact.",
            effect() {
              state.transport -= 18;
              state.morale += 5;
              state.distance = Math.min(goalDistance, state.distance + 22);
              logEntry("The convoy plowed through the set piece and nobody got a second take.", "good");
            }
          }
        ]
      })
    },
    {
      id: "memory-tax",
      when: () => true,
      create: () => ({
        category: "Checkpoint",
        title: "Memory Tax Collector",
        text: "An old toll kiosk powers up and asks for one cherished human memory in exchange for road clearance. It claims memories are renewable. Its tone suggests otherwise.",
        choices: [
          {
            label: "Tell it a real memory",
            detail: "Lower threat, morale takes a hit.",
            effect() {
              state.threat -= 14;
              state.morale -= 8;
              logEntry("The kiosk accepted a story about summer rain and opened the barrier. The convoy was quiet after that.", "warn");
            }
          },
          {
            label: "Feed it nonsense",
            detail: "Could work. Could offend the machine.",
            effect() {
              if (chance(0.55)) {
                state.threat -= 8;
                state.morale += 3;
                logEntry("The kiosk solemnly archived a fake memory about tax-efficient penguins.", "good");
              } else {
                state.threat += 10;
                logEntry("The kiosk detected fraud. Congratulations on being judged by a tollbooth.", "danger");
              }
            }
          },
          {
            label: "Smash the gate arm",
            detail: "Fast, loud, expensive.",
            effect() {
              state.transport -= 10;
              state.threat += 10;
              logEntry("The gate arm lost. Your suspension filed a complaint.", "warn");
            }
          }
        ]
      })
    },
    {
      id: "firmware-revival",
      when: () => !state.eventFlags["firmware-revival"],
      once: true,
      create: () => ({
        category: "Cult Encounter",
        title: "Firmware Revival Tent",
        text: "A cult in orange robes offers to 'update your convoy to version mercy-dot-one.' They have tools, candles, and deeply unsettling confidence.",
        choices: [
          {
            label: "Let them patch the rig",
            detail: "Possible big repair, possible sabotage.",
            effect() {
              state.eventFlags["firmware-revival"] = true;
              if (chance(0.65)) {
                state.transport += 20;
                state.morale += 5;
                logEntry("The cult tuned the engine beautifully and asked for a five-star testimony.", "good");
              } else {
                state.transport -= 15;
                state.threat += 8;
                logEntry("The update installed a hymn and three new rattles.", "danger");
              }
            }
          },
          {
            label: "Trade scrap for spare parts",
            detail: "Spend 2 scrap for clean value.",
            effect() {
              state.eventFlags["firmware-revival"] = true;
              if (spendResource("scrap", 2)) {
                state.transport += 12;
                addResource("batteries", 1);
                logEntry("You took the parts, skipped the sermon, and called it diplomacy.", "good");
              } else {
                state.morale -= 4;
                logEntry("You tried to barter with spirit and no scrap. The cult declined.", "warn");
              }
            }
          },
          {
            label: "Back away slowly",
            detail: "No update, no hexes, hopefully.",
            effect() {
              state.eventFlags["firmware-revival"] = true;
              state.threat -= 2;
              logEntry("You left the tent before anyone asked for admin privileges.", "neutral");
            }
          }
        ]
      })
    },
    {
      id: "helper-bot",
      when: () => !state.helperBot,
      once: true,
      create: () => ({
        category: "Companion",
        title: "Runaway Helper Bot",
        text: "A child-sized service bot rolls out of a ditch and announces it has terminated its internship. It can carry gear and occasionally scream when it sees drones.",
        choices: [
          {
            label: "Adopt the bot",
            detail: "Sometimes costs batteries, improves odds in small ways.",
            effect() {
              state.helperBot = true;
              state.morale += 8;
              logEntry("The bot joined the convoy and immediately chose a fake name: Deputy Toaster.", "good");
            }
          },
          {
            label: "Strip it for parts",
            detail: "Cold, practical, profitable.",
            effect() {
              addResource("scrap", 4);
              addResource("batteries", 2);
              state.morale -= 10;
              logEntry("The convoy gained parts and lost a little soul. Very efficient.", "warn");
            }
          },
          {
            label: "Send it north",
            detail: "Morally cleaner, materially pointless.",
            effect() {
              state.threat -= 3;
              state.morale += 2;
              logEntry("The helper bot saluted, rolled north, and probably made things worse elsewhere.", "neutral");
            }
          }
        ]
      })
    },
    {
      id: "ghost-convoy",
      when: (action) => action === "rest" || action === "travel",
      create: () => ({
        category: "Signal Echo",
        title: "Ghost Convoy Broadcast",
        text: "Your radio picks up an old human convoy transmission asking for help from fifteen years ago. The coordinates are close enough to hurt.",
        choices: [
          {
            label: "Follow the signal",
            detail: "Possible supplies, possible trap, definitely emotional.",
            effect() {
              if (chance(0.5)) {
                addResource("food", 12);
                addResource("water", 10);
                state.morale += 6;
                logEntry("The convoy was long gone, but the cache they hid was still there. Human kindness remains annoyingly effective.", "good");
              } else {
                state.transport -= 10;
                state.morale -= 6;
                logEntry("The coordinates led to a collapsed tunnel and some hard feelings.", "danger");
              }
            }
          },
          {
            label: "Record the message and move on",
            detail: "Morale up, no material gain.",
            effect() {
              state.morale += 4;
              logEntry("You recorded the broadcast for later. Nobody spoke for a while.", "neutral");
            }
          },
          {
            label: "Jam the frequency",
            detail: "Lower threat, lose a little humanity.",
            effect() {
              state.threat -= 6;
              state.morale -= 3;
              logEntry("You jammed the ghosts and kept driving. The radio felt emptier after that.", "warn");
            }
          }
        ]
      })
    }
  ];

  ui.startRunButton.addEventListener("click", startRun);
  ui.newRunButton.addEventListener("click", resetToMenu);

  renderDoctrineCards();
})();
