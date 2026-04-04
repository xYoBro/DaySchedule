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

function applyPrintScalingToPage(page) {
  const maxH = 10.2 * 96;
  const contentH = page.scrollHeight;
  if (contentH <= maxH) return;

  const ratio = Math.max(0.6, maxH / contentH);
  const lerp = (range, t) => range[0] + (range[1] - range[0]) * (1 - t);
  const T = LAYOUT_TARGETS;

  page.style.setProperty('--band-main-pad-v', lerp(T.band.mainPadV, ratio) + 'px');
  page.style.setProperty('--band-main-pad-h', lerp(T.band.mainPadH, ratio) + 'px');
  page.style.setProperty('--band-title-fs', lerp(T.band.titleFs, ratio) + 'px');
  page.style.setProperty('--band-desc-fs', lerp(T.band.descFs, ratio) + 'px');
  page.style.setProperty('--band-meta-fs', lerp(T.band.metaFs, ratio) + 'px');
  page.style.setProperty('--notes-fs', lerp(T.notes.fs, ratio) + 'px');
}
