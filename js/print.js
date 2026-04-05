function printActiveDay() {
  const dayId = Store.getActiveDay();
  if (!dayId) { toast('No day selected.'); return; }
  renderDay(dayId);
  // 200ms delay: innerHTML assignment triggers async layout; scrollHeight
  // measurement in applyPrintScaling requires a complete layout pass first.
  setTimeout(() => {
    applyPrintScaling();
    window.print();
    // Re-render to clear any inline scaling styles (zoom, CSS vars) from the preview.
    renderDay(dayId);
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
    if (notes.length > 0) html += renderNotes(notes);
    html += renderFooter();
    html += '</div>';
  });
  container.innerHTML = html;
  // 200ms delay: same as printActiveDay — layout must complete before measuring.
  setTimeout(() => {
    document.querySelectorAll('.print-page').forEach(applyPrintScalingToPage);
    window.print();
    const activeDay = Store.getActiveDay();
    if (activeDay) renderDay(activeDay);
  }, 200);
}

function applyPrintScaling() {
  const page = document.querySelector('.page');
  if (page) applyPrintScalingToPage(page);
}

function measureContentHeight(page) {
  // Measure in conditions matching print layout:
  // - display: block (print CSS uses block, screen uses flex)
  // - width matching print content area: 8.5in page - 0.3in @page margins - 0.5in page padding = 7.7in
  // - no min-height constraint
  const orig = {
    width: page.style.width,
    minHeight: page.style.minHeight,
    display: page.style.display,
  };
  page.style.width = '7.7in';
  page.style.minHeight = '0';
  page.style.display = 'block';

  // Sum child heights + margins (offsetHeight excludes margin)
  let h = 0;
  for (const child of page.children) {
    const cs = getComputedStyle(child);
    h += child.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
  }

  // Add page's own vertical padding (not included in children measurements)
  const pageCs = getComputedStyle(page);
  h += parseFloat(pageCs.paddingTop) + parseFloat(pageCs.paddingBottom);

  page.style.width = orig.width;
  page.style.minHeight = orig.minHeight;
  page.style.display = orig.display;
  return h;
}

function applyScalePass(page, ratio) {
  const lerp = (range, t) => range[0] + (range[1] - range[0]) * (1 - t);
  const T = LAYOUT_TARGETS;

  // Main band padding and fonts
  page.style.setProperty('--band-main-pad-v', lerp(T.band.mainPadV, ratio) + 'px');
  page.style.setProperty('--band-main-pad-h', lerp(T.band.mainPadH, ratio) + 'px');
  page.style.setProperty('--band-sup-pad-v', lerp(T.band.supPadV, ratio) + 'px');
  page.style.setProperty('--band-sup-pad-h', lerp(T.band.supPadH, ratio) + 'px');
  page.style.setProperty('--band-title-fs', lerp(T.band.titleFs, ratio) + 'px');
  page.style.setProperty('--band-desc-fs', lerp(T.band.descFs, ratio) + 'px');
  page.style.setProperty('--band-meta-fs', lerp(T.band.metaFs, ratio) + 'px');
  page.style.setProperty('--band-tag-fs', lerp(T.band.tagFs, ratio) + 'px');
  page.style.setProperty('--band-time-start-fs', lerp(T.band.timeStartFs, ratio) + 'px');
  page.style.setProperty('--band-time-end-fs', lerp(T.band.timeEndFs, ratio) + 'px');
  page.style.setProperty('--band-time-dur-fs', lerp(T.band.timeDurFs, ratio) + 'px');
  // Notes
  page.style.setProperty('--notes-fs', lerp(T.notes.fs, ratio) + 'px');
  page.style.setProperty('--notes-line-h', lerp(T.notes.lineH, ratio));
  // Concurrent row
  page.style.setProperty('--conc-title-fs', lerp(T.conc.titleFs, ratio) + 'px');
  page.style.setProperty('--conc-time-fs', lerp(T.conc.timeFs, ratio) + 'px');
  page.style.setProperty('--conc-detail-fs', lerp(T.conc.detailFs, ratio) + 'px');
  // Section spacing
  page.style.setProperty('--hdr-pad-b', lerp(T.spacing.hdrPadB, ratio) + 'px');
  page.style.setProperty('--hdr-margin-b', lerp(T.spacing.hdrMarginB, ratio) + 'px');
  page.style.setProperty('--section-gap', lerp(T.spacing.sectionGap, ratio) + 'px');
  page.style.setProperty('--footer-gap', lerp(T.spacing.footerGap, ratio) + 'px');
}

function applyPrintScalingToPage(page) {
  // Available height for .page content (children + page padding):
  //   11in letter height          = 1056px (at 96dpi)
  //   @page margin 0.15in * 2     = -28.8px
  //   Theoretical max              = 1027.2px
  //
  // Target 9.5in (912px) — intentionally conservative. Screen measurement of
  // content height systematically differs from print layout due to:
  //   - Integer rounding of offsetHeight (accumulates over many children)
  //   - Text reflow at slightly different effective widths
  //   - Elements with hardcoded sizes that don't participate in CSS var scaling
  //     (sup/break bands use fixed font-size and padding)
  // The 12.5% headroom absorbs these differences reliably.
  const maxH = 9.5 * 96;
  const contentH = measureContentHeight(page);

  if (contentH <= maxH) return;

  // Phase 1: CSS variable scaling (fonts, padding, spacing).
  // Shrinks main band text, notes, concurrent row, and section spacing.
  let ratio = Math.max(0.5, maxH / contentH);
  for (let pass = 0; pass < 4; pass++) {
    applyScalePass(page, ratio);
    const afterH = measureContentHeight(page);
    if (afterH <= maxH) break;
    ratio = Math.max(0.5, ratio * (maxH / afterH));
  }

  // Phase 2: whole-page zoom safety net.
  // If CSS variable scaling could not reclaim enough space (content is very dense
  // or dominated by elements with hardcoded sizes), apply a CSS zoom on the page.
  // Unlike transform:scale(), zoom affects the layout box — the browser
  // recalculates the element's size after zoom, which correctly influences
  // pagination in Chrome, Safari, and Firefox 126+.
  const finalH = measureContentHeight(page);
  if (finalH > maxH) {
    page.style.zoom = (maxH / finalH).toString();
  }
}
