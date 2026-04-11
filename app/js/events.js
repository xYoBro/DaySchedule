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
 *     - .band-conc[data-event-id] → select concurrent event
 *     - .band[data-event-id] → select event
 *     - .conc-item[data-event-id] → select concurrent event
 *     - .hdr → open settings modal
 *     - .notes-list li[data-note-id] → select note
 *     - .preview-area (empty area) → deselect
 *   Registers global keydown listener for:
 *     - Ctrl/Cmd+P → printAllDays()
 *     - Ctrl/Cmd+S → forceSave()
 *     - Ctrl/Cmd+Z → undo()
 *     - Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y → redo()
 * ──────────────────────────────────────────────────────────────────────────── */

document.addEventListener('click', e => {
  // Click on "Also happening" concurrent indicator -> select that concurrent event
  const concIndicator = e.target.closest('.band-conc[data-event-id]');
  if (concIndicator && !e.target.closest('.inspector')) {
    const dayId = Store.getActiveDay();
    if (dayId) selectEntity('event', dayId, concIndicator.getAttribute('data-event-id'));
    return;
  }

  // Click on event band -> select in inspector
  const band = e.target.closest('.band[data-event-id]');
  if (band && !e.target.closest('.inspector')) {
    const dayId = Store.getActiveDay();
    if (dayId) selectEntity('event', dayId, band.getAttribute('data-event-id'));
    return;
  }

  // Click on concurrent event item -> select in inspector
  const concItem = e.target.closest('.conc-item[data-event-id]');
  if (concItem && !e.target.closest('.inspector')) {
    const dayId = Store.getActiveDay();
    if (dayId) selectEntity('event', dayId, concItem.getAttribute('data-event-id'));
    return;
  }

  // Click on header -> open settings modal (logo, title, contact, groups)
  const hdr = e.target.closest('.hdr');
  if (hdr && !e.target.closest('.inspector')) {
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
  if (e.target.closest('.preview-area') && !e.target.closest('.band') && !e.target.closest('.notes-list li') && !e.target.closest('.conc-item')) {
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
