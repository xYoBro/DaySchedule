/* ── skin-band.js ── Contract ───────────────────────────────────────────────
 *
 * EXPORTS:
 *   renderDayBody_band(dayId)         → HTML string — full schedule body for band skin
 *   renderBand(band, densityInfo)     → HTML string — single event band
 *   renderConcurrentRow(conc, groups, densityInfo) → HTML string — "Also Happening" section
 *
 * REQUIRES:
 *   render.js       — clearDaggerFootnotes(), addDaggerFootnote(), getDaggerFootnotes(),
 *                     renderNotes()
 *   app-state.js    — Store.getDay(), Store.getGroups(), Store.getGroup(), Store.getNotes()
 *   utils.js        — esc(), formatDuration(), getContrastingTextColor()
 *   data-helpers.js — classifyEvents(), computeDuration(), analyzeDayLayout(),
 *                     getSharedEventExceptions(), summarizeExceptionNote()
 *
 * CONSUMED BY:
 *   render.js — renderDay() dispatches to renderDayBody_band() for the bands skin
 *   print.js  — renderBand(), renderConcurrentRow() called directly for print layout
 * ──────────────────────────────────────────────────────────────────────────── */

function renderDayBody_band(dayId) {
  const day = Store.getDay(dayId);
  if (!day) return '';
  const groups = Store.getGroups();
  const classified = classifyEvents(day.events, groups);
  const { mainBands, concurrent } = classified;
  const notes = Store.getNotes(dayId);
  const layoutAnalysis = analyzeDayLayout(day.events, groups, classified);
  const densityInfo = getBandDensityInfo(mainBands, concurrent, layoutAnalysis);

  clearDaggerFootnotes();

  let html = '';
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
    html += renderBand(band, densityInfo);
    if (band.tier === 'break') {
      const next = mainBands[i + 1];
      if (next && next.tier !== 'break') {
        html += '<div class="section-break"></div>';
      }
    }
    prevTier = band.tier;
  });
  html += '</div>';

  if (densityInfo.warning) html += renderBandDensityNote(densityInfo);

  if (concurrent.length > 0) {
    html += renderConcurrentRow(concurrent, groups, densityInfo);
  }

  if (notes.length > 0 || getDaggerFootnotes().length > 0) {
    html += renderNotes(notes);
  }

  return html;
}

function getBandDensityInfo(mainBands, concurrent, layoutAnalysis) {
  const info = {
    denseMode: false,
    inlinePreviewLimit: Infinity,
    maxConcurrentOnBand: 0,
    warning: '',
    recommendedSkin: layoutAnalysis ? layoutAnalysis.recommendedSkin : 'bands',
    recommendationReason: layoutAnalysis ? layoutAnalysis.reason : '',
    usePackedConcurrent: layoutAnalysis ? layoutAnalysis.usePackedConcurrent : false,
  };

  if (!concurrent || concurrent.length === 0) return info;

  info.maxConcurrentOnBand = mainBands.reduce((max, band) => {
    const count = band.concurrent ? band.concurrent.length : 0;
    return Math.max(max, count);
  }, 0);

  info.denseMode = concurrent.length >= 10 || info.maxConcurrentOnBand >= 4;
  info.inlinePreviewLimit = info.denseMode ? 2 : Infinity;

  if (!info.denseMode) return info;

  const parts = [];
  parts.push(concurrent.length + ' concurrent event' + (concurrent.length === 1 ? '' : 's'));
  if (info.maxConcurrentOnBand > 0) {
    parts.push('up to ' + info.maxConcurrentOnBand + ' attached to one time block');
  }
  info.warning = parts.join(', ') + '. Try Grid, Cards, or Phases for easier scanning.';
  return info;
}

function renderBandDensityNote(densityInfo) {
  const recommendedSkin = densityInfo.recommendedSkin;
  const recommendedLabel = SKIN_LABELS[recommendedSkin] ? SKIN_LABELS[recommendedSkin].name : recommendedSkin;
  const actionOrder = ['grid', 'cards', 'phases'].filter(skin => skin !== recommendedSkin);
  if (['grid', 'cards', 'phases'].includes(recommendedSkin)) actionOrder.unshift(recommendedSkin);

  let html = '<div class="band-view-note">';
  html += '<div class="band-view-note-copy">';
  html += '<strong>Bands view warning:</strong> ' + esc(densityInfo.warning);
  if (recommendedSkin && recommendedSkin !== 'bands') {
    html += ' <span class="band-view-recommendation">Recommended: <strong>' + esc(recommendedLabel) + '</strong> because ' + esc(densityInfo.recommendationReason) + '</span>';
  }
  html += '</div>';
  html += '<div class="band-view-actions">';
  actionOrder.forEach(skin => {
    const label = SKIN_LABELS[skin] ? SKIN_LABELS[skin].name : skin;
    const recommendedClass = skin === recommendedSkin ? ' band-view-switch--recommended' : '';
    const buttonLabel = skin === recommendedSkin ? 'Use ' + label : label;
    html += '<button type="button" class="band-view-switch' + recommendedClass + '" data-skin-switch="' + esc(skin) + '">' + esc(buttonLabel) + '</button>';
  });
  html += '</div>';
  html += '</div>';
  return html;
}

function renderBand(band, densityInfo) {
  const { event: evt, tier, group, concurrent: concList, overlappingMain } = band;
  const dur = computeDuration(evt);
  const durStr = formatDuration(dur);
  const hasMainOverlap = overlappingMain && overlappingMain.length > 0;
  const sharedExceptions = getSharedEventExceptions(evt, Store.getEvents(Store.getActiveDay()), Store.getGroups());
  const exceptionNote = summarizeExceptionNote(sharedExceptions, 3);
  const groupTextColor = group ? getContrastingTextColor(group.color) : '#ffffff';
  const previewLimit = getBandPreviewLimit(concList || [], densityInfo);
  const previewConcurrent = (concList || []).slice(0, previewLimit);
  const hiddenConcurrentCount = Math.max(0, (concList ? concList.length : 0) - previewConcurrent.length);
  const jumpStartTime = hiddenConcurrentCount > 0 && concList[previewConcurrent.length]
    ? concList[previewConcurrent.length].startTime
    : '';

  const tierClass = tier === 'main' ? 'main' : tier === 'break' ? 'brk' : 'sup';
  const overlapClass = hasMainOverlap ? ' band-overlap' : '';
  const accentStyle = tier === 'main' && group ? ' style="--accent:' + esc(group.color) + ';"' : '';
  const concSlotClass = densityInfo && densityInfo.denseMode ? 'band-conc-slot band-conc-slot--dense' : 'band-conc-slot';

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
  if (tier !== 'break') {
    const metaParts = ['<span class="band-inline-time">' + esc(evt.startTime + '\u2013' + evt.endTime) + '</span>'];
    if (evt.location) metaParts.push('<span class="band-meta-item">' + esc(evt.location) + '</span>');
    if (evt.poc) metaParts.push('<span class="band-meta-item">POC: ' + esc(evt.poc) + '</span>');
    html += '<div class="band-meta-line">' + metaParts.join('<span class="band-meta-sep">\u00b7</span>') + '</div>';
  }
  if (evt.description && tier !== 'break') {
    html += '<div class="band-desc">' + esc(evt.description) + '</div>';
  }
  if (group && tier !== 'break') {
    html += '<div><span class="band-tag" style="background:' + esc(group.color) + ';color:' + esc(groupTextColor) + ';">' + esc(group.name) + '</span></div>';
  }
  if (evt.attendees && tier !== 'break') {
    const attendeeLabel = group ? '+ ' : 'WHO: ';
    html += '<div class="band-attendees">' + attendeeLabel + esc(evt.attendees) + '</div>';
  }
  if (exceptionNote) {
    html += '<div class="band-exception-note">Exceptions: ' + esc(exceptionNote) + '</div>';
  }
  // Overlap notice for main-on-main conflicts
  if (hasMainOverlap) {
    const overlapNames = overlappingMain.map(m => esc(m.title)).join(', ');
    html += '<div class="band-overlap-notice">Overlaps with ' + overlapNames + '</div>';
  }
  html += '</div>';

  // Fixed-width concurrent slot — always rendered for alignment
  html += '<div class="' + concSlotClass + '">';
  if (previewConcurrent.length > 0) {
    previewConcurrent.forEach(c => {
      html += renderBandConcurrentCard(c);
    });
  }
  if (hiddenConcurrentCount > 0) {
    html += renderBandConcurrentOverflow(hiddenConcurrentCount, jumpStartTime);
  }
  html += '</div>';

  html += '</div>';
  return html;
}

function getBandPreviewLimit(concList, densityInfo) {
  if (!densityInfo || !densityInfo.denseMode) return Infinity;
  if (!concList || concList.length === 0) return densityInfo.inlinePreviewLimit;
  if (concList.length >= 6) return 1;
  return densityInfo.inlinePreviewLimit;
}

function renderBandConcurrentCard(c) {
  const cGroup = Store.getGroup(c.groupId);
  let html = '<div class="band-conc" data-event-id="' + esc(c.id) + '">';
  html += '<div class="cc-label">Also at ' + esc(c.startTime) + '</div>';
  html += '<div class="cc-title">' + esc(c.title) + '</div>';
  html += '<div class="cc-detail">' + esc(c.startTime + '\u2013' + c.endTime);
  if (c.location) html += ' \u00b7 ' + esc(c.location);
  html += '</div>';
  if (c.poc) html += '<div class="cc-detail">POC: ' + esc(c.poc) + '</div>';
  if (cGroup) html += '<div><span class="band-tag" style="background:' + esc(cGroup.color) + ';color:' + esc(getContrastingTextColor(cGroup.color)) + ';">' + esc(cGroup.name) + '</span></div>';
  if (c.attendees) {
    const prefix = cGroup ? '+ ' : 'WHO: ';
    if (c.attendees.length > 25) {
      addDaggerFootnote({ title: c.title, time: c.startTime + '\u2013' + c.endTime, attendees: c.attendees });
      const daggerNum = getDaggerFootnotes().length;
      html += '<div class="cc-attendees">' + esc(prefix + c.attendees) + ' <sup>' + daggerNum + '</sup></div>';
    } else {
      html += '<div class="cc-attendees">' + esc(prefix + c.attendees) + '</div>';
    }
  }
  html += '</div>';
  return html;
}

function renderBandConcurrentOverflow(hiddenConcurrentCount, jumpStartTime) {
  const jumpAttr = jumpStartTime ? ' data-conc-jump="' + esc(jumpStartTime) + '"' : '';
  let html = '<div class="band-conc band-conc-more"' + jumpAttr + '>';
  html += '<div class="cc-label">More below</div>';
  html += '<div class="cc-title">+' + hiddenConcurrentCount + ' more also happening</div>';
  if (jumpStartTime) {
    html += '<div class="cc-detail">Jump to the ' + esc(jumpStartTime) + ' group below.</div>';
  } else {
    html += '<div class="cc-detail">See the grouped concurrent section.</div>';
  }
  html += '</div>';
  return html;
}

function renderConcurrentRow(concurrent, groups, densityInfo) {
  const groupMap = {};
  groups.forEach(g => { groupMap[g.id] = g; });

  let html = '<div class="conc-section">';
  html += '<div class="conc-section-label">Also Happening</div>';
  if (densityInfo && densityInfo.usePackedConcurrent) {
    html += renderConcurrentPacked(concurrent, groupMap);
  } else if (densityInfo && densityInfo.denseMode) {
    html += renderConcurrentGroups(concurrent, groupMap);
  } else {
    html += '<div class="conc-row">';
    concurrent.forEach(c => {
      html += renderConcurrentItem(c, groupMap[c.groupId]);
    });
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function renderConcurrentPacked(concurrent, groupMap) {
  const buckets = {};
  concurrent.forEach(c => {
    if (!buckets[c.startTime]) buckets[c.startTime] = [];
    buckets[c.startTime].push(c);
  });

  const starts = Object.keys(buckets).sort();
  let html = '<div class="conc-packed">';
  starts.forEach(startTime => {
    const bucket = buckets[startTime].slice().sort((a, b) => {
      const endDiff = a.endTime.localeCompare(b.endTime);
      return endDiff || a.title.localeCompare(b.title);
    });
    bucket.forEach((c, index) => {
      html += renderConcurrentItem(c, groupMap[c.groupId], {
        packed: true,
        groupAnchor: index === 0 ? startTime : '',
        groupHeading: index === 0 ? { time: startTime, count: bucket.length } : null,
      });
    });
  });
  html += '</div>';
  return html;
}

function renderConcurrentGroups(concurrent, groupMap) {
  const buckets = {};
  concurrent.forEach(c => {
    if (!buckets[c.startTime]) buckets[c.startTime] = [];
    buckets[c.startTime].push(c);
  });

  const starts = Object.keys(buckets).sort();
  let html = '<div class="conc-groups">';
  starts.forEach(startTime => {
    const bucket = buckets[startTime].slice().sort((a, b) => {
      const endDiff = a.endTime.localeCompare(b.endTime);
      return endDiff || a.title.localeCompare(b.title);
    });
    html += '<div class="conc-group" data-conc-group="' + esc(startTime) + '">';
    html += '<div class="conc-group-head">';
    html += '<span class="conc-group-time">' + esc(startTime) + '</span>';
    html += '<span class="conc-group-count">' + esc(bucket.length + (bucket.length === 1 ? ' event' : ' events')) + '</span>';
    html += '</div>';
    html += '<div class="conc-row">';
    bucket.forEach(c => {
      html += renderConcurrentItem(c, groupMap[c.groupId]);
    });
    html += '</div>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}

function renderConcurrentItem(c, g, options) {
  const opts = options || {};
  const borderColor = g ? g.color : '#d2d2d7';
  const packedClass = opts.packed ? ' conc-item--packed' : '';
  const groupAnchorAttr = opts.groupAnchor ? ' data-conc-group="' + esc(opts.groupAnchor) + '"' : '';
  let html = '<div class="conc-item' + packedClass + '" style="border-left-color:' + esc(borderColor) + ';" data-event-id="' + esc(c.id) + '"' + groupAnchorAttr + '>';
  if (opts.groupHeading) {
    html += '<div class="conc-pack-head">';
    html += '<span class="conc-group-time">' + esc(opts.groupHeading.time) + '</span>';
    html += '<span class="conc-group-count">' + esc(opts.groupHeading.count + (opts.groupHeading.count === 1 ? ' event' : ' events')) + '</span>';
    html += '</div>';
  }
  html += renderConcurrentItemBody(c, g);
  html += '</div>';
  return html;
}

function renderConcurrentItemBody(c, g) {
  let html = '';
  html += '<div class="ci-time">' + esc(c.startTime + ' \u2013 ' + c.endTime) + '</div>';
  html += '<div class="ci-title">' + esc(c.title) + '</div>';
  const parts = [c.location, c.poc].filter(Boolean);
  if (parts.length) html += '<div class="ci-detail">' + esc(parts.join(' \u00b7 ')) + '</div>';
  if (c.description) html += '<div class="ci-detail">' + esc(c.description) + '</div>';
  if (g) html += '<div><span class="band-tag" style="background:' + esc(g.color) + ';color:' + esc(getContrastingTextColor(g.color)) + ';">' + esc(g.name) + '</span></div>';
  if (c.attendees) {
    const prefix = g ? '+ ' : 'WHO: ';
    const existingIdx = getDaggerFootnotes().findIndex(fn => fn.title === c.title && fn.attendees === c.attendees);
    if (existingIdx !== -1) {
      html += '<div class="cc-attendees">' + esc(prefix + c.attendees) + ' <sup>' + (existingIdx + 1) + '</sup></div>';
    } else if (c.attendees.length > 25) {
      addDaggerFootnote({ title: c.title, time: c.startTime + ' \u2013 ' + c.endTime, attendees: c.attendees });
      html += '<div class="cc-attendees">' + esc(prefix + c.attendees) + ' <sup>' + getDaggerFootnotes().length + '</sup></div>';
    } else {
      html += '<div class="cc-attendees">' + esc(prefix + c.attendees) + '</div>';
    }
  }
  return html;
}
