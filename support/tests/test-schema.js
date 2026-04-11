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
