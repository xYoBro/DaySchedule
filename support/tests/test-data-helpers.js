describe('data-helpers — eventsOverlap', () => {
  it('detects overlapping events', () => {
    assert.equal(eventsOverlap(
      { startTime: '0800', endTime: '1100' },
      { startTime: '0900', endTime: '1000' }
    ), true);
  });

  it('detects non-overlapping events', () => {
    assert.equal(eventsOverlap(
      { startTime: '0800', endTime: '0900' },
      { startTime: '0900', endTime: '1000' }
    ), false);
  });

  it('detects partial overlap', () => {
    assert.equal(eventsOverlap(
      { startTime: '0730', endTime: '0830' },
      { startTime: '0800', endTime: '1100' }
    ), true);
  });
});

describe('data-helpers — classifyEvents', () => {
  it('separates main, supporting, and concurrent events', () => {
    const groups = [
      { id: 'g1', scope: 'main', name: 'All', color: '#000' },
      { id: 'g2', scope: 'limited', name: 'Few', color: '#000' },
    ];
    const events = [
      { id: 'e1', title: 'Formation',  startTime: '0700', endTime: '0800', groupId: 'g1', isMainEvent: true, isBreak: false },
      { id: 'e2', title: 'Promo Board', startTime: '0730', endTime: '1000', groupId: 'g2', isMainEvent: false, isBreak: false },
      { id: 'e3', title: 'Safety',     startTime: '0800', endTime: '0830', groupId: 'g2', isMainEvent: false, isBreak: false },
    ];
    const result = classifyEvents(events, groups);
    assert.equal(result.mainBands.some(b => b.event.id === 'e1'), true);
    assert.equal(result.concurrent.some(c => c.id === 'e2'), true);
    assert.equal(result.mainBands.some(b => b.event.id === 'e3'), true);
  });

  it('treats highlighted limited events as main and reports overlaps', () => {
    const groups = [
      { id: 'g1', scope: 'main', name: 'All', color: '#000' },
      { id: 'g2', scope: 'limited', name: 'SNCOs', color: '#000' },
    ];
    const events = [
      { id: 'e1', title: 'Formation', startTime: '0800', endTime: '0900', groupId: 'g1', isMainEvent: true, isBreak: false },
      { id: 'e2', title: 'SNCO Sync', startTime: '0830', endTime: '0930', groupId: 'g2', isMainEvent: true, isBreak: false },
    ];
    const result = classifyEvents(events, groups);
    const highlighted = result.mainBands.find(b => b.event.id === 'e2');
    assert(highlighted, 'highlighted limited event should become a main band');
    assert.equal(highlighted.overlappingMain.length, 1);
    assert.equal(highlighted.overlappingMain[0].id, 'e1');
  });

  it('anchors limited-only overlap clusters under a supporting band', () => {
    const groups = [
      { id: 'flight', scope: 'limited', name: 'By Flight', color: '#000' },
      { id: 'mx', scope: 'limited', name: 'Maintenance', color: '#111' },
      { id: 'med', scope: 'limited', name: 'Medical', color: '#222' },
    ];
    const events = [
      { id: 'e1', title: 'AFSC Training', startTime: '0830', endTime: '1100', groupId: 'flight', isMainEvent: false, isBreak: false },
      { id: 'e2', title: 'Tool Inventory', startTime: '0830', endTime: '0930', groupId: 'mx', isMainEvent: false, isBreak: false },
      { id: 'e3', title: 'PHA Screenings', startTime: '0830', endTime: '1100', groupId: 'med', isMainEvent: false, isBreak: false },
      { id: 'e4', title: 'TO Library Update', startTime: '0930', endTime: '1100', groupId: 'mx', isMainEvent: false, isBreak: false },
    ];

    const result = classifyEvents(events, groups);
    const anchor = result.mainBands.find(b => b.event.id === 'e1');

    assert(anchor, 'longest early limited event should remain as the supporting anchor band');
    assert.equal(anchor.tier, 'supporting');
    assert.equal(anchor.concurrent.length, 3);
    assert.equal(result.mainBands.length, 1);
    assert.equal(result.concurrent.length, 3);
  });
});

describe('data-helpers — shared event exceptions', () => {
  it('summarizes limited audiences overlapping a shared event', () => {
    const groups = [
      { id: 'all', scope: 'main', name: 'All Personnel', color: '#000' },
      { id: 'chiefs', scope: 'limited', name: 'Flight Chiefs', color: '#111' },
      { id: 'mx', scope: 'limited', name: 'Maintenance', color: '#222' },
    ];
    const events = [
      { id: 'shared', title: 'Cyber Awareness', startTime: '1500', endTime: '1530', groupId: 'all', isMainEvent: true, isBreak: false },
      { id: 'chiefs', title: 'Convoy Ops Brief', startTime: '1400', endTime: '1530', groupId: 'chiefs', isMainEvent: false, isBreak: false, attendees: 'MSgt Franklin, TSgt Park' },
      { id: 'mx', title: 'MX Debrief', startTime: '1430', endTime: '1500', groupId: 'mx', isMainEvent: false, isBreak: false },
    ];

    const info = getSharedEventExceptions(events[0], events, groups);

    assert.equal(info.events.length, 1);
    assert.equal(info.groupNames.join(', '), 'Flight Chiefs');
    assert.equal(info.attendeeNames.join(', '), 'MSgt Franklin, TSgt Park');
  });

  it('finds shared events that a limited audience will read as an exception to', () => {
    const groups = [
      { id: 'all', scope: 'main', name: 'All Personnel', color: '#000' },
      { id: 'chiefs', scope: 'limited', name: 'Flight Chiefs', color: '#111' },
    ];
    const events = [
      { id: 'shared', title: 'Cyber Awareness', startTime: '1500', endTime: '1530', groupId: 'all', isMainEvent: true, isBreak: false },
      { id: 'chiefs', title: 'Convoy Ops Brief', startTime: '1400', endTime: '1530', groupId: 'chiefs', isMainEvent: false, isBreak: false, attendees: 'MSgt Franklin' },
    ];

    const info = getOverlappingSharedEvents(events[1], events, groups);

    assert.equal(info.events.length, 1);
    assert.equal(info.titles[0], 'Cyber Awareness');
  });

  it('collapses group and named exceptions into one compact schedule note', () => {
    const text = summarizeExceptionNote({
      groupNames: ['Flight Chiefs'],
      attendeeNames: ['TSgt Snuffy', 'A1C Broadmoore'],
    }, 3);

    assert.equal(text, 'Flight Chiefs, TSgt Snuffy, and A1C Broadmoore');
  });
});

describe('data-helpers — chronological Bands sections', () => {
  const groups = [
    { id: 'all', scope: 'main', name: 'Everyone' },
    { id: 'a', scope: 'limited', name: 'Team A' },
    { id: 'b', scope: 'limited', name: 'Team B' },
  ];
  const event = (id, startTime, endTime, extra) => ({ id, title: id, startTime, endTime, groupId: 'a', ...extra });
  const ids = entries => entries.map(entry => entry.event.id);

  it('keeps strict-overlap main components together and adjacent main blocks separate', () => {
    const sections = buildBandSections([
      event('first', '0800', '0930', { groupId: 'all' }),
      event('second', '0900', '1030', { groupId: 'all' }),
      event('third', '1000', '1100', { groupId: 'all' }),
      event('adjacent', '1100', '1200', { groupId: 'all' }),
      event('early-task', '0815', '0845'), event('shared-task', '0915', '0945'),
    ], groups);
    assert.equal(sections.length, 2);
    assert.deepEqual(ids(sections[0].mains), ['first', 'second', 'third']);
    assert.equal(sections[0].startTime, '0800');
    assert.equal(sections[0].endTime, '1100');
    assert.deepEqual(sections[0].supporting[0].overlappingMain.map(evt => evt.id), ['first']);
    assert.deepEqual(sections[0].supporting[1].overlappingMain.map(evt => evt.id), ['first', 'second']);
    assert.deepEqual(ids(sections[1].mains), ['adjacent']);
  });

  it('anchors an early supporting event before the main block and keeps its full original range', () => {
    const early = event('early', '0745', '0915', { description: 'Unabridged detail', attendees: 'Alex' });
    const sections = buildBandSections([event('main', '0800', '1000', { groupId: 'all' }), early], groups);
    assert.deepEqual(sections.map(section => section.kind), ['supporting', 'main']);
    assert.deepEqual(ids(sections[0].supporting), ['early']);
    assert.equal(sections[0].supporting[0].event, early);
    assert.equal(sections[0].supporting[0].continuesAfter, true);
    assert.equal(sections[0].endTime, '0800');
    assert.deepEqual(ids(sections[1].supporting), []);
    assert.deepEqual(ids(sections[1].continuations), ['early']);
    assert.equal(sections[1].continuations[0].sourceSectionIndex, 0);
    assert.equal(sections[1].continuations[0].event.startTime, '0745');
    assert.equal(sections[1].continuations[0].event.endTime, '0915');
    assert.equal(sections[1].continuations[0].continuesAfter, false);
  });

  it('retains cross-boundary continuations through gaps and breaks without duplicating full entries', () => {
    const sections = buildBandSections([
      event('morning', '0800', '0900', { groupId: 'all' }),
      event('break', '0930', '1000', { groupId: '', isBreak: true }),
      event('later', '1000', '1100', { groupId: 'all' }),
      event('spans', '0845', '1015'), event('gap-start', '0915', '0945'),
    ], groups);
    assert.deepEqual(sections.map(section => section.kind), ['main', 'supporting', 'main', 'main']);
    assert.deepEqual(ids(sections[0].supporting), ['spans']);
    assert.deepEqual(ids(sections[1].supporting), ['gap-start']);
    assert.deepEqual(ids(sections[1].continuations), ['spans']);
    assert.deepEqual(ids(sections[2].continuations), ['spans', 'gap-start']);
    assert.equal(sections[2].mains[0].tier, 'break');
    assert.deepEqual(sections[2].continuations[0].overlappingMain, []);
    assert.deepEqual(sections[2].continuations[0].overlappingBreaks.map(evt => evt.id), ['break']);
    assert.deepEqual(ids(sections[3].continuations), ['spans']);
    assert.deepEqual(sections[2].continuations.map(entry => entry.sourceSectionIndex), [0, 1]);
  });

  it('preserves continuation-only intervals and drops genuinely empty gaps', () => {
    const sections = buildBandSections([
      event('first', '0800', '0900', { groupId: 'all' }),
      event('second', '1000', '1100', { groupId: 'all' }),
      event('third', '1300', '1400', { groupId: 'all' }),
      event('spans-gap', '0845', '1015'), event('after', '1430', '1500'),
    ], groups);
    assert.deepEqual(sections.map(section => section.startTime), ['0800', '0900', '1000', '1300', '1400']);
    assert.equal(sections[1].supporting.length, 0);
    assert.deepEqual(ids(sections[1].continuations), ['spans-gap']);
    assert.deepEqual(ids(sections[4].supporting), ['after']);
  });

  it('assigns boundary starts to the later section and does not continue events that have ended', () => {
    const sections = buildBandSections([
      event('one', '0800', '0900', { groupId: 'all' }),
      event('two', '0900', '1000', { groupId: 'all' }),
      event('ends', '0830', '0900'), event('starts', '0900', '0930'),
    ], groups);
    assert.deepEqual(ids(sections[0].supporting), ['ends']);
    assert.deepEqual(ids(sections[1].supporting), ['starts']);
    assert.equal(sections[0].supporting[0].continuesAfter, false);
    assert.equal(sections[1].continuations.length, 0);
    assert.equal(sections[1].supporting[0].sourceSectionIndex, 1);
  });

  it('keeps primary, highlighted, unassigned and break semantics without changing audience ownership', () => {
    const sections = buildBandSections([
      event('primary', '0800', '1000', { groupId: 'all', isMainEvent: false }),
      event('highlight', '0830', '0900', { groupId: 'b', isMainEvent: true }),
      event('unassigned-main', '0900', '0930', { groupId: '', isMainEvent: true }),
      event('break', '0915', '0945', { groupId: '', isBreak: true }),
      event('unassigned-support', '0920', '0930', { groupId: '' }),
    ], groups);
    assert.equal(sections.length, 1);
    assert.deepEqual(ids(sections[0].mains), ['primary', 'highlight', 'unassigned-main', 'break']);
    assert.equal(sections[0].mains[1].group, groups[2]);
    assert.equal(sections[0].mains[2].group, null);
    assert.deepEqual(ids(sections[0].supporting), ['unassigned-support']);
    assert.equal(sections[0].supporting[0].group, null);
    assert.deepEqual(sections[0].supporting[0].overlappingMain.map(evt => evt.id), ['primary', 'unassigned-main']);
    assert.deepEqual(sections[0].supporting[0].overlappingBreaks.map(evt => evt.id), ['break']);
  });

  it('handles empty and supporting-only days without inventing a main event', () => {
    assert.deepEqual(buildBandSections([], groups), []);
    assert.deepEqual(buildBandSections(null, groups), []);
    const sections = buildBandSections([
      event('late', '1000', '1100', { groupId: '' }), event('early', '0800', '0900'),
    ], groups);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].kind, 'supporting');
    assert.equal(sections[0].startTime, '0800');
    assert.equal(sections[0].endTime, '1100');
    assert.deepEqual(sections[0].mains, []);
    assert.deepEqual(ids(sections[0].supporting), ['early', 'late']);
    assert.deepEqual(sections[0].continuations, []);
  });

  it('preserves every canonical event once and does not mutate inputs', () => {
    const events = [event('late', '1200', '1230'),
      event('second', '0900', '1100', { groupId: 'all' }),
      event('cross', '0730', '1130'),
      event('first', '0800', '0900', { groupId: 'all' }),
      event('short', '0830', '0845'), event('long', '0830', '0945')];
    const snapshot = JSON.stringify({ events, groups });
    const sections = buildBandSections(events, groups);
    const canonical = sections.flatMap(section => section.mains.concat(section.supporting));
    assert.deepEqual(ids(canonical).sort(), events.map(evt => evt.id).sort());
    canonical.forEach(entry => assert.equal(entry.event, events.find(evt => evt.id === entry.event.id)));
    assert.deepEqual(ids(sections[1].supporting), ['long', 'short']);
    sections.forEach(section => section.continuations.forEach(entry => {
      assert(sections[entry.sourceSectionIndex].supporting.some(source => source.event === entry.event));
    }));
    assert.equal(JSON.stringify({ events, groups }), snapshot);
  });
});

describe('data-helpers — getOverlappingConcurrent', () => {
  it('finds concurrent events overlapping a main event', () => {
    const mainEvt = { startTime: '0900', endTime: '1100' };
    const concurrents = [
      { id: 'c1', startTime: '0800', endTime: '1100', title: 'Board' },
      { id: 'c2', startTime: '1200', endTime: '1400', title: 'Other' },
    ];
    const overlapping = getOverlappingConcurrent(mainEvt, concurrents);
    assert.equal(overlapping.length, 1);
    assert.equal(overlapping[0].id, 'c1');
  });
});

describe('data-helpers — computeDuration', () => {
  it('calculates duration in minutes', () => {
    assert.equal(computeDuration({ startTime: '0700', endTime: '0730' }), 30);
    assert.equal(computeDuration({ startTime: '0900', endTime: '1100' }), 120);
  });
});

describe('data-helpers — analyzeDayLayout', () => {
  it('recommends grid for heavy simultaneous group activity', () => {
    const groups = [
      { id: 'all', scope: 'main', name: 'All', color: '#000' },
      { id: 'a', scope: 'limited', name: 'A', color: '#111' },
      { id: 'b', scope: 'limited', name: 'B', color: '#222' },
      { id: 'c', scope: 'limited', name: 'C', color: '#333' },
      { id: 'd', scope: 'limited', name: 'D', color: '#444' },
    ];
    const events = [
      { id: 'm1', title: 'Main Block', startTime: '0800', endTime: '1200', groupId: 'all', isMainEvent: true, isBreak: false },
      { id: 'a1', title: 'A Task', startTime: '0830', endTime: '1000', groupId: 'a', isMainEvent: false, isBreak: false },
      { id: 'b1', title: 'B Task', startTime: '0830', endTime: '1030', groupId: 'b', isMainEvent: false, isBreak: false },
      { id: 'c1', title: 'C Task', startTime: '0830', endTime: '1100', groupId: 'c', isMainEvent: false, isBreak: false },
      { id: 'd1', title: 'D Task', startTime: '0830', endTime: '1130', groupId: 'd', isMainEvent: false, isBreak: false },
    ];

    const analysis = analyzeDayLayout(events, groups);
    assert.equal(analysis.recommendedSkin, 'grid');
    assert.equal(analysis.maxConcurrentAtStart, 4);
  });

  it('flags ragged dense concurrency for packed overflow rendering', () => {
    const groups = [
      { id: 'all', scope: 'main', name: 'All', color: '#000' },
      { id: 'a', scope: 'limited', name: 'A', color: '#111' },
      { id: 'b', scope: 'limited', name: 'B', color: '#222' },
      { id: 'c', scope: 'limited', name: 'C', color: '#333' },
      { id: 'd', scope: 'limited', name: 'D', color: '#444' },
    ];
    const events = [
      { id: 'm1', title: 'Main Block', startTime: '0800', endTime: '1500', groupId: 'all', isMainEvent: true, isBreak: false },
      { id: 'a1', title: 'A0830', startTime: '0830', endTime: '0930', groupId: 'a', isMainEvent: false, isBreak: false },
      { id: 'b1', title: 'B0830', startTime: '0830', endTime: '1000', groupId: 'b', isMainEvent: false, isBreak: false },
      { id: 'c1', title: 'C0830', startTime: '0830', endTime: '1030', groupId: 'c', isMainEvent: false, isBreak: false },
      { id: 'd1', title: 'D0830', startTime: '0830', endTime: '1100', groupId: 'd', isMainEvent: false, isBreak: false },
      { id: 'a2', title: 'A0930', startTime: '0930', endTime: '1000', groupId: 'a', isMainEvent: false, isBreak: false },
      { id: 'b2', title: 'B1000', startTime: '1000', endTime: '1030', groupId: 'b', isMainEvent: false, isBreak: false },
      { id: 'c2', title: 'C1200', startTime: '1200', endTime: '1300', groupId: 'c', isMainEvent: false, isBreak: false },
      { id: 'd2', title: 'D1200', startTime: '1200', endTime: '1330', groupId: 'd', isMainEvent: false, isBreak: false },
      { id: 'a3', title: 'A1330', startTime: '1330', endTime: '1400', groupId: 'a', isMainEvent: false, isBreak: false },
      { id: 'b3', title: 'B1400', startTime: '1400', endTime: '1430', groupId: 'b', isMainEvent: false, isBreak: false },
      { id: 'c3', title: 'C1400', startTime: '1400', endTime: '1500', groupId: 'c', isMainEvent: false, isBreak: false },
      { id: 'd3', title: 'D1430', startTime: '1430', endTime: '1500', groupId: 'd', isMainEvent: false, isBreak: false },
    ];

    const analysis = analyzeDayLayout(events, groups);
    assert.equal(analysis.usePackedConcurrent, true);
    assert.equal(analysis.bucketCount >= 5, true);
  });
});

describe('data-helpers — main track, phases and handouts', () => {
  const groups = [
    { id: 'all', scope: 'main', name: 'Everyone' },
    { id: 'a', scope: 'limited', name: 'Team A' },
    { id: 'b', scope: 'limited', name: 'Team B' },
  ];
  const event = (id, startTime, endTime, extra) => ({ id, title: id, startTime, endTime, groupId: 'a', ...extra });

  it('honors an unassigned Main Track override and keeps primary audience events on the main track', () => {
    assert.equal(isEventEffectiveMain({ groupId: '', isMainEvent: true }, groups), true);
    assert.equal(isEventEffectiveMain({ groupId: '', isMainEvent: false }, groups), false);
    assert.equal(isEventEffectiveMain({ groupId: 'all', isMainEvent: false }, groups), true);
    assert.equal(isEventEffectiveMain({ groupId: 'b', isMainEvent: false }, groups), false);
  });

  it('groups only contained tasks under an unambiguous temporal phase', () => {
    const events = [event('morning', '0800', '0900', { groupId: 'all' }),
      event('later', '1000', '1100', { groupId: 'all' }),
      event('inside', '0810', '0840'), event('gap', '0930', '0945'),
      event('spans', '0845', '1015'), event('after', '1200', '1230')];
    const phases = buildPhaseGroups(events, groups);
    assert.deepEqual(phases.find(phase => phase.event && phase.event.id === 'morning').tasks.map(task => task.event.id), ['inside']);
    ['gap', 'spans', 'after'].forEach(id => assert(phases.some(phase => !phase.event && phase.tasks.some(task => task.event.id === id)), id + ' should be independent'));
    const renderedIds = phases.flatMap(phase => (phase.event ? [phase.event.id] : []).concat(phase.tasks.map(task => task.event.id))).sort();
    assert.deepEqual(renderedIds, events.map(evt => evt.id).sort(), 'every event appears exactly once');
  });

  it('keeps tasks independent when two main phases overlap them', () => {
    const phases = buildPhaseGroups([event('one', '0800', '1000', { groupId: 'all' }),
      event('two', '0900', '1100', { isMainEvent: true }), event('ambiguous', '0915', '0930')], groups);
    assert(phases.some(phase => !phase.event && phase.tasks[0].event.id === 'ambiguous'));
  });

  it('includes shared events and breaks in an audience handout without leaking another limited audience', () => {
    const events = [event('shared', '0800', '0900', { groupId: 'all' }), event('own', '0900', '1000'),
      event('other-highlight', '1000', '1100', { groupId: 'b', isMainEvent: true }),
      event('break', '1100', '1200', { groupId: '', isBreak: true }),
      event('unassigned-main', '1200', '1230', { groupId: '', isMainEvent: true })];
    assert.deepEqual(getAudienceHandoutEvents(events, groups, 'a').map(evt => evt.id), ['shared', 'own', 'break', 'unassigned-main']);
    assert.equal(getAudienceHandoutEvents(events, groups, '').length, 5);
    assert.equal(events.length, 5, 'filtering leaves input intact');
  });

  it('flags dates, hours, missing audiences and shared resources while allowing adjacent events', () => {
    const days = [{ id: 'd1', date: '2026-09-10', startTime: '0800', endTime: '1700', events: [
      event('early', '0730', '0830', { groupId: '' }),
      event('one', '0900', '1000', { location: 'Room 1', attendees: 'Alex; Sam', attendeeFormat: 'suggested' }),
      event('two', '0930', '1030', { location: ' room 1 ', attendees: 'alex', attendeeFormat: 'suggested' }),
      event('adjacent', '1030', '1100', { location: 'Room 1', attendees: 'Alex' }),
    ] }, { id: 'd2', date: '2026-09-10', startTime: '1700', endTime: '0800', events: [] },
    { id: 'd3', date: '2026-02-31', startTime: '0800', endTime: '1700', events: [] }];
    const issues = getScheduleReviewIssues(days, groups);
    ['audience', 'outside-day', 'duplicate-date', 'day-range', 'date'].forEach(type => assert(issues.some(issue => issue.type === type), type));
    const overlaps = issues.filter(issue => issue.type === 'overlap');
    assert.equal(overlaps.length, 1);
    assert(overlaps[0].message.includes('audience, location, matching attendee entries (confirm identity)'));
    assert.deepEqual(overlaps[0].eventIds, ['one', 'two']);
  });
});
