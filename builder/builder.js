// Swapperman — custom script builder

(function () {
  'use strict';

  var rolesEl = document.getElementById('roles');
  var titleEl = document.getElementById('script-title');
  var authorEl = document.getElementById('script-author');
  var outputEl = document.getElementById('output');
  var statusEl = document.getElementById('status');
  var sheetEl = document.getElementById('sheet');
  var sheetFrameEl = sheetEl.parentNode;
  var keepGroupsEl = document.getElementById('keep-groups');

  var ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

  function toRoman(n) {
    return ROMAN[n] || String(n);
  }

  // One editable row per role. Values are read straight out of the DOM at
  // export time, so there's no separate state to keep in sync.
  function addRole(data) {
    data = data || {};

    var row = document.createElement('div');
    row.className = 'role-row';

    row.innerHTML =
      '<div class="role-main">' +
        '<div class="field">' +
          '<label>Name<input type="text" data-key="name"></label>' +
        '</div>' +
        '<div class="field">' +
          '<label>Description<textarea data-key="description" rows="4"></textarea></label>' +
        '</div>' +
      '</div>' +
      '<div class="role-params">' +
        '<div class="field">' +
          '<label>Group<input type="number" data-key="group" step="1" min="0"></label>' +
        '</div>' +
        '<div class="field">' +
          '<label>Priority<input type="number" data-key="priority" step="1"></label>' +
        '</div>' +
        '<div class="field field-check">' +
          '<label><input type="checkbox" data-key="requires_burn"> requires_burn</label>' +
        '</div>' +
        '<div class="field field-check">' +
          '<label><input type="checkbox" data-key="once_per_game"> once_per_game</label>' +
        '</div>' +
        '<div class="field field-check">' +
          '<label><input type="checkbox" data-key="can_be_swapped" checked> can_be_swapped</label>' +
        '</div>' +
        '<button type="button" class="remove">Remove</button>' +
      '</div>';

    // Seed the inputs from imported/default data
    setValue(row, 'name', data.name || '');
    setValue(row, 'description', data.description || '');
    setValue(row, 'group', typeof data.group === 'number' ? data.group : 1);
    setValue(row, 'priority', typeof data.priority === 'number' ? data.priority : 2);
    setChecked(row, 'requires_burn', data.requires_burn === true);
    setChecked(row, 'once_per_game', data.once_per_game === true);
    // can_be_swapped defaults to true, so only an explicit false unchecks it
    setChecked(row, 'can_be_swapped', data.can_be_swapped !== false);

    row.querySelector('.remove').addEventListener('click', function () {
      row.parentNode.removeChild(row);
      renderPreview();
    });

    rolesEl.appendChild(row);
    return row;
  }

  function field(row, key) {
    return row.querySelector('[data-key="' + key + '"]');
  }

  function setValue(row, key, value) {
    field(row, key).value = value;
  }

  function setChecked(row, key, on) {
    field(row, key).checked = on;
  }

  // Turn one role row into a plain object. Optional flags are only written when
  // they differ from their default, matching the hand-written roles.json style.
  function readRole(row) {
    var role = {};

    var name = field(row, 'name').value.trim();
    role.name = name;

    var group = parseInt(field(row, 'group').value, 10);
    if (!isNaN(group)) {
      role.group = group;
    }

    var priority = parseInt(field(row, 'priority').value, 10);
    if (!isNaN(priority)) {
      role.priority = priority;
    }

    if (field(row, 'requires_burn').checked) {
      role.requires_burn = true;
    }
    if (field(row, 'once_per_game').checked) {
      role.once_per_game = true;
    }
    // Default is true, so only record the opt-out
    if (!field(row, 'can_be_swapped').checked) {
      role.can_be_swapped = false;
    }

    role.description = field(row, 'description').value.trim();

    return role;
  }

  function buildScript() {
    var roles = [];
    var rows = rolesEl.querySelectorAll('.role-row');
    for (var i = 0; i < rows.length; i++) {
      roles.push(readRole(rows[i]));
    }
    return {
      title: titleEl.value.trim() || 'Custom Script',
      author: authorEl.value.trim(),
      roles: roles
    };
  }

  // A script is exportable only if every role has a name and description and a
  // numeric priority — the fields the game relies on.
  function validate(script) {
    if (!script.roles.length) {
      return 'Add at least one role.';
    }
    for (var i = 0; i < script.roles.length; i++) {
      var r = script.roles[i];
      var n = i + 1;
      if (!r.name) {
        return 'Role ' + n + ' needs a name.';
      }
      if (!r.description) {
        return 'Role "' + r.name + '" needs a description.';
      }
      if (typeof r.priority !== 'number') {
        return 'Role "' + r.name + '" needs a numeric priority.';
      }
      if (typeof r.group !== 'number') {
        return 'Role "' + r.name + '" needs a numeric group.';
      }
    }
    return '';
  }

  function exportJson() {
    var script = buildScript();
    var error = validate(script);
    if (error) {
      status(error, true);
      outputEl.value = '';
      return null;
    }
    var json = JSON.stringify(script, null, 2);
    outputEl.value = json;
    status(script.roles.length + ' role' + (script.roles.length === 1 ? '' : 's') + ' exported.', false);
    return json;
  }

  function download() {
    var json = exportJson();
    if (!json) {
      return;
    }
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'roles.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function copy() {
    var json = exportJson();
    if (!json) {
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(function () {
        status('Copied to clipboard.', false);
      }, function () {
        selectOutput();
      });
    } else {
      selectOutput();
    }
  }

  function selectOutput() {
    outputEl.focus();
    outputEl.select();
    status('Select-all is ready — press Ctrl/Cmd+C to copy.', false);
  }

  function importFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try {
        data = JSON.parse(reader.result);
      } catch (err) {
        status('That file isn’t valid JSON.', true);
        return;
      }
      if (!data || !Array.isArray(data.roles)) {
        status('That JSON has no "roles" array.', true);
        return;
      }
      loadScript(data);
      status('Imported ' + data.roles.length + ' role' + (data.roles.length === 1 ? '' : 's') + '.', false);
    };
    reader.onerror = function () {
      status('Could not read that file.', true);
    };
    reader.readAsText(file);
  }

  function loadScript(data) {
    titleEl.value = typeof data.title === 'string' ? data.title : 'Custom Script';
    authorEl.value = typeof data.author === 'string' ? data.author : '';
    rolesEl.textContent = '';
    data.roles.forEach(function (role) {
      addRole(role);
    });
    renderPreview();
  }

  function status(message, isError) {
    statusEl.textContent = message;
    statusEl.className = 'io-status' + (isError ? ' is-error' : '');
  }

  // ------------------------------------------------------------------
  // Printable preview: an 8.5x11 sheet, title/author across the top and
  // roles in two columns grouped with numeral dividers.
  // ------------------------------------------------------------------

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text != null) {
      node.textContent = text;
    }
    return node;
  }

  function renderPreview() {
    var script = buildScript();

    sheetEl.textContent = '';

    var head = el('div', 'sheet-head');
    head.appendChild(el('div', 'sheet-title', script.title || 'Custom Script'));
    if (script.author) {
      head.appendChild(el('div', 'sheet-author', 'by ' + script.author));
    }
    sheetEl.appendChild(head);

    var body = el('div', 'sheet-body');
    // When on, whole groups are kept from splitting across the two columns
    body.classList.toggle('keep-groups', keepGroupsEl.checked);

    // Grouped and ordered the same way the game shows them
    var ordered = script.roles.slice().sort(function (a, b) {
      return (a.group || 0) - (b.group || 0);
    });

    // Each group (divider + its roles) lives in one block so it can be kept
    // together in a single column when the option is on.
    var lastGroup = null;
    var block = null;
    ordered.forEach(function (role) {
      var group = typeof role.group === 'number' ? role.group : 0;
      if (group !== lastGroup) {
        block = el('div', 'sheet-group-block');
        var divider = el('div', 'sheet-group');
        divider.appendChild(el('span', null, toRoman(group)));
        block.appendChild(divider);
        body.appendChild(block);
        lastGroup = group;
      }

      var item = el('div', 'sheet-role');
      item.appendChild(el('span', 'sheet-role-name', role.name || 'Untitled'));
      if (role.description) {
        item.appendChild(document.createTextNode(' '));
        item.appendChild(el('span', 'sheet-role-desc', role.description));
      }
      block.appendChild(item);
    });

    sheetEl.appendChild(body);

    fitSheet(body);
    scaleSheet();
  }

  // "Scale to fit one page": shrink the font until the two-column body stops
  // overflowing into extra columns (scrollWidth grows when it does).
  function fitSheet(body) {
    var size = 16;
    sheetEl.style.fontSize = size + 'px';
    while (size > 6 && body.scrollWidth > body.clientWidth + 1) {
      size -= 0.5;
      sheetEl.style.fontSize = size + 'px';
    }
  }

  // The sheet is laid out at true letter size (816x1056px at 96dpi) so it
  // prints accurately; on screen we scale it down to fit the preview pane —
  // constrained by both the pane width and the remaining window height so the
  // whole page stays visible without scrolling.
  function scaleSheet() {
    var naturalW = 8.5 * 96;
    var naturalH = 11 * 96;

    // Pane width comes from the (un-resized) aside, so reading it back doesn't
    // feed into the frame width we set below
    var availW = sheetFrameEl.parentNode.clientWidth;
    var top = sheetFrameEl.getBoundingClientRect().top;
    var availH = Math.max(120, window.innerHeight - top - 16);

    var k = Math.min(1, availW / naturalW, availH / naturalH);

    sheetEl.style.transform = 'scale(' + k + ')';
    sheetFrameEl.style.width = (naturalW * k) + 'px';
    sheetFrameEl.style.height = (naturalH * k) + 'px';
  }

  document.getElementById('add-role').addEventListener('click', function () {
    addRole();
    renderPreview();
  });
  document.getElementById('export').addEventListener('click', exportJson);
  document.getElementById('download').addEventListener('click', download);
  document.getElementById('copy').addEventListener('click', copy);
  document.getElementById('print').addEventListener('click', function () {
    window.print();
  });
  document.getElementById('import-file').addEventListener('change', function () {
    var file = this.files && this.files[0];
    if (file) {
      importFile(file);
    }
    this.value = '';
  });

  // Live preview: any edit to a role, the title, or the author re-renders it
  rolesEl.addEventListener('input', renderPreview);
  rolesEl.addEventListener('change', renderPreview);
  titleEl.addEventListener('input', renderPreview);
  authorEl.addEventListener('input', renderPreview);
  keepGroupsEl.addEventListener('change', renderPreview);
  window.addEventListener('resize', scaleSheet);

  // Start with one empty role so the page isn't blank
  addRole();
  renderPreview();
})();
