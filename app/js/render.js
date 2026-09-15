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
  bands: function(dayId, day, options) { return renderDayBody_band(dayId, day, options); },
  grid: function(dayId, day, options) { return renderDayBody_grid(dayId, day, options); },
  cards: function(dayId, day, options) { return renderDayBody_cards(dayId, day, options); },
  phases: function(dayId, day, options) { return renderDayBody_phases(dayId, day, options); },
};

// Shared reference to current schedule file data for theme access.
// Ensures a file data object always exists when the Store has content,
// so the Appearance tab always has something to write theme settings to.
let _currentScheduleFileData = null;
function setCurrentScheduleFileData(data) { _currentScheduleFileData = data; }
function getCurrentScheduleFileData() {
  if (!_currentScheduleFileData && (Store.getTitle() || Store.getDays().length)) {
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
  page.className = 'page skin-' + theme.skin + (theme.skin === 'bands' ? ' bands-screen band-page' : ' alternate-page');

  let html = '';
  if (theme.skin === 'bands') html = BandLayout.page(day, { interactive: true });
  else html = AlternateViews.page(day, theme.skin, { interactive: true });
  container.innerHTML = html;

  if (theme.skin === 'bands') {
    removePrintScaling(page);
    const result = BandLayout.fit(container.querySelector('.band-sheet'));
    const notice = document.createElement('div');
    notice.className = 'band-fit-notice'; notice.setAttribute('role', 'status');
    if (!result.fits) notice.textContent = 'This day exceeds the readable one-page limits. All content remains here for editing. Reduce or revise the content before printing.';
    container.appendChild(notice);
  }
  else {
    removePrintScaling(page);
    const result = AlternateViews.fit(container.querySelector('.alternate-sheet'));
    const notice = document.createElement('div');
    notice.className = 'alternate-fit-notice'; notice.setAttribute('role', 'status');
    if (!result.fits) notice.textContent = 'This day exceeds the readable one-page limits in this view. All content remains available for editing. Review the content or choose Readable pages when printing.';
    container.appendChild(notice);
  }
  if (typeof syncPreviewSelection === 'function') syncPreviewSelection();
}

function renderHeader(day) {
  const totalDays = Store.getDays().length;
  const dayIndex = Store.getDays().findIndex(d => d.id === day.id) + 1;
  const dayLabel = day.label || ('Day ' + dayIndex + ' of ' + totalDays);
  const logo = Store.getLogo();
  const footer = Store.getFooter();
  const dateStr = day.date ? formatDateDisplay(day.date) : '';

  let html = '<div class="hdr" role="button" tabindex="0" aria-label="Customize schedule" title="Customize schedule">';
  html += '<div class="hdr-text">';
  html += '<div class="hdr-title">' + esc(Store.getTitle()) + '</div>';
  html += '<div class="hdr-sub">' + [dateStr, dayLabel].filter(Boolean).map(esc).join(' &ensp;\u2014&ensp; ') + '</div>';
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

function renderNotes(notes, options) {
  const bands = options && options.bands;
  let html = '<div class="notes' + (bands ? ' bands-print-section bands-print-wide bands-print-notes' : '') + '">';
  html += '<div class="notes-label">Notes</div>';
  html += '<ul class="notes-list' + (bands ? ' bands-print-items' : '') + '">';
  notes.forEach(n => {
    if (!n.text && !n.category) {
      // Freshly added, nothing typed yet. Visible on screen so it can be
      // clicked back into; hidden in print (see @media print) and dropped
      // by normalizeNote on the next load.
      html += '<li data-note-id="' + esc(n.id) + '" class="note-empty"><button type="button" class="note-select"><em>Empty note</em></button></li>';
      return;
    }
    html += '<li data-note-id="' + esc(n.id) + '"' + (bands ? ' class="bands-print-event bands-print-note"' : '') + '><button type="button" class="note-select' + (bands ? ' bands-print-description' : '') + '">';
    if (n.category) html += '<strong>' + esc(n.category) + ' \u2014</strong> ';
    html += esc(n.text) + '</button></li>';
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
