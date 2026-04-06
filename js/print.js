function printActiveDay() {
  const dayId = Store.getActiveDay();
  if (!dayId) { toast('No day selected.'); return; }
  renderDay(dayId);
  setTimeout(() => {
    applyPrintScaling();
    window.print();
  }, 200);
}

function printAllDays() {
  const container = document.getElementById('scheduleContainer');
  const days = Store.getDays();
  if (!days.length) { toast('No days to print.'); return; }

  let html = '';
  days.forEach(day => {
    const groups = Store.getGroups();
    const { mainBands, concurrent } = classifyEvents(day.events, groups);
    const notes = Store.getNotes(day.id);
    _daggerFootnotes = [];
    html += '<div class="page print-page">';
    html += renderHeader(day);
    html += '<div class="schedule">';
    let prevTier = null;
    mainBands.forEach((band, i) => {
      if (band.tier === 'break' && prevTier && prevTier !== 'break') html += '<div class="section-break"></div>';
      html += renderBand(band);
      if (band.tier === 'break') {
        const next = mainBands[i + 1];
        if (next && next.tier !== 'break') html += '<div class="section-break"></div>';
      }
      prevTier = band.tier;
    });
    html += '</div>';
    if (concurrent.length > 0) html += renderConcurrentRow(concurrent, groups);
    if (notes.length > 0 || _daggerFootnotes.length > 0) html += renderNotes(notes);
    html += renderFooter();
    html += '</div>';
  });
  container.innerHTML = html;
  setTimeout(() => {
    applyPrintScaling();
    window.print();
    const activeDay = Store.getActiveDay();
    if (activeDay) renderDay(activeDay);
  }, 200);
}

// ── Print Scaling ──────────────────────────────────────────────────────────
// Three-stage bottom-up CSS compression, then transform:scale fallback.
// Measures at print width (8in) for accurate overflow detection.
// Uses transform:scale instead of zoom for Safari print compatibility.

function applyPrintScaling() {
  const pages = document.querySelectorAll('.print-page');
  if (pages.length) {
    pages.forEach(p => applyPrintScalingToPage(p));
  } else {
    const page = document.querySelector('.page');
    if (page) applyPrintScalingToPage(page);
  }
}

function applyPrintScalingToPage(page) {
  // Usable print area: 11in page - 0.3in @page margins - 0.38in padding
  const maxH = 10.32 * 96;

  // Reset any previous scaling
  removePrintScaling(page);

  // Force print-width measurement: the screen preview may be narrower,
  // causing extra text wrapping and inflated scrollHeight. Temporarily
  // set the page to print width for accurate measurement.
  const origWidth = page.style.width;
  const origMinH = page.style.minHeight;
  const origMaxH = page.style.maxHeight;
  const origOverflow = page.style.overflow;
  page.style.width = '8in';
  page.style.minHeight = '0';
  page.style.maxHeight = 'none';
  page.style.overflow = 'visible';

  let contentH = page.scrollHeight;

  if (contentH <= maxH) {
    page.style.width = origWidth;
    page.style.minHeight = origMinH;
    page.style.maxHeight = origMaxH;
    page.style.overflow = origOverflow;
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
  page.style.setProperty('--conc-detail-fs', lerp(T.conc.detailFs, s1Factor) + 'px');
  page.style.setProperty('--conc-time-fs', lerp(T.conc.timeFs, s1Factor) + 'px');
  page.style.setProperty('--conc-title-fs', lerp(T.conc.titleFs, s1Factor) + 'px');

  contentH = page.scrollHeight;
  if (contentH <= maxH) {
    page.style.width = origWidth;
    page.style.minHeight = origMinH;
    page.style.maxHeight = origMaxH;
    page.style.overflow = origOverflow;
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

  contentH = page.scrollHeight;
  if (contentH <= maxH) {
    page.style.width = origWidth;
    page.style.minHeight = origMinH;
    page.style.maxHeight = origMaxH;
    page.style.overflow = origOverflow;
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

  // Restore width
  page.style.width = origWidth;
  page.style.minHeight = origMinH;
  page.style.maxHeight = origMaxH;
  page.style.overflow = origOverflow;

  if (contentH <= maxH) return;

  // Final fallback: transform:scale to shrink the layout.
  // Uses transform instead of zoom for Safari print compatibility —
  // Safari doesn't honor zoom for page-break calculations.
  const scale = maxH / contentH;
  page.style.transformOrigin = 'top left';
  page.style.transform = 'scale(' + scale + ')';
  // Set explicit height so the print engine sees a box that fits one page
  page.style.height = maxH + 'px';
  page.dataset.printScaled = '1';
}

function removePrintScaling(page) {
  const props = [
    '--band-main-pad-v','--band-main-pad-h','--band-sup-pad-v',
    '--band-title-fs','--band-desc-fs','--band-meta-fs','--band-tag-fs',
    '--band-time-start-fs','--band-time-end-fs','--band-time-dur-fs',
    '--conc-title-fs','--conc-time-fs','--conc-detail-fs','--notes-fs',
  ];
  props.forEach(p => page.style.removeProperty(p));

  if (page.dataset.printScaled) {
    page.style.removeProperty('transform');
    page.style.removeProperty('transformOrigin');
    page.style.removeProperty('height');
    delete page.dataset.printScaled;
  }
}

// Auto-scale on any print trigger (Cmd+P, browser menu, etc.)
window.addEventListener('beforeprint', () => {
  applyPrintScaling();
});

// Clean up scaling after print so screen view is unaffected
window.addEventListener('afterprint', () => {
  const activeDay = Store.getActiveDay();
  if (activeDay) renderDay(activeDay);
});
