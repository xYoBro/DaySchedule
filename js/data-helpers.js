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

  const mainEvents = [];
  const limitedEvents = [];

  events.forEach(evt => {
    if (evt.isBreak) {
      mainEvents.push(evt);
      return;
    }
    if (evt.isMainEvent) {
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

  const mainBands = allBandEvents.map(evt => ({
    event: evt,
    tier: evt.isBreak ? 'break' : evt.isMainEvent ? 'main' : 'supporting',
    group: groupMap[evt.groupId] || null,
    concurrent: evt.isMainEvent && !evt.isBreak
      ? getOverlappingConcurrent(evt, concurrent)
      : [],
  }));

  return { mainBands, concurrent };
}
