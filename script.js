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

  // Id of the unassigned player currently picked, or null. Assignment is
  // one-way: once a player is on a team they can only be deleted.
  var selectedId = null;

  var form = document.getElementById('player-form');
  var input = document.getElementById('player-input');
  var empty = document.getElementById('players-empty');

  var grids = {
    left: document.getElementById('left-grid'),
    none: document.getElementById('none-grid'),
    right: document.getElementById('right-grid')
  };

  var counts = {
    left: document.getElementById('left-count'),
    right: document.getElementById('right-count')
  };

  var teamNames = {
    left: document.getElementById('team-left-name'),
    right: document.getElementById('team-right-name')
  };

  var campTotals = {
    left: document.getElementById('left-total'),
    right: document.getElementById('right-total')
  };

  var assignButtons = {
    left: document.getElementById('assign-left'),
    right: document.getElementById('assign-right')
  };

  var assignLabels = {
    left: document.getElementById('assign-left-label'),
    right: document.getElementById('assign-right-label')
  };

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
  var picked = { left: [], right: [] };

  var rolesStatus = document.getElementById('roles-status');
  var rolesColumns = document.getElementById('roles-columns');
  var rolesSource = document.getElementById('roles-source');
  var rolesFileInput = document.getElementById('roles-file');

  var roleLists = {
    left: document.getElementById('roles-left-list'),
    right: document.getElementById('roles-right-list')
  };

  var roleProgress = {
    left: document.getElementById('roles-left-progress'),
    right: document.getElementById('roles-right-progress')
  };

  var roleTeamNames = {
    left: document.getElementById('roles-left-name'),
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

  var nightPanel = document.getElementById('night-order');
  var nightList = document.getElementById('night-list');

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
    if (selectedId === id) {
      selectedId = null;
    }
  }

  function assignPlayer(player, team) {
    player.team = team;
    // Loyal to their own camp until infiltrators are drawn
    player.alignment = team;

    if (selectedId === player.id) {
      selectedId = null;
    }
  }

  function assignSelected(team) {
    var player = playerById(selectedId);
    if (player) {
      assignPlayer(player, team);
    }
    selectedId = null;
  }

  function unassignedPlayers() {
    return players.filter(function (p) {
      return p.team === null;
    });
  }

  // One player per camp is secretly loyal to the opposite camp. Re-running
  // redraws both, so everyone resets to their own camp first.
  function assignInfiltrators(count) {
    // Default to one so existing callers (e.g. the test fixture) are unaffected
    count = (typeof count === 'number' && count > 0) ? count : 1;

    ['left', 'right'].forEach(function (team) {
      var roster = teamPlayers(team);
      if (!roster.length) {
        return;
      }

      roster.forEach(function (p) {
        p.alignment = team;
      });

      // Can't have more moles than the camp has players
      var n = Math.min(count, roster.length);
      shuffle(roster).slice(0, n).forEach(function (mole) {
        mole.alignment = otherTeam(team);
      });
    });
  }

  // Ids picked for a camp swap during play (at most two)
  var swapSelection = [];

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

    // Keep the most recent two picks
    swapSelection.push(id);
    if (swapSelection.length > 2) {
      swapSelection.shift();
    }
  }

  // Two players, one from each camp
  function canSwap() {
    if (swapSelection.length !== 2) {
      return false;
    }
    var a = playerById(swapSelection[0]);
    var b = playerById(swapSelection[1]);
    return !!a && !!b && a.team !== null && b.team !== null && a.team !== b.team;
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
    selectedId = null;

    TEST_NAMES.forEach(function (name, i) {
      addPlayer(name);
      var p = players[players.length - 1];
      p.team = i < 3 ? 'left' : 'right';
      p.alignment = p.team;
    });

    // Six distinct roles, three per camp
    var chosen = shuffle(roles).slice(0, 6).map(function (r) {
      return r.name;
    });
    picked.left = chosen.slice(0, 3);
    picked.right = chosen.slice(3, 6);

    autoAssign();
    assignInfiltrators();
  }

  // Everyone on a camp has a role in hand
  // Camps must be within one player of each other — no lopsided games
  function campsBalanced() {
    return Math.abs(teamSize('left') - teamSize('right')) <= 1;
  }

  function readyToStart() {
    var seated = players.filter(function (p) {
      return p.team !== null;
    });
    return seated.length > 0 &&
      teamSize('left') > 0 &&
      teamSize('right') > 0 &&
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
    if (teamSize('left') === 0 || teamSize('right') === 0) {
      return 'Both camps need at least one player.';
    }
    if (!campsBalanced()) {
      return 'Camps must be equal, or differ by at most one player (' +
        teamSize('left') + ' vs ' + teamSize('right') + ').';
    }
    return 'Every player on a camp needs a role.';
  }

  // Single owner of what's on screen. Reveal mode is a setup-phase tool only —
  // it can't be reached once the game starts.
  function applyView() {
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
    return teamSize('left') > 0 && teamSize('right') > 0;
  }

  // A camp can't hold more infiltrators than it has players, so the ceiling is
  // set by the smaller camp.
  function maxInfiltrators() {
    return Math.min(teamSize('left'), teamSize('right'));
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
      return 'Both camps need at least one player.';
    }
    if (!hasInfiltrators()) {
      return 'Everyone is loyal to their own camp.';
    }

    var left = infiltratorsIn('left');
    var right = infiltratorsIn('right');
    if (left === right) {
      return left + ' player' + (left === 1 ? '' : 's') +
        ' in each camp loyal to the other side.';
    }
    return left + ' loyal to the other side on the left, ' +
      right + ' on the right.';
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

  function renderNightOrder() {
    nightPanel.hidden = phase !== 'playing';
    // Clear even when hidden so stale (possibly expanded) rows don't linger
    nightList.textContent = '';
    if (phase !== 'playing') {
      return;
    }

    nightOrder().forEach(function (step) {
      var item = document.createElement('li');
      item.className = 'night-step';
      item.dataset.alignment = step.player.alignment;

      // Burn-gated roles do nothing unless the player actually burned, and a
      // spent once-per-game role does nothing at all any more
      if (roleRequiresBurn(step.role) && step.player.action !== 'burn') {
        item.classList.add('is-inactive');
      }
      if (roleOncePerGame(step.role) && step.player.usedAbility) {
        item.classList.add('is-inactive');
      }

      var body = document.createElement('div');
      body.className = 'night-step-body';

      var role = document.createElement('span');
      role.className = 'night-role';
      role.textContent = step.role.name;
      body.appendChild(role);

      var who = document.createElement('span');
      who.className = 'night-player';
      who.dataset.alignment = step.player.alignment;
      who.textContent = ' — ' + step.player.name;
      body.appendChild(who);

      var desc = document.createElement('span');
      desc.className = 'night-desc';
      desc.textContent = step.role.description;
      body.appendChild(desc);

      var action = document.createElement('span');
      action.className = 'night-action';
      if (step.player.action === 'roast') {
        action.textContent = '☁️';
        action.title = 'Roasting';
      } else if (step.player.action === 'burn') {
        action.textContent = '🔥';
        action.title = 'Burning';
      } else {
        action.textContent = '☁️';
        action.title = 'Undecided';
        action.classList.add('is-undecided');
      }

      var open = !!expandedHistory[step.player.id];

      var caret = document.createElement('span');
      caret.className = 'night-caret';
      caret.textContent = open ? '▾' : '▸';

      var row = document.createElement('div');
      row.className = 'night-row';
      row.appendChild(caret);
      row.appendChild(body);

      // Once-per-game roles get a spend marker the moderator can flip
      if (roleOncePerGame(step.role)) {
        row.appendChild(buildOnceToggle(step.player));
      }

      row.appendChild(action);
      row.addEventListener('click', function () {
        if (expandedHistory[step.player.id]) {
          delete expandedHistory[step.player.id];
        } else {
          expandedHistory[step.player.id] = true;
        }
        renderNightOrder();
      });

      item.appendChild(row);

      if (open) {
        item.appendChild(buildHistory(step.player));
      }

      nightList.appendChild(item);
    });
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
      { value: 'roast', glyph: '☁️', label: 'Roast a marshmallow' },
      { value: 'burn', glyph: '🔥', label: 'Burn a marshmallow' }
    ].forEach(function (choice) {
      var btn = document.createElement('button');
      btn.className = 'action-btn action-' + choice.value;
      btn.type = 'button';
      btn.textContent = choice.glyph;
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

    // Only unassigned players are selectable, and only during setup
    if (player.team === null && phase === 'setup') {
      if (player.id === selectedId) {
        card.classList.add('is-selected');
      }
      card.setAttribute('aria-pressed', player.id === selectedId);
      card.addEventListener('click', function () {
        selectedId = (selectedId === player.id) ? null : player.id;
        render();
      });
    }

    return card;
  }

  function render() {
    var tally = { left: 0, none: 0, right: 0 };

    // Settle role state first so the cards below render from clean data
    trimPicks();
    pruneRoleState();

    grids.left.textContent = '';
    grids.none.textContent = '';
    grids.right.textContent = '';

    players.forEach(function (player) {
      var k = key(player.team);
      grids[k].appendChild(buildCard(player));
      tally[k]++;
    });

    counts.left.textContent = tally.left;
    counts.right.textContent = tally.right;

    ['left', 'right'].forEach(function (team) {
      campTotals[team].textContent = campMarshmallows(team);
      campTotals[team].hidden = phase !== 'playing';
    });

    empty.hidden = players.length > 0;

    assignButtons.left.disabled = selectedId === null || revealMode;
    assignButtons.right.disabled = selectedId === null || revealMode;
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
    gameBarText.textContent = 'Game in progress — ' + decided + ' of ' + seated + ' chosen.';

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

  function otherTeam(team) {
    return team === 'left' ? 'right' : 'left';
  }

  function campName(team) {
    if (team !== 'left' && team !== 'right') {
      return 'nobody';
    }
    return teamNames[team].value.trim() ||
      (team === 'left' ? 'Left camp' : 'Right camp');
  }

  // A camp can hold exactly as many roles as it has players, so removing
  // players has to drop picks that no longer fit.
  function trimPicks() {
    ['left', 'right'].forEach(function (team) {
      picked[team] = picked[team].slice(0, teamSize(team));
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
    if (picked[otherTeam(team)].indexOf(roleName) !== -1) {
      return;
    }

    picked[team].push(roleName);
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
    var takenByOther = picked[otherTeam(team)].indexOf(role.name) !== -1;
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
      if (p.alignment !== 'left' && p.alignment !== 'right') {
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

    ['left', 'right'].forEach(function (team) {
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
    return ['left', 'right'].every(function (team) {
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
    ['left', 'right'].forEach(function (team) {
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
        'Both camps need players and exactly enough roles chosen to cover them.';
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

    ['left', 'right'].forEach(function (team) {
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
  // one spin at a time. Every unassigned player gets an equal slice; the camp
  // a winner lands in alternates on each spin, so the two stay level.
  //
  // Geometry: slice 0 starts at 12 o'clock and they run clockwise, which is
  // exactly how conic-gradient lays its stops out. The pointer sits at 12
  // o'clock too, so a slice at clockwise angle `a` is under the pointer once
  // the disc has been rotated by −a.
  // ==========================================================================

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

  // Camp the next winner joins. Flips after every spin.
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

  // Evenly spaced hues, with alternating lightness so neighbouring slices stay
  // apart even when a big roster packs the hues close together. Light enough
  // throughout that the dark slice labels stay readable.
  function sliceColor(index, total) {
    var hue = Math.round((index * 360) / total);
    var light = index % 2 === 0 ? 66 : 54;
    return 'hsl(' + hue + ', 68%, ' + light + '%)';
  }

  // Names get smaller as slices get thinner
  function wheelLabelSize(total) {
    if (total > 14) {
      return '0.85rem';
    }
    if (total > 9) {
      return '1.05rem';
    }
    if (total > 5) {
      return '1.3rem';
    }
    return '1.6rem';
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
      var label = document.createElement('div');
      label.className = 'wheel-label';
      label.textContent = player.name;
      label.style.transform = 'rotate(' + ((i + 0.5) * slice - 90) + 'deg)';
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

    // Still "spinning" as far as the SPIN button is concerned — the pause is
    // part of the same turn and must not be cut short by another press.
    setTimeout(function () {
      if (spinId !== wheelSpinId) {
        return;
      }

      wheelSpinning = false;

      var team = wheelTeam;
      assignPlayer(player, team);
      wheelTeam = otherTeam(team);

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

    // Start with whichever camp is behind, so alternating from there leaves
    // the two within a player of each other however many names are in play.
    wheelTeam = teamSize('left') <= teamSize('right') ? 'left' : 'right';

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
        picked: { left: picked.left, right: picked.right },
        infiltratorCount: infiltratorCount,
        roles: roles,
        rolesCustom: rolesCustom,
        rolesTitle: rolesSource ? rolesSource.textContent : '',
        teamNames: {
          left: teamNames.left ? teamNames.left.value : '',
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
      team: (p.team === 'left' || p.team === 'right') ? p.team : null,
      alignment: (p.alignment === 'left' || p.alignment === 'right') ? p.alignment : null,
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

    // Only restore a game when there's an actual roster to bring back
    if (Array.isArray(snap.players) && snap.players.length) {
      players = snap.players.map(normalizePlayer);
      nextId = typeof snap.nextId === 'number'
        ? snap.nextId
        : players.reduce(function (m, p) { return Math.max(m, p.id); }, 0) + 1;
      phase = (snap.phase === 'playing') ? 'playing' : 'setup';
      if (snap.picked) {
        picked.left = Array.isArray(snap.picked.left) ? snap.picked.left : [];
        picked.right = Array.isArray(snap.picked.right) ? snap.picked.right : [];
      }
      infiltratorCount = typeof snap.infiltratorCount === 'number' ? snap.infiltratorCount : 1;
      if (snap.teamNames) {
        if (teamNames.left && typeof snap.teamNames.left === 'string') {
          teamNames.left.value = snap.teamNames.left;
        }
        if (teamNames.right && typeof snap.teamNames.right === 'string') {
          teamNames.right.value = snap.teamNames.right;
        }
      }
      result.players = true;
    }

    return result;
  }

  // Full clean slate: empty roster, no assignments, back to setup. The loaded
  // roles list and team names are kept (those are configuration, not a game).
  function newGame() {
    players = [];
    nextId = 1;
    picked.left = [];
    picked.right = [];

    phase = 'setup';
    selectedId = null;
    swapSelection = [];
    expandedHistory = {};
    infiltratorCount = 1;

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
    var name = teamNames[team].value.trim() ||
      (team === 'left' ? 'Left team' : 'Right team');
    assignLabels[team].textContent = name;
    roleTeamNames[team].textContent = name;
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

  ['left', 'right'].forEach(function (team) {
    assignButtons[team].addEventListener('click', function () {
      if (selectedId === null) {
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
    selectedId = null;
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
    selectedId = null;

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

  endRoastBtn.addEventListener('click', function () {
    endRoastingPhase();
    render();
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

  wheelBtn.addEventListener('click', openWheel);
  wheelSpinBtn.addEventListener('click', spinWheel);
  wheelCloseBtn.addEventListener('click', closeWheel);

  if (rolesFileInput) {
    rolesFileInput.addEventListener('change', handleRolesUpload);
  }

  // Bring back an in-progress game if one was left open, then reflect any
  // restored team names on the mirrored labels.
  var restored = restoreState();
  syncTeamName('left');
  syncTeamName('right');

  render();

  // The default set isn't persisted, so fetch it unless an uploaded set was
  // restored. Preserve any restored game's picks/roles across that fetch.
  if (!restored.roles) {
    loadRoles(restored.players);
  }

});
