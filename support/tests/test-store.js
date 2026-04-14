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

  it('preserves attendees when adding an event', () => {
    Store.reset();
    Store.addDay({ date: '2026-03-15', startTime: '0700', endTime: '1630' });
    const dayId = Store.getDays()[0].id;
    Store.addEvent(dayId, {
      title: 'Weapons Qualification',
      startTime: '0830',
      endTime: '1100',
      groupId: 'grp_chiefs',
      attendees: 'RSO: TSgt Park, Ammo: SrA Bell',
    });
    const events = Store.getEvents(dayId);
    assert.equal(events[0].attendees, 'RSO: TSgt Park, Ammo: SrA Bell');
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
    const snap = Store.snapshot();
    Store.setTitle('Changed');
    assert.equal(Store.getTitle(), 'Changed');
    Store.restore(snap);
    assert.equal(Store.getTitle(), 'Test');
  });

  it('snapshot and restore preserve the active day when it still exists', () => {
    Store.reset();
    const day1 = Store.addDay({ date: '2026-03-15' });
    const day2 = Store.addDay({ date: '2026-03-16' });
    Store.setActiveDay(day2.id);

    const snap = Store.snapshot();
    Store.setActiveDay(day1.id);
    Store.restore(snap);

    assert.equal(Store.getActiveDay(), day2.id);
  });
});
