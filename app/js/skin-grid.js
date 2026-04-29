/* ── skin-grid.js ── Contract ─────────────────────────────────────────────
 *
 * EXPORTS:
 *   renderDayBody_grid(dayId) → string (HTML)
 *
 * REQUIRES:
 *   app-state.js    — Store.getDay(), Store.getGroups(), Store.getNotes()
 *   utils.js        — esc(), timeToMinutes(), getContrastingTextColor()
 *   data-helpers.js — getSharedEventExceptions(), summarizeExceptionNote()
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

  // Separate shared/main-track events from group-specific events.
  const sharedEvents = events.filter(e => isEventEffectiveMain(e, groups));
  const groupEvents = events.filter(e => !sharedEvents.includes(e));

  // Get groups that have events
  const activeGroupIds = [...new Set(groupEvents.map(e => e.groupId).filter(Boolean))];
  const activeGroups = activeGroupIds.map(id => groups.find(g => g.id === id)).filter(Boolean);

  // Time rows are keyed by event starts. Boundaries caused duplicate-looking
  // rows when several main-track events shared the same start time.
  const timeSlots = Array.from(new Set(events.map(e => e.startTime)))
    .sort((a, b) => timeToMinutes(a) - timeToMinutes(b));

  // CSS grid needs explicit column count
  const colCount = Math.max(activeGroups.length, 1);
  let html = '<div class="grid-schedule" style="--grid-cols:' + colCount + ';">';
  const overlapWarnings = getGridLaneOverlapWarnings(activeGroups, groupEvents);

  if (overlapWarnings.length > 0) {
    html += '<div class="grid-view-note">';
    html += '<strong>Grid view warning:</strong> ' + esc(summarizeGridOverlapWarnings(overlapWarnings));
    html += '</div>';
  }

  if (activeGroups.length > 0) {
    html += '<div class="grid-header">';
    html += '<div class="grid-time-col">Time</div>';
    html += '<div class="grid-lane-head-strip">';
    activeGroups.forEach(g => {
      html += '<div class="grid-group-col" style="background:' + esc(g.color) + ';color:' + esc(getContrastingTextColor(g.color)) + ';">' + esc(g.name) + '</div>';
    });
    html += '</div>';
    html += '</div>';
  }

  // Rows
  timeSlots.forEach(slotStart => {
    const sharedAtSlot = sharedEvents.filter(e => e.startTime === slotStart);
    const groupRow = renderGridRow(slotStart, activeGroups, groupEvents);

    if (!sharedAtSlot.length && !groupRow.hasGroupActivity) return;

    html += '<div class="grid-slot">';
    html += '<div class="grid-time-col">' + esc(slotStart) + '</div>';
    html += '<div class="grid-slot-body">';

    if (sharedAtSlot.length > 0) {
      html += '<div class="grid-main-stack">';
      sharedAtSlot.forEach(shared => {
        html += renderGridBanner(shared, events, groups);
      });
      html += '</div>';
    }

    if (groupRow.hasGroupActivity) html += groupRow.html;

    html += '</div>';
    html += '</div>';
  });

  html += '</div>';
  if (notes.length > 0) html += renderNotes(notes);
  return html;
}

function renderGridBanner(shared, events, groups) {
  const sharedExceptions = getSharedEventExceptions(shared, events, groups);
  const exceptionNote = summarizeExceptionNote(sharedExceptions, 3);
  const bannerClass = shared.isBreak ? 'grid-banner grid-banner-break' : 'grid-banner';
  let html = '<div class="' + bannerClass + '" data-event-id="' + esc(shared.id) + '">';
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
  if (exceptionNote) {
    html += '<div class="grid-banner-exception">Exceptions: ' + esc(exceptionNote) + '</div>';
  }
  html += '</div>';
  html += '</div>';
  html += '</div>';
  return html;
}

function renderGridRow(slotStart, activeGroups, groupEvents) {
  const slotMinutes = timeToMinutes(slotStart);
  let hasGroupActivity = false;
  let html = '<div class="grid-row">';

  activeGroups.forEach(g => {
    const startingEvents = groupEvents.filter(e =>
      e.groupId === g.id &&
      e.startTime === slotStart
    );
    const continuingEvents = groupEvents.filter(e =>
      e.groupId === g.id &&
      e.startTime !== slotStart &&
      timeToMinutes(e.startTime) <= slotMinutes &&
      timeToMinutes(e.endTime) > slotMinutes
    );
    const laneEvents = startingEvents.concat(continuingEvents);

    if (laneEvents.length > 0) hasGroupActivity = true;

    if (laneEvents.length > 0) {
      html += '<div class="grid-cell-stack">';
      laneEvents.forEach(evt => {
        html += renderGridCell(evt, g, evt.startTime !== slotStart);
      });
      html += '</div>';
      return;
    }

    html += '<div class="grid-cell-stack grid-cell-empty"></div>';
  });

  html += '</div>';
  return { html, hasGroupActivity };
}

function renderGridCell(evt, group, isContinuation) {
  const className = isContinuation ? 'grid-cell grid-cell-cont' : 'grid-cell';
  const accentText = getContrastingTextColor(group.color);
  const accentStyle = '--grid-accent:' + esc(group.color) + ';--grid-accent-text:' + esc(accentText) + ';';
  let html = '<div class="' + className + '" style="' + accentStyle + '" data-event-id="' + esc(evt.id) + '">';
  html += '<div class="grid-cell-head">';
  html += '<div class="grid-cell-title">' + esc(evt.title) + '</div>';
  html += '<div class="grid-cell-time">' + esc(evt.startTime + '\u2013' + evt.endTime) + '</div>';
  html += '</div>';
  if (isContinuation) {
    html += '<div class="grid-cell-body">';
    html += '<div class="grid-cell-audience">' + esc(group.name) + '</div>';
    html += '<div class="grid-cell-meta">Continues from ' + esc(evt.startTime) + '</div>';
    html += '</div>';
    html += '</div>';
    return html;
  }
  html += '<div class="grid-cell-body">';
  html += '<div class="grid-cell-audience">' + esc(group.name) + '</div>';
  const meta = [];
  if (evt.location) meta.push('<span>' + esc(evt.location) + '</span>');
  if (evt.poc) meta.push('<span>POC: ' + esc(evt.poc) + '</span>');
  if (meta.length > 0) {
    html += '<div class="grid-cell-meta-line">' + meta.join('<span class="grid-meta-sep">\u00b7</span>') + '</div>';
  }
  if (evt.description) html += '<div class="grid-cell-meta">' + esc(evt.description) + '</div>';
  if (evt.attendees) html += '<div class="grid-cell-meta grid-cell-attendees">WHO: ' + esc(evt.attendees) + '</div>';
  html += '</div>';
  html += '</div>';
  return html;
}

function getGridLaneOverlapWarnings(activeGroups, groupEvents) {
  const warnings = [];

  activeGroups.forEach(group => {
    const eventsForGroup = groupEvents
      .filter(evt => evt.groupId === group.id)
      .slice()
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

    for (let i = 0; i < eventsForGroup.length; i++) {
      for (let j = i + 1; j < eventsForGroup.length; j++) {
        const current = eventsForGroup[i];
        const next = eventsForGroup[j];
        if (timeToMinutes(next.startTime) >= timeToMinutes(current.endTime)) break;
        warnings.push({
          groupName: group.name,
          titles: [current.title, next.title],
        });
      }
    }
  });

  return warnings;
}

function summarizeGridOverlapWarnings(warnings) {
  const first = warnings[0];
  const pair = first.titles.join(' and ');
  if (warnings.length === 1) {
    return pair + ' overlap in ' + first.groupName + '. Use Cards or Phases to review both events.';
  }
  return pair + ' overlap in ' + first.groupName + ', plus ' + (warnings.length - 1) + ' more overlap' + (warnings.length === 2 ? '' : 's') + '. Use Cards or Phases to review all events.';
}
