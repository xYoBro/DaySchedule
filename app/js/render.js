/* ── render.js ── Contract ─────────────────────────────────────────────────
 *
 * EXPORTS:
 *   renderDay(dayId)              — renders full schedule page for a day into #scheduleContainer
 *   renderHeader(day)             → HTML string — header with title, date, logo
 *   renderNotes(notes)            → HTML string — notes + dagger footnotes
 *   renderFooter()                → HTML string — footer with contact, POC, print date
 *   formatDateDisplay(dateStr)    → string — "Wednesday, 15 March 2026"
 *   getDaggerFootnotes()          → array — current dagger footnote entries
 *   addDaggerFootnote(fn)         — push an entry onto the dagger footnotes array
 *   clearDaggerFootnotes()        — reset the dagger footnotes array
 *   setCurrentScheduleFileData(data) — sets file-level data for theme access
 *   getCurrentScheduleFileData()  → object|null — current schedule file data
 *
 * REQUIRES:
 *   app-state.js    — Store.getDay(), Store.getDays(), Store.getGroups(), Store.getGroup(),
 *                     Store.getNotes(), Store.getTitle(), Store.getLogo(), Store.getFooter()
 *   utils.js        — esc(), formatDuration(), timeToMinutes()
 *   data-helpers.js — classifyEvents(), computeDuration()
 *   themes.js       — getScheduleTheme(), applyPalette()
 *   print.js        — applyPrintScaling()
 *   skin-band.js    — renderDayBody_band()
 *
 * DOM ELEMENTS:
 *   #scheduleContainer — the page div where schedule HTML is injected
 *
 * CONSUMED BY:
 *   inspector.js  — renderDay() via renderActiveDay()
 *   print.js      — renderHeader(), renderNotes(), renderFooter()
 *   library.js    — setCurrentScheduleFileData() on open/create/return
 *   storage.js    — (indirectly via renderActiveDay)
 * ──────────────────────────────────────────────────────────────────────────── */

// Dagger footnote state (shared with skin files via accessor functions)
let _daggerFootnotes = [];
function getDaggerFootnotes() { return _daggerFootnotes; }
function addDaggerFootnote(fn) { _daggerFootnotes.push(fn); }
function clearDaggerFootnotes() { _daggerFootnotes = []; }

// Skin dispatcher registry
const SKIN_RENDERERS = {
  bands: function(dayId) { return renderDayBody_band(dayId); },
  grid:  function(dayId) { return typeof renderDayBody_grid   === 'function' ? renderDayBody_grid(dayId)   : ''; },
  cards: function(dayId) { return typeof renderDayBody_cards  === 'function' ? renderDayBody_cards(dayId)  : ''; },
  phases:function(dayId) { return typeof renderDayBody_phases === 'function' ? renderDayBody_phases(dayId) : ''; },
};

// Shared reference to current schedule file data for theme access.
// Ensures a file data object always exists when the Store has content,
// so the Appearance tab always has something to write theme settings to.
let _currentScheduleFileData = null;
function setCurrentScheduleFileData(data) { _currentScheduleFileData = data; }
function getCurrentScheduleFileData() {
  if (!_currentScheduleFileData && Store.getTitle()) {
    _currentScheduleFileData = {
      name: Store.getTitle(),
      current: Store.getPersistedState(),
      versions: [],
    };
  }
  return _currentScheduleFileData;
}

function renderDay(dayId) {
  const day = Store.getDay(dayId);
  if (!day) return;
  const container = document.getElementById('scheduleContainer');
  if (!container) return;

  // Apply theme
  const fileData = getCurrentScheduleFileData();
  const theme = getScheduleTheme(fileData && fileData.theme);
  applyPalette(theme.palette, theme.customColors);

  // Set skin class on page
  const page = container.closest('.page') || container;
  page.className = 'page skin-' + theme.skin;

  // Dispatch to skin renderer
  const renderer = SKIN_RENDERERS[theme.skin] || SKIN_RENDERERS.bands;

  let html = '';
  html += renderHeader(day);
  html += renderer(dayId);
  html += renderFooter();
  container.innerHTML = html;

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
