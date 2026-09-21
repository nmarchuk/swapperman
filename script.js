// Swapperman — site scripts

document.addEventListener('DOMContentLoaded', function () {

  // Footer year
  var year = document.getElementById('year');
  if (year) {
    year.textContent = new Date().getFullYear();
  }

  // ==========================================================================
  // Players
  // ==========================================================================

  // Source of truth. Each player is an object so more fields (role, score,
  // status...) can be hung off it later without touching the render logic.
  // team is 'left', 'right', or null for unassigned.
  var players = [];
  var nextId = 1;

  // Ids of the unassigned players currently picked, in click order. Clicking a
  // card adds or removes it, so a whole group can be seated in one press.
  // Assignment is one-way: once a player is on a camp they can only be deleted.
  var selectedIds = [];

  function isSelected(id) {
    return selectedIds.indexOf(id) !== -1;
  }

  function toggleSelected(id) {
    var at = selectedIds.indexOf(id);
    if (at === -1) {
      selectedIds.push(id);
    } else {
      selectedIds.splice(at, 1);
    }
  }

  function clearSelection() {
    selectedIds = [];
  }

  // A pick only stands while the player is still on the roster and still
  // unassigned, so deleting or seating someone drops them from the selection.
  // Sole owner of that clean-up — the paths that remove or seat players don't
  // each have to remember to prune.
  function pruneSelection() {
    selectedIds = selectedIds.filter(function (id) {
      var p = playerById(id);
      return !!p && p.team === null;
    });
  }

  // Camps in play: two by default, three when the switch above the roster is
  // flipped. The third camp turns a two-way swap into a rotation, since three
  // players from three camps can move round the ring either way.
  var teamCount = 2;

  // Every camp the page has markup for, in the order they sit on screen.
  var ALL_TEAMS = ['left', 'middle', 'right'];

  // Everything that walks the camps goes through this, so in a two-camp game
  // the middle camp simply isn't there.
  function activeTeams() {
    return teamCount === 3 ? ALL_TEAMS : ['left', 'right'];
  }

  function isActiveTeam(team) {
    return activeTeams().indexOf(team) !== -1;
  }

  // Next camp round the ring. dir is 1 for clockwise — left, middle, right and
  // back to left, the order they're laid out — and -1 for the other way. With
  // two camps either direction just gives the other camp.
  function stepTeam(team, dir) {
    var order = activeTeams();
    var at = order.indexOf(team);
    if (at === -1) {
      return team;
    }
    return order[(at + dir + order.length) % order.length];
  }

  function otherTeams(team) {
    return activeTeams().filter(function (t) {
      return t !== team;
    });
  }

  var form = document.getElementById('player-form');
  var input = document.getElementById('player-input');
  var empty = document.getElementById('players-empty');

  var grids = {
    left: document.getElementById('left-grid'),
    middle: document.getElementById('middle-grid'),
    none: document.getElementById('none-grid'),
    right: document.getElementById('right-grid')
  };

  var counts = {
    left: document.getElementById('left-count'),
    middle: document.getElementById('middle-count'),
    right: document.getElementById('right-count')
  };

  var teamNames = {
    left: document.getElementById('team-left-name'),
    middle: document.getElementById('team-middle-name'),
    right: document.getElementById('team-right-name')
  };

  var campTotals = {
    left: document.getElementById('left-total'),
    middle: document.getElementById('middle-total'),
    right: document.getElementById('right-total')
  };

  var assignButtons = {
    left: document.getElementById('assign-left'),
    middle: document.getElementById('assign-middle'),
    right: document.getElementById('assign-right')
  };

  var assignLabels = {
    left: document.getElementById('assign-left-label'),
    middle: document.getElementById('assign-middle-label'),
    right: document.getElementById('assign-right-label')
  };

  var assignCounts = {
    left: document.getElementById('assign-left-count'),
    middle: document.getElementById('assign-middle-count'),
    right: document.getElementById('assign-right-count')
  };

  // Third-camp markup that is shown or hidden with the camp count
  var middlePanel = document.getElementById('team-middle-panel');
  var middleRolesColumn = document.getElementById('roles-middle-column');

  var campCountButtons = Array.prototype.slice.call(
    document.querySelectorAll('#camp-count .camp-count-btn')
  );

  // ==========================================================================
  // Roles
  // ==========================================================================

  // Loaded from roles.json
  var roles = [];
  // True only when the user uploaded their own set. The default set is never
  // persisted, so edits to roles.json always reach the site on next load.
  var rolesCustom = false;

  // Role names picked per camp, in click order. Arrays rather than Sets so
  // that shrinking a camp can drop the most recent picks first.
  var picked = { left: [], middle: [], right: [] };

  var rolesStatus = document.getElementById('roles-status');
  var rolesColumns = document.getElementById('roles-columns');
  var rolesSource = document.getElementById('roles-source');
  var rolesFileInput = document.getElementById('roles-file');

  var roleLists = {
    left: document.getElementById('roles-left-list'),
    middle: document.getElementById('roles-middle-list'),
    right: document.getElementById('roles-right-list')
  };

  var roleProgress = {
    left: document.getElementById('roles-left-progress'),
    middle: document.getElementById('roles-middle-progress'),
    right: document.getElementById('roles-right-progress')
  };

  var roleTeamNames = {
    left: document.getElementById('roles-left-name'),
    middle: document.getElementById('roles-middle-name'),
    right: document.getElementById('roles-right-name')
  };

  // ==========================================================================
  // Reveal mode
  // ==========================================================================

  // While on, roles are hidden everywhere and clicking a player shows their
  // role full screen instead — for walking players up one at a time.
  var revealMode = false;

  var revealBar = document.getElementById('reveal-bar');
  var revealToggle = document.getElementById('reveal-toggle');
  var revealBarHint = document.getElementById('reveal-bar-hint');
  var revealModal = document.getElementById('reveal-modal');
  var revealPlayer = document.getElementById('reveal-player');
  var revealRole = document.getElementById('reveal-role');
  var revealDesc = document.getElementById('reveal-desc');
  var rolesPanel = document.getElementById('roles');
  var setupPanel = document.getElementById('setup');

  // 'setup' while building the game, 'playing' once it starts. Kept on this
  // page rather than a second one so the roster and roles survive the switch.
  var phase = 'setup';

  var startBtn = document.getElementById('start-game');
  // Optional: safe to delete or comment out the button in index.html
  var loadTestBtn = document.getElementById('load-test');
  var newGameBtn = document.getElementById('new-game');
  var resetAllBtn = document.getElementById('reset-all');
  var gameBar = document.getElementById('game-bar');
  var gameBarText = document.getElementById('game-bar-text');
  var clearActionsBtn = document.getElementById('clear-actions');
  var endRoastBtn = document.getElementById('end-roasting');
  var swapBtn = document.getElementById('swap-camps');
  var rotateCwBtn = document.getElementById('rotate-cw');
  var rotateCcwBtn = document.getElementById('rotate-ccw');

  var nightPanel = document.getElementById('night-order');
  var runnerPosition = document.getElementById('runner-position');
  var runnerStep = document.getElementById('runner-step');
  var runnerPrev = document.getElementById('runner-prev');
  var runnerNext = document.getElementById('runner-next');
  var runnerEnd = document.getElementById('runner-end');

  // Where the host is in tonight's order. Two values because the cursor has to
  // survive the list changing underneath it: nightOrder() is re-derived on
  // every render, and flipping a roast/burn toggle can move a burn-gated role
  // in or out of the set mid-night. The key is the real anchor; the position
  // is only the fallback for when the anchored step no longer exists.
  var currentStepKey = null;
  var currentStepPos = 0;

  var campTools = document.getElementById('camp-tools');
  var infiltrateBtn = document.getElementById('assign-infiltrators');
  var infiltrateHint = document.getElementById('infiltrate-hint');
  var infiltrateCountSelect = document.getElementById('infiltrator-count');

  // How many infiltrators to plant per camp when the button is pressed
  var infiltratorCount = 1;

  var autoAssignBtn = document.getElementById('auto-assign');
  var clearAssignBtn = document.getElementById('clear-assign');
  var assignHint = document.getElementById('assign-roles-hint');

  function key(team) {
    return team === null ? 'none' : team;
  }

  function addPlayer(name) {
    // team is where the player physically sits; alignment is the camp they are
    // actually loyal to, which an infiltrator flips.
    // lockedRole: pinned by hand before the roll. role: what they ended up with.
    players.push({
      id: nextId++,
      name: name,
      team: null,
      alignment: null,
      lockedRole: null,
      role: null,
      // Their choice for the night: 'roast', 'burn', or null for undecided
      action: null,
      marshmallows: 0,
      // Event log, in order. Entries are either
      //   { type: 'night', action: 'roast' | 'burn' | null }
      //   { type: 'swap',  team: 'left' | 'right' }   the camp they moved to
      history: [],
      // Whether they began the game loyal to the other camp
      startedAsInfiltrator: false,
      // Only meaningful for once-per-game roles
      usedAbility: false,
      // Free-text note the moderator can jot during the game
      reminder: ''
    });
  }

  function removePlayer(id) {
    players = players.filter(function (p) {
      return p.id !== id;
    });
  }

  function assignPlayer(player, team) {
    player.team = team;
    // Loyal to their own camp until infiltrators are drawn
    player.alignment = team;
  }

  // Seats everyone picked, in roster order rather than the order they were
  // clicked, so the camp fills the way the unassigned row reads.
  function assignSelected(team) {
    if (!isActiveTeam(team)) {
      return;
    }

    players.forEach(function (p) {
      if (p.team === null && isSelected(p.id)) {
        assignPlayer(p, team);
      }
    });

    clearSelection();
  }

  function unassignedPlayers() {
    return players.filter(function (p) {
      return p.team === null;
    });
  }

  // Some players in each camp are secretly loyal to another camp. Re-running
  // redraws them all, so everyone resets to their own camp first.
  function assignInfiltrators(count) {
    // Default to one so existing callers (e.g. the test fixture) are unaffected
    count = (typeof count === 'number' && count > 0) ? count : 1;

    activeTeams().forEach(function (team) {
      var roster = teamPlayers(team);
      if (!roster.length) {
        return;
      }

      roster.forEach(function (p) {
        p.alignment = team;
      });

      // Can't have more moles than the camp has players
      var n = Math.min(count, roster.length);
      // With three camps a camp's moles are dealt round the other two rather
      // than all defecting to the same place. Shuffled so which camp gets the
      // odd one out isn't fixed.
      var targets = shuffle(otherTeams(team));

      shuffle(roster).slice(0, n).forEach(function (mole, i) {
        mole.alignment = targets[i % targets.length];
      });
    });
  }

  // Ids picked for a camp move during play. Two players from different camps
  // trade places; with three camps in play, three players from three camps can
  // instead rotate round the ring.
  var swapSelection = [];

  function maxSwapPicks() {
    return teamCount === 3 ? 3 : 2;
  }

  function playerById(id) {
    return players.find(function (p) {
      return p.id === id;
    }) || null;
  }

  function toggleSwapSelection(id) {
    var at = swapSelection.indexOf(id);

    if (at !== -1) {
      swapSelection.splice(at, 1);
      return;
    }

    // Keep the most recent picks, dropping the oldest once the cap is hit
    swapSelection.push(id);
    while (swapSelection.length > maxSwapPicks()) {
      swapSelection.shift();
    }
  }

  // True only when every pick is seated and no two share a camp — the shape
  // both a swap and a rotation need. Returns null otherwise.
  function selectionTeams() {
    var seen = [];

    for (var i = 0; i < swapSelection.length; i++) {
      var p = playerById(swapSelection[i]);
      if (!p || p.team === null || seen.indexOf(p.team) !== -1) {
        return null;
      }
      seen.push(p.team);
    }

    return seen;
  }

  // Two players, one from each of two camps
  function canSwap() {
    return swapSelection.length === 2 && selectionTeams() !== null;
  }

  // Three camps in play and one player picked in each — the only shape a
  // three-way rotation makes sense for.
  function canRotate() {
    return teamCount === 3 &&
      swapSelection.length === 3 &&
      selectionTeams() !== null;
  }

  // Trades the two players' camps. Alignment is untouched — where someone
  // sits and who they're loyal to are separate things.
  function swapSelected() {
    var a = playerById(swapSelection[0]);
    var b = playerById(swapSelection[1]);

    var aTeam = a.team;
    a.team = b.team;
    b.team = aTeam;

    [a, b].forEach(function (p) {
      if (!p.history) {
        p.history = [];
      }
      p.history.push({ type: 'swap', team: p.team });
    });

    swapSelection = [];
  }

  // Moves each of the three picked players one camp round the ring, so all
  // three land somewhere new in a single step. Like a two-way swap, alignment
  // is untouched — only where they sit changes.
  function rotateSelected(dir) {
    var moving = swapSelection.map(function (id) {
      return playerById(id);
    });

    // Read every destination before moving anyone, or the second player would
    // be stepped on from a camp they had already been shifted into.
    var destinations = moving.map(function (p) {
      return stepTeam(p.team, dir);
    });

    moving.forEach(function (p, i) {
      p.team = destinations[i];
      if (!p.history) {
        p.history = [];
      }
      p.history.push({ type: 'swap', team: p.team });
    });

    swapSelection = [];
  }

  // "Camp Yellow → Camp Purple → Camp Green → Camp Yellow", so a rotate button
  // spells out which way the players actually move rather than leaving the
  // arrow glyph to be interpreted.
  function rotationLabel(dir) {
    var order = activeTeams();
    var names = (dir === 1 ? order : order.slice().reverse()).map(function (team) {
      return campName(team);
    });
    return names.concat(names[0]).join(' → ');
  }

  function marshmallowsOf(player) {
    return typeof player.marshmallows === 'number' ? player.marshmallows : 0;
  }

  // Manual correction by the moderator. Marshmallows never go below zero, so
  // the recorded delta is the change that actually landed.
  function adjustMarshmallows(player, delta) {
    var before = marshmallowsOf(player);
    var after = Math.max(0, before + delta);
    var applied = after - before;

    if (applied === 0) {
      return;
    }

    player.marshmallows = after;

    if (!player.history) {
      player.history = [];
    }
    player.history.push({ type: 'adjust', delta: applied });
  }

  // Totalled by where players physically sit, not who they're loyal to
  function campMarshmallows(team) {
    return teamPlayers(team).reduce(function (sum, p) {
      return sum + marshmallowsOf(p);
    }, 0);
  }

  // Roasters take a marshmallow, burners take none, and the night's choices
  // are cleared ready for the next one.
  function endRoastingPhase() {
    players.forEach(function (p) {
      if (p.team === null) {
        return;
      }
      if (p.action === 'roast') {
        p.marshmallows = marshmallowsOf(p) + 1;
      }
      if (!p.history) {
        p.history = [];
      }
      p.history.push({ type: 'night', action: p.action });
      p.action = null;
    });
  }

  // Test fixture: a complete six-player game, one press from starting.
  var TEST_NAMES = ['Rowan', 'Anna', 'Nick', 'Ava', 'Jaimey', 'Connor'];

  function loadTestGame() {
    players = [];
    nextId = 1;
    clearSelection();

    var camps = activeTeams();

    TEST_NAMES.forEach(function (name, i) {
      addPlayer(name);
      var p = players[players.length - 1];
      // Round-robin, so six names come out three-a-side or two-a-side
      p.team = camps[i % camps.length];
      p.alignment = p.team;
    });

    // One distinct role per player, dealt out camp by camp
    var chosen = shuffle(roles).slice(0, TEST_NAMES.length).map(function (r) {
      return r.name;
    });
    camps.forEach(function (team) {
      picked[team] = chosen.splice(0, teamSize(team));
    });

    autoAssign();
    assignInfiltrators();
  }

  // Head count of every camp in play, in display order
  function campSizes() {
    return activeTeams().map(function (team) {
      return teamSize(team);
    });
  }

  // Everyone on a camp has a role in hand
  // Camps must be within one player of each other — no lopsided games
  function campsBalanced() {
    var sizes = campSizes();
    return Math.max.apply(null, sizes) - Math.min.apply(null, sizes) <= 1;
  }

  function everyCampStaffed() {
    return campSizes().every(function (n) {
      return n > 0;
    });
  }

  function readyToStart() {
    var seated = players.filter(function (p) {
      return p.team !== null;
    });
    return seated.length > 0 &&
      everyCampStaffed() &&
      campsBalanced() &&
      seated.every(function (p) {
        return p.role !== null;
      });
  }

  // Tooltip explaining why Start is disabled, empty once the game can begin
  function startButtonReason() {
    if (readyToStart()) {
      return '';
    }
    if (!everyCampStaffed()) {
      return 'Every camp needs at least one player.';
    }
    if (!campsBalanced()) {
      return 'Camps must be equal, or differ by at most one player (' +
        campSizes().join(' vs ') + ').';
    }
    return 'Every player on a camp needs a role.';
  }

  // Single owner of what's on screen. Reveal mode is a setup-phase tool only —
  // it can't be reached once the game starts.
  // Shows or hides everything belonging to the third camp, and tells the
  // stylesheet how many column tracks the team and role grids need.
  function applyCampCount() {
    var three = teamCount === 3;

    document.body.dataset.camps = String(teamCount);

    middlePanel.hidden = !three;
    middleRolesColumn.hidden = !three;
    assignButtons.middle.hidden = !three;

    rotateCwBtn.hidden = !three;
    rotateCcwBtn.hidden = !three;

    campCountButtons.forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.count === String(teamCount));
      // Re-shaping the camps mid-game would strand players, so it's setup-only
      btn.disabled = phase !== 'setup';
    });
  }

  function applyView() {
    applyCampCount();

    var setupVisible = phase === 'setup' && !revealMode;

    setupPanel.hidden = !setupVisible;
    campTools.hidden = !setupVisible;
    rolesPanel.hidden = !setupVisible;

    revealBar.hidden = phase !== 'setup';
    gameBar.hidden = phase !== 'playing';

    revealBarHint.textContent = revealMode
      ? 'Roles hidden. Click a player to show them their role.'
      : 'Roles are visible while setting up.';
  }

  function canAssignInfiltrators() {
    return everyCampStaffed();
  }

  // A camp can't hold more infiltrators than it has players, so the ceiling is
  // set by the smallest camp.
  function maxInfiltrators() {
    return Math.min.apply(null, campSizes());
  }

  function infiltratorsIn(team) {
    return teamPlayers(team).filter(function (p) {
      return p.alignment !== null && p.alignment !== p.team;
    }).length;
  }

  function hasInfiltrators() {
    return players.some(function (p) {
      return p.team !== null && p.alignment !== null && p.alignment !== p.team;
    });
  }

  // One line describing the current infiltrator spread, for the camp-tools bar
  function infiltratorHint() {
    if (!canAssignInfiltrators()) {
      return 'Every camp needs at least one player.';
    }
    if (!hasInfiltrators()) {
      return 'Everyone is loyal to their own camp.';
    }

    var camps = activeTeams();
    var spread = camps.map(function (team) {
      return infiltratorsIn(team);
    });

    var even = spread.every(function (n) {
      return n === spread[0];
    });

    if (even) {
      return spread[0] + ' player' + (spread[0] === 1 ? '' : 's') +
        ' in each camp loyal to another side.';
    }

    return camps.map(function (team, i) {
      return spread[i] + ' in ' + campName(team);
    }).join(', ') + ' loyal to another side.';
  }

  // Rebuilds the count dropdown to offer 1..max, clamped to what the current
  // rosters allow. Disabled (showing a single "1") until both camps exist.
  function renderInfiltratorCount() {
    // Tolerate a stale/cached HTML that predates this control
    if (!infiltrateCountSelect) {
      return;
    }

    var max = maxInfiltrators();

    // Keep the chosen value in range as camps grow and shrink
    infiltratorCount = Math.min(Math.max(1, infiltratorCount), Math.max(1, max));

    infiltrateCountSelect.textContent = '';
    var top = Math.max(1, max);
    for (var n = 1; n <= top; n++) {
      var option = document.createElement('option');
      option.value = String(n);
      option.textContent = String(n);
      infiltrateCountSelect.appendChild(option);
    }

    infiltrateCountSelect.value = String(infiltratorCount);
    infiltrateCountSelect.disabled = max < 1;
  }

  // Player ids whose night-order history is open
  var expandedHistory = {};

  function actionGlyph(action) {
    if (action === 'roast') {
      return '☁️';
    }
    if (action === 'burn') {
      return '🔥';
    }
    return '–';
  }

  // Compact: infiltrator flag if it applies, then one glyph per past night
  function buildHistory(player) {
    var wrap = document.createElement('div');
    wrap.className = 'night-history';

    if (player.startedAsInfiltrator) {
      var flag = document.createElement('span');
      flag.className = 'history-flag';
      flag.textContent = 'Original infiltrator';
      wrap.appendChild(flag);
    }

    var past = player.history || [];

    if (!past.length) {
      var none = document.createElement('span');
      none.className = 'history-empty';
      none.textContent = 'No nights yet';
      wrap.appendChild(none);
      return wrap;
    }

    var nightNo = 0;

    past.forEach(function (entry) {
      var item = document.createElement('span');

      if (entry.type === 'swap') {
        item.className = 'history-swap';
        item.title = 'Swapped into ' + campName(entry.team);
        item.textContent = '⇄';
      } else if (entry.type === 'used') {
        item.className = 'history-used';
        item.title = 'Used their once-per-game ability';
        item.textContent = '★';
      } else if (entry.type === 'adjust') {
        item.className = 'history-adjust';
        var signed = (entry.delta > 0 ? '+' : '') + entry.delta;
        item.title = 'Manual adjustment: ' + signed + ' marshmallow' +
          (Math.abs(entry.delta) === 1 ? '' : 's');
        item.textContent = signed + '🍡';
      } else {
        nightNo++;
        item.className = 'history-night';
        item.title = 'Night ' + nightNo;
        item.textContent = nightNo + actionGlyph(entry.action);
      }

      wrap.appendChild(item);
    });

    return wrap;
  }

  // Marks a once-per-game ability as spent. Records it in history so you can
  // see which night it went on.
  function buildOnceToggle(player) {
    var used = !!player.usedAbility;

    var btn = document.createElement('button');
    btn.className = 'once-toggle';
    btn.type = 'button';
    btn.textContent = used ? 'used' : 'once';
    btn.title = used ? 'Ability spent — click to undo' : 'Mark ability as used';
    btn.setAttribute('aria-pressed', used);

    if (used) {
      btn.classList.add('is-used');
    }

    btn.addEventListener('click', function (event) {
      // Don't let this expand the history row underneath
      event.stopPropagation();

      player.usedAbility = !player.usedAbility;

      if (!player.history) {
        player.history = [];
      }
      if (player.usedAbility) {
        player.history.push({ type: 'used' });
      } else {
        // Undo removes the most recent spend marker
        for (var i = player.history.length - 1; i >= 0; i--) {
          if (player.history[i].type === 'used') {
            player.history.splice(i, 1);
            break;
          }
        }
      }

      render();
    });

    return btn;
  }

  // ==========================================================================
  // Role field defaults
  //
  // Every role must declare a priority — a default there would be invisible
  // in a file where night order is the whole point. The optional flags below
  // do default, since their absence reads naturally as "no, it doesn't".
  // Read role flags through these accessors rather than the fields directly.
  //
  //   priority        REQUIRED  lower goes earlier in the night order
  //   requires_burn   false     ability only works if they burned tonight
  //   once_per_game   false     ability can be spent once
  //   can_be_swapped  true      whether a camp swap can move them
  // ==========================================================================

  function rolePriority(role) {
    return typeof role.priority === 'number' ? role.priority : 2;
  }

  // Surfaces authoring mistakes rather than letting them sort silently
  function warnMissingPriorities() {
    var missing = roles.filter(function (r) {
      return typeof r.priority !== 'number';
    });

    if (missing.length) {
      console.warn(
        'roles.json: priority is required but missing on ' +
        missing.map(function (r) { return r.name; }).join(', ') +
        ' — treating as 2.'
      );
    }
  }

  function roleRequiresBurn(role) {
    return role.requires_burn === true;
  }

  function roleOncePerGame(role) {
    return role.once_per_game === true;
  }

  function roleCanBeSwapped(role) {
    return role.can_be_swapped !== false;
  }

  // Roles actually held by a player, ordered by priority. Ties keep the order
  // they appear in roles.json, which a stable sort over that array gives us.
  function nightOrder() {
    var steps = [];

    roles.forEach(function (role) {
      players.forEach(function (p) {
        if (p.team !== null && p.role === role.name) {
          steps.push({ role: role, player: p });
        }
      });
    });

    return steps.sort(function (a, b) {
      return rolePriority(a.role) - rolePriority(b.role);
    });
  }

  // Identity of a step, stable across the re-derivations that happen on every
  // render. An array index is not: a burn-gated role entering or leaving the
  // set would silently move the cursor onto a different role.
  function stepKey(step) {
    return step.player.id + '|' + step.role.name;
  }

  // Nights already resolved, counted off the history that endRoastingPhase()
  // writes. Every seated player gets one 'night' entry per round, so the
  // longest run is the number of completed nights.
  function nightsCompleted() {
    return players.reduce(function (most, p) {
      if (p.team === null || !Array.isArray(p.history)) {
        return most;
      }
      var nights = p.history.filter(function (h) {
        return h.type === 'night';
      }).length;
      return Math.max(most, nights);
    }, 0);
  }

  // Resolve the cursor against tonight's actual order. Prefers the anchored
  // step; falls back to the nearest surviving position when that step is gone
  // (its player was removed), rather than throwing the host back to the start.
  function resolveStepIndex(steps) {
    if (!steps.length) {
      return -1;
    }
    if (currentStepKey !== null) {
      for (var i = 0; i < steps.length; i++) {
        if (stepKey(steps[i]) === currentStepKey) {
          return i;
        }
      }
    }
    return Math.min(Math.max(currentStepPos, 0), steps.length - 1);
  }

  // Paging is the correction mechanism, so it moves the cursor and nothing
  // else: it never advances on its own, never wraps, and never ends the night.
  // Ending the round stays the host's explicit press of End roasting phase.
  function moveStep(delta) {
    var steps = nightOrder();
    if (!steps.length) {
      return;
    }
    var next = Math.min(Math.max(resolveStepIndex(steps) + delta, 0), steps.length - 1);
    currentStepPos = next;
    currentStepKey = stepKey(steps[next]);
    render();
  }

  // Players still owing a roast-or-burn choice. The night cannot be resolved
  // until every seated player has one, so this is what the UI says out loud
  // instead of leaving a disabled button to be puzzled over.
  function undecidedPlayers() {
    return players.filter(function (p) {
      return p.team !== null && !p.action;
    });
  }

  // The one way a night ends, wherever it is triggered from. Never fired by
  // paging to the last step — the host presses it.
  function resolveNight() {
    endRoastingPhase();
    currentStepKey = null;
    currentStepPos = 0;
    render();
  }

  function renderNightOrder() {
    nightPanel.hidden = phase !== 'playing';
    // Clear even when hidden so a stale step doesn't linger behind the panel
    runnerStep.textContent = '';
    if (phase !== 'playing') {
      return;
    }

    var steps = nightOrder();
    var index = resolveStepIndex(steps);

    if (index === -1) {
      runnerPosition.textContent = '';
      runnerPrev.disabled = true;
      runnerNext.disabled = true;
      return;
    }

    // Keep the stored cursor in step with what is actually on screen, so a
    // reload resumes here rather than wherever the pointer last drifted.
    currentStepPos = index;
    currentStepKey = stepKey(steps[index]);

    var step = steps[index];
    runnerPosition.textContent = 'Night ' + (nightsCompleted() + 1) +
      ' · Step ' + (index + 1) + ' of ' + steps.length;

    runnerPrev.disabled = index === 0;
    runnerNext.disabled = index === steps.length - 1;

    runnerStep.dataset.alignment = step.player.alignment;

    // Same two facts the list used to conflate. A burn-gated role is waiting
    // on a condition the host can still change tonight; a spent once-per-game
    // role is finished for the game.
    var gated = roleRequiresBurn(step.role) && step.player.action !== 'burn';
    var spent = roleOncePerGame(step.role) && step.player.usedAbility;

    runnerStep.className = 'runner-step' +
      (gated ? ' is-gated' : '') +
      (spent ? ' is-spent' : '');

    var heading = document.createElement('p');
    heading.className = 'runner-role';
    heading.textContent = step.role.name;
    runnerStep.appendChild(heading);

    var who = document.createElement('p');
    who.className = 'runner-player';

    var name = document.createElement('span');
    name.className = 'night-player';
    name.dataset.alignment = step.player.alignment;
    name.textContent = step.player.name;
    who.appendChild(name);

    // Camp in words as well as in colour, for the same reason the cards carry
    // it: the stripe and the name colour are the same hue and nothing else.
    var camp = document.createElement('span');
    camp.className = 'player-align-tag';
    camp.dataset.alignment = step.player.alignment;
    camp.textContent = ' (' + campName(step.player.alignment) + ')';
    who.appendChild(camp);

    if (gated || spent) {
      var chip = document.createElement('span');
      chip.className = 'night-chip' + (spent ? ' is-spent-chip' : '');
      chip.textContent = spent ? 'Spent' : 'Needs burn';
      who.appendChild(chip);
    }

    // The player's own choice, in words. Undecided shows nothing.
    if (step.player.action === 'roast' || step.player.action === 'burn') {
      var action = document.createElement('span');
      action.className = 'night-action';
      action.textContent = step.player.action === 'roast' ? '☁️ Roast' : '🔥 Burn';
      who.appendChild(action);
    }

    runnerStep.appendChild(who);

    var desc = document.createElement('p');
    desc.className = 'runner-desc';
    desc.textContent = step.role.description;
    runnerStep.appendChild(desc);

    var tools = document.createElement('div');
    tools.className = 'runner-tools';

    // Once-per-game roles keep their spend marker on the step itself
    if (roleOncePerGame(step.role)) {
      tools.appendChild(buildOnceToggle(step.player));
    }

    var open = !!expandedHistory[step.player.id];

    var histBtn = document.createElement('button');
    histBtn.type = 'button';
    histBtn.className = 'runner-history-btn';
    histBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    histBtn.textContent = (open ? '▾' : '▸') + ' History';
    histBtn.addEventListener('click', function () {
      if (expandedHistory[step.player.id]) {
        delete expandedHistory[step.player.id];
      } else {
        expandedHistory[step.player.id] = true;
      }
      render();
    });
    tools.appendChild(histBtn);

    runnerStep.appendChild(tools);

    if (open) {
      runnerStep.appendChild(buildHistory(step.player));
    }

    // Arriving at the last step used to be a dead end: Next greyed out and
    // nothing saying what came next. The night still only ends on an explicit
    // press, but now it is offered where the host actually finishes.
    runnerEnd.hidden = index !== steps.length - 1;
    runnerEnd.textContent = '';

    if (index === steps.length - 1) {
      var waiting = undecidedPlayers();

      var endText = document.createElement('p');
      endText.className = 'runner-end-text';
      endText.textContent = waiting.length
        ? 'Last step. Night ' + (nightsCompleted() + 1) + ' can end once ' +
          (waiting.length === 1
            ? waiting[0].name + ' has'
            : waiting.length + ' players have') + ' chosen roast or burn.'
        : 'Last step. Ending the night pays out every roast and starts night ' +
          (nightsCompleted() + 2) + '.';
      runnerEnd.appendChild(endText);

      var endBtn = document.createElement('button');
      endBtn.type = 'button';
      endBtn.className = 'btn';
      endBtn.textContent = 'End night ' + (nightsCompleted() + 1);
      endBtn.disabled = waiting.length > 0;
      endBtn.addEventListener('click', resolveNight);
      runnerEnd.appendChild(endBtn);
    }
  }

  function roleByName(name) {
    return roles.find(function (r) {
      return r.name === name;
    }) || null;
  }

  function closeReveal() {
    revealModal.hidden = true;
    document.removeEventListener('keydown', closeReveal);
  }

  function openReveal(player) {
    var role = roleByName(player.role);

    revealPlayer.textContent = player.name;
    revealRole.textContent = player.role;
    revealDesc.textContent = role ? role.description : '';
    revealModal.dataset.team = player.team;
    revealModal.hidden = false;

    // Click closes via the modal's own handler, so only keys are global here —
    // a document click listener would fire on the click that opened this.
    document.addEventListener('keydown', closeReveal);
  }

  // Dropdown for pinning a player's role by hand before the roll. Roles
  // already locked by a campmate are left out.
  function buildRolePicker(player) {
    var select = document.createElement('select');
    select.className = 'player-role';
    select.setAttribute('aria-label', 'Lock a role for ' + player.name);

    if (player.lockedRole) {
      select.classList.add('is-locked');
    }

    var blank = document.createElement('option');
    blank.value = '';
    blank.textContent = 'Random';
    select.appendChild(blank);

    var lockedByOthers = teamPlayers(player.team)
      .filter(function (p) {
        return p.id !== player.id && p.lockedRole;
      })
      .map(function (p) {
        return p.lockedRole;
      });

    picked[player.team].forEach(function (name) {
      if (lockedByOthers.indexOf(name) !== -1) {
        return;
      }
      var option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });

    select.value = player.lockedRole || '';

    select.addEventListener('change', function () {
      player.lockedRole = select.value || null;
      // A pinned role takes effect immediately so the card reflects the choice
      if (player.lockedRole) {
        player.role = player.lockedRole;
      }
      render();
    });

    // Selecting a card is a click on the card; don't let the dropdown trigger it
    select.addEventListener('click', function (event) {
      event.stopPropagation();
    });

    return select;
  }

  // Live-editable note on a player. It writes straight to the model on every
  // keystroke and never triggers a re-render — a render here would rebuild the
  // input and yank focus away mid-word.
  function buildReminderInput(player) {
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'player-reminder';
    input.value = player.reminder || '';
    input.placeholder = 'Reminder…';
    input.setAttribute('aria-label', 'Reminder for ' + player.name);
    input.maxLength = 60;

    input.addEventListener('input', function () {
      player.reminder = input.value;
      // Reminder edits skip render (to keep focus), so persist directly
      saveState();
    });

    // The card is a swap-select target during play; typing/clicking here
    // must not toggle that selection.
    input.addEventListener('click', function (event) {
      event.stopPropagation();
    });

    return input;
  }

  // Marshmallow total with manual − / + correction, top-right of the card.
  function buildMarshmallowCounter(player) {
    var wrap = document.createElement('div');
    wrap.className = 'player-marshmallows';

    var minus = document.createElement('button');
    minus.className = 'marsh-btn';
    minus.type = 'button';
    minus.textContent = '−';
    minus.title = 'Remove a marshmallow';
    minus.setAttribute('aria-label', 'Remove a marshmallow from ' + player.name);
    minus.disabled = marshmallowsOf(player) === 0;
    minus.addEventListener('click', function (event) {
      event.stopPropagation();
      adjustMarshmallows(player, -1);
      render();
    });

    var count = document.createElement('span');
    count.className = 'marsh-count';
    count.textContent = marshmallowsOf(player);

    var plus = document.createElement('button');
    plus.className = 'marsh-btn';
    plus.type = 'button';
    plus.textContent = '+';
    plus.title = 'Add a marshmallow';
    plus.setAttribute('aria-label', 'Add a marshmallow to ' + player.name);
    plus.addEventListener('click', function (event) {
      event.stopPropagation();
      adjustMarshmallows(player, 1);
      render();
    });

    wrap.appendChild(minus);
    wrap.appendChild(count);
    wrap.appendChild(plus);
    return wrap;
  }

  // Roast or burn for the night — mutually exclusive, and clicking the active
  // one clears it back to undecided.
  function buildActionToggle(player) {
    var wrap = document.createElement('div');
    wrap.className = 'player-action';

    [
      { value: 'roast', glyph: '☁️', text: 'Roast', label: 'Roast a marshmallow' },
      { value: 'burn', glyph: '🔥', text: 'Burn', label: 'Burn a marshmallow' }
    ].forEach(function (choice) {
      var btn = document.createElement('button');
      btn.className = 'action-btn action-' + choice.value;
      btn.type = 'button';

      // The glyph alone told a host who built this apart from a host who was
      // taught the game an hour ago. There is no hover on the tablet this runs
      // on, so the title was unreachable and the word had to be on screen.
      var mark = document.createElement('span');
      mark.className = 'action-glyph';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = choice.glyph;
      btn.appendChild(mark);

      var word = document.createElement('span');
      word.className = 'action-text';
      word.textContent = choice.text;
      btn.appendChild(word);

      btn.title = choice.label;
      btn.setAttribute('aria-label', player.name + ': ' + choice.label);
      btn.setAttribute('aria-pressed', player.action === choice.value);

      if (player.action === choice.value) {
        btn.classList.add('is-active');
      }

      btn.addEventListener('click', function (event) {
        event.stopPropagation();
        player.action = (player.action === choice.value) ? null : choice.value;
        render();
      });

      wrap.appendChild(btn);
    });

    return wrap;
  }

  function buildCard(player) {
    var card = document.createElement('div');
    card.className = 'player-card';
    card.dataset.playerId = player.id;

    if (player.team) {
      card.dataset.team = player.team;
    }

    var heading = document.createElement('h3');
    heading.textContent = player.name;
    card.appendChild(heading);

    // Editing the roster belongs to setup only
    if (!revealMode && phase === 'setup') {
      var remove = document.createElement('button');
      remove.className = 'player-remove';
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', 'Remove ' + player.name);
      remove.addEventListener('click', function (event) {
        // Don't let the click bubble up and re-select the card
        event.stopPropagation();
        removePlayer(player.id);
        render();
      });
      card.appendChild(remove);
    }

    // Per-player info goes here as the game grows
    var details = document.createElement('div');
    details.className = 'player-details';
    card.appendChild(details);

    // Reveal mode: no role text, no pickers — just a card that opens the
    // full-screen reveal for players who actually have a role.
    if (revealMode) {
      if (player.team !== null && player.role) {
        card.classList.add('is-revealable');
        card.addEventListener('click', function () {
          openReveal(player);
        });
      }
      return card;
    }

    if (player.team !== null) {
      // Alignment sits next to the name, as colored "(Camp Green)"
      var tag = document.createElement('span');
      tag.className = 'player-align-tag';
      tag.dataset.alignment = player.alignment;
      tag.textContent = ' (' + campName(player.alignment) + ')';
      heading.appendChild(tag);

      // Card takes its loyalty's color, not the camp it's sitting in
      card.dataset.alignment = player.alignment;

      if (player.alignment !== player.team) {
        card.classList.add('is-infiltrator');
      }

      if (player.role) {
        var assigned = document.createElement('span');
        assigned.className = 'player-assigned';
        assigned.textContent = player.role;

        if (player.lockedRole) {
          var mark = document.createElement('span');
          mark.className = 'lock-mark';
          mark.textContent = ' (locked)';
          assigned.appendChild(mark);
        }

        details.appendChild(assigned);
      }

      // A free-text reminder the moderator edits live during play
      if (phase === 'playing') {
        details.appendChild(buildReminderInput(player));
      }

      // Pinning a role is a setup-time decision
      if (phase === 'setup') {
        card.appendChild(buildRolePicker(player));
      }

      // During play, clicking a card picks it for a camp swap
      if (phase === 'playing') {
        if (swapSelection.indexOf(player.id) !== -1) {
          card.classList.add('is-swap-picked');
        }
        card.classList.add('is-pickable');
        card.setAttribute('aria-pressed', swapSelection.indexOf(player.id) !== -1);
        card.addEventListener('click', function () {
          toggleSwapSelection(player.id);
          render();
        });
      }

      // Night choices only matter once the game is running
      if (phase === 'playing') {
        card.classList.add('is-playing');

        // Marshmallow counter with roast/burn stacked beneath it, top-right
        var controls = document.createElement('div');
        controls.className = 'player-controls';
        controls.appendChild(buildMarshmallowCounter(player));
        controls.appendChild(buildActionToggle(player));
        card.appendChild(controls);
      }
    }

    // Only unassigned players are selectable, and only during setup. Picks
    // accumulate, so several players can be seated in one press.
    if (player.team === null && phase === 'setup') {
      if (isSelected(player.id)) {
        card.classList.add('is-selected');
      }
      card.setAttribute('aria-pressed', isSelected(player.id));
      card.addEventListener('click', function () {
        toggleSelected(player.id);
        render();
      });
    }

    return card;
  }

  function render() {
    var tally = { left: 0, middle: 0, none: 0, right: 0 };

    // Settle roster and role state first so the cards below render clean data
    evictInactiveCamps();
    pruneSelection();
    trimPicks();
    pruneRoleState();

    grids.none.textContent = '';
    ALL_TEAMS.forEach(function (team) {
      grids[team].textContent = '';
    });

    players.forEach(function (player) {
      var k = key(player.team);
      grids[k].appendChild(buildCard(player));
      tally[k]++;
    });

    // Every camp with markup is kept current, in play or not, so nothing stale
    // is left behind the moment the third camp is switched back on.
    ALL_TEAMS.forEach(function (team) {
      counts[team].textContent = tally[team];
      campTotals[team].textContent = campMarshmallows(team);
      campTotals[team].hidden = phase !== 'playing';
      assignButtons[team].disabled = selectedIds.length === 0 || revealMode;
      // Reads "Assign to Camp Yellow" for a single pick, "Assign 4 to Camp
      // Yellow" once there's a group to seat
      assignCounts[team].textContent = selectedIds.length > 1 ? selectedIds.length : '';
    });

    empty.hidden = players.length > 0;
    // Nothing to spin for once everyone has a camp
    wheelBtn.disabled = revealMode || unassignedPlayers().length === 0;

    applyView();
    renderNightOrder();

    var decided = players.filter(function (p) {
      return p.team !== null && p.action;
    }).length;
    var seated = players.filter(function (p) {
      return p.team !== null;
    }).length;

    clearActionsBtn.disabled = decided === 0;
    endRoastBtn.disabled = decided < seated;
    swapBtn.disabled = !canSwap();

    rotateCwBtn.disabled = !canRotate();
    rotateCcwBtn.disabled = !canRotate();
    rotateCwBtn.title = 'Clockwise — ' + rotationLabel(1);
    rotateCcwBtn.title = 'Counter-clockwise — ' + rotationLabel(-1);
    // The reason lives in visible text, not a title: a tooltip on a disabled
    // button is unreachable on the tablet this runs on.
    gameBarText.textContent = decided < seated
      ? 'Game in progress — ' + decided + ' of ' + seated + ' chosen. ' +
        'Every player needs a roast or burn before the night can end.'
      : 'Game in progress — all ' + seated + ' chosen. The night can be ended.';

    startBtn.disabled = !readyToStart();
    // Explain a disabled Start button rather than leaving it a mystery
    startBtn.title = startButtonReason();

    // Optional dev affordance — the button can be commented out of the HTML
    if (loadTestBtn) {
      loadTestBtn.disabled = roles.length < TEST_NAMES.length;
    }
    infiltrateBtn.disabled = !canAssignInfiltrators();
    renderInfiltratorCount();
    infiltrateHint.textContent = infiltratorHint();

    // Camp sizes changed, so role capacity did too
    renderRoles();

    // Persist after every state change so a tab close loses nothing
    saveState();
  }

  function teamSize(team) {
    return players.filter(function (p) {
      return p.team === team;
    }).length;
  }

  var DEFAULT_CAMP_NAMES = {
    left: 'Left camp',
    middle: 'Middle camp',
    right: 'Right camp'
  };

  function campName(team) {
    if (ALL_TEAMS.indexOf(team) === -1) {
      return 'nobody';
    }
    return teamNames[team].value.trim() || DEFAULT_CAMP_NAMES[team];
  }

  // A player can only sit in a camp that's in play, so dropping back to two
  // camps sends anyone in the middle to the unassigned row.
  function evictInactiveCamps() {
    players.forEach(function (p) {
      if (p.team !== null && !isActiveTeam(p.team)) {
        p.team = null;
      }
    });
  }

  // A camp can hold exactly as many roles as it has players, so removing
  // players has to drop picks that no longer fit. Camps out of play hold no
  // picks at all.
  function trimPicks() {
    ALL_TEAMS.forEach(function (team) {
      picked[team] = isActiveTeam(team)
        ? picked[team].slice(0, teamSize(team))
        : [];
    });
  }

  function togglePick(team, roleName) {
    var index = picked[team].indexOf(roleName);

    if (index !== -1) {
      picked[team].splice(index, 1);
      return;
    }

    // Silently ignore clicks on rows the UI already shows as unavailable
    if (picked[team].length >= teamSize(team)) {
      return;
    }
    if (roleTakenByAnotherCamp(team, roleName)) {
      return;
    }

    picked[team].push(roleName);
  }

  // A role is dealt out by at most one camp, so every other camp in play has
  // a claim on it that blocks this one.
  function roleTakenByAnotherCamp(team, roleName) {
    return otherTeams(team).some(function (other) {
      return picked[other].indexOf(roleName) !== -1;
    });
  }

  var ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

  function toRoman(n) {
    return ROMAN[n] || String(n);
  }

  // Thin labeled rule that separates one role group from the next
  function buildGroupDivider(group) {
    var divider = document.createElement('div');
    divider.className = 'role-group-divider';
    var label = document.createElement('span');
    label.className = 'role-group-label';
    label.textContent = toRoman(group);
    divider.appendChild(label);
    return divider;
  }

  function buildRoleOption(team, role) {
    var isPicked = picked[team].indexOf(role.name) !== -1;
    var takenByOther = roleTakenByAnotherCamp(team, role.name);
    var full = picked[team].length >= teamSize(team);
    var disabled = takenByOther || (full && !isPicked);

    var label = document.createElement('label');
    label.className = 'role-option';
    // Description is clamped to one line, so keep the full text reachable
    label.title = role.name + ' — ' + role.description;
    if (isPicked) {
      label.classList.add('is-selected');
    }
    if (disabled) {
      label.classList.add('is-disabled');
    }

    var box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = isPicked;
    box.disabled = disabled;
    box.addEventListener('change', function () {
      togglePick(team, role.name);
      // Full render: changing the picks also changes every card's role dropdown
      render();
    });
    label.appendChild(box);

    var text = document.createElement('span');

    var name = document.createElement('span');
    name.className = 'role-name';
    name.textContent = role.name;
    text.appendChild(name);

    if (takenByOther) {
      var taken = document.createElement('span');
      taken.className = 'role-taken';
      taken.textContent = 'In play';
      name.appendChild(document.createTextNode(' '));
      name.appendChild(taken);
    }

    var desc = document.createElement('span');
    desc.className = 'role-desc';
    desc.textContent = role.description;
    text.appendChild(desc);

    label.appendChild(text);
    return label;
  }

  function teamPlayers(team) {
    return players.filter(function (p) {
      return p.team === team;
    });
  }

  // Locks and rolled roles both go stale when the picked list or the roster
  // changes, so drop anything that no longer refers to a role in play.
  function pruneRoleState() {
    players.forEach(function (p) {
      if (p.team === null) {
        p.lockedRole = null;
        p.role = null;
        p.alignment = null;
        p.action = null;
        return;
      }

      // A player on a camp always has some alignment; default is their own
      if (!isActiveTeam(p.alignment)) {
        p.alignment = p.team;
      }

      // Picks are a setup-time concept: they decide which roles a camp deals
      // out. Once play starts a role belongs to the player and travels with
      // them across a camp swap, so it must not be pruned against the camp
      // they happen to be sitting in.
      if (phase !== 'setup') {
        return;
      }

      if (p.lockedRole && picked[p.team].indexOf(p.lockedRole) === -1) {
        p.lockedRole = null;
      }
      if (p.role && picked[p.team].indexOf(p.role) === -1) {
        p.role = null;
      }
    });

    // Two players in a camp must not hold the same locked role — again, only
    // meaningful while the roster is still being built
    if (phase !== 'setup') {
      return;
    }

    activeTeams().forEach(function (team) {
      var seen = [];
      teamPlayers(team).forEach(function (p) {
        if (!p.lockedRole) {
          return;
        }
        if (seen.indexOf(p.lockedRole) !== -1) {
          p.lockedRole = null;
        } else {
          seen.push(p.lockedRole);
        }
      });
    });
  }

  // Every camp has players and exactly enough roles picked to cover them
  function readyToAssign() {
    return activeTeams().every(function (team) {
      return teamSize(team) > 0 && picked[team].length === teamSize(team);
    });
  }

  function hasAssignments() {
    return players.some(function (p) {
      return p.role !== null;
    });
  }

  function shuffle(list) {
    var out = list.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  // Locked players keep their pick; everyone else gets what's left, shuffled.
  function autoAssign() {
    activeTeams().forEach(function (team) {
      var roster = teamPlayers(team);
      var taken = [];

      roster.forEach(function (p) {
        if (p.lockedRole) {
          p.role = p.lockedRole;
          taken.push(p.lockedRole);
        }
      });

      var pool = shuffle(picked[team].filter(function (name) {
        return taken.indexOf(name) === -1;
      }));

      roster.forEach(function (p) {
        if (!p.lockedRole) {
          p.role = pool.pop() || null;
        }
      });
    });
  }

  function clearAssignments() {
    players.forEach(function (p) {
      p.role = null;
    });
  }

  function renderAssignControls() {
    var ready = readyToAssign();

    autoAssignBtn.disabled = !ready;
    clearAssignBtn.disabled = !hasAssignments();

    if (ready) {
      assignHint.textContent = 'Ready to assign.';
    } else {
      assignHint.textContent =
        'Every camp needs players and exactly enough roles chosen to cover them.';
    }
  }

  function renderRoles() {
    if (!roles.length) {
      return;
    }

    renderAssignControls();

    // Show roles grouped, regardless of their order in roles.json. Stable sort
    // keeps each group's roles in the order they appear in the file.
    var ordered = roles.slice().sort(function (a, b) {
      return (a.group || 0) - (b.group || 0);
    });

    activeTeams().forEach(function (team) {
      var list = roleLists[team];

      // Rebuilding resets scroll, which is jarring in a long list
      var scroll = list.scrollTop;
      list.textContent = '';

      var lastGroup = null;
      ordered.forEach(function (role) {
        // Mark each group change with a thin divider carrying the incoming
        // group's Roman numeral (skip the very first group)
        if (role.group !== lastGroup) {
          list.appendChild(buildGroupDivider(role.group));
          lastGroup = role.group;
        }
        list.appendChild(buildRoleOption(team, role));
      });

      list.scrollTop = scroll;

      var size = teamSize(team);
      roleProgress[team].textContent = picked[team].length + ' / ' + size + ' chosen';
      roleProgress[team].classList.toggle('is-full', size > 0 && picked[team].length === size);
    });
  }

  // ==========================================================================
  // Team wheel
  //
  // A full-screen spinner that deals the unassigned players out to the camps,
  // one spin at a time. Every unassigned player gets an equal slice, and each
  // winner joins whichever camp is furthest behind, so two or three camps all
  // come out level.
  //
  // Geometry: slice 0 starts at 12 o'clock and they run clockwise, which is
  // exactly how conic-gradient lays its stops out. The pointer sits at 12
  // o'clock too, so a slice at clockwise angle `a` is under the pointer once
  // the disc has been rotated by −a.
  // ==========================================================================

  // The camp with the fewest players, earliest in display order on a tie
  function leastFilledTeam() {
    return activeTeams().reduce(function (best, team) {
      return teamSize(team) < teamSize(best) ? team : best;
    });
  }

  var wheelBtn = document.getElementById('wheel-btn');
  var wheelModal = document.getElementById('wheel-modal');
  var wheelDisc = document.getElementById('wheel-disc');
  var wheelSpinBtn = document.getElementById('wheel-spin');
  var wheelCloseBtn = document.getElementById('wheel-close');
  var wheelResult = document.getElementById('wheel-result');
  var wheelNext = document.getElementById('wheel-next');
  var wheelNextTeam = document.getElementById('wheel-next-team');

  // Must stay in step with the .wheel-disc transition duration in styles.css
  var WHEEL_SPIN_MS = 8000;
  // How long the winner sits lit up under the pointer before the wheel is
  // redrawn without them. Matches the .wheel-glow pulse in styles.css.
  var WHEEL_PAUSE_MS = 2000;

  // Camp the next winner joins. Moves to whichever camp is furthest behind
  // after every spin.
  var wheelTeam = 'left';
  // Player ids in slice order, i.e. what the disc currently shows
  var wheelOrder = [];
  // Absolute rotation in degrees, only ever counted upwards so each spin
  // carries on clockwise from where the last one stopped
  var wheelRotation = 0;
  var wheelSpinning = false;
  // Overlay wedge that lights the winning slice. Rebuilt with the disc, so it
  // is held here rather than looked up.
  var wheelGlow = null;
  // Bumped on every spin and on close, so a spin abandoned part-way through
  // can't come back later and seat someone
  var wheelSpinId = 0;

  // The wheel wears the colour of the camp that is about to receive, so the
  // table can see what is at stake before it moves. A rainbow here put a
  // yellow wedge and a green wedge on screen while the header read "joins
  // Camp Yellow", which teaches the room to distrust the one colour code the
  // rest of the app depends on.
  // dark is the lightness of the alternating darker slice. It is per camp
  // because purple runs much darker than yellow or green at the same value,
  // and the near-black names have to stay high contrast on every slice of
  // every camp — this is read across a table, not at arm's length.
  var CAMP_WHEEL_HUE = {
    left:   { hue: 48,  sat: 82, dark: 56 },
    middle: { hue: 270, sat: 70, dark: 65 },
    right:  { hue: 142, sat: 52, dark: 56 }
  };

  // Slices alternate light and dark within that one camp hue, with a small
  // drift either side of it so neighbours stay apart on a long roster. Kept
  // light enough throughout that the near-black names stay high contrast.
  function sliceColor(index, total) {
    var camp = CAMP_WHEEL_HUE[wheelTeam] || CAMP_WHEEL_HUE.left;
    var drift = (index % 4) * 5 - 7;
    var light = index % 2 === 0 ? 82 : camp.dark;
    return 'hsl(' + (camp.hue + drift) + ', ' + camp.sat + '%, ' + light + '%)';
  }

  // Names are read across a table from a laptop screen, so these are sized to
  // be legible at a distance rather than to fit comfortably.
  function wheelLabelSize(total) {
    if (total > 16) {
      return '1.3rem';
    }
    if (total > 12) {
      return '1.7rem';
    }
    if (total > 8) {
      return '2.1rem';
    }
    if (total > 5) {
      return '2.6rem';
    }
    return '3.2rem';
  }

  // Setting textContent detaches the camp span, so put it straight back —
  // holding the one element keeps its camp-colored styling hook alive.
  function renderWheelHead(remaining) {
    if (!remaining) {
      wheelNext.textContent = 'Everyone has a camp.';
      delete wheelModal.dataset.team;
      return;
    }

    wheelNext.textContent = 'Next pick joins ';
    wheelNextTeam.textContent = campName(wheelTeam);
    wheelNext.appendChild(wheelNextTeam);
    wheelModal.dataset.team = wheelTeam;
  }

  function renderWheel() {
    var pool = unassignedPlayers();

    wheelOrder = pool.map(function (p) {
      return p.id;
    });

    wheelDisc.textContent = '';
    wheelDisc.classList.toggle('is-empty', pool.length === 0);
    wheelDisc.style.fontSize = wheelLabelSize(pool.length);

    wheelSpinBtn.disabled = wheelSpinning || pool.length === 0;
    renderWheelHead(pool.length);

    if (!pool.length) {
      wheelDisc.style.background = '';
      wheelGlow = null;
      return;
    }

    // First child, so the names and spokes below paint over it — a lit wedge
    // must not wash out the very name it is pointing at. A fresh element each
    // render is also what restarts its pulse on the next win.
    wheelGlow = document.createElement('div');
    wheelGlow.className = 'wheel-glow';
    wheelDisc.appendChild(wheelGlow);

    var slice = 360 / pool.length;
    var stops = [];

    pool.forEach(function (player, i) {
      var color = sliceColor(i, pool.length);
      stops.push(color + ' ' + (i * slice) + 'deg ' + ((i + 1) * slice) + 'deg');

      // The bars run outwards from the hub along 3 o'clock, so every angle
      // measured from 12 o'clock is a quarter turn behind.
      var angle = (i + 0.5) * slice - 90;
      var label = document.createElement('div');
      label.className = 'wheel-label';
      label.style.transform = 'rotate(' + angle + 'deg)';

      // The strip runs hub-to-rim and carries its text at the rim end. Once it
      // is rotated past the vertical the glyphs come out upside down, so the
      // text span is turned about its own centre: same place on the slice,
      // right way up. No name on this wheel is ever read upside down.
      var text = document.createElement('span');
      text.className = 'wheel-label-text';
      text.textContent = player.name;
      var turn = ((angle % 360) + 360) % 360;
      if (turn > 90 && turn < 270) {
        text.classList.add('is-flipped');
      }
      label.appendChild(text);
      wheelDisc.appendChild(label);

      // Divider on this slice's leading edge. One per slice closes the ring.
      var spoke = document.createElement('div');
      spoke.className = 'wheel-spoke';
      spoke.style.transform = 'rotate(' + (i * slice - 90) + 'deg)';
      wheelDisc.appendChild(spoke);
    });

    // A single slice would give conic-gradient nothing to interpolate between
    wheelDisc.style.background = pool.length === 1
      ? sliceColor(0, 1)
      : 'conic-gradient(' + stops.join(', ') + ')';
  }

  // Lights the winning wedge for the length of the pause
  function glowSlice(index, total) {
    if (!wheelGlow) {
      return;
    }

    var slice = 360 / total;
    var from = index * slice;
    var to = (index + 1) * slice;

    wheelGlow.style.background =
      'conic-gradient(transparent ' + from + 'deg, #ffffff ' + from + 'deg ' +
      to + 'deg, transparent ' + to + 'deg)';
    wheelGlow.classList.add('is-on');
  }

  // Names the winner, holds a beat for the drama, then seats them and hands
  // the next pick to the other camp. The spin id guards the pause the same way
  // it guards the spin: closing the wheel part-way through drops the result.
  function landOnPlayer(id, spinId) {
    var player = playerById(id);

    // The roster can be edited from another tab's restore or a stray click
    // while the disc was turning; if the winner is gone, just redraw.
    if (!player || player.team !== null) {
      wheelSpinning = false;
      renderWheel();
      render();
      return;
    }

    wheelResult.textContent = player.name + ' → ' + campName(wheelTeam);
    wheelResult.dataset.team = wheelTeam;
    glowSlice(wheelOrder.indexOf(id), wheelOrder.length);

    // The winning name lifts off its slice while the wedge pulses under it
    var winning = wheelDisc.children[wheelOrder.indexOf(id) * 2 + 1];
    if (winning && winning.firstChild) {
      winning.firstChild.classList.add('is-winner');
    }

    // Still "spinning" as far as the SPIN button is concerned — the pause is
    // part of the same turn and must not be cut short by another press.
    setTimeout(function () {
      if (spinId !== wheelSpinId) {
        return;
      }

      wheelSpinning = false;

      assignPlayer(player, wheelTeam);
      wheelTeam = leastFilledTeam();

      renderWheel();
      render();
    }, WHEEL_PAUSE_MS);
  }

  function spinWheel() {
    if (wheelSpinning || !wheelOrder.length) {
      return;
    }

    var total = wheelOrder.length;
    var slice = 360 / total;
    var winner = Math.floor(Math.random() * total);
    var winnerId = wheelOrder[winner];

    // Land somewhere inside the slice rather than dead centre, but well clear
    // of both edges so the pointer never looks ambiguous
    var target = (winner + 0.2 + Math.random() * 0.6) * slice;

    // Whole turns for the show, then however much more brings `target` up to
    // the pointer. Rotation only grows, so the modulo keeps `delta` positive.
    var turns = 9 + Math.floor(Math.random() * 5);
    var delta = (((-target - wheelRotation) % 360) + 360) % 360;

    wheelSpinning = true;
    wheelSpinBtn.disabled = true;
    wheelResult.textContent = '';
    delete wheelResult.dataset.team;

    wheelRotation += turns * 360 + delta;
    wheelDisc.style.transform = 'rotate(' + wheelRotation + 'deg)';

    // transitionend is the real signal, but it never fires if the transition
    // is interrupted or the tab is backgrounded — so back it with a timer and
    // let whichever arrives first do the work.
    var spinId = ++wheelSpinId;

    function settle() {
      // Whichever signal got here first, this spin is done listening
      wheelDisc.removeEventListener('transitionend', settle);
      clearTimeout(fallback);

      // Closing the wheel or starting another spin abandons this one
      if (spinId !== wheelSpinId) {
        return;
      }
      landOnPlayer(winnerId, spinId);
    }

    var fallback = setTimeout(settle, WHEEL_SPIN_MS + 500);
    wheelDisc.addEventListener('transitionend', settle);
  }

  function closeWheel() {
    // Drop any spin still in flight rather than seating its winner behind
    // a closed modal
    wheelSpinId++;
    wheelSpinning = false;

    wheelModal.hidden = true;
    document.removeEventListener('keydown', onWheelKey);
  }

  function onWheelKey(event) {
    if (event.key === 'Escape') {
      closeWheel();
    }
  }

  function openWheel() {
    if (phase !== 'setup' || revealMode || !unassignedPlayers().length) {
      return;
    }

    // Always deal to the camp that's furthest behind, which leaves them all
    // within a player of each other however many names are in play.
    wheelTeam = leastFilledTeam();

    // Back to a known angle without animating the trip there
    wheelSpinning = false;
    wheelRotation = 0;
    wheelDisc.style.transition = 'none';
    wheelDisc.style.transform = 'rotate(0deg)';
    // Reading the layout flushes the reset before the transition comes back
    void wheelDisc.offsetWidth;
    wheelDisc.style.transition = '';

    wheelResult.textContent = '';
    delete wheelResult.dataset.team;

    renderWheel();
    wheelModal.hidden = false;
    document.addEventListener('keydown', onWheelKey);
  }

  // ==========================================================================
  // Persistence — the whole game survives an accidental tab close
  // ==========================================================================

  var SAVE_KEY = 'swapperman.save.v1';

  // localStorage access can throw (private mode), so probe defensively
  function storageOk() {
    try {
      return typeof localStorage !== 'undefined';
    } catch (err) {
      return false;
    }
  }

  function saveState() {
    if (!storageOk()) {
      return;
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 1,
        phase: phase,
        players: players,
        nextId: nextId,
        picked: { left: picked.left, middle: picked.middle, right: picked.right },
        teamCount: teamCount,
        infiltratorCount: infiltratorCount,
        currentStepKey: currentStepKey,
        currentStepPos: currentStepPos,
        roles: roles,
        rolesCustom: rolesCustom,
        rolesTitle: rolesSource ? rolesSource.textContent : '',
        teamNames: {
          left: teamNames.left ? teamNames.left.value : '',
          middle: teamNames.middle ? teamNames.middle.value : '',
          right: teamNames.right ? teamNames.right.value : ''
        }
      }));
    } catch (err) {
      // Quota or serialization failure — persistence is best-effort
    }
  }

  // Rebuild a player with every current field, defaulting any a save from an
  // older build left out. Keeps restored games from hitting undefined fields.
  function normalizePlayer(p) {
    return {
      id: p.id,
      name: p.name,
      team: ALL_TEAMS.indexOf(p.team) !== -1 ? p.team : null,
      alignment: ALL_TEAMS.indexOf(p.alignment) !== -1 ? p.alignment : null,
      lockedRole: p.lockedRole || null,
      role: p.role || null,
      action: (p.action === 'roast' || p.action === 'burn') ? p.action : null,
      marshmallows: typeof p.marshmallows === 'number' ? p.marshmallows : 0,
      history: Array.isArray(p.history) ? p.history : [],
      startedAsInfiltrator: !!p.startedAsInfiltrator,
      usedAbility: !!p.usedAbility,
      reminder: typeof p.reminder === 'string' ? p.reminder : ''
    };
  }

  // Returns which parts were restored so the boot sequence knows whether it
  // still needs to fetch roles.json.
  function restoreState() {
    var result = { roles: false, players: false };
    if (!storageOk()) {
      return result;
    }

    var raw;
    try {
      raw = localStorage.getItem(SAVE_KEY);
    } catch (err) {
      return result;
    }
    if (!raw) {
      return result;
    }

    var snap;
    try {
      snap = JSON.parse(raw);
    } catch (err) {
      return result; // corrupt save — ignore it
    }
    if (!snap || snap.v !== 1) {
      return result;
    }

    // Only restore saved roles for an uploaded set. The default set is left to
    // loadRoles() (result.roles stays false) so edits to roles.json always show
    // up instead of being shadowed by a stale copy cached in the save.
    if (snap.rolesCustom && Array.isArray(snap.roles) && snap.roles.length) {
      roles = snap.roles;
      rolesCustom = true;
      if (rolesSource && typeof snap.rolesTitle === 'string') {
        rolesSource.textContent = snap.rolesTitle;
      }
      rolesStatus.hidden = true;
      rolesColumns.hidden = false;
      result.roles = true;
    }

    // Camp count is configuration rather than part of the roster, so it comes
    // back whether or not there's a saved game behind it.
    teamCount = snap.teamCount === 3 ? 3 : 2;

    // Only restore a game when there's an actual roster to bring back
    if (Array.isArray(snap.players) && snap.players.length) {
      players = snap.players.map(normalizePlayer);
      nextId = typeof snap.nextId === 'number'
        ? snap.nextId
        : players.reduce(function (m, p) { return Math.max(m, p.id); }, 0) + 1;
      phase = (snap.phase === 'playing') ? 'playing' : 'setup';
      if (snap.picked) {
        ALL_TEAMS.forEach(function (team) {
          picked[team] = Array.isArray(snap.picked[team]) ? snap.picked[team] : [];
        });
      }
      infiltratorCount = typeof snap.infiltratorCount === 'number' ? snap.infiltratorCount : 1;
      // Absent in saves from before the night runner, so an older game resumes
      // at the first step rather than at undefined.
      currentStepKey = typeof snap.currentStepKey === 'string' ? snap.currentStepKey : null;
      currentStepPos = typeof snap.currentStepPos === 'number' ? snap.currentStepPos : 0;
      if (snap.teamNames) {
        ALL_TEAMS.forEach(function (team) {
          if (teamNames[team] && typeof snap.teamNames[team] === 'string') {
            teamNames[team].value = snap.teamNames[team];
          }
        });
      }
      result.players = true;
    }

    return result;
  }

  // Full clean slate: empty roster, no assignments, back to setup. The loaded
  // roles list, camp count and team names are kept (those are configuration,
  // not a game).
  function newGame() {
    players = [];
    nextId = 1;
    ALL_TEAMS.forEach(function (team) {
      picked[team] = [];
    });

    phase = 'setup';
    clearSelection();
    swapSelection = [];
    expandedHistory = {};
    infiltratorCount = 1;
    currentStepKey = null;
    currentStepPos = 0;

    revealMode = false;
    if (revealToggle) {
      revealToggle.checked = false;
    }
    closeReveal();
    closeWheel();

    render();
  }

  // Mirror a team-name input onto the assign button and role heading
  function syncTeamName(team) {
    var name = campName(team);
    assignLabels[team].textContent = name;
    roleTeamNames[team].textContent = name;
  }

  // Switching the camp count re-shapes the roster, so it belongs to setup.
  // Dropping to two camps strands whoever is sitting in the middle, which the
  // render below returns to the unassigned row.
  function setTeamCount(n) {
    if (phase !== 'setup' || n === teamCount) {
      return;
    }

    var stranded = teamPlayers('middle').length;

    if (n === 2 && stranded) {
      var ok = (typeof window !== 'undefined' && window.confirm)
        ? window.confirm('Drop to two camps? The ' + stranded + ' player' +
            (stranded === 1 ? '' : 's') + ' in ' + campName('middle') +
            ' go back to unassigned.')
        : true;
      if (!ok) {
        return;
      }
    }

    teamCount = n;

    clearSelection();
    swapSelection = [];
    closeWheel();

    render();
  }

  function showRolesError(message) {
    rolesStatus.hidden = false;
    rolesStatus.classList.add('is-error');
    rolesStatus.textContent = message;
  }

  // Adopt a parsed roles document (from roles.json or an uploaded file).
  // Returns false without touching anything if the shape is wrong.
  function applyRolesData(data, isCustom, preserveGame) {
    if (!data || !Array.isArray(data.roles) || data.roles.length === 0) {
      return false;
    }

    roles = data.roles;
    rolesCustom = !!isCustom;

    // A new role set invalidates anything that referenced the old one. On a
    // restore we're re-fetching the same default set the saved game was built
    // on, so keep the picks and assigned roles instead of clearing them.
    if (!preserveGame) {
      picked.left = [];
      picked.right = [];
      players.forEach(function (p) {
        p.lockedRole = null;
        p.role = null;
      });
    }

    warnMissingPriorities();

    var title = typeof data.title === 'string' && data.title ? data.title : 'Custom set';
    rolesSource.textContent = title + ' — ' + roles.length + ' roles';

    rolesStatus.hidden = true;
    rolesStatus.classList.remove('is-error');
    rolesColumns.hidden = false;
    // Full render: controls outside the role lists depend on roles loading
    render();
    return true;
  }

  function loadRoles(preserveGame) {
    // cache:'no-cache' revalidates so a redeploy of roles.json is picked up
    // instead of a stale cached copy without the newer fields (e.g. group)
    fetch('roles.json', { cache: 'no-cache' })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.json();
      })
      .then(function (data) {
        if (!applyRolesData(data, false, preserveGame)) {
          showRolesError('roles.json has no non-empty "roles" array.');
        }
      })
      .catch(function () {
        // fetch() is blocked on file:// URLs, which is the likely cause here
        showRolesError(
          'Could not load roles.json. Serve this page over http:// ' +
          '(for example: python -m http.server) rather than opening the file directly. ' +
          'You can also upload a roles JSON above.'
        );
      });
  }

  // Let the user swap in their own roles file without a server round-trip
  function handleRolesUpload() {
    var file = rolesFileInput.files && rolesFileInput.files[0];
    if (!file) {
      return;
    }

    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try {
        data = JSON.parse(reader.result);
      } catch (err) {
        showRolesError('That file isn’t valid JSON.');
        rolesFileInput.value = '';
        return;
      }

      if (!applyRolesData(data, true)) {
        showRolesError('That JSON needs a non-empty "roles" array.');
      }

      // Reset so re-selecting the same file fires 'change' again
      rolesFileInput.value = '';
    };
    reader.onerror = function () {
      showRolesError('Could not read that file.');
      rolesFileInput.value = '';
    };
    reader.readAsText(file);
  }

  function rejectInput() {
    input.classList.add('is-rejected');
    input.focus();
    setTimeout(function () {
      input.classList.remove('is-rejected');
    }, 900);
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var name = input.value.trim();

    if (!name) {
      return;
    }

    var duplicate = players.some(function (p) {
      return p.name.toLowerCase() === name.toLowerCase();
    });

    if (duplicate) {
      rejectInput();
      return;
    }

    addPlayer(name);
    input.value = '';
    input.focus();
    render();
  });

  ALL_TEAMS.forEach(function (team) {
    assignButtons[team].addEventListener('click', function () {
      if (!selectedIds.length) {
        return;
      }
      assignSelected(team);
      render();
    });

    // Keep the assign buttons and role headings showing the current team names
    teamNames[team].addEventListener('input', function () {
      syncTeamName(team);
      // Team names live in the DOM, not player state — persist on edit
      saveState();
    });
  });

  revealToggle.addEventListener('change', function () {
    revealMode = revealToggle.checked;
    clearSelection();
    closeReveal();
    closeWheel();

    render();
  });

  revealModal.addEventListener('click', closeReveal);

  if (loadTestBtn) {
    loadTestBtn.addEventListener('click', function () {
      if (roles.length < TEST_NAMES.length) {
        return;
      }
      loadTestGame();
      render();
    });
  }

  startBtn.addEventListener('click', function () {
    if (!readyToStart()) {
      return;
    }
    phase = 'playing';
    clearSelection();
    currentStepKey = null;
    currentStepPos = 0;

    // Fresh game: nobody has roasted anything yet, and the infiltrators as
    // they stand now are the *original* ones for history purposes.
    players.forEach(function (p) {
      p.marshmallows = 0;
      p.action = null;
      p.history = [];
      p.usedAbility = false;
      p.reminder = '';
      p.startedAsInfiltrator = p.team !== null && p.alignment !== p.team;
    });

    expandedHistory = {};
    swapSelection = [];

    // Reveal is setup-only, so leave it behind cleanly rather than carrying
    // a second mode into the game
    revealMode = false;
    revealToggle.checked = false;
    closeReveal();
    closeWheel();

    render();
  });

  swapBtn.addEventListener('click', function () {
    if (!canSwap()) {
      return;
    }
    swapSelected();
    render();
  });

  [
    { btn: rotateCwBtn, dir: 1 },
    { btn: rotateCcwBtn, dir: -1 }
  ].forEach(function (turn) {
    turn.btn.addEventListener('click', function () {
      if (!canRotate()) {
        return;
      }
      rotateSelected(turn.dir);
      render();
    });
  });

  endRoastBtn.addEventListener('click', resolveNight);

  runnerPrev.addEventListener('click', function () {
    moveStep(-1);
  });

  runnerNext.addEventListener('click', function () {
    moveStep(1);
  });

  // The first keyboard path through a night. Left/right always page; space is
  // offered too, but only when focus is not on a control that owns the key
  // itself, so it never fights a button press or types into a reminder field.
  document.addEventListener('keydown', function (event) {
    if (phase !== 'playing') {
      return;
    }
    // A modal owns the keyboard while it is open
    if (!revealModal.hidden || !wheelModal.hidden) {
      return;
    }

    var el = document.activeElement;
    var tag = el ? el.tagName : '';
    var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable);

    if (typing) {
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveStep(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveStep(-1);
    } else if (event.key === ' ' && tag !== 'BUTTON' && tag !== 'A') {
      event.preventDefault();
      moveStep(1);
    }
  });

  clearActionsBtn.addEventListener('click', function () {
    players.forEach(function (p) {
      p.action = null;
    });
    render();
  });

  newGameBtn.addEventListener('click', function () {
    var ok = (typeof window !== 'undefined' && window.confirm)
      ? window.confirm('Start a new game? This removes all players and clears ' +
          'the current game. The loaded roles and camp names are kept.')
      : true;
    if (ok) {
      newGame();
    }
  });

  // Setup-page reset: same clear as New game, reachable before a game starts
  if (resetAllBtn) {
    resetAllBtn.addEventListener('click', function () {
      var ok = (typeof window !== 'undefined' && window.confirm)
        ? window.confirm('Reset everything? This removes all players and clears ' +
            'every role choice. The loaded roles and camp names are kept.')
        : true;
      if (ok) {
        newGame();
      }
    });
  }

  if (infiltrateCountSelect) {
    infiltrateCountSelect.addEventListener('change', function () {
      var n = parseInt(infiltrateCountSelect.value, 10);
      infiltratorCount = isNaN(n) ? 1 : n;
      render();
    });
  }

  infiltrateBtn.addEventListener('click', function () {
    if (!canAssignInfiltrators()) {
      return;
    }
    assignInfiltrators(infiltratorCount);
    render();
  });

  autoAssignBtn.addEventListener('click', function () {
    if (!readyToAssign()) {
      return;
    }
    autoAssign();
    render();
  });

  clearAssignBtn.addEventListener('click', function () {
    clearAssignments();
    render();
  });

  campCountButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      setTeamCount(parseInt(btn.dataset.count, 10));
    });
  });

  wheelBtn.addEventListener('click', openWheel);
  wheelSpinBtn.addEventListener('click', spinWheel);
  wheelCloseBtn.addEventListener('click', closeWheel);

  if (rolesFileInput) {
    rolesFileInput.addEventListener('change', handleRolesUpload);
  }

  // Bring back an in-progress game if one was left open, then reflect any
  // restored team names on the mirrored labels.
  var restored = restoreState();
  ALL_TEAMS.forEach(syncTeamName);

  render();

  // The default set isn't persisted, so fetch it unless an uploaded set was
  // restored. Preserve any restored game's picks/roles across that fetch.
  if (!restored.roles) {
    loadRoles(restored.players);
  }

});
