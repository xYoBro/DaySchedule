/* ── skin-band.js ── Contract ───────────────────────────────────────────────
 *
 * EXPORTS:
 *   renderDayBody_band(dayId)         → HTML string — full schedule body for band skin
 *   renderBand(band)                  → HTML string — single event band
 *   renderConcurrentRow(conc, groups) → HTML string — "Also Happening" section
 *
 * REQUIRES:
 *   render.js       — clearDaggerFootnotes(), addDaggerFootnote(), getDaggerFootnotes(),
 *                     renderNotes()
 *   app-state.js    — Store.getDay(), Store.getGroups(), Store.getGroup(), Store.getNotes()
 *   utils.js        — esc(), formatDuration()
 *   data-helpers.js — classifyEvents(), computeDuration()
 *
 * CONSUMED BY:
 *   render.js — renderDay() dispatches to renderDayBody_band() for the bands skin
 *   print.js  — renderBand(), renderConcurrentRow() called directly for print layout
 * ──────────────────────────────────────────────────────────────────────────── */

function renderDayBody_band(dayId) {
  const day = Store.getDay(dayId);
  if (!day) return '';
  const groups = Store.getGroups();
  const { mainBands, concurrent } = classifyEvents(day.events, groups);
  const notes = Store.getNotes(dayId);

  clearDaggerFootnotes();

  let html = '';
  html += '<div class="schedule">';
  if (mainBands.length === 0 && concurrent.length === 0) {
    html += '<div class="empty-state">';
    html += '<p>Click <strong>+ Event</strong> to add your first event.</p>';
    html += '<p>Click <strong>+ Note</strong> to add scheduling notes.</p>';
    html += '</div>';
  }
  let prevTier = null;
  mainBands.forEach((band, i) => {
    if (band.tier === 'break' && prevTier && prevTier !== 'break') {
      html += '<div class="section-break"></div>';
    }
    html += renderBand(band);
    if (band.tier === 'break') {
      const next = mainBands[i + 1];
      if (next && next.tier !== 'break') {
        html += '<div class="section-break"></div>';
      }
    }
    prevTier = band.tier;
  });
  html += '</div>';

  if (concurrent.length > 0) {
    html += renderConcurrentRow(concurrent, groups);
  }

  if (notes.length > 0 || getDaggerFootnotes().length > 0) {
    html += renderNotes(notes);
  }

  return html;
}

function renderBand(band) {
  const { event: evt, tier, group, concurrent: concList, overlappingMain } = band;
  const dur = computeDuration(evt);
  const durStr = formatDuration(dur);
  const hasMainOverlap = overlappingMain && overlappingMain.length > 0;

  const tierClass = tier === 'main' ? 'main' : tier === 'break' ? 'brk' : 'sup';
  const overlapClass = hasMainOverlap ? ' band-overlap' : '';
  const accentStyle = tier === 'main' && group ? ' style="--accent:' + esc(group.color) + ';"' : '';

  let html = '<div class="band ' + tierClass + overlapClass + '"' + accentStyle + ' data-event-id="' + esc(evt.id) + '">';

  // Time block
  html += '<div class="band-time">';
  html += '<div class="t-start">' + esc(evt.startTime) + '</div>';
  html += '<div class="t-end">' + esc(evt.endTime) + '</div>';
  if (tier === 'main' && !evt.isBreak) {
    html += '<div class="t-dur">' + esc(durStr) + '</div>';
  }
  html += '</div>';

  // Content
  html += '<div class="band-content">';
  html += '<div class="band-title">' + esc(evt.title) + '</div>';
  if (evt.description && tier !== 'break') {
    html += '<div class="band-desc">' + esc(evt.description) + '</div>';
  }
  if ((evt.location || evt.poc) && tier !== 'break') {
    const locParts = [evt.location, evt.poc ? 'POC: ' + evt.poc : ''].filter(Boolean);
    html += '<div class="band-loc">' + esc(locParts.join(' \u00b7 ')) + '</div>';
  }
  if (group && tier !== 'break') {
    html += '<div><span class="band-tag" style="background:' + esc(group.color) + ';color:white;">' + esc(group.name) + '</span></div>';
  }
  if (evt.attendees && tier !== 'break') {
    const attendeeLabel = group ? '+ ' : 'WHO: ';
    html += '<div class="band-attendees">' + attendeeLabel + esc(evt.attendees) + '</div>';
  }
  // Overlap notice for main-on-main conflicts
  if (hasMainOverlap) {
    const overlapNames = overlappingMain.map(m => esc(m.title)).join(', ');
    html += '<div class="band-overlap-notice">Overlaps with ' + overlapNames + '</div>';
  }
  html += '</div>';

  // Fixed-width concurrent slot — always rendered for alignment
  html += '<div class="band-conc-slot">';
  if (concList && concList.length > 0) {
    concList.forEach(c => {
      const cGroup = Store.getGroup(c.groupId);
      html += '<div class="band-conc" data-event-id="' + esc(c.id) + '">';
      html += '<div class="cc-label">Also at ' + esc(c.startTime) + '</div>';
      html += '<div class="cc-title">' + esc(c.title) + '</div>';
      html += '<div class="cc-detail">' + esc(c.startTime + '\u2013' + c.endTime);
      if (c.location) html += ' \u00b7 ' + esc(c.location);
      html += '</div>';
      if (c.poc) html += '<div class="cc-detail">POC: ' + esc(c.poc) + '</div>';
      if (cGroup) html += '<div><span class="band-tag" style="background:' + esc(cGroup.color) + ';color:white;">' + esc(cGroup.name) + '</span></div>';
      if (c.attendees) {
        const prefix = cGroup ? '+ ' : 'WHO: ';
        if (c.attendees.length > 25) {
          // Long text will truncate in the 180px slot — add footnote
          addDaggerFootnote({ title: c.title, time: c.startTime + '\u2013' + c.endTime, attendees: c.attendees });
          const daggerNum = getDaggerFootnotes().length;
          html += '<div class="cc-attendees">' + esc(prefix + c.attendees) + ' <sup>' + daggerNum + '</sup></div>';
        } else {
          // Short enough to display in full — no footnote needed
          html += '<div class="cc-attendees">' + esc(prefix + c.attendees) + '</div>';
        }
      }
      html += '</div>';
    });
  }
  html += '</div>';

  html += '</div>';
  return html;
}

function renderConcurrentRow(concurrent, groups) {
  const groupMap = {};
  groups.forEach(g => { groupMap[g.id] = g; });

  let html = '<div class="conc-section">';
  html += '<div class="conc-section-label">Also Happening</div>';
  html += '<div class="conc-row">';
  concurrent.forEach(c => {
    const g = groupMap[c.groupId];
    const borderColor = g ? g.color : '#d2d2d7';
    html += '<div class="conc-item" style="border-left-color:' + esc(borderColor) + ';" data-event-id="' + esc(c.id) + '">';
    html += '<div class="ci-time">' + esc(c.startTime + ' \u2013 ' + c.endTime) + '</div>';
    html += '<div class="ci-title">' + esc(c.title) + '</div>';
    const parts = [c.location, c.poc].filter(Boolean);
    if (parts.length) html += '<div class="ci-detail">' + esc(parts.join(' \u00b7 ')) + '</div>';
    if (c.description) html += '<div class="ci-detail">' + esc(c.description) + '</div>';
    if (g) html += '<div><span class="band-tag" style="background:' + esc(g.color) + ';color:white;">' + esc(g.name) + '</span></div>';
    if (c.attendees) {
      const prefix = g ? '+ ' : 'WHO: ';
      // Check if a footnote already exists from the inline band card
      const existingIdx = getDaggerFootnotes().findIndex(fn => fn.title === c.title && fn.attendees === c.attendees);
      if (existingIdx !== -1) {
        // Reuse the existing footnote reference
        html += '<div class="cc-attendees">' + esc(prefix + c.attendees) + ' <sup>' + (existingIdx + 1) + '</sup></div>';
      } else if (c.attendees.length > 25) {
        // Long text — create new footnote
        addDaggerFootnote({ title: c.title, time: c.startTime + ' \u2013 ' + c.endTime, attendees: c.attendees });
        html += '<div class="cc-attendees">' + esc(prefix + c.attendees) + ' <sup>' + getDaggerFootnotes().length + '</sup></div>';
      } else {
        html += '<div class="cc-attendees">' + esc(prefix + c.attendees) + '</div>';
      }
    }
    html += '</div>';
  });
  html += '</div></div>';
  return html;
}
