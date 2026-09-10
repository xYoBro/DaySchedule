/* ── print.js ── Contract ──────────────────────────────────────────────────
 *
 * EXPORTS:
 *   openPrintReview()             — choose days, audience, detail and page layout
 *   printSchedule(options)        — builds and prints an isolated handout
 *   getPrintDays(options)         — copies selected/filtered data without changing Store
 *   printActiveDay()              — prints the currently active day
 *   printAllDays()                — builds all days into hidden container, prints
 *   applyPrintScaling(forPrint)   — 3-stage adaptive CSS compression + zoom fallback
 *   applyPrintScalingToPage(page, forPrint) — scales a single .page element
 *   removePrintScaling(page)      — removes all scaling CSS vars and zoom
 *
 * REQUIRES:
 *   app-state.js    — Store.getActiveDay(), Store.getDays(), Store.getGroups(), Store.getNotes()
 *   ui-core.js      — toast(), openModal(), closeModal()
 *   render.js       — renderDay(), renderHeader(), SKIN_RENDERERS, renderFooter()
 *   data-helpers.js — getAudienceHandoutEvents(), getScheduleReviewIssues()
 *   constants.js    — LAYOUT_TARGETS
 *
 * CONSUMED BY:
 *   render.js    — applyPrintScaling() (called after renderDay)
 *   events.js    — openPrintReview() (Ctrl+P and toolbar button)
 *
 * SIDE EFFECTS:
 *   Registers beforeprint listener → applyPrintScaling(true)
 *   Registers afterprint listener → re-renders active day
 *   Creates/reuses #printContainer element on document.body
 * ──────────────────────────────────────────────────────────────────────────── */

let _printDocumentTitle = null;

function normalizePrintOptions(options) {
  const opts = options || {};
  const knownDays = Store.getDays().map(day => day.id);
  const requestedDays = Array.isArray(opts.dayIds) ? opts.dayIds : knownDays;
  return {
    dayIds: knownDays.filter(id => requestedDays.includes(id)),
    audienceId: Store.getGroup(opts.audienceId) ? opts.audienceId : '',
    detail: opts.detail === 'overview' ? 'overview' : 'full',
    mode: opts.mode === 'fit' ? 'fit' : 'readable',
  };
}

function getPrintDays(options) {
  const opts = normalizePrintOptions(options);
  return Store.getDays().filter(day => opts.dayIds.includes(day.id)).map(day => ({
    ...day,
    events: getAudienceHandoutEvents(day.events, Store.getGroups(), opts.audienceId)
      .map(evt => opts.detail === 'overview' ? { ...evt, description: '' } : { ...evt }),
    notes: (day.notes || []).map(note => ({ ...note })),
  }));
}

function buildPrintMarkup(options) {
  const opts = normalizePrintOptions(options);
  const theme = getScheduleTheme(getCurrentScheduleFileData() && getCurrentScheduleFileData().theme);
  const renderer = SKIN_RENDERERS[theme.skin] || SKIN_RENDERERS.bands;
  const audience = Store.getGroup(opts.audienceId);
  return getPrintDays(opts).map(day => {
    let html = '<div class="page print-page skin-' + esc(theme.skin) + ' print-' + opts.mode + '" data-print-mode="' + opts.mode + '" data-print-day="' + esc(day.id) + '">';
    html += renderHeader(day);
    if (audience || opts.detail === 'overview') {
      html += '<div class="print-handout-label">' + esc(audience ? 'Audience: ' + audience.name + ' · Primary audience events and breaks included. ' : '');
      if (opts.detail === 'overview') html += 'Overview · Event notes omitted. ';
      html += 'Day notes included.</div>';
    }
    html += renderer(day.id, day);
    html += renderFooter() + '</div>';
    return html;
  }).join('');
}

function measurePrintPlan(options) {
  const opts = normalizePrintOptions(options);
  const container = document.createElement('div');
  container.className = 'print-measurement';
  container.setAttribute('aria-hidden', 'true');
  container.inert = true;
  container.innerHTML = buildPrintMarkup(opts);
  document.body.appendChild(container);
  try {
    return Array.from(container.querySelectorAll('.print-page')).map(page => {
      applyPrintScalingToPage(page, true);
      const scale = parseFloat(page.style.zoom || '1');
      const textSizes = Array.from(page.querySelectorAll('*')).filter(el =>
        !el.closest('.band-view-note, .note-empty, .hdr-logo, sup') &&
        Array.from(el.childNodes).some(node => node.nodeType === 3 && node.textContent.trim()) &&
        el.getClientRects().length && getComputedStyle(el).display !== 'none'
      ).map(el => parseFloat(getComputedStyle(el).fontSize)).filter(Number.isFinite);
      const height = page.getBoundingClientRect().height;
      return {
        dayId: page.dataset.printDay,
        scale,
        estimatedPages: opts.mode === 'fit' ? 1 : Math.max(1, Math.ceil(height / ((10.32 * 96) - 48))),
        smallestTextPt: (textSizes.length ? Math.min(...textSizes) : 12) * scale * 0.75,
      };
    });
  } finally {
    container.remove();
  }
}

function openPrintReview() {
  const days = Store.getDays();
  if (!days.length) { toast('No days to print.'); return; }
  let overlay = document.getElementById('printReviewModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'printReviewModal';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = '<div class="modal print-review-modal"></div>';
    document.body.appendChild(overlay);
  }
  const modal = overlay.querySelector('.modal');
  let html = '<h2 id="printReviewTitle">Review and print</h2>';
  html += '<fieldset class="print-review-days"><legend>Days to print</legend>';
  days.forEach((day, index) => {
    const label = day.label || day.date || ('Day ' + (index + 1));
    html += '<label><input type="checkbox" name="printDay" value="' + esc(day.id) + '" checked> ' + esc(label) + '</label>';
  });
  html += '</fieldset><div class="print-review-fields">';
  html += '<label for="printAudience">Audience</label><select id="printAudience"><option value="">Everyone</option>';
  Store.getGroups().forEach(group => { html += '<option value="' + esc(group.id) + '">' + esc(group.name) + '</option>'; });
  html += '</select><p class="print-review-hint">An audience handout includes primary audience events and breaks. Review named exceptions and day notes before sharing.</p>';
  html += '<label for="printDetail">Details</label><select id="printDetail"><option value="full">Full details</option><option value="overview">Overview — omit event notes</option></select>';
  html += '<label for="printMode">Page layout</label><select id="printMode"><option value="readable">Readable pages — allow more than one page per day</option><option value="fit">Fit each day on one page — may make text small</option></select></div>';
  html += '<div id="printReviewSummary" role="status" aria-live="polite"></div>';
  html += '<details class="print-review-checks"><summary id="printReviewCheckCount">Schedule checks</summary><ul id="printReviewIssues"></ul></details>';
  html += '<div class="modal-actions"><button type="button" class="btn" id="printReviewCancel">Cancel</button><button type="button" class="btn btn-primary" id="printReviewConfirm">Print</button></div>';
  modal.innerHTML = html;
  const readOptions = () => normalizePrintOptions({
    dayIds: Array.from(modal.querySelectorAll('[name="printDay"]:checked')).map(input => input.value),
    audienceId: modal.querySelector('#printAudience').value,
    detail: modal.querySelector('#printDetail').value,
    mode: modal.querySelector('#printMode').value,
  });
  const refresh = () => {
    const opts = readOptions();
    const fullDays = getPrintDays({ ...opts, detail: 'full' });
    const events = fullDays.flatMap(day => day.events);
    const omitted = opts.detail === 'overview' ? events.filter(evt => evt.description).length : 0;
    const metrics = measurePrintPlan(opts);
    const sheets = metrics.reduce((sum, page) => sum + page.estimatedPages, 0);
    const small = metrics.filter(page => page.smallestTextPt < 8);
    let summary = '<p>' + opts.dayIds.length + ' day(s), ' + events.length + ' event(s). Estimated ' + sheets + ' printed page(s).</p>';
    if (omitted) summary += '<p>' + omitted + ' event note(s) will be omitted from this overview.</p>';
    if (small.length) summary += '<p class="print-review-warning">Text may be as small as ' + Math.min(...small.map(page => page.smallestTextPt)).toFixed(1) + ' pt. Text below 8 pt can be hard to read; choose Readable pages or print fewer audiences.</p>';
    summary += '<p class="print-review-hint">Check your browser’s print preview before sharing. Paper and printer settings can change pagination.</p>';
    modal.querySelector('#printReviewSummary').innerHTML = summary;
    const issues = getScheduleReviewIssues(fullDays, Store.getGroups());
    modal.querySelector('#printReviewCheckCount').textContent = issues.length ? issues.length + ' schedule check(s) to review' : 'No schedule checks flagged';
    modal.querySelector('#printReviewIssues').innerHTML = issues.map(issue => '<li>' + esc(issue.message) + '</li>').join('');
    modal.querySelector('#printReviewConfirm').disabled = opts.dayIds.length === 0;
  };
  modal.querySelectorAll('input, select').forEach(input => input.addEventListener('change', refresh));
  modal.querySelector('#printReviewCancel').addEventListener('click', () => closeModal('printReviewModal'));
  modal.querySelector('#printReviewConfirm').addEventListener('click', () => {
    const options = readOptions();
    closeModal('printReviewModal');
    printSchedule(options);
  });
  refresh();
  openModal('printReviewModal');
}

function printActiveDay() {
  const dayId = Store.getActiveDay();
  if (!dayId) { toast('No day selected.'); return; }
  printSchedule({ dayIds: [dayId], mode: 'fit' });
}

function printAllDays() {
  printSchedule({ mode: 'fit' });
}

function printSchedule(options) {
  const opts = normalizePrintOptions(options);
  if (!opts.dayIds.length) { toast('No days to print.'); return; }
  let container = document.getElementById('printContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'printContainer';
    document.body.appendChild(container);
  }
  container.className = 'print-staging';
  container.inert = true;
  container.setAttribute('aria-hidden', 'true');
  container.innerHTML = buildPrintMarkup(opts);
  document.body.classList.add('printing-schedule');
  if (_printDocumentTitle === null) _printDocumentTitle = document.title;
  const audience = Store.getGroup(opts.audienceId);
  document.title = [Store.getTitle(), audience ? audience.name : 'Everyone',
    opts.detail === 'overview' ? 'Overview' : 'Full details', opts.dayIds.length + ' day(s)'].join(' — ');
  // Logos are local data URLs, but decoding is asynchronous. Wait for them
  // before measuring rather than assuming a fixed timeout is long enough.
  const images = Array.from(container.querySelectorAll('img'));
  Promise.all(images.map(img => typeof img.decode === 'function' ? img.decode().catch(err => {
    if (typeof logAppError === 'function') logAppError('warn', String(err && err.message || err), 'print logo');
    toast('The logo could not be read and may be missing from the printout.', 6000);
  }) : Promise.resolve()))
    .then(() => {
      try {
        applyPrintScaling(true);
        window.print();
      } catch (err) {
        container.innerHTML = '';
        container.className = '';
        document.body.classList.remove('printing-schedule');
        if (_printDocumentTitle !== null) { document.title = _printDocumentTitle; _printDocumentTitle = null; }
        if (typeof logAppError === 'function') logAppError('error', String(err && err.message || err), 'print');
        toast('Couldn’t open the print dialog. Try your browser’s File → Print.', 6000);
      }
    });
}

// ── Print Scaling ──────────────────────────────────────────────────────────
// Three-stage bottom-up CSS compression, then zoom fallback (print only —
// on screen the page grows taller instead of zooming below readability).
// Measures at print width (8.2in) for accurate overflow detection.
// Uses zoom (not transform:scale) because zoom affects actual layout flow —
// the print engine sees the zoomed dimensions for pagination. transform:scale
// is purely visual and does not change layout height, causing page overflow.

function applyPrintScaling(forPrint) {
  const pages = forPrint
    ? document.querySelectorAll('.print-page')
    : document.querySelectorAll('.page:not(.print-page)');
  if (pages.length) {
    pages.forEach(p => applyPrintScalingToPage(p, forPrint));
  } else {
    const page = document.querySelector('.page');
    if (page) applyPrintScalingToPage(page, forPrint);
  }
}

function applyPrintScalingToPage(page, forPrint) {
  // For print: usable area = 11in - 0.3in @page margins - 0.38in padding,
  // minus 48px safety margin for browser rendering differences.
  // For screen: match the .page card's min-height (11in = 1056px).
  // scrollHeight includes padding (border-box), so no subtraction needed.
  const maxH = forPrint
    ? (10.32 * 96) - 48   // print: ~943px
    : (11 * 96) - 10;      // screen: 1046px (page card minus small buffer)

  // Reset any previous scaling
  removePrintScaling(page);
  if (forPrint && page.dataset.printMode === 'readable') return;

  // For print: force print-width measurement (8.2in) since screen preview
  // may be narrower. For screen preview: measure at actual rendered width
  // so scaling matches what the user sees.
  const origWidth = page.style.width;
  const origMinH = page.style.minHeight;
  const origMaxH = page.style.maxHeight;
  const origOverflow = page.style.overflow;
  if (forPrint) page.style.width = '8.2in';
  page.style.minHeight = '0';
  page.style.maxHeight = 'none';
  page.style.overflow = 'visible';

  // For print: force footer to 5px margin during measurement — screen mode
  // uses margin-top:auto which absorbs flex space and masks true content height.
  // For screen preview: leave auto margin alone so footer stays at page bottom.
  const footer = page.querySelector('.footer');
  const origFooterMargin = footer ? footer.style.marginTop : '';
  if (forPrint && footer) footer.style.marginTop = '5px';

  let contentH = page.scrollHeight;

  if (contentH <= maxH) {
    page.style.width = origWidth;
    page.style.minHeight = origMinH;
    page.style.maxHeight = origMaxH;
    page.style.overflow = origOverflow;
    if (footer) footer.style.marginTop = origFooterMargin;
    return;
  }

  // Three-stage bottom-up compression: compress lowest-priority content first,
  // only touching primary band content as a last resort.
  const lerp = (range, f) => range[1] + (range[0] - range[1]) * f;
  const T = LAYOUT_TARGETS;

  // Stage 1: Notes, footer, concurrent detail fonts
  const s1Need = contentH - maxH;
  const s1Factor = Math.max(0, Math.min(1, 1 - (s1Need / (maxH * 0.15))));
  page.style.setProperty('--notes-fs', lerp(T.notes.fs, s1Factor) + 'px');
  page.style.setProperty('--notes-lh', lerp(T.notes.lineH, s1Factor));
  page.style.setProperty('--conc-detail-fs', lerp(T.conc.detailFs, s1Factor) + 'px');
  page.style.setProperty('--conc-time-fs', lerp(T.conc.timeFs, s1Factor) + 'px');
  page.style.setProperty('--conc-title-fs', lerp(T.conc.titleFs, s1Factor) + 'px');

  void page.offsetHeight; // force reflow so scrollHeight reads updated layout
  contentH = page.scrollHeight;
  if (contentH <= maxH) {
    page.style.width = origWidth;
    page.style.minHeight = origMinH;
    page.style.maxHeight = origMaxH;
    page.style.overflow = origOverflow;
    if (footer) footer.style.marginTop = origFooterMargin;
    return;
  }

  // Stage 2: Supporting band padding, meta/description fonts, tags
  const s2Need = contentH - maxH;
  const s2Factor = Math.max(0, Math.min(1, 1 - (s2Need / (maxH * 0.25))));
  page.style.setProperty('--band-sup-pad-v', lerp(T.band.supPadV, s2Factor) + 'px');
  page.style.setProperty('--band-desc-fs', lerp(T.band.descFs, s2Factor) + 'px');
  page.style.setProperty('--band-meta-fs', lerp(T.band.metaFs, s2Factor) + 'px');
  page.style.setProperty('--band-tag-fs', lerp(T.band.tagFs, s2Factor) + 'px');
  page.style.setProperty('--band-time-end-fs', lerp(T.band.timeEndFs, s2Factor) + 'px');
  page.style.setProperty('--band-time-dur-fs', lerp(T.band.timeDurFs, s2Factor) + 'px');

  void page.offsetHeight; // force reflow so scrollHeight reads updated layout
  contentH = page.scrollHeight;
  if (contentH <= maxH) {
    page.style.width = origWidth;
    page.style.minHeight = origMinH;
    page.style.maxHeight = origMaxH;
    page.style.overflow = origOverflow;
    if (footer) footer.style.marginTop = origFooterMargin;
    return;
  }

  // Stage 3: Primary band content — only as a last resort
  const s3Need = contentH - maxH;
  const s3Factor = Math.max(0, Math.min(1, 1 - (s3Need / (maxH * 0.25))));
  page.style.setProperty('--band-main-pad-v', lerp(T.band.mainPadV, s3Factor) + 'px');
  page.style.setProperty('--band-main-pad-h', lerp(T.band.mainPadH, s3Factor) + 'px');
  page.style.setProperty('--band-title-fs', lerp(T.band.titleFs, s3Factor) + 'px');
  page.style.setProperty('--band-time-start-fs', lerp(T.band.timeStartFs, s3Factor) + 'px');

  // Re-measure after all CSS var compression
  contentH = page.scrollHeight;

  // Restore measurement overrides
  page.style.width = origWidth;
  page.style.minHeight = origMinH;
  page.style.maxHeight = origMaxH;
  page.style.overflow = origOverflow;
  if (footer) footer.style.marginTop = origFooterMargin;

  if (contentH <= maxH) return;

  // Screen: never zoom — stretch the page to the content height instead.
  // (Bands positions events absolutely, so the page cannot grow on its own.)
  // Microscopic-but-fits is worse than a tall, readable page; the density
  // warning already steers users to Grid/Cards/Phases. Print still zooms.
  if (!forPrint) {
    page.style.minHeight = contentH + 'px';
    return;
  }

  // Final fallback (print only): zoom shrinks actual layout dimensions.
  // zoom affects layout flow (unlike transform:scale which is visual-only),
  // so the print engine sees the zoomed box size for pagination.
  let scale = maxH / contentH;
  page.style.zoom = scale;
  page.dataset.printScaled = '1';

  // Force min-height:0 so the stylesheet's 11in floor doesn't reassert at
  // the zoomed size (11in * 0.95 = 10.45in can still overflow).
  page.style.minHeight = '0';

  // Browser zoom rounding can leave the final rendered box a few pixels taller
  // than scrollHeight predicted. Re-measure the actual box and correct once.
  void page.offsetHeight;
  const renderedHeight = page.getBoundingClientRect().height;
  if (renderedHeight > maxH) {
    scale = scale * (maxH / renderedHeight) * 0.995;
    page.style.zoom = scale;
  }
}

function removePrintScaling(page) {
  const props = [
    '--band-main-pad-v','--band-main-pad-h','--band-sup-pad-v',
    '--band-title-fs','--band-desc-fs','--band-meta-fs','--band-tag-fs',
    '--band-time-start-fs','--band-time-end-fs','--band-time-dur-fs',
    '--conc-title-fs','--conc-time-fs','--conc-detail-fs','--notes-fs','--notes-lh',
  ];
  props.forEach(p => page.style.removeProperty(p));

  // zoom and inline min-height only ever come from scaling (the print zoom
  // fallback or the screen grow path), so always clear them.
  page.style.removeProperty('zoom');
  page.style.removeProperty('min-height');
  delete page.dataset.printScaled;
}

// Auto-scale on any print trigger (Cmd+P, browser menu, etc.)
window.addEventListener('beforeprint', () => {
  applyPrintScaling(true);
});

// Clean up scaling after print so screen view is unaffected
window.addEventListener('afterprint', () => {
  // Empty the print container: the print stylesheet forces it visible
  // (display:block !important), so stale pages left here would be printed —
  // with pre-edit data — by any later browser-menu File→Print.
  const printContainer = document.getElementById('printContainer');
  if (printContainer) { printContainer.innerHTML = ''; printContainer.className = ''; }
  document.body.classList.remove('printing-schedule');
  if (_printDocumentTitle !== null) { document.title = _printDocumentTitle; _printDocumentTitle = null; }
  const activeDay = Store.getActiveDay();
  if (activeDay) renderDay(activeDay);
});
