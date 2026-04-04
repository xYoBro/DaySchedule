let _editingEventId = null;

function openEventEditor(dayId, eventId) {
  closeEventEditor();
  const evt = Store.getEvents(dayId).find(e => e.id === eventId);
  if (!evt) return;
  _editingEventId = eventId;
  const band = document.querySelector('[data-event-id="' + eventId + '"]');
  if (!band) return;

  const groups = Store.getGroups();
  const groupOptions = groups.map(g =>
    '<option value="' + esc(g.id) + '"' + (g.id === evt.groupId ? ' selected' : '') + '>' + esc(g.name) + '</option>'
  ).join('');

  const timeOptions = buildTimeOptions();

  const editorHtml = '<div class="editor-panel" data-editing="' + esc(eventId) + '">'
    + '<div class="editor-row">'
    + '<label>Title <input type="text" class="ed-title" value="' + esc(evt.title) + '"></label>'
    + '</div>'
    + '<div class="editor-row editor-row-time">'
    + '<label>Start <select class="ed-start">' + timeOptions.replace('value="' + evt.startTime + '"', 'value="' + evt.startTime + '" selected') + '</select></label>'
    + '<label>End <select class="ed-end">' + timeOptions.replace('value="' + evt.endTime + '"', 'value="' + evt.endTime + '" selected') + '</select></label>'
    + '<label>Group <select class="ed-group">' + groupOptions + '</select></label>'
    + '</div>'
    + '<div class="editor-row">'
    + '<label>Description <textarea class="ed-desc" rows="2">' + esc(evt.description) + '</textarea></label>'
    + '</div>'
    + '<div class="editor-row editor-row-half">'
    + '<label>Location <input type="text" class="ed-loc" value="' + esc(evt.location) + '"></label>'
    + '<label>POC <input type="text" class="ed-poc" value="' + esc(evt.poc) + '"></label>'
    + '</div>'
    + '<div class="editor-row editor-row-checks">'
    + '<label><input type="checkbox" class="ed-main"' + (evt.isMainEvent ? ' checked' : '') + '> Main Event</label>'
    + '<label><input type="checkbox" class="ed-break"' + (evt.isBreak ? ' checked' : '') + '> Break</label>'
    + '</div>'
    + '<div class="editor-actions">'
    + '<button class="btn btn-primary ed-save">Done</button>'
    + '<button class="btn btn-danger ed-delete">Delete</button>'
    + '</div>'
    + '</div>';

  band.insertAdjacentHTML('afterend', editorHtml);
  band.classList.add('editing-active');

  const panel = band.nextElementSibling;
  panel.querySelector('.ed-save').onclick = () => saveEventEdit(dayId, eventId, panel);
  panel.querySelector('.ed-delete').onclick = () => deleteEvent(dayId, eventId);
  panel.querySelector('.ed-title').focus();
}

function saveEventEdit(dayId, eventId, panel) {
  saveUndoState();
  const group = Store.getGroup(panel.querySelector('.ed-group').value);
  Store.updateEvent(dayId, eventId, {
    title: panel.querySelector('.ed-title').value.trim(),
    startTime: panel.querySelector('.ed-start').value,
    endTime: panel.querySelector('.ed-end').value,
    description: panel.querySelector('.ed-desc').value.trim(),
    location: panel.querySelector('.ed-loc').value.trim(),
    poc: panel.querySelector('.ed-poc').value.trim(),
    groupId: panel.querySelector('.ed-group').value,
    isMainEvent: panel.querySelector('.ed-main').checked,
    isBreak: panel.querySelector('.ed-break').checked,
  });
  closeEventEditor();
  sessionSave();
  renderActiveDay();
}

function deleteEvent(dayId, eventId) {
  if (!confirm('Delete this event?')) return;
  saveUndoState();
  Store.removeEvent(dayId, eventId);
  closeEventEditor();
  sessionSave();
  renderActiveDay();
}

function closeEventEditor() {
  document.querySelectorAll('.editor-panel').forEach(p => p.remove());
  document.querySelectorAll('.editing-active').forEach(b => b.classList.remove('editing-active'));
  _editingEventId = null;
}

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
  if (evt) setTimeout(() => openEventEditor(dayId, evt.id), 100);
}

function buildTimeOptions() {
  let html = '';
  for (let m = 0; m < 24 * 60; m += TIME_INCREMENT) {
    const t = minutesToTime(m);
    html += '<option value="' + t + '">' + t + '</option>';
  }
  return html;
}
