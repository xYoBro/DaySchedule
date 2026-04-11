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
