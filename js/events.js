document.addEventListener('click', e => {
  // Click on event band -> select in inspector
  const band = e.target.closest('.band[data-event-id]');
  if (band && !e.target.closest('.inspector')) {
    const dayId = Store.getActiveDay();
    if (dayId) selectEntity('event', dayId, band.getAttribute('data-event-id'));
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
  if (e.target.closest('.preview-area') && !e.target.closest('.band') && !e.target.closest('.notes-list li') && !e.target.closest('.conc-section')) {
    selectEntity(null);
    return;
  }
});

// Keyboard shortcuts for undo/redo
document.addEventListener('keydown', e => {
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
