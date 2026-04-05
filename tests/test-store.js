describe('Store — schedule state', () => {
  it('initializes with empty schedule', () => {
    Store.reset();
    assert.equal(Store.getTitle(), '');
    assert.deepEqual(Store.getDays(), []);
    assert.equal(Store.getGroups().length > 0, true);
  });

  it('sets and gets title', () => {
    Store.reset();
    Store.setTitle('April RSD');
    assert.equal(Store.getTitle(), 'April RSD');
  });

  it('adds a day', () => {
    Store.reset();
    Store.addDay({ date: '2026-03-15', startTime: '0700', endTime: '1630' });
    assert.equal(Store.getDays().length, 1);
    assert.equal(Store.getDays()[0].date, '2026-03-15');
  });

  it('adds an event to a day', () => {
    Store.reset();
    Store.addDay({ date: '2026-03-15', startTime: '0700', endTime: '1630' });
    const dayId = Store.getDays()[0].id;
    Store.addEvent(dayId, { title: 'Formation', startTime: '0700', endTime: '0730', groupId: 'grp_all' });
    const events = Store.getEvents(dayId);
    assert.equal(events.length, 1);
    assert.equal(events[0].title, 'Formation');
  });

  it('events auto-sort by start time', () => {
    Store.reset();
    Store.addDay({ date: '2026-03-15', startTime: '0700', endTime: '1630' });
    const dayId = Store.getDays()[0].id;
    Store.addEvent(dayId, { title: 'B', startTime: '0900', endTime: '1000', groupId: 'grp_all' });
    Store.addEvent(dayId, { title: 'A', startTime: '0700', endTime: '0800', groupId: 'grp_all' });
    const events = Store.getEvents(dayId);
    assert.equal(events[0].title, 'A');
    assert.equal(events[1].title, 'B');
  });

  it('snapshot and restore for undo', () => {
    Store.reset();
    Store.setTitle('Test');
    const day = Store.addDay({ date: '2026-03-15', startTime: '0700', endTime: '1630' });
    Store.setActiveDay(day.id);
    const snap = Store.snapshot();
    Store.setTitle('Changed');
    Store.addDay({ date: '2026-03-16', startTime: '0700', endTime: '1630' });
    Store.setActiveDay('missing-day');
    assert.equal(Store.getTitle(), 'Changed');
    Store.restore(snap);
    assert.equal(Store.getTitle(), 'Test');
    assert.equal(Store.getActiveDay(), day.id);
    assert.equal(Store.getDays().length, 1);
  });

  it('normalizes persisted days and restores a valid active day', () => {
    Store.reset();
    Store.setActiveDay('stale-day');
    Store.loadPersistedState({
      title: 'Loaded',
      days: [{ id: 'day_1', date: '2026-03-15', startTime: '700', endTime: '1630' }],
      groups: [{ id: 'grp_ops', name: 'Ops' }],
      footer: { contact: 'Wing HQ' },
    });
    const day = Store.getDay('day_1');
    const group = Store.getGroup('grp_ops');
    assert.equal(Store.getTitle(), 'Loaded');
    assert.equal(Store.getActiveDay(), 'day_1');
    assert.equal(day.startTime, '0700');
    assert.deepEqual(day.events, []);
    assert.deepEqual(day.notes, []);
    assert.equal(group.scope, 'limited');
    assert.equal(group.color, DEFAULT_COLOR_PALETTE[0]);
    assert.deepEqual(Store.getFooter(), { contact: 'Wing HQ', poc: '', updated: '' });
  });
});
