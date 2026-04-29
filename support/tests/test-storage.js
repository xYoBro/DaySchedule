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

describe('Persistence — .schedule workbook format', () => {
  function makeWorkbookFixture() {
    const state = {
      title: 'Workbook Drill',
      days: [{
        id: 'day_workbook',
        date: '2026-07-11',
        startTime: '0700',
        endTime: '1630',
        events: [{
          id: 'evt_workbook',
          title: 'Workbook Brief',
          startTime: '0900',
          endTime: '1000',
          groupId: 'grp_all',
          isMainEvent: true,
        }],
        notes: [],
      }],
      groups: DEFAULT_GROUPS,
      logo: null,
      footer: { contact: '', poc: '', updated: '' },
      activeDay: 'day_workbook',
      theme: { skin: 'grid', palette: 'airforce', customColors: null },
    };
    const fileData = buildScheduleFile('Workbook Drill', state, [{ name: 'Baseline', data: state }], 'Tester');
    fileData.theme = state.theme;
    return { state, fileData };
  }

  it('serializes a full schedule envelope into a .schedule workbook object', () => {
    const fixture = makeWorkbookFixture();
    const content = buildScheduleWorkbookContent(fixture.fileData);
    const parsedJson = JSON.parse(content);

    assert.equal(parsedJson.fileType, 'dayschedule');
    assert.equal(parsedJson.schemaVersion, 1);
    assert.equal(parsedJson.schedule.name, 'Workbook Drill');
    assert.equal(parsedJson.schedule.versions.length, 1);
    assert.equal(parsedJson.schedule.theme.skin, 'grid');
  });

  it('parses .schedule files without dropping theme, versions, or active day', () => {
    const fixture = makeWorkbookFixture();
    const parsed = parseScheduleWorkbookContent(buildScheduleWorkbookContent(fixture.fileData), 'workbook.schedule');

    assert.equal(parsed.kind, 'schedule-workbook');
    assert.equal(parsed.sourceFormat, 'schedule');
    assert.equal(parsed.state.title, 'Workbook Drill');
    assert.equal(parsed.state.activeDay, 'day_workbook');
    assert.equal(parsed.fileData.versions[0].name, 'Baseline');
    assert.equal(parsed.fileData.theme.palette, 'airforce');
  });

  it('parses legacy SAVED_STATE wrappers with trailing JavaScript safely', () => {
    const fixture = makeWorkbookFixture();
    const content = 'window.SAVED_STATE = ' + JSON.stringify(fixture.state) + ';\nwindow.after = true;';
    const parsed = parseScheduleWorkbookContent(content, 'scheduledata.js');

    assert.equal(parsed.kind, 'schedule-state');
    assert.equal(parsed.sourceFormat, 'saved-state-js');
    assert.equal(parsed.state.days.length, 1);
    assert.equal(parsed.state.days[0].events[0].title, 'Workbook Brief');
  });

  it('rejects workbook files with no valid days', () => {
    assert.throws(() => {
      parseScheduleWorkbookContent(JSON.stringify({
        fileType: 'dayschedule',
        schemaVersion: 1,
        schedule: { current: { title: 'Broken', days: [], groups: [] } },
      }), 'broken.schedule');
    });
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
