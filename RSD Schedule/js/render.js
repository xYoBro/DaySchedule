// Collects dagger footnotes for attendees that are truncated in tight spaces.
// Populated during renderBand/renderConcurrentRow, consumed by renderDay.
let _daggerFootnotes = [];

function renderDay(dayId) {
  const day = Store.getDay(dayId);
  if (!day) return;
  const groups = Store.getGroups();
  const { mainBands, concurrent } = classifyEvents(day.events, groups);
  const notes = Store.getNotes(dayId);
  const container = document.getElementById('scheduleContainer');
  if (!container) return;

  _daggerFootnotes = [];

  let html = '';
  html += renderHeader(day);
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

  if (notes.length > 0 || _daggerFootnotes.length > 0) {
    html += renderNotes(notes);
  }

  html += renderFooter();
  container.innerHTML = html;

  // Apply print scaling to preview so the screen view matches what will
  // actually print — prevents content appearing to spill past the page edge.
  applyPrintScaling();
}

function renderHeader(day) {
  const totalDays = Store.getDays().length;
  const dayIndex = Store.getDays().findIndex(d => d.id === day.id) + 1;
  const dayLabel = day.label || ('Day ' + dayIndex + ' of ' + totalDays);
  const logo = Store.getLogo();
  const footer = Store.getFooter();
  const dateStr = day.date ? formatDateDisplay(day.date) : '';

  let html = '<div class="hdr">';
  html += '<div class="hdr-text">';
  html += '<div class="hdr-title">' + esc(Store.getTitle()) + '</div>';
  html += '<div class="hdr-sub">' + esc(dateStr) + ' &ensp;\u2014&ensp; ' + esc(dayLabel) + '</div>';
  html += '<div class="hdr-meta">' + esc(footer.contact || '') + '</div>';
  html += '</div>';
  if (logo) {
    html += '<div class="hdr-logo"><img src="' + esc(logo) + '" alt="Unit Logo"></div>';
  } else {
    html += '<div class="hdr-logo"><span>Unit<br>Logo</span></div>';
  }
  html += '</div>';
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
          _daggerFootnotes.push({ title: c.title, time: c.startTime + '\u2013' + c.endTime, attendees: c.attendees });
          const daggerNum = _daggerFootnotes.length;
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
      const existingIdx = _daggerFootnotes.findIndex(fn => fn.title === c.title && fn.attendees === c.attendees);
      if (existingIdx !== -1) {
        // Reuse the existing footnote reference
        html += '<div class="cc-attendees">' + esc(prefix + c.attendees) + ' <sup>' + (existingIdx + 1) + '</sup></div>';
      } else if (c.attendees.length > 25) {
        // Long text — create new footnote
        _daggerFootnotes.push({ title: c.title, time: c.startTime + ' \u2013 ' + c.endTime, attendees: c.attendees });
        html += '<div class="cc-attendees">' + esc(prefix + c.attendees) + ' <sup>' + _daggerFootnotes.length + '</sup></div>';
      } else {
        html += '<div class="cc-attendees">' + esc(prefix + c.attendees) + '</div>';
      }
    }
    html += '</div>';
  });
  html += '</div></div>';
  return html;
}

function renderNotes(notes) {
  let html = '<div class="notes">';
  html += '<div class="notes-label">Notes</div>';
  html += '<ul class="notes-list">';
  notes.forEach(n => {
    html += '<li data-note-id="' + esc(n.id) + '">';
    if (n.category) html += '<strong>' + esc(n.category) + ' \u2014</strong> ';
    html += esc(n.text) + '</li>';
  });
  html += '</ul>';
  if (_daggerFootnotes.length > 0) {
    html += '<ul class="dagger-list">';
    _daggerFootnotes.forEach((fn, i) => {
      html += '<li class="dagger-note"><sup>' + (i + 1) + '</sup> <strong>' + esc(fn.title) + ' (' + esc(fn.time) + ') \u2014</strong> ' + esc(fn.attendees) + '</li>';
    });
    html += '</ul>';
  }
  html += '</div>';
  return html;
}

function renderFooter() {
  const f = Store.getFooter();
  const now = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const printDate = now.getDate() + ' ' + months[now.getMonth()] + ' ' + now.getFullYear();
  const parts = [f.contact, f.poc ? 'Schedule POC: ' + f.poc : '', 'Printed: ' + printDate].filter(Boolean);
  return '<div class="footer">' + esc(parts.join(' \u00b7 ')) + '</div>';
}

function formatDateDisplay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return days[d.getDay()] + ', ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}
