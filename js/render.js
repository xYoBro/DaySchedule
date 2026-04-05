function renderDay(dayId) {
  const day = Store.getDay(dayId);
  if (!day) return;
  const groups = Store.getGroups();
  const { mainBands, concurrent } = classifyEvents(day.events, groups);
  const notes = Store.getNotes(dayId);
  const container = document.getElementById('scheduleContainer');
  if (!container) return;

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

  if (notes.length > 0) {
    html += renderNotes(notes);
  }

  html += renderFooter();
  container.innerHTML = html;
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
  const { event: evt, tier, group, concurrent: concList } = band;
  const dur = computeDuration(evt);
  const durStr = formatDuration(dur);

  const tierClass = tier === 'main' ? 'main' : tier === 'break' ? 'brk' : 'sup';
  const accentStyle = tier === 'main' && group ? ' style="--accent:' + esc(group.color) + ';"' : '';

  let html = '<div class="band ' + tierClass + '"' + accentStyle + ' data-event-id="' + esc(evt.id) + '">';

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
    html += '<div><span class="band-tag">' + esc(group.name) + '</span></div>';
  }
  html += '</div>';

  // "Also happening" — clickable concurrent indicators
  if (concList && concList.length > 0) {
    concList.forEach(c => {
      const cGroup = Store.getGroup(c.groupId);
      html += '<div class="band-conc" data-event-id="' + esc(c.id) + '">';
      html += '<div class="cc-label">Also happening</div>';
      html += '<div class="cc-title">' + esc(c.title) + '</div>';
      html += '<div class="cc-detail">' + esc(c.startTime + '\u2013' + c.endTime);
      if (c.location) html += ' \u00b7 ' + esc(c.location);
      html += '</div>';
      if (cGroup) html += '<div class="cc-badge">' + esc(cGroup.name) + '</div>';
      html += '</div>';
    });
  }

  html += '</div>';
  return html;
}

function renderConcurrentRow(concurrent, groups) {
  const groupMap = {};
  groups.forEach(g => { groupMap[g.id] = g; });

  let html = '<div class="conc-section">';
  html += '<div class="conc-section-label">Long-Running Concurrent Events</div>';
  html += '<div class="conc-row">';
  concurrent.forEach(c => {
    const g = groupMap[c.groupId];
    html += '<div class="conc-item" data-event-id="' + esc(c.id) + '">';
    html += '<div class="ci-time">' + esc(c.startTime + ' \u2013 ' + c.endTime) + '</div>';
    html += '<div class="ci-title">' + esc(c.title) + '</div>';
    const parts = [c.location, c.poc].filter(Boolean);
    if (parts.length) html += '<div class="ci-detail">' + esc(parts.join(' \u00b7 ')) + '</div>';
    if (c.description) html += '<div class="ci-detail">' + esc(c.description) + '</div>';
    if (g) html += '<div class="ci-badge">' + esc(g.name) + '</div>';
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
  html += '</ul></div>';
  return html;
}

function renderFooter() {
  const f = Store.getFooter();
  const parts = [f.contact, f.poc ? 'Schedule POC: ' + f.poc : '', f.updated ? 'Updated: ' + f.updated : ''].filter(Boolean);
  if (!parts.length) return '';
  return '<div class="footer">' + esc(parts.join(' \u00b7 ')) + '</div>';
}

function formatDateDisplay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return days[d.getDay()] + ', ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}
