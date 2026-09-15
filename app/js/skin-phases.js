/* ── skin-phases.js ── Contract ───────────────────────────────────────────
 *
 * EXPORTS:
 *   renderDayBody_phases(dayId) → string (HTML)
 *
 * REQUIRES:
 *   app-state.js    — Store.getDay(), Store.getGroups(), Store.getNotes()
 *   utils.js        — esc(), getContrastingTextColor()
 *   data-helpers.js — getSharedEventExceptions(), summarizeExceptionNote()
 *   render.js       — renderNotes(), clearDaggerFootnotes()
 *
 * CONSUMED BY:
 *   render.js — dispatches to this when skin === 'phases'
 * ──────────────────────────────────────────────────────────────────────────── */

function renderDayBody_phases(dayId, dayOverride) {
  const day = dayOverride || Store.getDay(dayId);
  if (!day) return '';
  const groups = Store.getGroups();
  const events = day.events.slice().sort(compareBandOrder);
  const notes = day.notes || Store.getNotes(dayId);

  clearDaggerFootnotes();

  if (events.length === 0) {
    let html = '<div class="empty-state">';
    html += '<p>Click <strong>+ Event</strong> to add your first event.</p>';
    html += '</div>';
    if (notes.length > 0) html += renderNotes(notes);
    return html;
  }

  const phases = buildPhaseGroups(events, groups);

  let html = '<div class="phases-schedule">';

  phases.forEach((phase, i) => {
    const evt = phase.event;
    const isBreak = evt && evt.isBreak;
    const sharedExceptions = evt ? getSharedEventExceptions(evt, events, groups) : null;
    const exceptionNote = sharedExceptions ? summarizeExceptionNote(sharedExceptions, 3) : '';

    if (evt) {
      html += '<div class="phase-block' + (isBreak ? ' phase-break' : '') + '">';
      html += '<div class="phase-header" data-event-id="' + esc(evt.id) + '">';
      html += '<div class="phase-name">' + esc(evt.title) + '</div>';
      const meta = ['<span class="phase-inline-time">' + esc(evt.startTime + '\u2013' + evt.endTime) + '</span>'];
      if (evt.location) meta.push('<span>' + esc(evt.location) + '</span>');
      if (evt.poc) meta.push('<span>POC: ' + esc(evt.poc) + '</span>');
      html += '<div class="phase-meta-line">' + meta.join('<span class="phase-meta-sep">\u00b7</span>') + '</div>';
      // Phase headers are main-track events; keep their audience tag and
      // named people as Bands does \u2014 a handout without WHO is missing data.
      const phaseGroup = evt.groupId ? (groups.find(g => g.id === evt.groupId) || null) : null;
      if (phaseGroup || evt.attendees) {
        html += '<div class="phase-meta-line phase-who">';
        if (phaseGroup) html += '<span class="skin-group-tag" style="background:' + esc(phaseGroup.color) + ';color:' + esc(getContrastingTextColor(phaseGroup.color)) + ';">' + esc(phaseGroup.name) + '</span>';
        if (evt.attendees) html += '<span>WHO: ' + esc(evt.attendees) + '</span>';
        html += '</div>';
      }
      html += renderFlightDetails(evt);
      if (evt.description) {
        html += '<div class="phase-desc">' + esc(evt.description) + '</div>';
      }
      if (exceptionNote) {
        html += '<div class="phase-exception-note">Exceptions: ' + esc(exceptionNote) + '</div>';
      }
      html += '</div>';
    } else {
      html += '<div class="phase-block">';
      html += '<div class="phase-independent-label">' + esc(phase.label) + '</div>';
    }

    if (phase.tasks.length > 0) {
      html += '<div class="phase-tasks">';
      phase.tasks.forEach(task => {
        const t = task.event;
        const g = task.group;
        html += '<div class="phase-task" data-event-id="' + esc(t.id) + '">';
        html += '<div class="phase-task-head">';
        if (g) html += '<span class="phase-task-group" style="background:' + esc(g.color) + ';color:' + esc(getContrastingTextColor(g.color)) + ';">' + esc(g.name) + '</span>';
        html += '<span class="phase-task-title">' + esc(t.title) + '</span>';
        html += '</div>';
        const taskMeta = ['<span class="phase-task-inline-time">' + esc(t.startTime + '\u2013' + t.endTime) + '</span>'];
        if (t.location) taskMeta.push('<span>' + esc(t.location) + '</span>');
        if (t.poc) taskMeta.push('<span>POC: ' + esc(t.poc) + '</span>');
        html += '<div class="phase-task-meta">' + taskMeta.join('<span class="phase-meta-sep">\u00b7</span>') + '</div>';
        if (t.description) {
          html += '<div class="phase-task-detail">' + esc(t.description) + '</div>';
        }
        html += renderFlightDetails(t);
        if (t.attendees) html += '<div class="phase-task-detail">WHO: ' + esc(t.attendees) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div>';

    // Transition marker between phases
    if (i < phases.length - 1 && !isBreak) {
      html += '<div class="phase-transition">&darr;</div>';
    }
  });

  html += '</div>';

  if (notes.length > 0) html += renderNotes(notes);
  return html;
}
