/* Small additions to existing inspector/Customize surfaces, using normal Store
 * edits so workbook saves, recovery, versions and Undo/Redo retain the choices.
 */
function renderAttendeeFormatting(event, disabled) {
  const mode = event.attendeeFormat || 'text';
  const options = [['text', 'Text as entered'], ['suggested', 'Suggest from separators'], ['lines', 'One person per line'], ['spaces', 'Each space separates a surname']];
  return '<details class="attendee-preview"><summary>Format names for Bands</summary><label for="insp-attendee-format">Separate entries</label><select id="insp-attendee-format"' + disabled + '>' +
    options.map(([value, label]) => '<option value="' + value + '"' + (mode === value ? ' selected' : '') + '>' + label + '</option>').join('') +
    '</select><div id="insp-attendee-preview" role="status">' + attendeePreviewHTML(event) + '</div></details>';
}

function attendeePreviewHTML(event) {
  const parsed = parsePersonnelInput(event.attendees || '', event.attendeeFormat || 'text');
  return '<p>' + esc(parsed.notice) + '</p>' + (parsed.mode === 'text'
    ? '<div class="attendee-preview-list">' + esc(parsed.raw || 'No specific people entered.') + '</div>'
    : '<p><strong>' + parsed.entries.length + ' entries will print</strong></p><div class="attendee-preview-list">' + parsed.entries.map(esc).join('; ') + '</div>') +
    '<p>POCs stay separate. Complete entries print as shown; no name parts are guessed or removed.</p>';
}

function renderBandEventFields(event, readOnly) {
  const disabled = readOnly ? ' disabled' : '';
  const activities = event.flightActivities || [];
  let html = '<div class="insp-toggle-section"><label class="insp-toggle-label"><input type="checkbox" id="insp-evt-emphasis"' +
    (event.emphasized ? ' checked' : '') + disabled + '> Emphasize in Bands</label></div>';
  html += '<details class="flight-editor"' + (activities.length ? ' open' : '') + '><summary>Flight activities' + (activities.length ? ' (' + activities.length + ')' : '') + '</summary>';
  html += '<p class="insp-context-note">Add each flight’s activity within this event. Use the same time window for shared training, or add separate timed activities.</p>';
  activities.forEach((activity, index) => {
    html += '<div class="flight-editor-item" data-flight-index="' + index + '">';
    const field = (key, label, time) => '<label for="flight-' + index + '-' + key + '">' + label + '</label><input id="flight-' + index + '-' + key + '" data-flight-field="' + key + '" type="text" value="' + esc(activity[key]) + '"' + (time ? ' maxlength="5"' : '') + disabled + '>';
    html += field('flight', 'Flight') + field('title', 'Activity');
    html += '<div class="field-row"><div>' + field('startTime', 'Start', true) + '</div><div>' + field('endTime', 'End', true) + '</div></div>';
    html += field('location', 'Location') + field('poc', 'POC');
    html += '<label for="flight-' + index + '-description">Instructions</label><textarea id="flight-' + index + '-description" data-flight-field="description"' + disabled + '>' + esc(activity.description) + '</textarea>';
    html += '<button class="btn" type="button" data-remove-flight="' + index + '"' + disabled + '>Remove activity</button></div>';
  });
  return html + '<button class="btn" type="button" id="insp-add-flight"' + disabled + '>+ Flight activity</button></details>';
}

function wireBandEventFields(panel, dayId, eventId) {
  const current = () => Store.getEvents(dayId).find(event => event.id === eventId);
  const update = updates => {
    saveUndoState(); Store.updateEvent(dayId, eventId, updates); renderActiveDay(); sessionSave();
  };
  const preview = () => {
    const target = panel.querySelector('#insp-attendee-preview');
    if (target && current()) target.innerHTML = attendeePreviewHTML(current());
  };
  panel.querySelector('#insp-evt-attendees')?.addEventListener('input', preview);
  panel.querySelector('#insp-attendee-format')?.addEventListener('change', event => {
    update({ attendeeFormat: normalizeAttendeeFormat(event.target.value) }); preview();
  });
  panel.querySelector('#insp-evt-emphasis')?.addEventListener('change', event => update({ emphasized: event.target.checked }));
  panel.querySelector('#insp-add-flight')?.addEventListener('click', () => {
    const event = current();
    update({ flightActivities: [...(event.flightActivities || []), { id: generateId('flight'), flight: '', title: '', startTime: event.startTime, endTime: event.endTime, location: '', poc: '', description: '' }] });
    renderInspector();
    document.querySelector('.flight-editor-item:last-of-type input')?.focus();
  });
  panel.querySelectorAll('[data-flight-field]').forEach(input => {
    const field = input.dataset.flightField, isTime = field === 'startTime' || field === 'endTime';
    input.addEventListener(isTime ? 'change' : 'input', () => {
      const event = current(), activities = structuredClone(event.flightActivities || []);
      const index = Number(input.closest('[data-flight-index]').dataset.flightIndex), activity = activities[index];
      if (!activity) return;
      const value = isTime ? normalizeTime(input.value) : input.value;
      const next = { ...activity, [field]: value };
      if (isTime && (!isValidScheduleTime(value) || next.startTime >= next.endTime || next.startTime < event.startTime || next.endTime > event.endTime)) {
        input.value = activity[field]; toast('Keep the activity’s start and end within its parent event, with the end after the start.', 6000); return;
      }
      activities[index] = next; update({ flightActivities: activities });
    });
  });
  panel.querySelectorAll('[data-remove-flight]').forEach(button => button.addEventListener('click', () => {
    update({ flightActivities: current().flightActivities.filter((_, index) => index !== Number(button.dataset.removeFlight)) });
    renderInspector(); document.querySelector('#insp-add-flight')?.focus();
  }));
}

function updateBandSettings(updates) {
  const file = getCurrentScheduleFileData();
  if (!file) return;
  saveUndoState();
  file.theme = { ...file.theme, bands: { ...getBandSettings(file.theme), ...updates } };
  renderActiveDay(); sessionSave();
}
