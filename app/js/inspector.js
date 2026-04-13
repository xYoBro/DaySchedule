/* ── inspector.js ── Contract ──────────────────────────────────────────────
 *
 * EXPORTS:
 *   selectEntity(type, dayId, entityId) — sets selection, renders inspector, highlights element
 *   renderInspector()        — dispatches to event/note/schedule-setup inspector face
 *   renderActiveDay()        — renders active day + day tabs (main render entry point)
 *   renderDayTabs()          — renders day tab buttons in toolbar
 *   wireToolbar()            — wires all toolbar buttons, title input, overflow menu
 *   syncToolbarTitle()       — syncs toolbar title input with Store.getTitle()
 *   openSettingsModal()      — opens settings modal (general + groups tabs)
 *   closeSettingsModal()     — closes settings modal, re-renders
 *   openDayEventSheetModal() — opens a day-only table editor for the active day
 *   openAddEvent(dayId)      — creates new event, selects it
 *   openAddNote(dayId)       — creates new note, selects it
 *   snapToQuarter(timeStr)   → string — snaps to nearest 15-min increment
 *   formatDateShort(dateStr) → string — "Sat, 15 Mar"
 *
 * REQUIRES:
 *   app-state.js    — Store (all read/write methods)
 *   utils.js        — esc(), timeToMinutes(), generateId()
 *   ui-core.js      — toast()
 *   data-helpers.js — classifyEvents(), eventsOverlap()
 *   persistence.js  — saveUndoState(), sessionSave()
 *   render.js       — renderDay()
 *   storage.js      — getCurrentFileName(), hasDirectoryAccess(), scheduleNameToSlug(),
 *                     renameScheduleFile(), setCurrentFile(), getLastSavedAt()
 *   library.js      — returnToLibrary(), openHelpModal()
 *   versions.js     — openVersionPanel()
 *   print.js        — printAllDays()
 *
 * DOM ELEMENTS:
 *   #inspectorPanel    — right-side inspector panel
 *   #tbTitle           — toolbar title input
 *   #tbBack            — back to library button
 *   #addEventBtn       — add event button
 *   #addNoteBtn        — add note button
 *   #addDayBtn         — add day button
 *   #versionsMenuBtn   — versions panel button (overflow)
 *   #helpBtn           — help button (overflow)
 *   #overflowMenu      — overflow menu container
 *   #customizeBtn      — customize button
 *   #printBtn          — print button (overflow)
 *   #daySheetBtn       — opens day event sheet modal
 *   #settingsModal     — settings modal overlay
 *   #dayEventSheetModal — day event sheet modal overlay
 *   #dayTabs           — day tab container
 *
 * CONSUMED BY:
 *   events.js    — selectEntity(), openSettingsModal()
 *   library.js   — renderActiveDay(), renderInspector(), syncToolbarTitle()
 *   storage.js   — renderActiveDay(), syncToolbarTitle()
 *   persistence.js — renderActiveDay()
 *   init.js      — wireToolbar(), renderActiveDay()
 * ──────────────────────────────────────────────────────────────────────────── */

/* ── inspector.js ── Unified inspector panel (replaces editing.js, groups.js, schedule-setup.js) */

let _selection = { type: null, dayId: null, entityId: null };
let _deleteTimer = null;
let _expandedDayId = null;
let _settingsAdvancedOpen = false;
let _daySheetSelectedEventId = null;

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
  const readOnly = typeof isCurrentScheduleEditable === 'function' ? !isCurrentScheduleEditable() : false;
  const disabledAttr = readOnly ? ' disabled' : '';

  let html = '<h3>Days</h3>';
  if (readOnly) {
    html += '<div class="insp-readonly-note">Read-only view. Click <strong>Edit</strong> above to make changes.</div>';
  }

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
      html += '<input type="date" class="insp-day-date" value="' + esc(day.date) + '"' + disabledAttr + '>';
      html += '<div class="field-row">';
      html += '<div><label>Start</label><input type="text" class="insp-day-start" value="' + esc(day.startTime) + '" placeholder="0700"' + disabledAttr + '></div>';
      html += '<div><label>End</label><input type="text" class="insp-day-end" value="' + esc(day.endTime) + '" placeholder="1630"' + disabledAttr + '></div>';
      html += '</div>';
      html += '<label>Label</label>';
      html += '<input type="text" class="insp-day-label" value="' + esc(day.label || '') + '" placeholder="auto (e.g., Day 1)"' + disabledAttr + '>';
      html += '<button class="btn insp-day-duplicate" style="font-size:10px;padding:3px 8px;margin-top:6px;"' + disabledAttr + '>Duplicate Day</button>';
      if (days.length > 1) {
        html += ' <button class="btn btn-danger insp-day-remove" style="font-size:10px;padding:3px 8px;margin-top:6px;"' + disabledAttr + '>Remove Day</button>';
      }
      html += '</div>';
    }
    html += '</div>';
  });
  html += '</div>';

  html += '<p class="insp-hint" style="margin-top:12px;">Use Quick Edit for fast row changes, or click an event or note on the schedule for detailed editing here.</p>';

  panel.innerHTML = html;
  wireScheduleSetup(panel);
}

function wireScheduleSetup(panel) {
  const editable = typeof isCurrentScheduleEditable === 'function' ? isCurrentScheduleEditable() : true;
  // Day accordion headers — toggle expand/collapse
  panel.querySelectorAll('.insp-day-header').forEach(header => {
    header.addEventListener('click', () => {
      const dayId = header.closest('.insp-day-item').getAttribute('data-day-id');
      _expandedDayId = (_expandedDayId === dayId) ? null : dayId;
      renderInspector();
    });
  });

  if (!editable) return;

  // Day fields (only wired for the expanded day)
  panel.querySelectorAll('.insp-day-body').forEach(body => {
    const item = body.closest('.insp-day-item');
    const dayId = item.getAttribute('data-day-id');
    wireDayField(body, '.insp-day-date', dayId, 'date');
    wireDayField(body, '.insp-day-start', dayId, 'startTime');
    wireDayField(body, '.insp-day-end', dayId, 'endTime');
    wireDayField(body, '.insp-day-label', dayId, 'label', true);

    const dupBtn = body.querySelector('.insp-day-duplicate');
    if (dupBtn) {
      dupBtn.addEventListener('click', () => {
        saveUndoState();
        const clone = Store.duplicateDay(dayId);
        if (clone) {
          Store.setActiveDay(clone.id);
          _expandedDayId = clone.id;
          sessionSave();
          renderActiveDay();
          renderInspector();
          toast('Duplicated day');
        }
      });
    }

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
  const currentTheme = getScheduleTheme(getCurrentScheduleFileData() && getCurrentScheduleFileData().theme);

  let html = '<h2>Customize Schedule</h2>';
  html += '<p class="settings-summary">Change the title, unit logo, layout, and colors here. Open Advanced only when you need groups, header text, or manual export.</p>';

  html += '<div class="settings-section">';
  html += '<div class="settings-section-title">Basics</div>';
  html += '<label class="settings-label">Schedule Title</label>';
  html += '<input type="text" class="settings-input" id="settings-title" value="' + esc(title) + '">';
  html += '<label class="settings-label">Unit Logo</label>';
  html += '<input type="file" class="settings-input" id="settings-logo" accept="image/*" style="font-size:12px;padding:5px 8px;">';
  if (Store.getLogo()) {
    html += '<div class="settings-logo-preview"><img src="' + esc(Store.getLogo()) + '" style="max-height:48px;border-radius:4px;"> ';
    html += '<button class="btn" id="settings-logo-remove" style="font-size:10px;padding:2px 8px;">Remove logo</button></div>';
  }
  html += '</div>';

  html += '<div class="settings-section">';
  html += '<div class="settings-section-title">Look</div>';
  html += '<div class="settings-label" style="margin-bottom:8px;">Layout</div>';
  html += '<div class="skin-picker">';
  SKIN_NAMES.forEach(function(skin) {
    const label = SKIN_LABELS[skin];
    const selected = skin === currentTheme.skin ? ' selected' : '';
    html += '<div class="skin-option' + selected + '" data-skin="' + skin + '">';
    html += '<div class="skin-thumb skin-thumb-' + skin + '"></div>';
    html += '<div class="skin-option-name">' + esc(label.name) + '</div>';
    html += '<div class="skin-option-desc">' + esc(label.desc) + '</div>';
    html += '</div>';
  });
  html += '</div>';

  html += '<div class="settings-label" style="margin-top:16px;margin-bottom:8px;">Colors</div>';
  html += '<div class="palette-picker">';
  PALETTE_NAMES.forEach(function(name) {
    const p = PALETTES[name];
    const selected = name === currentTheme.palette ? ' selected' : '';
    html += '<div class="palette-option' + selected + '" data-palette="' + name + '">';
    html += '<div class="palette-swatch" style="background:' + esc(p.bg) + ';">';
    html += '<div class="palette-bar" style="background:' + esc(p.accent) + ';"></div>';
    html += '<div class="palette-bar" style="background:' + esc(p.accentSecondary) + ';"></div>';
    html += '<div class="palette-bar" style="background:' + esc(p.accentTertiary) + ';"></div>';
    html += '</div>';
    html += '<div class="palette-option-name">' + esc(PALETTE_LABELS[name]) + '</div>';
    html += '</div>';
  });
  html += '<div class="palette-option' + (currentTheme.palette === 'custom' ? ' selected' : '') + '" data-palette="custom">';
  html += '<div class="palette-swatch palette-custom-swatch">+</div>';
  html += '<div class="palette-option-name">Custom</div>';
  html += '</div>';
  html += '</div>';
  html += '</div>';

  html += '<details class="settings-advanced"' + (_settingsAdvancedOpen ? ' open' : '') + ' id="settingsAdvanced">';
  html += '<summary>Advanced</summary>';
  html += '<div class="settings-advanced-body">';
  html += '<label class="settings-label">Header Line</label>';
  html += '<input type="text" class="settings-input" id="settings-contact" value="' + esc(footer.contact) + '">';
  html += '<label class="settings-label">Point of Contact</label>';
  html += '<input type="text" class="settings-input" id="settings-poc" value="' + esc(footer.poc) + '">';
  html += '<div class="settings-section-title" style="margin-top:18px;">Audiences</div>';
  html += '<p class="insp-hint" style="margin-top:0;margin-bottom:8px;">Use audiences to decide where events land on the schedule. Primary audiences go to the main track automatically. Supporting audiences stay in the side track unless a specific event is promoted.</p>';
  groups.forEach(g => {
    html += '<div class="insp-group-item" data-group-id="' + esc(g.id) + '">';
    html += '<input type="color" class="insp-group-color" value="' + esc(g.color) + '">';
    html += '<input type="text" class="insp-group-name" value="' + esc(g.name) + '" placeholder="Group name">';
    html += '<button class="insp-group-scope ' + (g.scope === 'main' ? 'main' : '') + '" title="Toggle between Primary and Supporting">' + (g.scope === 'main' ? 'Primary' : 'Supporting') + '</button>';
    html += '<button class="insp-group-remove">&times;</button>';
    html += '</div>';
  });
  html += '<button class="btn" id="settings-add-group" style="margin-top:6px;font-size:11px;">+ Add Group</button>';
  html += '<div class="settings-export-row">';
  html += '<div class="settings-export-copy">';
  html += '<div class="settings-export-label">Manual File Export</div>';
  html += '<div class="settings-export-hint">Only use this when browser auto-save is unavailable or a lead asks for a manual backup file.</div>';
  html += '</div>';
  html += '<button class="btn settings-export-btn" id="settings-save-file">Manual Export</button>';
  html += '</div>';
  html += '</div>';
  html += '</details>';

  html += '<div class="modal-actions">';
  html += '<button class="btn btn-primary" id="settings-done">Done</button>';
  html += '</div>';

  modal.innerHTML = html;
  wireSettingsModal(modal);
}

function wireSettingsModal(modal) {
  const advanced = modal.querySelector('#settingsAdvanced');
  if (advanced) {
    advanced.addEventListener('toggle', () => {
      _settingsAdvancedOpen = advanced.open;
    });
  }

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
      scopeBtn.textContent = isMain ? 'Supporting' : 'Primary';
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

  // Skin picker
  modal.querySelectorAll('.skin-option').forEach(function(opt) {
    opt.addEventListener('click', function() {
      const skin = opt.getAttribute('data-skin');
      const fileData = getCurrentScheduleFileData();
      if (fileData) {
        if (!fileData.theme) fileData.theme = {};
        fileData.theme.skin = skin;
      }
      sessionSave();
      renderSettingsModal(modal);
      renderActiveDay();
      toast('Layout: ' + (SKIN_LABELS[skin] ? SKIN_LABELS[skin].name : skin));
    });
  });

  // Palette picker
  modal.querySelectorAll('.palette-option').forEach(function(opt) {
    opt.addEventListener('click', function() {
      const palette = opt.getAttribute('data-palette');
      const fileData = getCurrentScheduleFileData();
      if (fileData) {
        if (!fileData.theme) fileData.theme = {};
        fileData.theme.palette = palette;
      }
      sessionSave();
      renderSettingsModal(modal);
      renderActiveDay();
      toast('Colors: ' + (PALETTE_LABELS[palette] || palette));
    });
  });

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

// ── Day Event Sheet Modal ─────────────────────────────────────────────────

function openDayEventSheetModal(focusInfo) {
  if (typeof isCurrentScheduleEditable === 'function' && !isCurrentScheduleEditable()) {
    toast('This schedule is read-only until you click Edit.');
    return;
  }
  const dayId = Store.getActiveDay();
  if (!dayId) {
    toast('Add a day first');
    return;
  }
  const modal = document.getElementById('dayEventSheetModalContent');
  if (!modal) return;
  renderDayEventSheetModal(modal, dayId, focusInfo);
  openModal('dayEventSheetModal');
}

function closeDayEventSheetModal() {
  _daySheetSelectedEventId = null;
  closeModal('dayEventSheetModal');
}

function getDayEventSheetContext(dayId) {
  const day = Store.getDay(dayId);
  if (!day) return null;

  const days = Store.getDays();
  const dayIndex = days.findIndex(d => d.id === dayId) + 1;
  const events = Store.getEvents(dayId).slice()
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  const groups = Store.getGroups();
  const groupMap = {};
  groups.forEach(g => { groupMap[g.id] = g; });

  const { mainBands } = classifyEvents(events, groups);
  const overlapMap = {};
  let overlapCount = 0;
  mainBands.forEach(band => {
    if (band.overlappingMain && band.overlappingMain.length > 0) {
      overlapMap[band.event.id] = band.overlappingMain.map(evt => evt.title);
      overlapCount += 1;
    }
  });

  return { day, dayIndex, events, groups, groupMap, overlapMap, overlapCount };
}

function getDaySheetTrackStatus(evt, group) {
  if (evt.isBreak) {
    return {
      label: 'Break',
      tone: 'break',
      title: 'Breaks always appear in the main track.'
    };
  }
  if (group && group.scope === 'main') {
    return {
      label: 'Main via audience',
      tone: 'primary',
      title: 'The selected Primary audience automatically places this event in the main track.'
    };
  }
  if (evt.isMainEvent) {
    return {
      label: 'Main override',
      tone: 'override',
      title: 'This supporting or unassigned event is manually shown in the main track.'
    };
  }
  if (group && group.scope === 'limited') {
    return {
      label: 'Side via audience',
      tone: 'supporting',
      title: 'Supporting audiences stay in the side track unless Main Track is turned on.'
    };
  }
  return {
    label: 'Needs audience',
    tone: 'none',
    title: 'Choose an audience to place this event automatically, or turn on Main Track manually.'
  };
}

function resolveDaySheetSelectedEventId(ctx, dayId, preferredId) {
  const validIds = new Set(ctx.events.map(evt => evt.id));
  if (preferredId && validIds.has(preferredId)) return preferredId;
  if (_daySheetSelectedEventId && validIds.has(_daySheetSelectedEventId)) return _daySheetSelectedEventId;
  if (_selection.type === 'event' && _selection.dayId === dayId && validIds.has(_selection.entityId)) return _selection.entityId;
  return ctx.events[0] ? ctx.events[0].id : null;
}

function buildDaySheetDetailPanel(ctx, eventId) {
  const evt = ctx.events.find(item => item.id === eventId);
  if (!evt) return '';

  const group = ctx.groupMap[evt.groupId] || null;
  const overlapNames = ctx.overlapMap[evt.id] || [];
  const trackStatus = getDaySheetTrackStatus(evt, group);

  let html = '<div class="day-sheet-detail-bar">';
  html += '<div class="day-sheet-detail-summary">';
  html += '<div class="day-sheet-detail-kicker">Selected Row</div>';
  html += '<div class="day-sheet-detail-heading">' + esc(evt.title || 'Untitled event') + '</div>';
  html += '<div class="day-sheet-detail-meta">';
  html += '<span class="day-sheet-detail-meta-item">' + esc(evt.startTime + '\u2013' + evt.endTime) + '</span>';
  html += '<span class="day-sheet-detail-meta-item">' + esc(formatDuration(computeDuration(evt))) + '</span>';
  html += '<span class="day-sheet-badge day-sheet-badge-track day-sheet-badge-track-' + esc(trackStatus.tone) + '" title="' + esc(trackStatus.title) + '">' + esc(trackStatus.label) + '</span>';
  if (overlapNames.length > 0) {
    html += '<span class="day-sheet-badge warn" title="' + esc('Overlaps with ' + overlapNames.join(', ')) + '">Overlap</span>';
  }
  html += '</div>';
  html += '</div>';
  html += '<div class="day-sheet-detail-actions">';
  html += '<button class="btn" id="daySheetOpenDetails" data-event-id="' + esc(evt.id) + '">Full Details</button>';
  html += '<button class="btn btn-danger" id="daySheetDeleteSelected" data-event-id="' + esc(evt.id) + '" data-delete-label="Delete">Delete</button>';
  html += '</div>';
  html += '</div>';

  html += '<div class="day-sheet-detail-grid">';
  html += '<label class="day-sheet-detail-field">';
  html += '<span class="day-sheet-detail-label">Specific people</span>';
  html += '<input type="text" data-event-id="' + esc(evt.id) + '" data-field="attendees" data-focus="attendees" value="' + esc(evt.attendees) + '" placeholder="Optional names or exceptions">';
  html += '</label>';
  html += '<label class="day-sheet-detail-field">';
  html += '<span class="day-sheet-detail-label">POC</span>';
  html += '<input type="text" data-event-id="' + esc(evt.id) + '" data-field="poc" data-focus="poc" value="' + esc(evt.poc) + '" placeholder="Optional">';
  html += '</label>';
  html += '<label class="day-sheet-detail-field day-sheet-detail-wide">';
  html += '<span class="day-sheet-detail-label">Notes</span>';
  html += '<input type="text" data-event-id="' + esc(evt.id) + '" data-field="description" data-focus="description" value="' + esc(evt.description) + '" placeholder="Instructions, details, or uniform notes">';
  html += '</label>';
  html += '</div>';
  if (overlapNames.length > 0) {
    html += '<p class="day-sheet-details-hint">Overlap warning: ' + esc(overlapNames.join(', ')) + ' share this time block.</p>';
  }
  html += '<p class="day-sheet-detail-tip">Click a row to edit these fields below. Double-click a row to open the full event editor.</p>';
  return html;
}

function syncDaySheetSelectionUI(modal, dayId, eventId) {
  if (!modal || !eventId) return;
  _daySheetSelectedEventId = eventId;
  modal.querySelectorAll('.day-sheet-row').forEach(row => {
    row.classList.toggle('is-selected', row.getAttribute('data-event-id') === eventId);
  });
  const detailPanel = modal.querySelector('#daySheetDetailPanel');
  if (detailPanel) {
    const ctx = getDayEventSheetContext(dayId);
    detailPanel.innerHTML = buildDaySheetDetailPanel(ctx, eventId);
    wireDaySheetDetailPanel(modal, dayId);
  }
}

function openDaySheetFullDetails(dayId, eventId) {
  closeDayEventSheetModal();
  selectEntity('event', dayId, eventId);
}

function renderDayEventSheetModal(modal, dayId, focusInfo) {
  const ctx = getDayEventSheetContext(dayId);
  if (!modal || !ctx) return;
  const selectedEventId = resolveDaySheetSelectedEventId(ctx, dayId, focusInfo && focusInfo.eventId);
  _daySheetSelectedEventId = selectedEventId;

  const dayTitle = ctx.day.label || (ctx.day.date ? formatDateShort(ctx.day.date) : 'Day ' + ctx.dayIndex);
  const subtitleBits = [];
  if (ctx.day.label && ctx.day.date) subtitleBits.push(formatDateShort(ctx.day.date));
  subtitleBits.push(ctx.day.startTime + '\u2013' + ctx.day.endTime);
  subtitleBits.push(ctx.events.length + (ctx.events.length === 1 ? ' event' : ' events'));
  if (ctx.overlapCount) {
    subtitleBits.push(ctx.overlapCount + (ctx.overlapCount === 1 ? ' overlap warning' : ' overlap warnings'));
  }

  let html = '<div class="day-sheet-shell">';
  html += '<div class="day-sheet-header">';
  html += '<div>';
  html += '<div class="day-sheet-kicker">Quick Edit</div>';
  html += '<h2 class="day-sheet-title">' + esc(dayTitle) + '</h2>';
  html += '<p class="day-sheet-subtitle">' + esc(subtitleBits.join(' • ')) + '</p>';
  html += '</div>';
  html += '<div class="day-sheet-header-actions">';
  html += '<button class="btn btn-primary" id="daySheetAddEvent">+ Event</button>';
  html += '<button class="btn" id="daySheetClose">Close</button>';
  html += '</div>';
  html += '</div>';
  html += '<div class="day-sheet-guide">Click a row to edit extra fields below. Double-click a row for full details. <strong>Audience</strong> places events automatically; <strong>Main</strong> only overrides.</div>';

  if (!ctx.events.length) {
    html += '<div class="day-sheet-table-wrap">';
    html += '<div class="day-sheet-empty"><strong>No events on this day yet.</strong>Add one here to start building the schedule, or keep using the standard + Event flow.</div>';
    html += '</div>';
    html += '</div>';
    modal.innerHTML = html;
    wireDayEventSheetModal(modal, dayId);
    return;
  }

  html += '<div class="day-sheet-table-wrap">';
  html += '<table class="day-sheet-table">';
  html += '<thead><tr>';
  html += '<th>Start</th>';
  html += '<th>End</th>';
  html += '<th>Title</th>';
  html += '<th>Audience</th>';
  html += '<th>Location</th>';
  html += '<th>Break</th>';
  html += '<th>Main</th>';
  html += '<th>Track</th>';
  html += '<th>Dur</th>';
  html += '</tr></thead><tbody>';

  ctx.events.forEach(evt => {
    const group = ctx.groupMap[evt.groupId] || null;
    const overlapNames = ctx.overlapMap[evt.id] || [];
    const canHighlight = !evt.isBreak && !(group && group.scope === 'main');
    const trackStatus = getDaySheetTrackStatus(evt, group);
    const isSelected = evt.id === selectedEventId;

    html += '<tr class="day-sheet-row' + (isSelected ? ' is-selected' : '') + '" data-event-id="' + esc(evt.id) + '">';
    html += '<td><input type="text" class="day-sheet-time-input" data-event-id="' + esc(evt.id) + '" data-field="startTime" data-focus="startTime" value="' + esc(evt.startTime) + '" maxlength="4" placeholder="0700"></td>';
    html += '<td><input type="text" class="day-sheet-time-input" data-event-id="' + esc(evt.id) + '" data-field="endTime" data-focus="endTime" value="' + esc(evt.endTime) + '" maxlength="4" placeholder="0800"></td>';
    html += '<td><input type="text" class="day-sheet-title-input" data-event-id="' + esc(evt.id) + '" data-field="title" data-focus="title" value="' + esc(evt.title) + '"></td>';
    html += '<td><select class="day-sheet-group-select" data-event-id="' + esc(evt.id) + '" data-focus="groupId">';
    html += '<option value="">-- None --</option>';
    ctx.groups.forEach(g => {
      html += '<option value="' + esc(g.id) + '"' + (g.id === evt.groupId ? ' selected' : '') + '>' + esc(g.name) + '</option>';
    });
    html += '</select></td>';
    html += '<td><input type="text" class="day-sheet-location-input" data-event-id="' + esc(evt.id) + '" data-field="location" data-focus="location" value="' + esc(evt.location) + '"></td>';
    html += '<td class="day-sheet-check-cell"><input type="checkbox" class="day-sheet-break-toggle" data-event-id="' + esc(evt.id) + '"' + (evt.isBreak ? ' checked' : '') + ' aria-label="Break"></td>';
    if (canHighlight) {
      html += '<td class="day-sheet-check-cell"><input type="checkbox" class="day-sheet-main-toggle" data-event-id="' + esc(evt.id) + '"' + (evt.isMainEvent ? ' checked' : '') + ' title="Turn this on only when a supporting or unassigned event should appear in the main track." aria-label="Main track override"></td>';
    } else {
      html += '<td class="day-sheet-check-cell"><span class="day-sheet-cell-note" title="' + esc(evt.isBreak ? 'Breaks always render in the main track.' : 'The selected Primary audience already places this event in the main track.') + '">Auto</span></td>';
    }
    html += '<td><div class="day-sheet-track-cell">';
    html += '<span class="day-sheet-badge day-sheet-badge-track day-sheet-badge-track-' + esc(trackStatus.tone) + '" title="' + esc(trackStatus.title) + '">' + esc(trackStatus.label) + '</span>';
    if (overlapNames.length > 0) {
      html += '<span class="day-sheet-badge warn" title="' + esc('Overlaps with ' + overlapNames.join(', ')) + '">Overlap</span>';
    }
    html += '</div></td>';
    html += '<td><span class="day-sheet-duration">' + esc(formatDuration(computeDuration(evt))) + '</span></td>';
    html += '</tr>';
  });

  html += '</tbody></table>';
  html += '</div>';
  html += '<div class="day-sheet-detail-panel" id="daySheetDetailPanel">';
  html += buildDaySheetDetailPanel(ctx, selectedEventId);
  html += '</div>';
  html += '</div>';

  modal.innerHTML = html;
  wireDayEventSheetModal(modal, dayId);

  if (focusInfo && focusInfo.eventId && focusInfo.field) {
    setTimeout(() => {
      const target = modal.querySelector('[data-event-id="' + focusInfo.eventId + '"][data-focus="' + focusInfo.field + '"]');
      if (target && target.focus) {
        target.focus();
        if (target.select && target.tagName !== 'SELECT') target.select();
      }
    }, 50);
  }
}

function wireDayEventSheetModal(modal, dayId) {
  const closeBtn = modal.querySelector('#daySheetClose');
  if (closeBtn) closeBtn.addEventListener('click', () => closeDayEventSheetModal());

  const addBtn = modal.querySelector('#daySheetAddEvent');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      saveUndoState();
      const groups = Store.getGroups();
      const defaultGroup = groups.find(g => g.scope === 'main') || groups[0];
      const day = Store.getDay(dayId);
      const events = Store.getEvents(dayId);
      const startTime = events.length ? events[events.length - 1].endTime : ((day && day.startTime) || '0800');
      const endTime = minutesToTime(Math.min(timeToMinutes(startTime) + 60, (23 * 60) + 45));
      const evt = Store.addEvent(dayId, {
        title: 'New Event',
        startTime,
        endTime,
        groupId: defaultGroup ? defaultGroup.id : '',
      });
      sessionSave();
      renderActiveDay();
      renderInspector();
      if (evt) renderDayEventSheetModal(modal, dayId, { eventId: evt.id, field: 'title' });
      });
  }

  modal.querySelectorAll('.day-sheet-row').forEach(row => {
    const eventId = row.getAttribute('data-event-id');
    row.addEventListener('click', () => {
      syncDaySheetSelectionUI(modal, dayId, eventId);
    });
    row.addEventListener('dblclick', (e) => {
      if (e.target.closest('input, select, textarea, button, label')) return;
      openDaySheetFullDetails(dayId, eventId);
    });
  });

  modal.querySelectorAll('.day-sheet-time-input').forEach(input => {
    input.addEventListener('focus', () => {
      const eventId = input.getAttribute('data-event-id');
      syncDaySheetSelectionUI(modal, dayId, eventId);
    });
    input.addEventListener('blur', () => {
      const eventId = input.getAttribute('data-event-id');
      const field = input.getAttribute('data-field');
      const focusInfo = input._daySheetNextFocus || null;
      input._daySheetNextFocus = null;
      const snapped = snapToQuarter(input.value);
      input.value = snapped;
      commitDayEventSheetUpdate(dayId, eventId, { [field]: snapped }, { rerenderModal: true, checkConflict: true, focusInfo });
    });
    input.addEventListener('keydown', (e) => {
      const fieldOrder = ['startTime', 'endTime', 'title', 'groupId', 'location'];
      const field = input.getAttribute('data-field');
      const index = fieldOrder.indexOf(field);
      if (e.key === 'Tab') {
        const nextIndex = index + (e.shiftKey ? -1 : 1);
        input._daySheetNextFocus = nextIndex >= 0 && nextIndex < fieldOrder.length
          ? { eventId: input.getAttribute('data-event-id'), field: fieldOrder[nextIndex] }
          : null;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        input._daySheetNextFocus = { eventId: input.getAttribute('data-event-id'), field };
        input.blur();
      }
    });
  });

  modal.querySelectorAll('.day-sheet-title-input, .day-sheet-location-input').forEach(input => {
    input.addEventListener('focus', () => {
      const eventId = input.getAttribute('data-event-id');
      syncDaySheetSelectionUI(modal, dayId, eventId);
    });
    input.addEventListener('change', () => {
      const eventId = input.getAttribute('data-event-id');
      const field = input.getAttribute('data-field');
      const value = typeof input.value === 'string' ? input.value.trim() : input.value;
      commitDayEventSheetUpdate(dayId, eventId, { [field]: value }, { rerenderModal: false });
    });
    if (input.tagName !== 'TEXTAREA') {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        }
      });
    }
  });

  modal.querySelectorAll('.day-sheet-group-select').forEach(select => {
    select.addEventListener('focus', () => {
      const eventId = select.getAttribute('data-event-id');
      syncDaySheetSelectionUI(modal, dayId, eventId);
    });
    select.addEventListener('change', () => {
      const eventId = select.getAttribute('data-event-id');
      const currentEvent = Store.getEvents(dayId).find(e => e.id === eventId);
      if (!currentEvent) return;
      const oldGroup = Store.getGroup(currentEvent.groupId);
      const newGroup = Store.getGroup(select.value);
      const oldScope = oldGroup ? oldGroup.scope : 'limited';
      const newScope = newGroup ? newGroup.scope : 'limited';
      const updates = { groupId: select.value };
      if (!newGroup) {
        updates.isMainEvent = false;
      } else if (oldScope !== newScope) {
        updates.isMainEvent = newScope === 'main';
      }
      commitDayEventSheetUpdate(dayId, eventId, updates, {
        rerenderModal: true,
        checkConflict: true,
        focusInfo: { eventId, field: 'groupId' }
      });
    });
  });

  modal.querySelectorAll('.day-sheet-break-toggle').forEach(input => {
    input.addEventListener('focus', () => {
      const eventId = input.getAttribute('data-event-id');
      syncDaySheetSelectionUI(modal, dayId, eventId);
    });
    input.addEventListener('change', () => {
      const eventId = input.getAttribute('data-event-id');
      commitDayEventSheetUpdate(dayId, eventId, { isBreak: input.checked }, { rerenderModal: true, checkConflict: true });
    });
  });

  modal.querySelectorAll('.day-sheet-main-toggle').forEach(input => {
    input.addEventListener('focus', () => {
      const eventId = input.getAttribute('data-event-id');
      syncDaySheetSelectionUI(modal, dayId, eventId);
    });
    input.addEventListener('change', () => {
      const eventId = input.getAttribute('data-event-id');
      commitDayEventSheetUpdate(dayId, eventId, { isMainEvent: input.checked }, { rerenderModal: true, checkConflict: true });
    });
  });

  wireDaySheetDetailPanel(modal, dayId);
}

function wireDaySheetDetailPanel(modal, dayId) {
  const detailPanel = modal.querySelector('#daySheetDetailPanel');
  if (!detailPanel) return;

  const openDetailsBtn = detailPanel.querySelector('#daySheetOpenDetails');
  if (openDetailsBtn) {
    openDetailsBtn.addEventListener('click', () => {
      const eventId = openDetailsBtn.getAttribute('data-event-id');
      if (eventId) openDaySheetFullDetails(dayId, eventId);
    });
  }

  detailPanel.querySelectorAll('input[type="text"]').forEach(input => {
    input.addEventListener('change', () => {
      const eventId = input.getAttribute('data-event-id');
      const field = input.getAttribute('data-field');
      const value = typeof input.value === 'string' ? input.value.trim() : input.value;
      commitDayEventSheetUpdate(dayId, eventId, { [field]: value }, { rerenderModal: false });
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
    });
  });

  const deleteBtn = detailPanel.querySelector('#daySheetDeleteSelected');
  if (deleteBtn) {
    wireDeleteButton(deleteBtn, () => {
      const eventId = deleteBtn.getAttribute('data-event-id');
      const events = Store.getEvents(dayId).slice()
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
      const index = events.findIndex(evt => evt.id === eventId);
      const nextEventId = (events[index + 1] && events[index + 1].id) || (events[index - 1] && events[index - 1].id) || null;
      saveUndoState();
      Store.removeEvent(dayId, eventId);
      sessionSave();
      renderActiveDay();
      renderInspector();
      renderDayEventSheetModal(modal, dayId, nextEventId ? { eventId: nextEventId } : null);
    });
  }
}

function commitDayEventSheetUpdate(dayId, eventId, updates, options) {
  saveUndoState();
  Store.updateEvent(dayId, eventId, updates);
  renderActiveDay();
  renderInspector();
  sessionSave();
  if (options && options.checkConflict) checkTimeConflict(dayId, eventId);
  if (!options || options.rerenderModal !== false) {
    const modal = document.getElementById('dayEventSheetModalContent');
    if (modal) renderDayEventSheetModal(modal, dayId, options && options.focusInfo);
  }
}

// ── Face 2: Event Inspector ────────────────────────────────────────────────

function renderEventInspector(panel, dayId, eventId) {
  const evt = Store.getEvents(dayId).find(e => e.id === eventId);
  if (!evt) { renderScheduleSetup(panel); return; }

  const groups = Store.getGroups();
  const readOnly = typeof isCurrentScheduleEditable === 'function' ? !isCurrentScheduleEditable() : false;
  const textReadOnly = readOnly ? ' readonly' : '';
  const disabledAttr = readOnly ? ' disabled' : '';

  let html = '<div class="insp-header"><h3 style="margin:0;">Event Details</h3><button class="insp-close" id="insp-close" title="Back to Setup">\u2715</button></div>';
  if (readOnly) {
    html += '<div class="insp-readonly-note">Read-only view. Click <strong>Edit</strong> above before changing this event.</div>';
  }

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
  html += '<input type="text" id="insp-evt-title" value="' + esc(evt.title) + '"' + textReadOnly + '>';

  // Times — text inputs with snap-to-15 validation
  html += '<div class="field-row">';
  html += '<div><label>Start</label><input type="text" id="insp-evt-start" value="' + esc(evt.startTime) + '" placeholder="0700" maxlength="4" class="time-input"' + textReadOnly + '></div>';
  html += '<div><label>End</label><input type="text" id="insp-evt-end" value="' + esc(evt.endTime) + '" placeholder="0800" maxlength="4" class="time-input"' + textReadOnly + '></div>';
  html += '</div>';

  // Group
  html += '<label>Audience</label>';
  html += '<select id="insp-evt-group"' + disabledAttr + '>';
  html += '<option value="">-- None --</option>';
  groups.forEach(g => {
    html += '<option value="' + esc(g.id) + '"' + (g.id === evt.groupId ? ' selected' : '') + '>' + esc(g.name) + '</option>';
  });
  html += '</select>';
  html += '<p class="insp-hint">Use <strong>Audience</strong> for the group or section this event belongs to. Primary audiences automatically place this event in the main track. Supporting or unassigned events stay in the side track unless you turn on <strong>Main Track</strong> below.</p>';

  // Specific People
  html += '<label>Specific People</label>';
  html += '<input type="text" id="insp-evt-attendees" value="' + esc(evt.attendees) + '" placeholder="e.g. SrA Snuffy, MSgt Yoda"' + textReadOnly + '>';
  html += '<p class="insp-hint">Optional named exceptions within the selected audience. Shows as "WHO:" on the band, or "+ names" when an audience is already assigned. In tight spaces, names truncate with a footnote in Notes.</p>';

  // Description
  html += '<label>Description</label>';
  html += '<textarea id="insp-evt-desc"' + textReadOnly + '>' + esc(evt.description) + '</textarea>';

  // Location + POC
  html += '<label>Location</label>';
  html += '<input type="text" id="insp-evt-loc" value="' + esc(evt.location) + '"' + textReadOnly + '>';
  html += '<label>Point of Contact</label>';
  html += '<input type="text" id="insp-evt-poc" value="' + esc(evt.poc) + '"' + textReadOnly + '>';

  // Break toggle
  html += '<div class="insp-toggle-section">';
  html += '<label class="insp-toggle-label"><input type="checkbox" id="insp-evt-break"' + (evt.isBreak ? ' checked' : '') + disabledAttr + '> This is a break</label>';
  html += '<p class="insp-hint">Breaks (lunch, travel) appear muted on the schedule.</p>';
  html += '</div>';

  // Highlight override — only show if group scope is limited
  const evtGroup = Store.getGroup(evt.groupId);
  const groupIsMain = evtGroup && evtGroup.scope === 'main';
  if (!groupIsMain && !evt.isBreak) {
    html += '<div class="insp-toggle-section">';
    html += '<label class="insp-toggle-label"><input type="checkbox" id="insp-evt-main"' + (evt.isMainEvent ? ' checked' : '') + disabledAttr + '> Show this in the main track</label>';
    html += '<p class="insp-hint">Use this only when a supporting or unassigned event still needs to appear in the main track.</p>';
    html += '</div>';
  }

  // Delete — in sticky zone
  html += '<div class="insp-delete-zone"><button class="delete-btn" id="insp-evt-delete"' + disabledAttr + '>Delete Event</button></div>';

  panel.innerHTML = html;
  wireEventInspector(panel, dayId, eventId);
}

function wireEventInspector(panel, dayId, eventId) {
  const editable = typeof isCurrentScheduleEditable === 'function' ? isCurrentScheduleEditable() : true;
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

  if (!editable) return;

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
  const readOnly = typeof isCurrentScheduleEditable === 'function' ? !isCurrentScheduleEditable() : false;
  const textReadOnly = readOnly ? ' readonly' : '';
  const disabledAttr = readOnly ? ' disabled' : '';

  let html = '<div class="insp-header"><h3 style="margin:0;">Note Details</h3><button class="insp-close" id="insp-close" title="Back to Setup">\u2715</button></div>';
  if (readOnly) {
    html += '<div class="insp-readonly-note">Read-only view. Click <strong>Edit</strong> above before changing this note.</div>';
  }

  html += '<label>Category</label>';
  html += '<input type="text" id="insp-note-cat" value="' + esc(note.category) + '" placeholder="e.g., Medical, TDY"' + textReadOnly + '>';

  html += '<label>Text</label>';
  html += '<textarea id="insp-note-text"' + textReadOnly + '>' + esc(note.text) + '</textarea>';

  html += '<div class="insp-delete-zone"><button class="delete-btn" id="insp-note-delete"' + disabledAttr + '>Delete Note</button></div>';

  panel.innerHTML = html;
  wireNoteInspector(panel, dayId, noteId);
}

function wireNoteInspector(panel, dayId, noteId) {
  const editable = typeof isCurrentScheduleEditable === 'function' ? isCurrentScheduleEditable() : true;
  const closeBtn = panel.querySelector('#insp-close');
  if (closeBtn) closeBtn.addEventListener('click', () => selectEntity(null));

  if (!editable) return;

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
  const defaultLabel = btn.getAttribute('data-delete-label') || (btn.id.includes('note') ? 'Delete Note' : 'Delete Event');
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
      btn.textContent = defaultLabel;
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
    if (typeof isCurrentScheduleEditable === 'function' && !isCurrentScheduleEditable()) {
      toast('This schedule is read-only until you click Edit.');
      return;
    }
    saveUndoState();
    const day = Store.addDay({ date: '', startTime: '0700', endTime: '1630' });
    if (!Store.getActiveDay()) Store.setActiveDay(day.id);
    _expandedDayId = day.id;
    sessionSave();
    renderActiveDay();
    selectEntity(null); // show days face with new day expanded
  };

  const daySheetBtn = document.getElementById('daySheetBtn');
  if (daySheetBtn) daySheetBtn.onclick = () => openDayEventSheetModal();

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

  const customizeBtn = document.getElementById('customizeBtn');
  if (customizeBtn) customizeBtn.onclick = () => openSettingsModal();

  const printBtn = document.getElementById('printBtn');
  if (printBtn) printBtn.onclick = () => { overflowMenu.classList.remove('open'); printAllDays(); };

  // Back to library
  const backBtn = document.getElementById('tbBack');
  if (backBtn) backBtn.onclick = () => returnToLibrary();

  // Versions panel
  const versionsMenuBtn = document.getElementById('versionsMenuBtn');
  if (versionsMenuBtn) versionsMenuBtn.onclick = () => { overflowMenu.classList.remove('open'); openVersionPanel(); };

  // Help button in overflow
  const helpBtn = document.getElementById('helpBtn');
  if (helpBtn) helpBtn.onclick = () => { overflowMenu.classList.remove('open'); openHelpModal(); };

  // Toolbar title — editable inline, syncs with Store
  const tbTitle = document.getElementById('tbTitle');
  if (tbTitle) {
    tbTitle.value = Store.getTitle();
    tbTitle.addEventListener('input', () => {
      if (typeof isCurrentScheduleEditable === 'function' && !isCurrentScheduleEditable()) return;
      Store.setTitle(tbTitle.value.trim());
      renderActiveDay();
      sessionSave();
      // Update filename if we have directory access
      const oldFile = getCurrentFileName();
      if (oldFile && hasDirectoryAccess()) {
        const newSlug = scheduleNameToSlug(tbTitle.value.trim());
        const newFile = newSlug + '.json';
        if (newFile !== oldFile) {
          renameScheduleFile(oldFile, newFile).then(ok => {
            if (ok) setCurrentFile(newFile, _lastKnownSavedAt);
          });
        }
      }
    });
  }

  // Settings modal — close on backdrop click
  const settingsOverlay = document.getElementById('settingsModal');
  if (settingsOverlay) {
    settingsOverlay.addEventListener('click', (e) => {
      if (e.target === settingsOverlay) closeSettingsModal();
    });
  }

  const daySheetOverlay = document.getElementById('dayEventSheetModal');
  if (daySheetOverlay) {
    daySheetOverlay.addEventListener('click', (e) => {
      if (e.target === daySheetOverlay) closeDayEventSheetModal();
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
  if (typeof isCurrentScheduleEditable === 'function' && !isCurrentScheduleEditable()) {
    toast('This schedule is read-only until you click Edit.');
    return;
  }
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
  if (typeof isCurrentScheduleEditable === 'function' && !isCurrentScheduleEditable()) {
    toast('This schedule is read-only until you click Edit.');
    return;
  }
  saveUndoState();
  const note = Store.addNote(dayId, { category: '', text: '(enter note text)' });
  sessionSave();
  renderActiveDay();
  selectEntity('note', dayId, note.id);
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
  const groups = Store.getGroups();
  const { mainBands } = classifyEvents(Store.getEvents(dayId), groups);
  const band = mainBands.find(b => b.event.id === eventId);
  if (!band || band.event.isBreak || band.tier !== 'main') return;
  if (band.overlappingMain && band.overlappingMain.length > 0) {
    const names = band.overlappingMain.map(c => c.title).join(', ');
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
