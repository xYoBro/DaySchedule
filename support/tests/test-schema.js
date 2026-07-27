describe('schema — normalizeEvent', () => {
  it('normalizes a complete event', () => {
    const e = normalizeEvent({ title: 'Test', startTime: '0700', endTime: '0800', groupId: 'grp_all' });
    assert.equal(e.title, 'Test');
    assert(e.id.startsWith('evt'), 'should generate id');
  });

  it('pads time values', () => {
    const e = normalizeEvent({ title: 'X', startTime: '700', endTime: '800', groupId: 'grp_all' });
    assert.equal(e.startTime, '0700');
    assert.equal(e.endTime, '0800');
  });

  it('rejects event without title', () => {
    const e = normalizeEvent({ startTime: '0700', endTime: '0800', groupId: 'grp_all' });
    assert.equal(e, null);
  });

  it('sets isBreak for break events', () => {
    const e = normalizeEvent({ title: 'Lunch', startTime: '1100', endTime: '1200', groupId: 'grp_all', isBreak: true });
    assert.equal(e.isBreak, true);
  });

  it('trims attendees text', () => {
    const e = normalizeEvent({
      title: 'Call Roster',
      startTime: '0900',
      endTime: '1000',
      groupId: 'grp_all',
      attendees: '  TSgt Yoda, SrA Snuffy  ',
    });
    assert.equal(e.attendees, 'TSgt Yoda, SrA Snuffy');
  });

  it('rejects events whose end time is not after the start time', () => {
    const sameTime = normalizeEvent({ title: 'Bad', startTime: '0900', endTime: '0900', groupId: 'grp_all' });
    const backwards = normalizeEvent({ title: 'Bad', startTime: '1000', endTime: '0900', groupId: 'grp_all' });

    assert.equal(sameTime, null);
    assert.equal(backwards, null);
  });
});

describe('schema — normalizeGroup', () => {
  it('normalizes a group with defaults', () => {
    const g = normalizeGroup({ name: 'Test Group' });
    assert.equal(g.name, 'Test Group');
    assert.equal(g.scope, 'limited');
    assert(g.id.startsWith('grp'), 'should generate id');
    assert(g.color, 'should have a color');
  });

  it('preserves scope when provided', () => {
    const g = normalizeGroup({ name: 'All', scope: 'main' });
    assert.equal(g.scope, 'main');
  });
});

describe('schema — normalizeNote', () => {
  it('normalizes a note', () => {
    const n = normalizeNote({ category: 'Medical', text: 'A1C Snuffy' });
    assert.equal(n.category, 'Medical');
    assert.equal(n.text, 'A1C Snuffy');
    assert(n.id.startsWith('note'), 'should generate id');
  });

  it('rejects note without text', () => {
    const n = normalizeNote({ category: 'TDY' });
    assert.equal(n, null);
  });
});

describe('schema — time validation', () => {
  it('rejects events with unparseable times', () => {
    assert.equal(normalizeEvent({ title: 'X', startTime: 'garbage', endTime: 'junk!' }), null);
  });
  it('rejects minutes greater than 59', () => {
    assert.equal(normalizeEvent({ title: 'X', startTime: '0095', endTime: '0130' }), null);
  });
  it('rejects cross-midnight ranges', () => {
    assert.equal(normalizeEvent({ title: 'X', startTime: '2200', endTime: '0100' }), null);
  });
  it('accepts 2400 as an end-of-day end time', () => {
    const e = normalizeEvent({ title: 'X', startTime: '2300', endTime: '2400' });
    assert(e !== null, 'should accept a 2400 end time');
  });
  it('falls back to default day times when invalid', () => {
    const d = normalizeDay({ startTime: 'abc', endTime: '9:99' });
    assert.equal(d.startTime, '0700');
    assert.equal(d.endTime, '1630');
  });
});

describe('schema — untrusted field sanitization', () => {
  it('strips unsafe characters from entity ids consistently', () => {
    const day = normalizeDay({
      id: 'day "1"',
      events: [{ id: 'evt"]x', title: 'A', startTime: '0800', endTime: '0900', groupId: 'grp "all"' }],
    });
    assert.equal(day.id, 'day1');
    assert.equal(day.events[0].id, 'evtx');
    assert.equal(day.events[0].groupId, 'grpall');
  });
  it('keeps day/activeDay references aligned after sanitizing', () => {
    const state = normalizePersistedState({ days: [{ id: 'day "1"' }], activeDay: 'day "1"' });
    assert.equal(state.activeDay, state.days[0].id);
  });
  it('replaces non-hex group colors', () => {
    const g = normalizeGroup({ name: 'G', color: 'red;background-image:url(x)' });
    assert.equal(g.color, DEFAULT_COLOR_PALETTE[0]);
  });
  it('keeps valid hex group colors', () => {
    assert.equal(normalizeGroup({ name: 'G', color: '#1a7a40' }).color, '#1a7a40');
  });
  it('rejects non-image logos', () => {
    const state = normalizePersistedState({ days: [], logo: 'javascript:alert(1)' });
    assert.equal(state.logo, null);
  });
  it('keeps data:image logos', () => {
    const state = normalizePersistedState({ days: [], logo: 'data:image/png;base64,AAAA' });
    assert.equal(state.logo, 'data:image/png;base64,AAAA');
  });
  it('normalizes theme to the known shape', () => {
    const state = normalizePersistedState({ days: [], theme: { skin: 'grid', junk: 'x', palette: 42 } });
    assert.equal(state.theme.skin, 'grid');
    assert.equal(state.theme.palette, undefined);
    assert.equal(state.theme.junk, undefined);
  });
});
