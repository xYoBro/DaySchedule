/* ── skin-cards.js ── Contract ────────────────────────────────────────────
 *
 * EXPORTS:
 *   renderDayBody_cards(dayId) → string (HTML)
 *
 * REQUIRES:
 *   app-state.js    — Store.getDay(), Store.getGroups(), Store.getNotes()
 *   utils.js        — esc()
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

  // Separate shared (main-scope) events from group-specific
  const sharedEvents = events.filter(e => {
    if (e.isBreak) return true;
    const g = groups.find(gr => gr.id === e.groupId);
    return g && g.scope === 'main';
  });
  const groupEvents = events.filter(e => !sharedEvents.includes(e));

  // Get groups that have events
  const activeGroupIds = [...new Set(groupEvents.map(e => e.groupId).filter(Boolean))];
  const activeGroups = activeGroupIds.map(id => groups.find(g => g.id === id)).filter(Boolean);

  let html = '';

  // Shared timeline banner
  if (sharedEvents.length > 0) {
    html += '<div class="cards-shared">';
    sharedEvents.forEach(e => {
      const breakClass = e.isBreak ? ' cards-shared-break' : '';
      html += '<span class="cards-shared-item' + breakClass + '" data-event-id="' + esc(e.id) + '">';
      html += '<strong>' + esc(e.startTime) + '</strong> ' + esc(e.title);
      if (e.location) html += ' <span class="cards-shared-loc">\u00b7 ' + esc(e.location) + '</span>';
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
      html += '<div class="cards-event-time">' + esc(evt.startTime + '\u2013' + evt.endTime) + '</div>';
      html += '<div class="cards-event-title">' + esc(evt.title) + '</div>';
      if (evt.location) html += '<div class="cards-event-detail">' + esc(evt.location) + '</div>';
      if (evt.poc) html += '<div class="cards-event-detail">POC: ' + esc(evt.poc) + '</div>';
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
