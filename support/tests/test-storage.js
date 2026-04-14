describe('Storage — slug generation', () => {
  it('converts name to lowercase hyphenated slug', () => {
    assert.equal(scheduleNameToSlug('May Drill'), 'may-drill');
  });

  it('strips special characters', () => {
    assert.equal(scheduleNameToSlug('April RSD (2026)'), 'april-rsd-2026');
  });

  it('collapses multiple hyphens', () => {
    assert.equal(scheduleNameToSlug('June - - Drill'), 'june-drill');
  });

  it('trims leading/trailing hyphens', () => {
    assert.equal(scheduleNameToSlug('  May Drill  '), 'may-drill');
  });

  it('returns fallback for empty string', () => {
    assert.equal(scheduleNameToSlug(''), 'schedule');
  });
});

describe('Storage — buildScheduleFile', () => {
  it('wraps Store state in schedule envelope', () => {
    const state = { title: 'Test', days: [], groups: [], logo: null, footer: {} };
    const file = buildScheduleFile('Test Schedule', state, [], 'Tester');
    assert.equal(file.name, 'Test Schedule');
    assert.deepEqual(file.current, state);
    assert.deepEqual(file.versions, []);
    assert.equal(file.lastSavedBy, 'Tester');
    assert(file.lastSavedAt, 'should have timestamp');
    assert(file.createdAt, 'should have createdAt');
    assert.equal(file.activity.length, 1);
    assert.equal(file.activity[0].type, 'created');
    assert.equal(file.activity[0].user, 'Tester');
  });
});

describe('Storage — parseScheduleMeta', () => {
  it('extracts metadata without full data load', () => {
    const file = {
      name: 'May Drill',
      createdAt: '2026-04-05T09:00:00Z',
      lastSavedBy: 'Tester',
      lastSavedAt: '2026-04-10T14:00:00Z',
      current: {
        title: 'May Drill',
        days: [{ id: 'd1', events: [{}, {}, {}], notes: [{}] }, { id: 'd2', events: [{}, {}], notes: [] }],
        groups: [], logo: null, footer: {}
      },
      versions: [{ name: 'v1' }]
    };
    const meta = parseScheduleMeta(file);
    assert.equal(meta.name, 'May Drill');
    assert.equal(meta.dayCount, 2);
    assert.equal(meta.eventCount, 5);
    assert.equal(meta.noteCount, 1);
    assert.equal(meta.versionCount, 1);
    assert.equal(meta.lastSavedBy, 'Tester');
  });
});
