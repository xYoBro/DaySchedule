/* Small additions to existing inspector/Customize surfaces, using normal Store
 * edits so workbook saves, recovery, versions and Undo/Redo retain the choices.
 */
function renderAttendeeFormatting(event, disabled, prefix = 'insp') {
  const mode = event.attendeeFormat || 'text';
  const options = [['text', 'Keep text as entered'], ['suggested', 'Separate at commas, ; or &'], ['lines', 'One entry per line'], ['spaces', 'One surname per space']];
  return '<div class="attendee-format"><label for="' + prefix + '-attendee-format">Name layout</label><select id="' + prefix + '-attendee-format"' + disabled + '>' +
    options.map(([value, label]) => '<option value="' + value + '"' + (mode === value ? ' selected' : '') + '>' + label + '</option>').join('') +
    '</select><details class="attendee-preview" open' + (event.attendees?.trim() ? '' : ' hidden') + '><summary>Print preview</summary><div id="' + prefix + '-attendee-preview">' + attendeePreviewHTML(event) + '</div></details></div>';
}

function attendeePreviewHTML(event) {
  const parsed = parsePersonnelInput(event.attendees || '', event.attendeeFormat || 'text');
  return (parsed.mode === 'text' ? '' : '<p class="attendee-count" role="status">' + parsed.entries.length + (parsed.entries.length === 1 ? ' entry' : ' entries') + ' · entered order</p>') +
    '<div class="attendee-preview-list">' + (parsed.mode === 'text' ? esc(parsed.raw) : parsed.entries.map(esc).join('; ')) + '</div>' +
    '<p>' + esc(parsed.notice) + '</p>' +
    (parsed.entries.length >= 8 ? '<p>Long lists use compact roster type. Every entry stays with this event. Use surnames if appropriate; the app never shortens names.</p>' : '');
}

function updateAttendeePreview(panel, event, prefix = 'insp') {
  const target = panel.querySelector('#' + prefix + '-attendee-preview');
  if (!target || !event) return;
  target.innerHTML = attendeePreviewHTML(event);
  target.closest('details').hidden = !event.attendees?.trim();
}

function flightEditorSummary(activity, event) {
  return (activity.flight || 'New flight') + ' · ' + (activity.title || 'Add activity') + ' · ' + activity.startTime + '–' + activity.endTime +
    (event && flightTimeNeedsReview(activity, event) ? ' · Review times' : '');
}

function flightTimeNeedsReview(activity, event) {
  return !isValidScheduleTime(activity.startTime) || !isValidScheduleTime(activity.endTime) ||
    activity.startTime >= activity.endTime || activity.startTime < event.startTime || activity.endTime > event.endTime;
}

function updateFlightEditorTimeContext(panel, event) {
  if (!event) return;
  panel.querySelectorAll('[data-flight-index]').forEach(item => {
    const activity = event.flightActivities?.[Number(item.dataset.flightIndex)];
    if (!activity) return;
    item.querySelector('summary').textContent = flightEditorSummary(activity, event);
    item.querySelector('[data-flight-full-time]').textContent = 'Use event time (' + event.startTime + '–' + event.endTime + ')';
    const warning = item.querySelector('.flight-time-warning');
    warning.textContent = 'Review this activity’s times: keep them within ' + event.startTime + '–' + event.endTime + '.';
    warning.hidden = !flightTimeNeedsReview(activity, event);
  });
}

function renderBandEventFields(event, readOnly) {
  const disabled = readOnly ? ' disabled' : '';
  const activities = event.flightActivities || [];
  let html = '<div class="insp-toggle-section"><label class="insp-toggle-label"><input type="checkbox" id="insp-evt-emphasis"' +
    (event.emphasized ? ' checked' : '') + disabled + '> Emphasize this event</label><p class="insp-hint">Makes a main band an anchor, or highlights a concurrent event. Does not change who attends or where it is listed.</p></div>';
  html += '<details class="flight-editor"' + (activities.length ? ' open' : '') + '><summary>Flight activities' + (activities.length ? ' (' + activities.length + ')' : '') + '</summary>';
  html += '<p class="insp-context-note">Add one activity per flight, or several timed activities for each flight. New activities start with this event’s full time window.</p>';
  activities.forEach((activity, index) => {
    html += '<details class="flight-editor-item" data-flight-index="' + index + '"' + (index === activities.length - 1 ? ' open' : '') + '><summary>' + esc(flightEditorSummary(activity, event)) + '</summary>';
    const field = (key, label, time) => '<label for="flight-' + index + '-' + key + '">' + label + '</label><input id="flight-' + index + '-' + key + '" data-flight-field="' + key + '" type="text" value="' + esc(activity[key]) + '"' + (time ? ' maxlength="5"' : '') + disabled + '>';
    html += field('flight', 'Flight') + field('title', 'Activity');
    html += '<div class="field-row"><div>' + field('startTime', 'Start', true) + '</div><div>' + field('endTime', 'End', true) + '</div></div>';
    html += '<button class="btn flight-use-event-time" type="button" data-flight-full-time="' + index + '"' + disabled + '>Use event time (' + esc(event.startTime + '–' + event.endTime) + ')</button>';
    html += '<p class="flight-time-warning insp-overlap-warn" role="status"' + (flightTimeNeedsReview(activity, event) ? '' : ' hidden') + '>Review this activity’s times: keep them within ' + esc(event.startTime + '–' + event.endTime) + '.</p>';
    html += field('location', 'Location (optional)') + field('poc', 'Point of contact (optional)');
    html += '<label for="flight-' + index + '-description">Instructions</label><textarea id="flight-' + index + '-description" data-flight-field="description"' + disabled + '>' + esc(activity.description) + '</textarea>';
    html += '<button class="btn" type="button" data-remove-flight="' + index + '"' + disabled + '>Remove activity</button></details>';
  });
  return html + '<button class="btn" type="button" id="insp-add-flight"' + disabled + '>+ Flight activity</button></details>';
}

function wireBandEventFields(panel, dayId, eventId) {
  const current = () => Store.getEvents(dayId).find(event => event.id === eventId);
  const update = updates => {
    saveUndoState(); Store.updateEvent(dayId, eventId, updates); renderActiveDay(); sessionSave();
    updateFlightEditorTimeContext(panel, current());
  };
  const preview = () => {
    updateAttendeePreview(panel, current());
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
  panel.querySelectorAll('[data-flight-full-time]').forEach(button => button.addEventListener('click', () => {
    const event = current(), index = Number(button.dataset.flightFullTime);
    const activities = structuredClone(event.flightActivities || []);
    activities[index].startTime = event.startTime; activities[index].endTime = event.endTime;
    update({ flightActivities: activities });
    const item = button.closest('[data-flight-index]');
    item.querySelector('[data-flight-field="startTime"]').value = event.startTime;
    item.querySelector('[data-flight-field="endTime"]').value = event.endTime;
  }));
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
