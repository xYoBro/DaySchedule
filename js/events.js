document.addEventListener('click', e => {
  const band = e.target.closest('.band[data-event-id]');
  if (band && !e.target.closest('.editor-panel') && !e.target.closest('.band-conc')) {
    const dayId = Store.getActiveDay();
    if (dayId) openEventEditor(dayId, band.getAttribute('data-event-id'));
    return;
  }
});

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
