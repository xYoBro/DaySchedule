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

  mainEvents.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  const concurrent = [];
  const supporting = [];

  limitedEvents.forEach(evt => {
    const overlapsMain = mainEvents.some(m => !m.isBreak && eventsOverlap(m, evt));
    if (overlapsMain) {
      concurrent.push(evt);
    } else {
      supporting.push(evt);
    }
  });

  const allBandEvents = [...mainEvents, ...supporting]
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  // Detect main-on-main overlaps
  function getOverlappingMain(evt) {
    return mainEvents.filter(m => m.id !== evt.id && !m.isBreak && eventsOverlap(m, evt));
  }

  // Track which concurrent events have been placed so each appears only once,
  // on the first band it overlaps with (the band active when it starts).
  const placedConcurrent = new Set();

  const mainBands = allBandEvents.map(evt => {
    const effMain = isEffectiveMain(evt);
    const overlappingMain = effMain && !evt.isBreak ? getOverlappingMain(evt) : [];
    let bandConcurrent = [];
    if (!evt.isBreak) {
      bandConcurrent = getOverlappingConcurrent(evt, concurrent)
        .filter(c => !placedConcurrent.has(c.id));
      bandConcurrent.forEach(c => placedConcurrent.add(c.id));
    }
    return {
      event: evt,
      tier: evt.isBreak ? 'break' : effMain ? 'main' : 'supporting',
      group: groupMap[evt.groupId] || null,
      concurrent: bandConcurrent,
      overlappingMain, // other main events that share time with this one
    };
  });

  return { mainBands, concurrent };
}
