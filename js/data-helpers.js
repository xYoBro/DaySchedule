function computeDuration(event) {
  return timeToMinutes(event.endTime) - timeToMinutes(event.startTime);
}

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
    if (!group) return !!evt.isMainEvent; // no group — respect manual flag (defaults false)
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

  const mainBands = allBandEvents.map(evt => {
    const effMain = isEffectiveMain(evt);
    return {
      event: evt,
      tier: evt.isBreak ? 'break' : effMain ? 'main' : 'supporting',
      group: groupMap[evt.groupId] || null,
      concurrent: effMain && !evt.isBreak
        ? getOverlappingConcurrent(evt, concurrent)
        : [],
    };
  });

  return { mainBands, concurrent };
}
