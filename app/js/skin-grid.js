/* ── skin-grid.js ── Contract ─────────────────────────────────────────────
 *
 * EXPORTS:
 *   renderDayBody_grid(dayId) → string (HTML)
 *
 * REQUIRES:
 *   app-state.js    — Store.getDay(), Store.getGroups(), Store.getNotes()
 *   utils.js        — esc(), timeToMinutes(), getContrastingTextColor()
 *   render.js       — renderNotes(), clearDaggerFootnotes()
 *
 * CONSUMED BY:
 *   render.js — dispatches to this when skin === 'grid'
 * ──────────────────────────────────────────────────────────────────────────── */

function renderDayBody_grid(dayId) {
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

  // Separate shared (main-scope/break) events from group-specific
  const sharedEvents = events.filter(e => {
    if (e.isBreak) return true;
    const g = groups.find(gr => gr.id === e.groupId);
    return g && g.scope === 'main';
  });
  const groupEvents = events.filter(e => !sharedEvents.includes(e));

  // Get groups that have events
  const activeGroupIds = [...new Set(groupEvents.map(e => e.groupId).filter(Boolean))];
  const activeGroups = activeGroupIds.map(id => groups.find(g => g.id === id)).filter(Boolean);

  // Build time slots from all event boundaries
  const timeSet = new Set();
  events.forEach(e => { timeSet.add(e.startTime); timeSet.add(e.endTime); });
  const timeSlots = Array.from(timeSet).sort();

  // CSS grid needs explicit column count
  const colCount = activeGroups.length;
  let html = '<div class="grid-schedule" style="--grid-cols:' + colCount + ';">';

  // Column headers
  html += '<div class="grid-header">';
  html += '<div class="grid-time-col"></div>';
  activeGroups.forEach(g => {
    html += '<div class="grid-group-col" style="background:' + esc(g.color) + ';color:' + esc(getContrastingTextColor(g.color)) + ';">' + esc(g.name) + '</div>';
  });
  html += '</div>';

  // Rows
  for (let i = 0; i < timeSlots.length - 1; i++) {
    const slotStart = timeSlots[i];
    const slotEnd = timeSlots[i + 1];

    // Check for shared event starting at this time
    const shared = sharedEvents.find(e => e.startTime === slotStart);
    if (shared) {
      const bannerClass = shared.isBreak ? 'grid-banner grid-banner-break' : 'grid-banner';
      html += '<div class="' + bannerClass + '" data-event-id="' + esc(shared.id) + '">';
      html += '<div class="grid-time-col">' + esc(shared.startTime) + '</div>';
      html += '<div class="grid-banner-content">';
      html += '<div class="grid-banner-stack">';
      html += '<div class="grid-banner-head">';
      html += '<div class="grid-banner-title">' + esc(shared.title) + '</div>';
      html += '<div class="grid-banner-time">' + esc(shared.startTime + '\u2013' + shared.endTime) + '</div>';
      html += '</div>';
      const bannerMeta = [];
      if (shared.location) bannerMeta.push('<span>' + esc(shared.location) + '</span>');
      if (shared.poc) bannerMeta.push('<span>POC: ' + esc(shared.poc) + '</span>');
      if (bannerMeta.length > 0) {
        html += '<div class="grid-banner-meta">' + bannerMeta.join('<span class="grid-meta-sep">\u00b7</span>') + '</div>';
      }
      if (shared.description) html += '<div class="grid-banner-desc">' + esc(shared.description) + '</div>';
      html += '</div>';
      html += '</div>';
      html += '</div>';
      continue;
    }

    // Group cells
    html += '<div class="grid-row">';
    html += '<div class="grid-time-col">' + esc(slotStart) + '</div>';
    activeGroups.forEach(g => {
      const evt = groupEvents.find(e =>
        e.groupId === g.id &&
        timeToMinutes(e.startTime) <= timeToMinutes(slotStart) &&
        timeToMinutes(e.endTime) > timeToMinutes(slotStart)
      );
      if (evt && evt.startTime === slotStart) {
        // Event starts in this slot
        html += '<div class="grid-cell" style="border-top:2px solid ' + esc(g.color) + ';" data-event-id="' + esc(evt.id) + '">';
        html += '<div class="grid-cell-head">';
        html += '<div class="grid-cell-title">' + esc(evt.title) + '</div>';
        html += '<div class="grid-cell-time">' + esc(evt.startTime + '\u2013' + evt.endTime) + '</div>';
        html += '</div>';
        const meta = [];
        if (evt.location) meta.push('<span>' + esc(evt.location) + '</span>');
        if (evt.poc) meta.push('<span>POC: ' + esc(evt.poc) + '</span>');
        if (meta.length > 0) {
          html += '<div class="grid-cell-meta-line">' + meta.join('<span class="grid-meta-sep">\u00b7</span>') + '</div>';
        }
        if (evt.description) html += '<div class="grid-cell-meta">' + esc(evt.description) + '</div>';
        if (evt.attendees) html += '<div class="grid-cell-meta grid-cell-attendees">WHO: ' + esc(evt.attendees) + '</div>';
        html += '</div>';
      } else if (evt) {
        // Continuation cell
        html += '<div class="grid-cell grid-cell-cont" data-event-id="' + esc(evt.id) + '"></div>';
      } else {
        html += '<div class="grid-cell grid-cell-empty"></div>';
      }
    });
    html += '</div>';
  }

  html += '</div>';
  if (notes.length > 0) html += renderNotes(notes);
  return html;
}
