/* ── inspector.js ── Unified inspector panel (replaces editing.js, groups.js, schedule-setup.js) */

let _selection = { type: null, dayId: null, entityId: null };
let _deleteTimer = null;
let _expandedDayId = null;
let _settingsTab = 'general';

// ── Selection ──────────────────────────────────────────────────────────────

function selectEntity(type, dayId, entityId) {
  _selection = { type: type || null, dayId: dayId || null, entityId: entityId || null };
  renderInspector();
  // Highlight selected band/note in preview
  document.querySelectorAll('.band.selected').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('.notes-list li.selected').forEach(n => n.classList.remove('selected'));
  if (type === 'event' && entityId) {
    const band = document.querySelector('.band[data-event-id="' + entityId + '"]');
    if (band) band.classList.add('selected');
  } else if (type === 'note' && entityId) {
    const noteEl = document.querySelector('.notes-list li[data-note-id="' + entityId + '"]');
    if (noteEl) noteEl.classList.add('selected');
  }
}

// ── Render dispatcher ──────────────────────────────────────────────────────

function renderInspector() {
  const panel = document.getElementById('inspectorPanel');
  if (!panel) return;
  clearDeleteTimer();

  if (_selection.type === 'event' && _selection.dayId && _selection.entityId) {
    renderEventInspector(panel, _selection.dayId, _selection.entityId);
  } else if (_selection.type === 'note' && _selection.dayId && _selection.entityId) {
    renderNoteInspector(panel, _selection.dayId, _selection.entityId);
  } else {
    renderScheduleSetup(panel);
  }
}

// ── Face 1: Schedule Setup ─────────────────────────────────────────────────

function renderScheduleSetup(panel) {
  const days = Store.getDays();

  let html = '<h3>Days</h3>';

  // Days — accordion
  html += '<div class="insp-day-accordion">';
  days.forEach((day, i) => {
    const shortDate = day.date ? formatDateShort(day.date) : 'Day ' + (i + 1);
    const timeRange = day.startTime + '–' + day.endTime;
    const isExpanded = day.id === (_expandedDayId || '');
    html += '<div class="insp-day-item" data-day-id="' + esc(day.id) + '">';
    // Collapsed header — always visible
    html += '<div class="insp-day-header' + (isExpanded ? ' expanded' : '') + '">';
    html += '<span class="insp-day-arrow">' + (isExpanded ? '▾' : '▸') + '</span>';
    html += '<span class="insp-day-summary">';
    html += '<strong>' + esc(shortDate) + '</strong>';
    html += '<span class="insp-day-times">' + esc(timeRange) + '</span>';
    html += '</span>';
    html += '</div>';
    // Expanded body — only shown when active
    if (isExpanded) {
      html += '<div class="insp-day-body">';
      html += '<label>Date</label>';
      html += '<input type="date" class="insp-day-date" value="' + esc(day.date) + '">';
      html += '<div class="field-row">';
      html += '<div><label>Start</label><input type="text" class="insp-day-start" value="' + esc(day.startTime) + '" placeholder="0700"></div>';
      html += '<div><label>End</label><input type="text" class="insp-day-end" value="' + esc(day.endTime) + '" placeholder="1630"></div>';
      html += '</div>';
      html += '<label>Label</label>';
      html += '<input type="text" class="insp-day-label" value="' + esc(day.label || '') + '" placeholder="auto (e.g., Day 1)">';
      if (days.length > 1) {
        html += '<button class="btn btn-danger insp-day-remove" style="font-size:10px;padding:3px 8px;margin-top:6px;">Remove Day</button>';
      }
      html += '</div>';
    }
    html += '</div>';
  });
  html += '</div>';

  html += '<p class="insp-hint" style="margin-top:12px;">Click an event or note on the schedule to edit it here.</p>';

  panel.innerHTML = html;
  wireScheduleSetup(panel);
}

function wireScheduleSetup(panel) {
  // Day accordion headers — toggle expand/collapse
  panel.querySelectorAll('.insp-day-header').forEach(header => {
    header.addEventListener('click', () => {
      const dayId = header.closest('.insp-day-item').getAttribute('data-day-id');
      _expandedDayId = (_expandedDayId === dayId) ? null : dayId;
      renderInspector();
    });
  });

  // Day fields (only wired for the expanded day)
  panel.querySelectorAll('.insp-day-body').forEach(body => {
    const item = body.closest('.insp-day-item');
    const dayId = item.getAttribute('data-day-id');
    wireDayField(body, '.insp-day-date', dayId, 'date');
    wireDayField(body, '.insp-day-start', dayId, 'startTime');
    wireDayField(body, '.insp-day-end', dayId, 'endTime');
    wireDayField(body, '.insp-day-label', dayId, 'label', true);

    const removeBtn = body.querySelector('.insp-day-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        saveUndoState();
        Store.removeDay(dayId);
        _expandedDayId = null;
        const days = Store.getDays();
        if (days.length && !days.find(d => d.id === Store.getActiveDay())) {
          Store.setActiveDay(days[0].id);
        }
        sessionSave();
        renderActiveDay();
        renderInspector();
      });
    }
  });
}

// ── Settings Modal ────────────────────────────────────────────────────────

function openSettingsModal() {
  const modal = document.getElementById('settingsModalContent');
  renderSettingsModal(modal);
  document.getElementById('settingsModal').classList.add('active');
}

function closeSettingsModal() {
  document.getElementById('settingsModal').classList.remove('active');
  renderActiveDay();
  renderInspector();
}

function renderSettingsModal(modal) {
  const title = Store.getTitle();
  const footer = Store.getFooter();
  const groups = Store.getGroups();

  let html = '<h2>Schedule Settings</h2>';

  // Tabs
  html += '<div class="modal-tabs">';
  html += '<button class="modal-tab' + (_settingsTab === 'general' ? ' active' : '') + '" data-tab="general">General</button>';
  html += '<button class="modal-tab' + (_settingsTab === 'groups' ? ' active' : '') + '" data-tab="groups">Audience Groups</button>';
  html += '</div>';

  // General tab
  html += '<div class="settings-tab-content" id="settingsTabGeneral"' + (_settingsTab !== 'general' ? ' style="display:none;"' : '') + '>';
  html += '<label class="settings-label">Schedule Title</label>';
  html += '<input type="text" class="settings-input" id="settings-title" value="' + esc(title) + '">';
  html += '<label class="settings-label">Logo</label>';
  html += '<input type="file" class="settings-input" id="settings-logo" accept="image/*" style="font-size:12px;padding:5px 8px;">';
  if (Store.getLogo()) {
    html += '<div style="margin-top:4px;display:flex;align-items:center;gap:8px;"><img src="' + esc(Store.getLogo()) + '" style="max-height:48px;border-radius:4px;"> ';
    html += '<button class="btn" id="settings-logo-remove" style="font-size:10px;padding:2px 8px;">Remove</button></div>';
  }
  html += '<label class="settings-label">Contact / Header Line</label>';
  html += '<input type="text" class="settings-input" id="settings-contact" value="' + esc(footer.contact) + '">';
  html += '<label class="settings-label">Schedule POC</label>';
  html += '<input type="text" class="settings-input" id="settings-poc" value="' + esc(footer.poc) + '">';
  html += '</div>';

  // Groups tab
  html += '<div class="settings-tab-content" id="settingsTabGroups"' + (_settingsTab !== 'groups' ? ' style="display:none;"' : '') + '>';
  html += '<p class="insp-hint" style="margin-top:0;margin-bottom:8px;">Main groups get schedule bands. Limited groups appear as concurrent when overlapping.</p>';
  groups.forEach(g => {
    html += '<div class="insp-group-item" data-group-id="' + esc(g.id) + '">';
    html += '<input type="color" class="insp-group-color" value="' + esc(g.color) + '">';
    html += '<input type="text" class="insp-group-name" value="' + esc(g.name) + '" placeholder="Group name">';
    html += '<button class="insp-group-scope ' + (g.scope === 'main' ? 'main' : '') + '" title="Toggle between Main and Limited scope">' + (g.scope === 'main' ? 'Main' : 'Limited') + '</button>';
    html += '<button class="insp-group-remove">&times;</button>';
    html += '</div>';
  });
  html += '<button class="btn" id="settings-add-group" style="margin-top:6px;font-size:11px;">+ Add Group</button>';
  html += '</div>';

  // Data section + Done
  html += '<div class="modal-actions">';
  html += '<button class="btn" id="settings-save-file">Save to File</button>';
  html += '<button class="btn btn-primary" id="settings-done">Done</button>';
  html += '</div>';

  modal.innerHTML = html;
  wireSettingsModal(modal);
}

function wireSettingsModal(modal) {
  // Tab switching
  modal.querySelectorAll('.modal-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      _settingsTab = tab.getAttribute('data-tab');
      renderSettingsModal(modal);
    });
  });

  // General tab fields — auto-commit on change
  const titleInput = modal.querySelector('#settings-title');
  if (titleInput) {
    titleInput.addEventListener('input', () => {
      saveUndoState();
      Store.setTitle(titleInput.value.trim());
      syncToolbarTitle();
      sessionSave();
    });
  }

  // Logo upload
  const logoInput = modal.querySelector('#settings-logo');
  if (logoInput) {
    logoInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        saveUndoState();
        Store.setLogo(ev.target.result);
        sessionSave();
        renderSettingsModal(modal);
      };
      reader.readAsDataURL(file);
    });
  }
  const logoRemove = modal.querySelector('#settings-logo-remove');
  if (logoRemove) {
    logoRemove.addEventListener('click', () => {
      saveUndoState();
      Store.setLogo(null);
      sessionSave();
      renderSettingsModal(modal);
    });
  }

  // Footer fields
  wireSettingsFooterField(modal, '#settings-contact', 'contact');
  wireSettingsFooterField(modal, '#settings-poc', 'poc');
  // 'updated' field removed — auto-set at print time

  // Group fields
  modal.querySelectorAll('.insp-group-item').forEach(item => {
    const groupId = item.getAttribute('data-group-id');

    const colorInput = item.querySelector('.insp-group-color');
    colorInput.addEventListener('change', () => {
      saveUndoState();
      Store.updateGroup(groupId, { color: colorInput.value });
      sessionSave();
    });

    const nameInput = item.querySelector('.insp-group-name');
    nameInput.addEventListener('input', () => {
      saveUndoState();
      Store.updateGroup(groupId, { name: nameInput.value.trim() });
      sessionSave();
    });

    const scopeBtn = item.querySelector('.insp-group-scope');
    scopeBtn.addEventListener('click', () => {
      saveUndoState();
      const isMain = scopeBtn.classList.contains('main');
      const newScope = isMain ? 'limited' : 'main';
      Store.updateGroup(groupId, { scope: newScope });
      scopeBtn.classList.toggle('main', !isMain);
      scopeBtn.textContent = isMain ? 'Limited' : 'Main';
      sessionSave();
    });

    const removeBtn = item.querySelector('.insp-group-remove');
    removeBtn.addEventListener('click', () => {
      saveUndoState();
      Store.removeGroup(groupId);
      sessionSave();
      renderSettingsModal(modal);
    });
  });

  // Add Group
  const addGroupBtn = modal.querySelector('#settings-add-group');
  if (addGroupBtn) {
    addGroupBtn.addEventListener('click', () => {
      saveUndoState();
      Store.addGroup({ name: 'New Group' });
      sessionSave();
      renderSettingsModal(modal);
    });
  }

  // Save data file
  const saveFileBtn = modal.querySelector('#settings-save-file');
  if (saveFileBtn) {
    saveFileBtn.addEventListener('click', () => saveDataFile());
  }

  // Done button
  const doneBtn = modal.querySelector('#settings-done');
  if (doneBtn) {
    doneBtn.addEventListener('click', () => closeSettingsModal());
  }
}

function wireSettingsFooterField(modal, selector, key) {
  const input = modal.querySelector(selector);
  if (!input) return;
  input.addEventListener('input', () => {
    saveUndoState();
    Store.setFooter({ [key]: input.value.trim() });
    sessionSave();
  });
}

function wireFooterField(panel, selector, key) {
  const input = panel.querySelector(selector);
  if (!input) return;
  input.addEventListener('input', () => {
    saveUndoState();
    Store.setFooter({ [key]: input.value.trim() });
    renderActiveDay();
    sessionSave();
  });
}

function wireDayField(item, selector, dayId, field, nullable) {
  const input = item.querySelector(selector);
  if (!input) return;
  const eventType = input.type === 'date' ? 'change' : 'input';
  input.addEventListener(eventType, () => {
    saveUndoState();
    const val = input.value.trim();
    Store.updateDay(dayId, { [field]: nullable && !val ? null : val });
    renderActiveDay();
    sessionSave();
    // Re-render inspector when date changes (reorders accordion)
    if (field === 'date') renderInspector();
  });
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return days[d.getDay()] + ', ' + d.getDate() + ' ' + months[d.getMonth()];
}

// ── Face 2: Event Inspector ────────────────────────────────────────────────

function renderEventInspector(panel, dayId, eventId) {
  const evt = Store.getEvents(dayId).find(e => e.id === eventId);
  if (!evt) { renderScheduleSetup(panel); return; }

  const groups = Store.getGroups();

  let html = '<div class="insp-header"><h3 style="margin:0;">Event Properties</h3><button class="insp-close" id="insp-close" title="Back to Setup">\u2715</button></div>';

  // Check for main-on-main overlaps
  const allEvents = Store.getEvents(dayId);
  const { mainBands } = classifyEvents(allEvents, groups);
  const thisBand = mainBands.find(b => b.event.id === eventId);
  if (thisBand && thisBand.overlappingMain && thisBand.overlappingMain.length > 0) {
    const names = thisBand.overlappingMain.map(m => esc(m.title)).join(', ');
    html += '<div class="insp-overlap-warn">Overlaps with ' + names + '</div>';
  }

  // Title
  html += '<label>Title</label>';
  html += '<input type="text" id="insp-evt-title" value="' + esc(evt.title) + '">';

  // Times — text inputs with snap-to-15 validation
  html += '<div class="field-row">';
  html += '<div><label>Start</label><input type="text" id="insp-evt-start" value="' + esc(evt.startTime) + '" placeholder="0700" maxlength="4" class="time-input"></div>';
  html += '<div><label>End</label><input type="text" id="insp-evt-end" value="' + esc(evt.endTime) + '" placeholder="0800" maxlength="4" class="time-input"></div>';
  html += '</div>';

  // Group
  html += '<label>Group</label>';
  html += '<select id="insp-evt-group">';
  html += '<option value="">-- None --</option>';
  groups.forEach(g => {
    html += '<option value="' + esc(g.id) + '"' + (g.id === evt.groupId ? ' selected' : '') + '>' + esc(g.name) + '</option>';
  });
  html += '</select>';

  // Attendees
  html += '<label>Attendees</label>';
  html += '<input type="text" id="insp-evt-attendees" value="' + esc(evt.attendees) + '" placeholder="e.g. SrA Snuffy, MSgt Yoda">';
  html += '<p class="insp-hint">Use only for specific individuals. Groups (All Personnel, Flight Chiefs) are handled by the Group field above. Names here appear on the band; in tight spaces they truncate with a numbered footnote in Notes.</p>';

  // Description
  html += '<label>Description</label>';
  html += '<textarea id="insp-evt-desc">' + esc(evt.description) + '</textarea>';

  // Location + POC
  html += '<label>Location</label>';
  html += '<input type="text" id="insp-evt-loc" value="' + esc(evt.location) + '">';
  html += '<label>POC</label>';
  html += '<input type="text" id="insp-evt-poc" value="' + esc(evt.poc) + '">';

  // Break toggle
  html += '<div class="insp-toggle-section">';
  html += '<label class="insp-toggle-label"><input type="checkbox" id="insp-evt-break"' + (evt.isBreak ? ' checked' : '') + '> This is a break</label>';
  html += '<p class="insp-hint">Breaks (lunch, travel) appear muted on the schedule.</p>';
  html += '</div>';

  // Highlight override — only show if group scope is limited
  const evtGroup = Store.getGroup(evt.groupId);
  const groupIsMain = evtGroup && evtGroup.scope === 'main';
  if (!groupIsMain && !evt.isBreak) {
    html += '<div class="insp-toggle-section">';
    html += '<label class="insp-toggle-label"><input type="checkbox" id="insp-evt-main"' + (evt.isMainEvent ? ' checked' : '') + '> Highlight this event</label>';
    html += '<p class="insp-hint">Shows this event as a primary band even though its group is limited attendance.</p>';
    html += '</div>';
  }

  // Delete — in sticky zone
  html += '<div class="insp-delete-zone"><button class="delete-btn" id="insp-evt-delete">Delete Event</button></div>';

  panel.innerHTML = html;
  wireEventInspector(panel, dayId, eventId);
}

function wireEventInspector(panel, dayId, eventId) {
  function autoCommit(selector, field, isSelect) {
    const el = panel.querySelector(selector);
    if (!el) return;
    const eventType = isSelect ? 'change' : 'input';
    el.addEventListener(eventType, () => {
      saveUndoState();
      let val;
      if (el.type === 'checkbox') val = el.checked;
      else val = typeof el.value === 'string' ? el.value.trim() : el.value;
      Store.updateEvent(dayId, eventId, { [field]: val });
      renderActiveDay();
      // Re-highlight selected
      const band = document.querySelector('.band[data-event-id="' + eventId + '"]');
      if (band) band.classList.add('selected');
      sessionSave();
    });
  }

  // Close button — back to schedule setup
  const closeBtn = panel.querySelector('#insp-close');
  if (closeBtn) closeBtn.addEventListener('click', () => selectEntity(null));

  autoCommit('#insp-evt-title', 'title');
  wireTimeInput(panel, '#insp-evt-start', 'startTime', dayId, eventId);
  wireTimeInput(panel, '#insp-evt-end', 'endTime', dayId, eventId);
  autoCommit('#insp-evt-attendees', 'attendees');
  autoCommit('#insp-evt-desc', 'description');
  autoCommit('#insp-evt-loc', 'location');
  autoCommit('#insp-evt-poc', 'poc');
  autoCommit('#insp-evt-break', 'isBreak', true);

  // Highlight override (only present for limited-scope groups)
  const mainCheckbox = panel.querySelector('#insp-evt-main');
  if (mainCheckbox) {
    autoCommit('#insp-evt-main', 'isMainEvent', true);
  }

  // Group change — auto-derive isMainEvent from group scope and re-render inspector
  const groupSelect = panel.querySelector('#insp-evt-group');
  if (groupSelect) {
    groupSelect.addEventListener('change', () => {
      const oldGroup = Store.getGroup(Store.getEvents(dayId).find(e => e.id === eventId).groupId);
      const newGroup = Store.getGroup(groupSelect.value);
      const oldScope = oldGroup ? oldGroup.scope : 'limited';
      const newScope = newGroup ? newGroup.scope : 'limited';
      const updates = { groupId: groupSelect.value };
      // Reset isMainEvent when: crossing scope boundary, or clearing the group
      if (!newGroup) {
        updates.isMainEvent = false; // no group = never main
      } else if (oldScope !== newScope) {
        updates.isMainEvent = newScope === 'main';
      }
      Store.updateEvent(dayId, eventId, updates);
      renderActiveDay();
      const band = document.querySelector('.band[data-event-id="' + eventId + '"]');
      if (band) band.classList.add('selected');
      sessionSave();
      renderInspector();
      checkTimeConflict(dayId, eventId);
    });
  }

  wireDeleteButton(panel.querySelector('#insp-evt-delete'), () => {
    saveUndoState();
    Store.removeEvent(dayId, eventId);
    sessionSave();
    selectEntity(null);
    renderActiveDay();
  });
}

// ── Face 3: Note Inspector ─────────────────────────────────────────────────

function renderNoteInspector(panel, dayId, noteId) {
  const note = Store.getNotes(dayId).find(n => n.id === noteId);
  if (!note) { renderScheduleSetup(panel); return; }

  let html = '<div class="insp-header"><h3 style="margin:0;">Note</h3><button class="insp-close" id="insp-close" title="Back to Setup">\u2715</button></div>';

  html += '<label>Category</label>';
  html += '<input type="text" id="insp-note-cat" value="' + esc(note.category) + '" placeholder="e.g., Medical, TDY">';

  html += '<label>Text</label>';
  html += '<textarea id="insp-note-text">' + esc(note.text) + '</textarea>';

  html += '<div class="insp-delete-zone"><button class="delete-btn" id="insp-note-delete">Delete Note</button></div>';

  panel.innerHTML = html;
  wireNoteInspector(panel, dayId, noteId);
}

function wireNoteInspector(panel, dayId, noteId) {
  const closeBtn = panel.querySelector('#insp-close');
  if (closeBtn) closeBtn.addEventListener('click', () => selectEntity(null));

  const catInput = panel.querySelector('#insp-note-cat');
  catInput.addEventListener('input', () => {
    saveUndoState();
    Store.updateNote(dayId, noteId, { category: catInput.value.trim() });
    renderActiveDay();
    const noteEl = document.querySelector('.notes-list li[data-note-id="' + noteId + '"]');
    if (noteEl) noteEl.classList.add('selected');
    sessionSave();
  });

  const textInput = panel.querySelector('#insp-note-text');
  textInput.addEventListener('input', () => {
    saveUndoState();
    Store.updateNote(dayId, noteId, { text: textInput.value.trim() });
    renderActiveDay();
    const noteEl = document.querySelector('.notes-list li[data-note-id="' + noteId + '"]');
    if (noteEl) noteEl.classList.add('selected');
    sessionSave();
  });

  wireDeleteButton(panel.querySelector('#insp-note-delete'), () => {
    saveUndoState();
    Store.removeNote(dayId, noteId);
    sessionSave();
    selectEntity(null);
    renderActiveDay();
  });
}

// ── Delete confirmation pattern ────────────────────────────────────────────

function wireDeleteButton(btn, onConfirm) {
  if (!btn) return;
  let armed = false;
  btn.addEventListener('click', () => {
    if (armed) {
      onConfirm();
      return;
    }
    armed = true;
    btn.textContent = 'Tap again to delete';
    btn.classList.add('confirm');
    clearDeleteTimer();
    _deleteTimer = setTimeout(() => {
      armed = false;
      btn.textContent = btn.id.includes('note') ? 'Delete Note' : 'Delete Event';
      btn.classList.remove('confirm');
    }, 3000);
  });
}

function clearDeleteTimer() {
  if (_deleteTimer) { clearTimeout(_deleteTimer); _deleteTimer = null; }
}

// ── Rendering helpers ──────────────────────────────────────────────────────

function renderActiveDay() {
  const dayId = Store.getActiveDay();
  if (dayId) renderDay(dayId);
  renderDayTabs();
}

function renderDayTabs() {
  const tabs = document.getElementById('dayTabs');
  if (!tabs) return;
  const days = Store.getDays();
  const activeDay = Store.getActiveDay();
  let html = '';
  days.forEach((day, i) => {
    const label = day.label || (day.date ? formatDateShort(day.date) : 'Day ' + (i + 1));
    const active = day.id === activeDay ? ' active' : '';
    html += '<button class="day-tab' + active + '" data-day-id="' + esc(day.id) + '">' + esc(label) + '</button>';
  });
  tabs.innerHTML = html;

  tabs.querySelectorAll('.day-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      Store.setActiveDay(tab.getAttribute('data-day-id'));
      selectEntity(null);
      renderActiveDay();
    });
  });
}

// ── Toolbar wiring ─────────────────────────────────────────────────────────

function wireToolbar() {
  const addBtn = document.getElementById('addEventBtn');
  if (addBtn) addBtn.onclick = () => {
    const dayId = Store.getActiveDay();
    if (dayId) openAddEvent(dayId);
    else toast('Add a day first');
  };

  const addNoteBtn = document.getElementById('addNoteBtn');
  if (addNoteBtn) addNoteBtn.onclick = () => {
    const dayId = Store.getActiveDay();
    if (dayId) openAddNote(dayId);
    else toast('Add a day first');
  };

  const addDayBtn = document.getElementById('addDayBtn');
  if (addDayBtn) addDayBtn.onclick = () => {
    saveUndoState();
    const day = Store.addDay({ date: '', startTime: '0700', endTime: '1630' });
    if (!Store.getActiveDay()) Store.setActiveDay(day.id);
    _expandedDayId = day.id;
    sessionSave();
    renderActiveDay();
    selectEntity(null); // show days face with new day expanded
  };

  // Overflow menu toggle
  const overflowBtn = document.getElementById('overflowBtn');
  const overflowMenu = document.getElementById('overflowMenu');
  if (overflowBtn && overflowMenu) {
    overflowBtn.onclick = (e) => {
      e.stopPropagation();
      overflowMenu.classList.toggle('open');
    };
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#overflowMenu')) overflowMenu.classList.remove('open');
    });
  }

  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) settingsBtn.onclick = () => { overflowMenu.classList.remove('open'); openSettingsModal(); };

  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) saveBtn.onclick = () => { overflowMenu.classList.remove('open'); saveDataFile(); };

  const printBtn = document.getElementById('printBtn');
  if (printBtn) printBtn.onclick = () => { overflowMenu.classList.remove('open'); printActiveDay(); };

  // Toolbar title — editable inline, syncs with Store
  const tbTitle = document.getElementById('tbTitle');
  if (tbTitle) {
    tbTitle.value = Store.getTitle();
    tbTitle.addEventListener('input', () => {
      Store.setTitle(tbTitle.value.trim());
      renderActiveDay();
      sessionSave();
    });
  }

  // Settings modal — close on backdrop click
  const settingsOverlay = document.getElementById('settingsModal');
  if (settingsOverlay) {
    settingsOverlay.addEventListener('click', (e) => {
      if (e.target === settingsOverlay) closeSettingsModal();
    });
  }

  // Escape key closes settings modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const overlay = document.getElementById('settingsModal');
      if (overlay && overlay.classList.contains('active')) {
        closeSettingsModal();
      }
    }
  });

  // Initial inspector render
  renderInspector();
}

function syncToolbarTitle() {
  const tbTitle = document.getElementById('tbTitle');
  if (tbTitle) tbTitle.value = Store.getTitle();
}

// ── Add event / note ───────────────────────────────────────────────────────

function openAddEvent(dayId) {
  saveUndoState();
  const groups = Store.getGroups();
  const defaultGroup = groups.find(g => g.scope === 'main') || groups[0];
  const evt = Store.addEvent(dayId, {
    title: 'New Event',
    startTime: '0800',
    endTime: '0900',
    groupId: defaultGroup ? defaultGroup.id : '',
  });
  sessionSave();
  renderActiveDay();
  if (evt) {
    selectEntity('event', dayId, evt.id);
    checkTimeConflict(dayId, evt.id);
  }
}

function openAddNote(dayId) {
  // Check if adding a note would overflow the page
  if (wouldOverflowPage()) {
    toast('Cannot add note — page is full. Remove content or shorten descriptions first.');
    return;
  }
  saveUndoState();
  const note = Store.addNote(dayId, { category: '', text: '(enter note text)' });
  sessionSave();
  renderActiveDay();
  // Check again after render — if it overflowed, undo immediately
  if (wouldOverflowPage()) {
    Store.removeNote(dayId, note.id);
    sessionSave();
    renderActiveDay();
    toast('Cannot add note — page is full. Remove content or shorten descriptions first.');
    return;
  }
  selectEntity('note', dayId, note.id);
}

function wouldOverflowPage() {
  const page = document.querySelector('.page');
  if (!page) return false;
  // Measure actual content height by summing children — ignores min-height on .page
  let contentHeight = 0;
  for (const child of page.children) {
    contentHeight += child.offsetHeight;
  }
  // US Letter portrait usable area: 11in minus ~0.4in padding = ~10.6in
  const maxHeight = 10.6 * 96;
  return contentHeight > maxHeight;
}

// ── Time input helpers ─────────────────────────────────────────────────────

// Snap minutes to nearest 15-minute increment
function snapToQuarter(timeStr) {
  const cleaned = timeStr.replace(/[^0-9]/g, '').padStart(4, '0').slice(0, 4);
  let h = parseInt(cleaned.slice(0, 2), 10);
  let m = parseInt(cleaned.slice(2, 4), 10);
  if (isNaN(h) || h > 23) h = 0;
  if (isNaN(m) || m > 59) m = 0;
  // Round to nearest 15
  m = Math.round(m / 15) * 15;
  if (m === 60) { m = 0; h = Math.min(h + 1, 23); }
  return String(h).padStart(2, '0') + String(m).padStart(2, '0');
}

function checkTimeConflict(dayId, eventId) {
  const evt = Store.getEvents(dayId).find(e => e.id === eventId);
  if (!evt || evt.isBreak) return;
  const group = Store.getGroup(evt.groupId);
  const isMain = group && group.scope === 'main';
  if (!isMain) return;
  const others = Store.getEvents(dayId).filter(e =>
    e.id !== eventId && !e.isBreak && (() => {
      const g = Store.getGroup(e.groupId);
      return g && g.scope === 'main';
    })()
  );
  const conflicts = others.filter(o => eventsOverlap(evt, o));
  if (conflicts.length > 0) {
    const names = conflicts.map(c => c.title).join(', ');
    toast('Schedule conflict: overlaps with ' + names);
  }
}

function wireTimeInput(panel, selector, field, dayId, eventId) {
  const input = panel.querySelector(selector);
  if (!input) return;
  input.addEventListener('blur', () => {
    const snapped = snapToQuarter(input.value);
    input.value = snapped;
    saveUndoState();
    Store.updateEvent(dayId, eventId, { [field]: snapped });
    renderActiveDay();
    const band = document.querySelector('.band[data-event-id="' + eventId + '"]');
    if (band) band.classList.add('selected');
    sessionSave();
    checkTimeConflict(dayId, eventId);
  });
  // Also commit on Enter key
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
  });
}
