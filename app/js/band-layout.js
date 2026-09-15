/* Approved day-first paper layout. One renderer and fitter serve editor and print.
 * Inputs come from normalized Store records; fitting moves existing DOM records,
 * never rewrites source data or infers names. No application network access.
 */
const BandLayout = (() => {
  const policy = Object.freeze({ margin: 36, logo: 72, notes: 90, clearance: 4,
    detail: 9, name: 10.5, roster: 9.5, title: 11.5, label: 8, scale: .85 });
  const ordered = events => events.slice().sort((a, b) => a.startTime.localeCompare(b.startTime));
  const time = event => event.startTime + '-' + event.endTime;
  const duration = event => {
    const minutes = computeDuration(event);
    return minutes >= 60 && minutes % 60 === 0 ? minutes / 60 + 'h' : minutes + 'm';
  };
  const attendance = event => parsePersonnelInput(event.attendees || '', event.attendeeFormat || 'text');

  function model(day) {
    const groups = getGroupMap(Store.getGroups());
    const mains = ordered(day.events.filter(event => isEventEffectiveMain(event, groups)));
    const concurrent = ordered(day.events.filter(event => !isEventEffectiveMain(event, groups)));
    const references = new Map(concurrent.map((event, i) => [event.id, i + 1]));
    const byMain = new Map(mains.map(main => [main.id, concurrent.filter(event => eventsOverlap(main, event))]));
    return { day, groups, mains, concurrent, references, byMain };
  }

  function paletteStyle() {
    const theme = getScheduleTheme(getCurrentScheduleFileData()?.theme);
    let colors = (BAND_PAPER_THEMES[theme.palette] || BAND_PAPER_THEMES.slate).colors;
    let ink = { bg: '#ffffff', text: '#20262c', textSecondary: '#39424b', textMuted: '#525962' };
    if (theme.palette === 'classic') colors = BAND_PAPER_THEMES.airforce.colors;
    if (theme.palette === 'custom' || theme.palette === 'darkops') {
      const custom = Object.assign({}, PALETTES[theme.palette] || PALETTES.classic, theme.customColors);
      ink = custom;
      colors = [custom.accent, custom.accentSecondary, custom.surface, custom.surface,
        custom.surface, custom.border, custom.surface, custom.surface, custom.accentTertiary];
    }
    const roles = BAND_COLOR_ROLES.map((role, i) => '--paper-' + role + ':' + colors[i]);
    roles.push('--paper-bg:' + ink.bg, '--paper-text:' + ink.text,
      '--paper-secondary:' + ink.textSecondary, '--paper-muted:' + ink.textMuted);
    roles.push('--paper-anchor-ink:' + getContrastingTextColor(colors[1]));
    roles.push('--paper-heading-ink:' + getContrastingTextColor(colors[0]));
    return roles.join(';');
  }

  function badge(event, number, interactive) {
    const attributes = 'class="start-ref" data-ref-event="' + esc(event.id) + '"';
    return interactive
      ? '<button type="button" ' + attributes + ' data-event-ref="' + esc(event.id) + '" aria-label="Concurrent event ' + number + ': ' + esc(event.title) + '">' + number + '</button>'
      : '<span ' + attributes + '>' + number + '</span>';
  }

  function articleAttributes(event, interactive) {
    return ' data-event-id="' + esc(event.id) + '"' + (interactive
      ? ' tabindex="0" aria-label="' + esc(event.title + ', ' + time(event) + '. Select to edit.') + '"' : '');
  }

  function attendees(event) {
    const parsed = attendance(event);
    if (!parsed.raw.trim()) return '';
    if (parsed.mode === 'text') return '<div class="attendee-free-text">' + esc(parsed.raw) + '</div>';
    return '<div class="attendees">' + parsed.entries.map((entry, index) =>
      '<span class="person-label" data-person="' + esc(entry) + '" data-entry-index="' + index + '"><strong>' + esc(entry) + '</strong></span>').join(' ') + '</div>';
  }

  function details(event) {
    const meta = [event.location, event.poc ? 'POC: ' + event.poc : ''].filter(Boolean);
    return (meta.length ? '<p class="event-meta">' + meta.map(esc).join(' · ') + '</p>' : '') +
      (event.description ? '<p class="description">' + esc(event.description) + '</p>' : '');
  }

  function flightTable(event) {
    const activities = event.flightActivities || [];
    if (!activities.length) return '';
    const flights = new Map();
    activities.forEach(activity => {
      const key = activity.flight || 'Unnamed flight';
      if (!flights.has(key)) flights.set(key, []);
      flights.get(key).push(activity);
    });
    const timed = activities.some(activity => activity.startTime !== event.startTime || activity.endTime !== event.endTime);
    return '<table class="flight-table"><thead><tr><th scope="col">Flight</th><th scope="col">' +
      (timed ? 'Time / activity' : 'Activity') + '</th><th scope="col">Location / POC</th></tr></thead><tbody>' +
      Array.from(flights, ([flight, entries]) => {
        const sorted = ordered(entries);
        const common = sorted.every(a => a.location === sorted[0].location && a.poc === sorted[0].poc);
        const logistics = a => (a.location ? '<span>' + esc(a.location) + '</span>' : '') +
          (a.poc ? '<span class="flight-poc">' + esc(a.poc) + '</span>' : '');
        return '<tr><th scope="row">' + esc(flight) + '</th><td>' + sorted.map(a =>
          '<div class="flight-activity">' + (timed ? '<span class="flight-time">' + esc(time(a)) + '</span> ' : '') +
          '<strong>' + esc(a.title || 'Untitled activity') + '</strong>' + (a.description ? '<span class="flight-description">' + esc(a.description) + '</span>' : '') + '</div>').join('') +
          '</td><td>' + (common ? logistics(sorted[0]) : sorted.map(a => '<div class="flight-logistics">' +
            '<span class="flight-time">' + esc(time(a)) + '</span>' + logistics(a) + '</div>').join('')) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function mainEvent(event, data, interactive) {
    const references = data.byMain.get(event.id) || [];
    const group = data.groups[event.groupId];
    const flight = (event.flightActivities || []).length > 0;
    const audience = flight ? 'By flight' : group?.name || '';
    const meta = (event.location ? '<span class="detail-field detail-location"><small>At</small> ' + esc(event.location) + '</span>' : '') +
      (event.poc ? '<span class="detail-field detail-poc"><small>POC</small> ' + esc(event.poc) + '</span>' : '');
    const refs = references.length ? '<div class="start-refs"><span class="reference-label">Concurrent events:</span><span class="reference-badges">' +
      references.map(item => badge(item, data.references.get(item.id), interactive)).join('') + '</span></div>' : '';
    return '<article class="event main-event' + (event.emphasized ? ' highlighted' : '') + (flight ? ' flight' : '') + (event.isBreak ? ' break' : '') + '"' + articleAttributes(event, interactive) + '>' +
      '<div class="time">' + esc(time(event)) + '<span class="duration">' + esc(duration(event)) + '</span></div>' +
      '<div class="main-content' + (refs && !meta && !event.description ? ' reference-only' : '') + '"><div class="main-top"><div class="event-title"><h3>' + esc(event.title) + '</h3>' +
      (audience && audience !== data.primaryLabel ? '<span class="audience">' + esc(audience) + '</span>' : '') +
      '</div><div class="main-details">' + meta + '</div></div><div class="main-support">' +
      (event.description ? '<p class="description">' + esc(event.description) + '</p>' : '') + refs + '</div>' + attendees(event) + flightTable(event) + '</div></article>';
  }

  function concurrentEvent(event, data, interactive) {
    const parsed = attendance(event), roster = parsed.mode !== 'text' && parsed.entries.length >= 8;
    const group = data.groups[event.groupId];
    const heading = '<header><h3>' + badge(event, data.references.get(event.id), false) + esc(event.title) + '</h3><span class="time">' + esc(time(event)) + '</span>' +
      (roster ? '<p class="roster-title">All ' + parsed.entries.length + ' entries · entered order</p>' : '') + '</header>';
    const audience = group && !/^specific (people|personnel)$/i.test(group.name.trim())
      ? '<div class="audience">' + esc(group.name) + '</div>' : '';
    const body = attendees(event);
    return '<article class="event ' + (roster ? 'large-event flow-roster' : 'small-event') + (event.emphasized ? ' highlighted' : '') + '"' + articleAttributes(event, interactive) + '>' +
      (roster ? '<div class="large-head">' + heading + '</div><div class="roster-body">' + audience + body + '<div class="roster-details">' + details(event) + flightTable(event) + '</div></div>' :
        heading + audience + body + details(event) + flightTable(event)) + '</article>';
  }

  function body(day, options) {
    const interactive = !!options?.interactive, data = model(day);
    const primary = Store.getGroups().filter(group => group.scope === 'main');
    data.primaryLabel = primary.length === 1 ? primary[0].name : '';
    return '<div class="sheet-body"><section class="main-panel"><h3 class="section-title">Main schedule' +
      (data.primaryLabel ? '<small>' + esc(data.primaryLabel) + '</small>' : '') + '</h3><div class="main-list">' +
      (data.mains.length ? data.mains.map(event => mainEvent(event, data, interactive)).join('') : '<p class="band-empty">No main events scheduled.</p>') +
      '</div></section>' + (data.concurrent.length ? '<section class="attendance-area"><div class="concurrent-heading"><h3 class="section-title">Concurrent events</h3></div><div class="attendance-columns">' +
      data.concurrent.map(event => concurrentEvent(event, data, interactive)).join('') + '</div></section>' : '') + '</div>';
  }

  function page(day, options) {
    const opts = options || {}, settings = getBandSettings(getCurrentScheduleFileData()?.theme);
    const index = Store.getDays().findIndex(item => item.id === day.id) + 1;
    const date = day.date ? formatDateDisplay(day.date).split(', ') : [];
    const label = day.label || date[0] || 'Day ' + index;
    const footer = Store.getFooter(), logo = Store.getLogo();
    const notes = (day.notes || []).filter(note => opts.interactive || note.category || note.text);
    const half = Math.ceil(notes.length / 2);
    const css = '--page-width:612pt;--page-height:792pt;--page-margin:36pt;--logo-size:72pt;' +
      '--min-detail:9pt;--min-name:10.5pt;--min-label:8pt;--min-main-title:11.5pt;--notes-height:' + settings.notesHeight + 'pt;' + paletteStyle();
    return '<section class="sheet band-sheet roomy" data-theme="app" data-fit="true" data-day="' + esc(day.id) + '" style="' + css + '" aria-label="' + esc(label) + '">' +
      '<div class="print-error"><b>Schedule not ready to print.</b><p>' + esc(label) + ': the complete day exceeds the supported text sizes. No partial schedule is printed. Review the content before issuing it.</p></div>' +
      '<header class="page-header' + (settings.showLogo ? '' : ' no-logo') + '"' + (opts.interactive ? ' data-band-customize tabindex="0" role="button" aria-label="Customize schedule"' : '') + '>' +
      (settings.showLogo ? '<div class="logo-slot' + (logo ? ' has-logo' : '') + '">' + (logo ? '<img src="' + esc(logo) + '" alt="Unit logo">' : '<span>UNIT<br>LOGO</span>') + '</div>' : '') +
      '<div class="heading-content">' + (Store.getTitle() ? '<p class="page-title">' + esc(Store.getTitle()) + '</p>' : '') +
      (footer.contact ? '<p class="schedule-label">' + esc(footer.contact) + '</p>' : '') + '</div><div class="day-heading"><h2>' + esc(label) + '</h2>' +
      (date.length > 1 ? '<p class="date">' + esc(date[1]) + '</p>' : '') + '</div></header>' +
      (opts.handout ? '<p class="band-handout">' + esc(opts.handout) + '</p>' : '') + body(day, opts) +
      '<section class="reminder-area"><div class="reminder-panel"><h3 class="reminder-heading">Notes &amp; Reminders</h3><div class="reminders">' +
      [notes.slice(0, half), notes.slice(half)].map(column => '<div class="reminder-column">' + column.map(note =>
        '<div class="reminder' + (!note.category && !note.text ? ' note-empty' : '') + '" data-note-id="' + esc(note.id) + '">' + (opts.interactive ? '<button type="button" class="note-select">' : '') +
        (note.category ? '<strong>' + esc(note.category) + ':</strong> ' : '') + esc(note.text || (!note.category ? 'Empty note' : '')) +
        (opts.interactive ? '</button>' : '') + '</div>').join('') + '</div>').join('') + '</div></div></section>' +
      '<footer class="page-footer"><span>' + (footer.poc ? 'Schedule POC: ' + esc(footer.poc) : '') + '</span><span>Day ' + index + ' of ' + Store.getDays().length + '</span></footer></section>';
  }

  function geometry(sheet) {
    const pageBox = sheet.getBoundingClientRect(), content = sheet.querySelector('.sheet-body').getBoundingClientRect();
    const area = sheet.querySelector('.reminder-area').getBoundingClientRect(), footer = sheet.querySelector('.page-footer').getBoundingClientRect();
    const panel = sheet.querySelector('.reminder-panel').getBoundingClientRect(), notes = sheet.querySelector('.reminders').getBoundingClientRect();
    const notesOverflow = Math.max(0, notes.bottom - panel.bottom);
    const overflow = Math.max(0, content.bottom + policy.clearance / .75 - area.top,
      footer.bottom - (pageBox.bottom - policy.margin / .75), notesOverflow);
    const tooWide = Array.from(sheet.querySelectorAll('.event,.reminder,.page-title,.schedule-label,.day-heading,.page-footer'))
      .some(element => element.scrollWidth > element.clientWidth + 1);
    return { fits: overflow < .05 && !tooWide, overflow, notesOverflow, tooWide };
  }

  function fit(sheet) {
    sheet.dataset.fit = 'true';
    sheet.style.setProperty('--main-extra', '0pt');
    sheet.style.setProperty('--main-title-grow', '0pt');
    let titleSize = 19;
    sheet.style.setProperty('--title-size', titleSize + 'pt');
    while (sheet.querySelector('.heading-content').getBoundingClientRect().height > 96 && titleSize > 10) {
      titleSize -= .25; sheet.style.setProperty('--title-size', titleSize + 'pt');
    }
    let noteScale = 1;
    sheet.style.setProperty('--note-scale', '1');
    while (geometry(sheet).notesOverflow > 0 && noteScale > policy.detail / 9.5) {
      noteScale = Math.max(policy.detail / 9.5, noteScale - .02);
      sheet.style.setProperty('--note-scale', String(noteScale));
    }
    const columns = sheet.querySelector('.attendance-columns');
    const entries = columns ? Array.from(columns.querySelectorAll('article[data-event-id]')) : [];
    let columnCount = 0, density = 'roomy', scale = 1;
    const place = (count, widths) => {
      if (!columns) return geometry(sheet).fits;
      const single = entries.length <= 3 && !entries.some(entry => entry.classList.contains('large-event'));
      columnCount = single ? 1 : count;
      columns.className = 'attendance-columns ' + (single ? 'single-list' : 'reading-columns');
      columns.style.gridTemplateColumns = (single ? [1] : widths).map(width => 'minmax(0,' + width + 'fr)').join(' ');
      columns.replaceChildren();
      const hosts = Array.from({ length: columnCount }, () => {
        const host = document.createElement('div'); host.className = 'event-column'; columns.appendChild(host); return host;
      });
      const box = sheet.getBoundingClientRect();
      const reserve = sheet.querySelector('.reminder-area').getBoundingClientRect().height + sheet.querySelector('.page-footer').getBoundingClientRect().height +
        parseFloat(getComputedStyle(sheet.querySelector('.page-footer')).marginTop);
      const limit = box.bottom - policy.margin / .75 - reserve - policy.clearance / .75 - columns.getBoundingClientRect().top;
      let col = 0;
      entries.forEach(entry => {
        hosts[col].appendChild(entry);
        if (hosts[col].getBoundingClientRect().height > limit + .05 && col + 1 < columnCount && hosts[col].children.length > 1) hosts[++col].appendChild(entry);
      });
      return geometry(sheet).fits;
    };
    const attempt = count => {
      // Long intact rosters may need either column to be wider. Exhaust these
      // two-column allocations before introducing a third reading column.
      const widths = count === 2
        ? [[1, 1], [.44, .56], [.4, .6], [.36, .64], [.56, .44], [.6, .4], [.64, .36]]
        : [[1, 1, 1]];
      const fits = () => widths.some(ratio => place(count, ratio));
      for (const roster of [12, 11.5, 11, 10.5, 10, policy.roster]) {
        sheet.style.setProperty('--roster-name-size', roster + 'pt');
        for (const candidate of ['roomy', 'standard', 'compact', 'tight']) {
          sheet.classList.remove('roomy', 'standard', 'compact', 'tight');
          sheet.classList.add(candidate); if (candidate === 'tight') sheet.classList.add('compact');
          sheet.style.setProperty('--type-scale', '1');
          density = candidate; scale = 1;
          if (fits()) return true;
        }
      }
      let low = policy.scale, high = 1;
      sheet.style.setProperty('--type-scale', String(low)); scale = low;
      if (!fits()) return false;
      for (let i = 0; i < 9; i++) {
        const mid = (low + high) / 2; sheet.style.setProperty('--type-scale', String(mid));
        if (fits()) low = mid; else high = mid;
      }
      scale = Math.floor(low * 100) / 100; sheet.style.setProperty('--type-scale', String(scale));
      return fits();
    };
    const fitted = attempt(2) || attempt(3);
    if (fitted) {
      const panel = sheet.querySelector('.main-panel'), area = sheet.querySelector('.reminder-area');
      const free = area.getBoundingClientRect().top - sheet.querySelector('.sheet-body').getBoundingClientRect().bottom;
      if (free >= 16) {
        const mainOnly = !columns, cap = (area.getBoundingClientRect().top - panel.getBoundingClientRect().top) * (mainOnly ? .88 : .68);
        let low = 0, high = 1;
        const apply = value => { sheet.style.setProperty('--main-extra', (mainOnly ? 18 : 7) * value + 'pt'); sheet.style.setProperty('--main-title-grow', (mainOnly ? 2.5 : 1.5) * value + 'pt'); };
        for (let i = 0; i < 9; i++) { const mid = (low + high) / 2; apply(mid); if (geometry(sheet).fits && panel.getBoundingClientRect().height <= cap) low = mid; else high = mid; }
        apply(Math.floor(low * 100) / 100);
      }
    }
    const result = geometry(sheet);
    sheet.dataset.fit = String(result.fits); sheet.dataset.columns = String(columnCount);
    sheet.dataset.density = density; sheet.dataset.textScale = String(scale);
    return { ...result, columns: columnCount, scale, density };
  }

  return { policy, model, attendance, page, body, fit, flightTable };
})();
