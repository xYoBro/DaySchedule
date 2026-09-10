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
      event('one', '0900', '1000', { location: 'Room 1', attendees: 'Alex; Sam' }),
      event('two', '0930', '1030', { location: ' room 1 ', attendees: 'alex' }),
      event('adjacent', '1030', '1100', { location: 'Room 1', attendees: 'Alex' }),
    ] }, { id: 'd2', date: '2026-09-10', startTime: '1700', endTime: '0800', events: [] },
    { id: 'd3', date: '2026-02-31', startTime: '0800', endTime: '1700', events: [] }];
    const issues = getScheduleReviewIssues(days, groups);
    ['audience', 'outside-day', 'duplicate-date', 'day-range', 'date'].forEach(type => assert(issues.some(issue => issue.type === type), type));
    const overlaps = issues.filter(issue => issue.type === 'overlap');
    assert.equal(overlaps.length, 1);
    assert(overlaps[0].message.includes('audience, location, named people'));
    assert.deepEqual(overlaps[0].eventIds, ['one', 'two']);
  });
});
