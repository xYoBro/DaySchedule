/* ── skin-phases.js ── Contract ───────────────────────────────────────────
 *
 * EXPORTS:
 *   renderDayBody_phases(dayId) → string (HTML)
 *
 * REQUIRES:
 *   app-state.js — Store.getDay(), Store.getGroups(), Store.getNotes()
 *   utils.js     — esc(), getContrastingTextColor()
 *   render.js    — renderNotes(), clearDaggerFootnotes()
 *
 * CONSUMED BY:
 *   render.js — dispatches to this when skin === 'phases'
 * ──────────────────────────────────────────────────────────────────────────── */

function renderDayBody_phases(dayId) {
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

  // Classify: main-scope events become phases, limited-scope become tasks
  const phases = [];
  let currentPhase = null;

  events.forEach(evt => {
    const group = groups.find(g => g.id === evt.groupId);
    const isPhase = (group && group.scope === 'main') || evt.isBreak;

    if (isPhase) {
      currentPhase = {
        event: evt,
        group: group,
        tasks: [],
      };
      phases.push(currentPhase);
    } else {
      if (!currentPhase) {
        currentPhase = { event: null, group: null, tasks: [] };
        phases.push(currentPhase);
      }
      currentPhase.tasks.push({ event: evt, group: group });
    }
  });

  let html = '<div class="phases-schedule">';

  phases.forEach((phase, i) => {
    const evt = phase.event;
    const isBreak = evt && evt.isBreak;

    if (evt) {
      html += '<div class="phase-block' + (isBreak ? ' phase-break' : '') + '" data-event-id="' + esc(evt.id) + '">';
      html += '<div class="phase-header">';
      html += '<div class="phase-name">' + esc(evt.title) + '</div>';
      if (!isBreak) {
        const meta = ['<span class="phase-inline-time">' + esc(evt.startTime + '\u2013' + evt.endTime) + '</span>'];
        if (evt.location) meta.push('<span>' + esc(evt.location) + '</span>');
        if (evt.poc) meta.push('<span>POC: ' + esc(evt.poc) + '</span>');
        html += '<div class="phase-meta-line">' + meta.join('<span class="phase-meta-sep">\u00b7</span>') + '</div>';
      }
      if (evt.description && !isBreak) {
        html += '<div class="phase-desc">' + esc(evt.description) + '</div>';
      }
      html += '</div>';
    } else {
      html += '<div class="phase-block">';
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
