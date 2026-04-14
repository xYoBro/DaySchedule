/* ── data-helpers.js ── Contract ───────────────────────────────────────────
 *
 * EXPORTS:
 *   computeDuration(event)                      → minutes (number)
 *   eventsOverlap(a, b)                         → boolean (touch-exclusive)
 *   getOverlappingConcurrent(mainEvt, concs)    → Array<event>
 *   classifyEvents(events, groups)              → {mainBands[], concurrent[]}
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

function classifyEvents(events, groups) {
  const groupMap = {};
  groups.forEach(g => { groupMap[g.id] = g; });

  // Derive effective "is main" from the group's CURRENT scope at render time.
  // isMainEvent on the event is a manual override — only honored when the
  // group scope is limited (the "Highlight this event" checkbox).
  function isEffectiveMain(evt) {
    if (evt.isBreak) return true; // breaks always go in main track
    const group = groupMap[evt.groupId];
    if (!group) return false; // no group — never main
    if (group.scope === 'main') return true; // main-scope group — always main
    return !!evt.isMainEvent; // limited-scope — only if manually highlighted
  }

  const mainEvents = [];
  const limitedEvents = [];

  events.forEach(evt => {
    if (isEffectiveMain(evt)) {
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
