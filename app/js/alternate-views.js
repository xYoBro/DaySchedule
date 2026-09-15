/* Cards, Grid and Phases share record semantics and paper limits, not a layout.
 * Rendering reads normalized data; fitting only moves whole DOM records.
 * Bands deliberately keeps its approved renderer, styles and fitting policy.
 */
const AlternateViews = (() => {
  const policy = Object.freeze({ detail: 9, name: 10.5, roster: 9.5, title: 11.5, clearance: 4 });
  const ordered = events => events.slice().sort((a, b) => a.startTime.localeCompare(b.startTime));
  const time = event => event.startTime + '–' + event.endTime;

  function model(day) {
    const groups = getGroupMap(Store.getGroups());
    const events = ordered(day.events || []);
    const mains = events.filter(event => isEventEffectiveMain(event, groups));
    const concurrent = events.filter(event => !isEventEffectiveMain(event, groups));
    const primaryLabels = Store.getGroups().filter(group => group.scope === 'main').map(group => group.name);
    return { day, groups, events, mains, concurrent, primaryLabel: primaryLabels.length === 1 ? primaryLabels[0] : '',
      numbers: new Map(concurrent.map((event, index) => [event.id, index + 1])),
      overlaps: new Map(mains.map(main => [main.id, concurrent.filter(event => eventsOverlap(main, event))])) };
  }

  function badge(event, number, interactive) {
    const attrs = ' class="av-number' + (number >= 100 ? ' av-number-wide' : '') + '" data-ref-event="' + esc(event.id) + '"';
    return interactive ? '<button type="button"' + attrs + ' data-event-ref="' + esc(event.id) + '" aria-label="Concurrent event ' + number + ': ' + esc(event.title) + '">' + number + '</button>'
      : '<span' + attrs + '>' + number + '</span>';
  }

  function references(event, data, interactive) {
    const overlaps = data.overlaps.get(event.id) || [];
    return overlaps.length ? '<div class="av-references"><span>Concurrent events:</span><span class="av-reference-list">' +
      overlaps.map(item => badge(item, data.numbers.get(item.id), interactive)).join('') + '</span></div>' : '';
  }

  function personnel(event) {
    const parsed = parsePersonnelInput(event.attendees || '', event.attendeeFormat || 'text');
    if (!parsed.raw.trim()) return '';
    if (parsed.mode === 'text') return '<div class="av-people av-literal">' + esc(parsed.raw) + '</div>';
    return '<div class="av-people' + (parsed.entries.length >= 8 ? ' av-roster' : '') + '">' + parsed.entries.map((entry, index) =>
      '<span data-person="' + esc(entry) + '" data-entry-index="' + index + '">' + esc(entry) + '</span>').join(' ') + '</div>';
  }

  function flights(event) {
    const activities = event.flightActivities || [];
    if (!activities.length) return '';
    const groups = new Map();
    activities.forEach(activity => {
      const label = activity.flight || 'Unnamed flight';
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(activity);
    });
    const timed = activities.some(activity => activity.startTime !== event.startTime || activity.endTime !== event.endTime);
    const logistics = activity => [activity.location, activity.poc ? 'POC: ' + activity.poc : ''].filter(Boolean).map(esc).join('<br>');
    return '<div class="av-flights" aria-label="Flight activities">' + Array.from(groups, ([flight, entries]) => {
      const sorted = ordered(entries), common = entries.every(a => a.location === entries[0].location && a.poc === entries[0].poc);
      return '<div class="av-flight' + (common ? '' : ' av-varied-logistics') + '"><strong class="av-flight-name">' + esc(flight) + '</strong><div>' + sorted.map(activity =>
        '<div class="av-flight-activity">' + (timed ? '<span class="av-flight-time">' + esc(time(activity)) + '</span>' : '') +
        '<span class="av-flight-title">' + esc(activity.title || 'Untitled activity') + '</span>' +
        (activity.description ? '<p class="av-description">' + esc(activity.description) + '</p>' : '') +
        (!common ? '<div class="av-flight-meta">' + logistics(activity) + '</div>' : '') + '</div>').join('') + '</div>' +
        (common ? '<div class="av-flight-meta">' + logistics(sorted[0]) + '</div>' : '') + '</div>';
    }).join('') + '</div>';
  }

  function record(event, data, options) {
    const opts = options || {}, main = data.overlaps.has(event.id), group = data.groups[event.groupId];
    // The group is an attendance field, never a substitute for individual names.
    const audience = group && !(main && group.name === data.primaryLabel) && !(event.attendees?.trim() && /^specific (people|personnel)$/i.test(group.name.trim())) ? group.name : '';
    const meta = event.location || event.poc ? '<div class="av-logistics">' +
      (event.location ? '<div class="av-location">' + esc(event.location) + '</div>' : '') +
      (event.poc ? '<div class="av-poc">POC: ' + esc(event.poc) + '</div>' : '') + '</div>' : '';
    if (opts.table) return tableRecord(event, data, opts, main, audience, meta);
    return '<article class="av-event ' + (main ? 'av-main' : 'av-concurrent') + (event.emphasized ? ' av-emphasized' : '') + '" data-event-id="' + esc(event.id) + '"' +
      (opts.interactive ? ' tabindex="0" aria-label="' + esc(event.title + ', ' + time(event) + '. Select to edit.') + '"' : '') + '>' +
      '<div class="av-event-heading"><h3>' + (!main ? badge(event, data.numbers.get(event.id), false) : '') + esc(event.title) + (main && audience ? '<small class="av-main-audience">' + esc(audience) + '</small>' : '') + '</h3>' + (main || opts.table ? meta : '') + '<span class="av-time">' + esc(time(event)) + '</span></div>' +
      '<div class="av-event-content">' + (!main && audience ? '<div class="av-audience">' + esc(audience) + '</div>' : '') + personnel(event) +
      (!main && !opts.table ? meta : '') +
      (event.description ? '<p class="av-description">' + esc(event.description) + '</p>' : '') + (main ? references(event, data, opts.interactive) : '') + flights(event) + '</div></article>';
  }

  function tableRecord(event, data, opts, main, audience, meta) {
    const parsed = parsePersonnelInput(event.attendees || '', event.attendeeFormat || 'text');
    const roster = parsed.entries.length >= 8;
    return '<article class="av-event av-table-record ' + (main ? 'av-main' : 'av-concurrent') + (event.emphasized ? ' av-emphasized' : '') + (roster ? ' av-table-roster' : '') +
      '" data-event-id="' + esc(event.id) + '"' + (opts.interactive ? ' tabindex="0" aria-label="' + esc(event.title + ', ' + time(event) + '. Select to edit.') + '"' : '') + '>' +
      '<span class="av-time">' + esc(time(event)) + '</span><div class="av-table-identity"><h3>' +
      (main ? '' : badge(event, data.numbers.get(event.id), false)) + esc(event.title) + '</h3>' +
      (audience ? '<div class="av-audience">' + esc(audience) + '</div>' : '') + (!roster ? personnel(event) : '') + '</div>' +
      '<div class="av-table-details">' + meta + '</div>' + (roster ? personnel(event) : '') +
      (event.description || (data.overlaps.get(event.id) || []).length ? '<div class="av-table-support">' + (event.description ? '<p class="av-description">' + esc(event.description) + '</p>' : '') + (main ? references(event, data, opts.interactive) : '') + '</div>' : '') + flights(event) + '</article>';
  }

  function flow(events, data, opts, className) {
    return '<div class="av-flow ' + (className || '') + '" data-flow-count="' + events.length + '">' +
      events.slice().sort((a, b) => data.numbers.get(a.id) - data.numbers.get(b.id)).map(event => record(event, data, opts)).join('') + '</div>';
  }

  const primaryHeading = data => 'Main schedule' + (data.primaryLabel ? '<small>' + esc(data.primaryLabel) + '</small>' : '');

  function cards(day, options) {
    const data = model(day);
    return '<div class="av-cards' + (data.mains.length && data.concurrent.length > 3 ? ' av-cards-columns' : '') + '">' + (data.mains.length || !data.concurrent.length ? '<section class="av-main-section"><h2 class="av-section-heading av-primary-heading">' + primaryHeading(data) + '</h2><div class="av-main-list">' +
      (data.mains.length ? data.mains.map(event => record(event, data, options)).join('') : '<p class="av-empty">No main events scheduled.</p>') + '</div></section>' : '') +
      (data.concurrent.length ? '<section class="av-concurrent-section"><h2 class="av-section-heading' + (!data.mains.length ? ' av-primary-heading' : '') + '">Concurrent events</h2>' + flow(data.concurrent, data, options) + '</section>' : '') + '</div>';
  }

  function grid(day, options) {
    const data = model(day);
    return '<div class="av-grid"><h2 class="av-section-heading av-primary-heading">' +
      (!data.mains.length && data.concurrent.length ? 'Concurrent events' : data.concurrent.length ? 'Main schedule &amp; concurrent events' + (data.primaryLabel ? '<small>Main: ' + esc(data.primaryLabel) + '</small>' : '') : primaryHeading(data)) + '</h2>' +
      '<div class="av-grid-head"><span>Time</span><span>Event / personnel</span><span>Location / POC</span></div>' +
      '<div class="av-grid-flow">' + (data.events.length ? data.events.map(event => record(event, data, { ...options, table: true })).join('') : '<p class="av-empty">No events scheduled.</p>') + '</div></div>';
  }

  function phases(day, options) {
    const data = model(day), phases = buildPhaseGroups(day.events || [], Store.getGroups())
      .sort((a, b) => a.sortEvent.startTime.localeCompare(b.sortEvent.startTime) || Number(!!b.event) - Number(!!a.event));
    return '<div class="av-phases"><h2 class="av-section-heading av-primary-heading">' + (data.mains.length || !data.concurrent.length ? primaryHeading(data) : 'Concurrent events') + '</h2><div class="av-phase-columns">' + (phases.length ? phases.map(phase =>
      '<section class="av-phase' + (phase.event ? '' : ' av-independent') + (phase.tasks.length > 2 || phase.event?.flightActivities?.length || phase.tasks.some(task => parsePersonnelInput(task.event.attendees || '', task.event.attendeeFormat || 'text').entries.length >= 8) ? ' av-phase-wide' : '') + '" aria-label="' + (phase.event ? esc(phase.event.title) : 'Concurrent events') + '">' +
      (phase.event ? record(phase.event, data, options) : '<h4 class="av-independent-label">Concurrent events</h4>') +
      (phase.tasks.length ? flow(phase.tasks.map(task => task.event), data, options) : '') + '</section>').join('') : '<p class="av-empty">No events scheduled.</p>') + '</div></div>';
  }

  function header(day, interactive) {
    const settings = getBandSettings(getCurrentScheduleFileData()?.theme), logo = Store.getLogo();
    const date = day.date ? formatDateDisplay(day.date).split(', ') : [];
    const index = Store.getDays().findIndex(item => item.id === day.id) + 1;
    const subtitle = Store.getFooter().contact;
    return '<header class="av-header' + (settings.showLogo ? '' : ' av-no-logo') + '"' +
      (interactive ? ' data-band-customize tabindex="0" role="button" aria-label="Customize schedule"' : '') + '>' +
      (settings.showLogo ? '<div class="av-logo">' + (logo ? '<img src="' + esc(logo) + '" alt="Unit logo">' : '<span>UNIT<br>LOGO</span>') + '</div>' : '') +
      '<div class="av-heading-text">' + (Store.getTitle() ? '<p class="av-page-title">' + esc(Store.getTitle()) + '</p>' : '') +
      (subtitle ? '<p class="av-subtitle">' + esc(subtitle) + '</p>' : '') + '</div><div class="av-day"><h2>' + esc(day.label || date[0] || 'Day ' + index) + '</h2>' +
      (date.length > 1 ? '<p>' + esc(date[1]) + '</p>' : '') + '</div></header>';
  }

  function notes(day, interactive) {
    const notes = (day.notes || []).filter(note => interactive || note.category || note.text);
    const half = Math.ceil(notes.length / 2);
    return '<section class="av-notes"><h2 class="av-section-heading">Notes &amp; Reminders</h2><div class="av-note-columns">' +
      [notes.slice(0, half), notes.slice(half)].map(column => '<div>' + column.map(note => '<div class="av-note' + (!note.category && !note.text ? ' note-empty' : '') + '" data-note-id="' + esc(note.id) + '">' +
        (interactive ? '<button type="button" class="note-select">' : '') + (note.category ? '<strong>' + esc(note.category) + ':</strong> ' : '') +
        esc(note.text || (!note.category ? 'Empty note' : '')) + (interactive ? '</button>' : '') + '</div>').join('') + '</div>').join('') + '</div></section>';
  }

  function page(day, skin, options) {
    const opts = options || {}, settings = getBandSettings(getCurrentScheduleFileData()?.theme);
    const theme = getScheduleTheme(getCurrentScheduleFileData()?.theme);
    let colors = Object.assign({}, PALETTES[theme.palette] || PALETTES.classic, theme.palette === 'custom' ? theme.customColors : {});
    const paper = BAND_PAPER_THEMES[theme.palette === 'classic' ? 'airforce' : theme.palette];
    if (paper) colors = { ...colors, bg: '#ffffff', text: '#20262c', textSecondary: '#39424b', textMuted: '#525962', accent: paper.colors[0], surface: paper.colors[2], border: paper.colors[5] };
    const palette = Object.entries(colors).map(([key, value]) => '--sch-' + key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase()) + ':' + value).join(';');
    const index = Store.getDays().findIndex(item => item.id === day.id) + 1;
    const body = { cards, grid, phases }[skin] || cards;
    return '<section class="alternate-sheet av-' + skin + '-sheet" data-fit="true" data-mode="' + (opts.printMode === 'readable' ? 'readable' : 'fit') +
      '" style="--av-notes-height:' + settings.notesHeight + 'pt;--av-heading-ink:' + getContrastingTextColor(colors.accent) + ';' + palette + '">' +
      '<div class="av-print-error"><strong>Schedule not ready to print.</strong><p>This day exceeds the readable one-page limits. Review the content or select Readable pages. No partial schedule is printed.</p></div>' +
      header(day, opts.interactive) + (opts.handout ? '<p class="av-handout">' + esc(opts.handout) + '</p>' : '') +
      '<div class="av-body">' + body(day, opts) + '</div>' + notes(day, opts.interactive) +
      '<footer class="av-footer"><span>' + (Store.getFooter().poc ? 'Schedule POC: ' + esc(Store.getFooter().poc) : '') + '</span><span>Day ' + index + ' of ' + Store.getDays().length + '</span></footer></section>';
  }

  function arrange(flow, columns, selector) {
    const records = Array.from(flow.querySelectorAll(selector || '.av-event'));
    if (!records.length) return;
    flow.replaceChildren(...records); flow.style.removeProperty('grid-template-columns');
    flow.dataset.columns = String(columns);
    if (columns === 1 || records.length < 2) return;
    const left = document.createElement('div'), right = document.createElement('div');
    left.className = right.className = 'av-column';
    flow.replaceChildren(left, right);
    let best = Infinity, split = 1, width = 50;
    // Measure both widths once per candidate, then find the best whole-record
    // split using prefix sums. This avoids moving every record for every split.
    for (const candidate of [50, 45, 55, 40, 60]) {
      flow.style.gridTemplateColumns = candidate + 'fr ' + (100 - candidate) + 'fr';
      left.replaceChildren(...records);
      const leftHeights = records.map(node => node.getBoundingClientRect().height);
      right.replaceChildren(...records);
      const rightHeights = records.map(node => node.getBoundingClientRect().height);
      const gap = parseFloat(getComputedStyle(right).rowGap) || 0;
      let leftHeight = 0, rightHeight = rightHeights.reduce((sum, height) => sum + height, 0);
      for (let i = 1; i < records.length; i++) {
        leftHeight += leftHeights[i - 1]; rightHeight -= rightHeights[i - 1];
        const height = Math.max(leftHeight + gap * (i - 1), rightHeight + gap * (records.length - i - 1));
        if (height < best) { best = height; split = i; width = candidate; }
      }
    }
    flow.style.gridTemplateColumns = width + 'fr ' + (100 - width) + 'fr';
    left.replaceChildren(...records.slice(0, split)); right.replaceChildren(...records.slice(split));
  }

  function arrangePhases(container) {
    const phases = Array.from(container.querySelectorAll('.av-phase'));
    if (!phases.length) return;
    container.replaceChildren();
    let segment = null;
    phases.forEach(phase => {
      if (phase.classList.contains('av-phase-wide')) {
        container.appendChild(phase); segment = null;
      } else {
        if (!segment) { segment = document.createElement('div'); segment.className = 'av-phase-segment'; container.appendChild(segment); }
        segment.appendChild(phase);
      }
    });
    container.querySelectorAll('.av-phase-segment').forEach(segment => arrange(segment, segment.children.length > 1 ? 2 : 1, '.av-phase'));
  }

  function geometry(sheet) {
    const body = sheet.querySelector('.av-body').getBoundingClientRect(), notes = sheet.querySelector('.av-notes').getBoundingClientRect();
    const noteBody = sheet.querySelector('.av-note-columns').getBoundingClientRect();
    const footer = sheet.querySelector('.av-footer').getBoundingClientRect(), box = sheet.getBoundingClientRect();
    const overflow = Math.max(0, body.bottom + policy.clearance / .75 - notes.top, noteBody.bottom - notes.bottom,
      footer.bottom - (box.bottom - 48));
    const tooWide = Array.from(sheet.querySelectorAll('.av-event,.av-note,.av-heading-text,.av-day,.av-footer'))
      .some(node => node.scrollWidth > node.clientWidth + 1);
    return { fits: overflow < .1 && !tooWide, overflow, tooWide };
  }

  function fit(sheet) {
    sheet.classList.remove('av-overflow', 'av-natural');
    sheet.dataset.fit = 'true';
    sheet.style.setProperty('--av-main-extra', '0pt');
    sheet.style.setProperty('--av-title', '19pt');
    for (let size = 19; size > 12 && sheet.querySelector('.av-heading-text').getBoundingClientRect().height > 100; size -= .5) {
      sheet.style.setProperty('--av-title', (size - .5) + 'pt');
    }
    sheet.style.setProperty('--av-note-size', '9.5pt');
    if (sheet.querySelector('.av-note-columns').getBoundingClientRect().bottom > sheet.querySelector('.av-notes').getBoundingClientRect().bottom) sheet.style.setProperty('--av-note-size', '9pt');
    const flows = Array.from(sheet.querySelectorAll('.av-flow'));
    const phaseColumns = sheet.querySelector('.av-phase-columns');
    const cardColumns = sheet.querySelector('.av-cards-columns') || (sheet.querySelector('.av-cards .av-main') && sheet.querySelectorAll('.av-cards .av-concurrent').length > 3 ? sheet.querySelector('.av-cards') : null);
    const gridFlow = sheet.querySelector('.av-grid-flow');
    const set = (scale, gap) => {
      sheet.style.setProperty('--av-scale', String(scale)); sheet.style.setProperty('--av-gap', gap + 'pt');
      flows.forEach(flow => arrange(flow, cardColumns || (phaseColumns && !flow.closest('.av-phase-wide')) || Number(flow.dataset.flowCount) <= 1 ? 1 : 2));
      if (phaseColumns) {
        const hasConcurrent = !!sheet.querySelector('.av-concurrent');
        sheet.classList.add('av-phases-continuous');
        flows.forEach(flow => arrange(flow, 1));
        arrange(phaseColumns, hasConcurrent ? 2 : 1, '.av-phase');
        const continuousHeight = phaseColumns.getBoundingClientRect().height;
        sheet.classList.remove('av-phases-continuous');
        flows.forEach(flow => arrange(flow, flow.closest('.av-phase-wide') && Number(flow.dataset.flowCount) > 1 ? 2 : 1));
        phaseColumns.dataset.columns = '1'; phaseColumns.style.removeProperty('grid-template-columns');
        arrangePhases(phaseColumns);
        if (!hasConcurrent || continuousHeight <= phaseColumns.getBoundingClientRect().height) {
          sheet.classList.add('av-phases-continuous');
          flows.forEach(flow => arrange(flow, 1));
          arrange(phaseColumns, hasConcurrent ? 2 : 1, '.av-phase');
        }
      }
      if (gridFlow) {
        const columns = gridFlow.querySelectorAll('.av-event').length > 10 ? 2 : 1;
        sheet.dataset.tableColumns = String(columns); arrange(gridFlow, columns);
      }
      if (cardColumns) {
        cardColumns.classList.add('av-cards-columns');
        let best = Infinity, chosen = 45;
        for (const width of [45, 40, 35]) {
          cardColumns.style.gridTemplateColumns = width + '% minmax(0,1fr)';
          const height = cardColumns.getBoundingClientRect().height;
          if (height < best) { best = height; chosen = width; }
        }
        cardColumns.style.gridTemplateColumns = chosen + '% minmax(0,1fr)';
        const besideHeight = cardColumns.getBoundingClientRect().height;
        cardColumns.classList.remove('av-cards-columns'); cardColumns.style.removeProperty('grid-template-columns');
        flows.forEach(flow => arrange(flow, Number(flow.dataset.flowCount) > 1 ? 2 : 1));
        if (besideHeight < cardColumns.getBoundingClientRect().height) {
          cardColumns.classList.add('av-cards-columns'); cardColumns.style.gridTemplateColumns = chosen + '% minmax(0,1fr)';
          flows.forEach(flow => arrange(flow, 1));
        }
      }
    };
    let result;
    // Reduce spacing before text. The final preset still respects every floor.
    for (const [scale, gap] of [[1.08, 5], [1, 5], [1, 3], [1, 1.5], [.95, 1.5], [.9, 1.5], [.85, 1], [.8, .5]]) {
      set(scale, gap); result = geometry(sheet);
      if (result.fits) break;
    }
    if (result.fits) {
      const spare = sheet.querySelector('.av-notes').getBoundingClientRect().top - sheet.querySelector('.av-body').getBoundingClientRect().bottom - 8;
      const mains = sheet.querySelectorAll('.av-main').length;
      if (mains && spare > 12) sheet.style.setProperty('--av-main-extra', Math.min(8, spare * .75 / mains / 2) + 'pt');
      result = geometry(sheet);
    }
    sheet.dataset.fit = String(result.fits);
    if (!result.fits) {
      if (sheet.dataset.mode === 'readable') {
        // Readable pages intentionally flow beyond one sheet at comfortable
        // type. An overlong record may span pages; its text is never clipped.
        set(1, 4); sheet.classList.add('av-natural'); sheet.dataset.fit = 'true';
        flows.forEach(flow => arrange(flow, 1));
        if (phaseColumns) arrange(phaseColumns, 1, '.av-phase');
        if (gridFlow) { sheet.dataset.tableColumns = '1'; arrange(gridFlow, 1); }
      } else sheet.classList.add('av-overflow');
    }
    return { ...result, fits: sheet.dataset.fit === 'true', natural: sheet.classList.contains('av-natural') };
  }

  return { policy, model, record, personnel, flights, cards, grid, phases, page, fit, geometry };
})();
