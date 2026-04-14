/* ── data-helpers.js ── Contract ───────────────────────────────────────────
 *
 * EXPORTS:
 *   computeDuration(event)                      → minutes (number)
 *   eventsOverlap(a, b)                         → boolean (touch-exclusive)
 *   getOverlappingConcurrent(mainEvt, concs)      → Array<event>
 *   getSharedEventExceptions(evt, events, groups) → {events[], groupNames[], titles[], attendeeNames[]}
 *   getOverlappingSharedEvents(evt, events, groups) → {events[], groupNames[], titles[], attendeeNames[]}
 *   summarizeDisplayList(items, limit?)          → string
 *   summarizeExceptionNote(info, itemLimit?)     → string
 *   classifyEvents(events, groups)                → {mainBands[], concurrent[]}
 *   analyzeDayLayout(events, groups, classified?) → layout metrics + recommendation
 *
 * REQUIRES:
 *   utils.js — timeToMinutes()
 *
 * CONSUMED BY:
 *   render.js    — computeDuration, classifyEvents
 *   print.js     — classifyEvents
 *   skin-band.js — analyzeDayLayout()
 *   inspector.js — classifyEvents, eventsOverlap (via checkTimeConflict)
 * ──────────────────────────────────────────────────────────────────────────── */

function computeDuration(event) {
  return timeToMinutes(event.endTime) - timeToMinutes(event.startTime);
}

// Touch-exclusive: adjacent events (0800-0900, 0900-1000) do NOT overlap.
function eventsOverlap(a, b) {
  const aStart = timeToMinutes(a.startTime), aEnd = timeToMinutes(a.endTime);
  const bStart = timeToMinutes(b.startTime), bEnd = timeToMinutes(b.endTime);
  return aStart < bEnd && bStart < aEnd;
}

function getOverlappingConcurrent(mainEvt, concurrents) {
  return concurrents.filter(c => eventsOverlap(mainEvt, c));
}

function compareBandOrder(a, b) {
  const startDiff = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
  if (startDiff !== 0) return startDiff;
  const durationDiff = computeDuration(b) - computeDuration(a);
  if (durationDiff !== 0) return durationDiff;
  return (a.title || '').localeCompare(b.title || '');
}

function getGroupMap(groupsOrMap) {
  if (!groupsOrMap) return {};
  if (!Array.isArray(groupsOrMap)) return groupsOrMap;
  const map = {};
  groupsOrMap.forEach(group => { map[group.id] = group; });
  return map;
}

function isEventEffectiveMain(evt, groupsOrMap) {
  if (!evt) return false;
  if (evt.isBreak) return true;
  const groupMap = getGroupMap(groupsOrMap);
  const group = groupMap[evt.groupId];
  if (!group) return false;
  if (group.scope === 'main') return true;
  return !!evt.isMainEvent;
}

function isSharedTrackEvent(evt, groupsOrMap) {
  if (!evt) return false;
  if (evt.isBreak) return true;
  const groupMap = getGroupMap(groupsOrMap);
  const group = groupMap[evt.groupId];
  return !!(group && group.scope === 'main');
}

function summarizeDisplayList(items, limit) {
  const values = (items || []).filter(Boolean);
  if (!values.length) return '';
  const maxItems = limit || 2;
  const visible = values.slice(0, maxItems);
  const hiddenCount = values.length - visible.length;
  let text = visible.join(', ');
  if (hiddenCount > 0) text += ' +' + hiddenCount + ' more';
  return text;
}

function formatNaturalList(items, limit) {
  const values = (items || []).filter(Boolean);
  if (!values.length) return '';
  const maxItems = limit || 3;
  const visible = values.slice(0, maxItems);
  const hiddenCount = values.length - visible.length;

  if (hiddenCount > 0) {
    if (visible.length === 1) return visible[0] + ' and ' + hiddenCount + ' more';
    if (visible.length === 2) return visible[0] + ', ' + visible[1] + ', and ' + hiddenCount + ' more';
    return visible.slice(0, -1).join(', ') + ', ' + visible[visible.length - 1] + ', and ' + hiddenCount + ' more';
  }

  if (visible.length === 1) return visible[0];
  if (visible.length === 2) return visible[0] + ' and ' + visible[1];
  return visible.slice(0, -1).join(', ') + ', and ' + visible[visible.length - 1];
}

function summarizeExceptionNote(info, itemLimit) {
  if (!info) return '';
  const ordered = [];
  const seen = new Set();

  (info.groupNames || []).forEach(name => {
    if (!name || seen.has(name)) return;
    seen.add(name);
    ordered.push(name);
  });
  (info.attendeeNames || []).forEach(name => {
    if (!name || seen.has(name)) return;
    seen.add(name);
    ordered.push(name);
  });

  return formatNaturalList(ordered, itemLimit || 3);
}

function collectAttendeeNames(attendees) {
  if (!attendees) return [];
  return String(attendees)
    .split(/\s*(?:,|;|\n|\/)\s*/)
    .map(item => item.trim())
    .filter(Boolean);
}

function buildOverlapInfo(events, groupMap) {
  const overlaps = (events || []).slice().sort(compareBandOrder);
  const seenGroups = new Set();
  const groupNames = [];
  const seenAttendees = new Set();
  const attendeeNames = [];

  overlaps.forEach(evt => {
    const groupName = (groupMap[evt.groupId] && groupMap[evt.groupId].name) || 'Unassigned';
    if (seenGroups.has(groupName)) return;
    seenGroups.add(groupName);
    groupNames.push(groupName);
  });

  overlaps.forEach(evt => {
    collectAttendeeNames(evt.attendees).forEach(name => {
      if (seenAttendees.has(name)) return;
      seenAttendees.add(name);
      attendeeNames.push(name);
    });
  });

  return {
    events: overlaps,
    groupNames: groupNames,
    titles: overlaps.map(evt => evt.title),
    attendeeNames: attendeeNames,
  };
}

function getSharedEventExceptions(evt, events, groupsOrMap) {
  const groupMap = getGroupMap(groupsOrMap);
  if (!isSharedTrackEvent(evt, groupMap) || evt.isBreak) {
    return { events: [], groupNames: [], titles: [], attendeeNames: [] };
  }
  const overlaps = (events || []).filter(other =>
    other.id !== evt.id &&
    !isEventEffectiveMain(other, groupMap) &&
    eventsOverlap(evt, other)
  );
  return buildOverlapInfo(overlaps, groupMap);
}

function getOverlappingSharedEvents(evt, events, groupsOrMap) {
  const groupMap = getGroupMap(groupsOrMap);
  if (!evt || isEventEffectiveMain(evt, groupMap) || evt.isBreak) {
    return { events: [], groupNames: [], titles: [], attendeeNames: [] };
  }
  const overlaps = (events || []).filter(other =>
    other.id !== evt.id &&
    isSharedTrackEvent(other, groupMap) &&
    !other.isBreak &&
    eventsOverlap(evt, other)
  );
  return buildOverlapInfo(overlaps, groupMap);
}

function classifyEvents(events, groups) {
  const groupMap = getGroupMap(groups);

  const mainEvents = [];
  const limitedEvents = [];

  events.forEach(evt => {
    if (isEventEffectiveMain(evt, groupMap)) {
      mainEvents.push(evt);
    } else {
      limitedEvents.push(evt);
    }
  });

  mainEvents.sort(compareBandOrder);

  const concurrentToMain = [];
  const independentLimited = [];

  limitedEvents.forEach(evt => {
    const overlapsMain = mainEvents.some(m => !m.isBreak && eventsOverlap(m, evt));
    if (overlapsMain) {
      concurrentToMain.push(evt);
    } else {
      independentLimited.push(evt);
    }
  });

  // Detect main-on-main overlaps
  function getOverlappingMain(evt) {
    return mainEvents.filter(m => m.id !== evt.id && !m.isBreak && eventsOverlap(m, evt));
  }

  // Track which concurrent events have been placed so each appears only once,
  // on the first band it overlaps with (the band active when it starts).
  const placedConcurrentToMain = new Set();

  const mainBands = mainEvents.map(evt => {
    let bandConcurrent = [];
    if (!evt.isBreak) {
      bandConcurrent = getOverlappingConcurrent(evt, concurrentToMain)
        .filter(c => !placedConcurrentToMain.has(c.id));
      bandConcurrent.forEach(c => placedConcurrentToMain.add(c.id));
    }
    return {
      event: evt,
      tier: evt.isBreak ? 'break' : 'main',
      group: groupMap[evt.groupId] || null,
      concurrent: bandConcurrent,
      overlappingMain: !evt.isBreak ? getOverlappingMain(evt) : [],
    };
  });

  const supportingBands = buildSupportingBands(independentLimited, groupMap);
  const allConcurrent = concurrentToMain.concat(supportingBands.flatMap(band => band.concurrent));

  return {
    mainBands: mainBands.concat(supportingBands).sort((a, b) => compareBandOrder(a.event, b.event)),
    concurrent: allConcurrent,
  };
}

function buildSupportingBands(events, groupMap) {
  const sorted = events.slice().sort(compareBandOrder);
  const used = new Set();
  const bands = [];

  sorted.forEach(evt => {
    if (used.has(evt.id)) return;
    used.add(evt.id);

    const attached = sorted.filter(other => !used.has(other.id) && eventsOverlap(evt, other));
    attached.forEach(other => used.add(other.id));

    bands.push({
      event: evt,
      tier: 'supporting',
      group: groupMap[evt.groupId] || null,
      concurrent: attached,
      overlappingMain: [],
    });
  });

  return bands;
}

function analyzeDayLayout(events, groups, classified) {
  const layout = classified || classifyEvents(events, groups);
  const concurrent = layout.concurrent || [];
  const bucketMap = {};

  concurrent.forEach(evt => {
    if (!bucketMap[evt.startTime]) bucketMap[evt.startTime] = [];
    bucketMap[evt.startTime].push(evt);
  });

  const bucketStarts = Object.keys(bucketMap).sort();
  const bucketSizes = bucketStarts.map(start => bucketMap[start].length);
  const maxConcurrentAtStart = bucketSizes.length ? Math.max.apply(null, bucketSizes) : 0;
  const sparseBucketCount = bucketSizes.filter(size => size <= 2).length;
  const limitedGroupCount = new Set(concurrent.map(evt => evt.groupId).filter(Boolean)).size;
  const longConcurrentCount = concurrent.filter(evt => computeDuration(evt) >= 120).length;

  let recommendedSkin = 'bands';
  let reason = 'the day mostly follows one main track.';

  if (maxConcurrentAtStart >= 4 || concurrent.length >= 10) {
    recommendedSkin = 'grid';
    reason = 'it compares simultaneous group events side by side.';
  } else if (limitedGroupCount >= 3 && bucketStarts.length >= 4) {
    recommendedSkin = 'cards';
    reason = 'it gives each group its own stable column for scanning.';
  } else if (longConcurrentCount >= 3 && bucketStarts.length <= 3) {
    recommendedSkin = 'phases';
    reason = 'it reads better when the day is a few long group blocks.';
  }

  return {
    recommendedSkin,
    reason,
    concurrentCount: concurrent.length,
    bucketCount: bucketStarts.length,
    bucketStarts,
    maxConcurrentAtStart,
    sparseBucketCount,
    limitedGroupCount,
    usePackedConcurrent: concurrent.length >= 8 && bucketStarts.length >= 5 && sparseBucketCount >= Math.ceil(bucketStarts.length / 2),
  };
}
