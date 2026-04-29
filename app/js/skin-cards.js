/* ── skin-cards.js ── Contract ────────────────────────────────────────────
 *
 * EXPORTS:
 *   renderDayBody_cards(dayId) → string (HTML)
 *
 * REQUIRES:
 *   app-state.js    — Store.getDay(), Store.getGroups(), Store.getNotes()
 *   utils.js        — esc()
 *   data-helpers.js — getSharedEventExceptions(), summarizeExceptionNote()
 *   render.js       — renderNotes(), clearDaggerFootnotes()
 *
 * CONSUMED BY:
 *   render.js — dispatches to this when skin === 'cards'
 * ──────────────────────────────────────────────────────────────────────────── */

function renderDayBody_cards(dayId) {
  const day = Store.getDay(dayId);
  if (!day) return '';
  const groups = Store.getGroups();
  const events = day.events.slice().sort((a, b) => a.startTime.localeCompare(b.startTime));
  const notes = Store.getNotes(dayId);

  clearDaggerFootnotes();

  if (events.length === 0) {
    let html = '<div class="empty-state">';
    html += '<p>Click <strong>+ Event</strong> to add your first event.</p>';
    html += '</div>';
    if (notes.length > 0) html += renderNotes(notes);
    return html;
  }

  // Separate shared/main-track events from group-specific events.
  const sharedEvents = events.filter(e => isEventEffectiveMain(e, groups));
  const groupEvents = events.filter(e => !sharedEvents.includes(e));

  // Get groups that have events
  const activeGroupIds = [...new Set(groupEvents.map(e => e.groupId).filter(Boolean))];
  const activeGroups = activeGroupIds.map(id => groups.find(g => g.id === id)).filter(Boolean);

  let html = '';

  // Shared timeline banner
  if (sharedEvents.length > 0) {
    html += '<div class="cards-shared">';
    sharedEvents.forEach(e => {
      const sharedExceptions = getSharedEventExceptions(e, events, groups);
      const exceptionNote = summarizeExceptionNote(sharedExceptions, 3);
      const breakClass = e.isBreak ? ' cards-shared-break' : '';
      html += '<span class="cards-shared-item' + breakClass + '" data-event-id="' + esc(e.id) + '">';
      html += '<span class="cards-shared-head">';
      html += '<span class="cards-shared-title">' + esc(e.title) + '</span>';
      html += '<span class="cards-shared-time">' + esc(e.startTime + '\u2013' + e.endTime) + '</span>';
      html += '</span>';
      const sharedMeta = [];
      if (e.location) sharedMeta.push('<span>' + esc(e.location) + '</span>');
      if (e.poc) sharedMeta.push('<span>POC: ' + esc(e.poc) + '</span>');
      if (sharedMeta.length > 0) {
        html += '<span class="cards-shared-meta">' + sharedMeta.join('<span class="cards-meta-sep">\u00b7</span>') + '</span>';
      }
      if (exceptionNote) {
        html += '<span class="cards-shared-exception">Exceptions: ' + esc(exceptionNote) + '</span>';
      }
      html += '</span>';
    });
    html += '</div>';
  }

  // Group cards — 2 columns for ≤4 groups, 3 for more
  const colCount = activeGroups.length <= 4 ? 2 : 3;
  html += '<div class="cards-grid cards-cols-' + colCount + '">';
  activeGroups.forEach(g => {
    const gEvents = groupEvents.filter(e => e.groupId === g.id)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    html += '<div class="cards-card" style="border-top:3px solid ' + esc(g.color) + ';">';
    html += '<div class="cards-card-header" style="color:' + esc(g.color) + ';">' + esc(g.name) + '</div>';

    gEvents.forEach(evt => {
      html += '<div class="cards-event" data-event-id="' + esc(evt.id) + '">';
      html += '<div class="cards-event-head">';
      html += '<div class="cards-event-title">' + esc(evt.title) + '</div>';
      html += '<div class="cards-event-time">' + esc(evt.startTime + '\u2013' + evt.endTime) + '</div>';
      html += '</div>';
      const meta = [];
      if (evt.location) meta.push('<span>' + esc(evt.location) + '</span>');
      if (evt.poc) meta.push('<span>POC: ' + esc(evt.poc) + '</span>');
      if (meta.length > 0) {
        html += '<div class="cards-event-meta">' + meta.join('<span class="cards-meta-sep">\u00b7</span>') + '</div>';
      }
      if (evt.description) html += '<div class="cards-event-detail">' + esc(evt.description) + '</div>';
      if (evt.attendees) html += '<div class="cards-event-detail">WHO: ' + esc(evt.attendees) + '</div>';
      html += '</div>';
    });

    if (gEvents.length === 0) {
      html += '<div class="cards-event-empty">No events assigned</div>';
    }

    html += '</div>';
  });
  html += '</div>';

  if (notes.length > 0) html += renderNotes(notes);
  return html;
}
