/* ── events.js ── Contract ─────────────────────────────────────────────────
 *
 * EXPORTS: none (all side effects — registers global event listeners)
 *
 * REQUIRES:
 *   app-state.js  — Store.getActiveDay()
 *   inspector.js  — selectEntity(), openSettingsModal()
 *   print.js      — printAllDays()
 *   persistence.js — undo(), redo()
 *   storage.js    — forceSave()
 *
 * SIDE EFFECTS:
 *   Registers global click listener for:
 *     - [data-conc-jump] → scroll to matching "Also Happening" time group
 *     - .band-conc[data-event-id] → select concurrent event
 *     - .band[data-event-id] → select event
 *     - .conc-item[data-event-id] → select concurrent event
 *     - [data-skin-switch] → switch layout skin
 *     - .hdr → open settings modal
 *     - .notes-list li[data-note-id] → select note
 *     - .preview-area (empty area) → deselect
 *   Registers global keydown listener for:
 *     - Ctrl/Cmd+P → printAllDays()
 *     - Ctrl/Cmd+S → forceSave()
 *     - Ctrl/Cmd+Z → undo()
 *     - Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y → redo()
 * ──────────────────────────────────────────────────────────────────────────── */

// Selector for any clickable event element across all skins
const EVENT_SELECTOR = '[data-event-id]';

document.addEventListener('click', e => {
  if (e.target.closest('.modal-overlay')) return;

  const concJump = e.target.closest('[data-conc-jump]');
  if (concJump) {
    const jumpTime = concJump.getAttribute('data-conc-jump');
    const target = jumpTime ? document.querySelector('[data-conc-group="' + jumpTime + '"]') : null;
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return;
  }

  const skinSwitch = e.target.closest('[data-skin-switch]');
  if (skinSwitch) {
    const skin = skinSwitch.getAttribute('data-skin-switch');
    const fileData = getCurrentScheduleFileData();
    if (fileData) {
      if (!fileData.theme) fileData.theme = {};
      fileData.theme.skin = skin;
    }
    sessionSave();
    renderActiveDay();
    toast('Layout: ' + (SKIN_LABELS[skin] ? SKIN_LABELS[skin].name : skin));
    return;
  }

  // Click on "Also happening" concurrent indicator -> select that concurrent event
  const concIndicator = e.target.closest('.band-conc[data-event-id]');
  if (concIndicator && !e.target.closest('.inspector')) {
    const dayId = Store.getActiveDay();
    if (dayId) selectEntity('event', dayId, concIndicator.getAttribute('data-event-id'));
    return;
  }

  // Click on any event element (band, grid cell, card event, phase task) -> select in inspector
  const eventEl = e.target.closest(EVENT_SELECTOR);
  if (eventEl && !e.target.closest('.inspector')) {
    const dayId = Store.getActiveDay();
    if (dayId) selectEntity('event', dayId, eventEl.getAttribute('data-event-id'));
    return;
  }

  // Click on header -> open settings modal (logo, title, contact, groups)
  const hdr = e.target.closest('.hdr');
  if (hdr && !e.target.closest('.inspector')) {
    if (typeof isCurrentScheduleEditable === 'function' && !isCurrentScheduleEditable()) {
      toast('Read-only. Click Edit.');
      return;
    }
    openSettingsModal();
    return;
  }

  // Click on note -> select in inspector
  const noteEl = e.target.closest('.notes-list li[data-note-id]');
  if (noteEl && !e.target.closest('.inspector')) {
    const dayId = Store.getActiveDay();
    if (dayId) selectEntity('note', dayId, noteEl.getAttribute('data-note-id'));
    return;
  }

  // Click on empty page area -> deselect (show schedule setup)
  if (e.target.closest('.preview-area') && !e.target.closest(EVENT_SELECTOR) && !e.target.closest('.notes-list li')) {
    selectEntity(null);
    return;
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  // Cmd/Ctrl+P — print all days
  if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
    e.preventDefault();
    printAllDays();
    return;
  }
  // Cmd/Ctrl+S — save immediately
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    forceSave();
    return;
  }
  // Undo/Redo
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    undo();
  }
  if ((e.metaKey || e.ctrlKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    redo();
  }
});
