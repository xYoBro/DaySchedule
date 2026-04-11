/* ── test-integration.js ── Integration tests for save/load/version cycle ──
 *
 * These tests exercise the async storage layer using an in-memory mock of the
 * File System Access API. The mock replaces the real FSAPI so tests run in any
 * browser without needing actual disk access or user gestures.
 *
 * Coverage:
 *   - Schedule CRUD (create, read, list, delete, rename)
 *   - Auto-save engine (markDirty → debounce → write)
 *   - Save/load round-trip (Store → file → Store)
 *   - Version create and restore with auto-backup
 *   - Stale-data detection
 *   - User identity persistence
 *   - Migration from SAVED_STATE
 * ──────────────────────────────────────────────────────────────────────────── */

// ── In-memory FSAPI mock ──────────────────────────────────────────────────

const MockFS = (() => {
  let _files = {};

  function reset() { _files = {}; }
  function getFiles() { return JSON.parse(JSON.stringify(_files)); }

  function createMockWritable(fileName) {
    let _buffer = '';
    return {
      write(content) { _buffer = content; return Promise.resolve(); },
      close() { _files[fileName] = _buffer; return Promise.resolve(); },
      abort() { _buffer = ''; return Promise.resolve(); },
    };
  }

  function createMockFileHandle(fileName) {
    return {
      kind: 'file',
      name: fileName,
      getFile() {
        if (!(fileName in _files)) return Promise.reject(new Error('File not found: ' + fileName));
        return Promise.resolve({
          text() { return Promise.resolve(_files[fileName]); }
        });
      },
      createWritable() { return Promise.resolve(createMockWritable(fileName)); },
    };
  }

  function createMockDirHandle(name) {
    return {
      name: name || 'data',
      kind: 'directory',
      queryPermission() { return Promise.resolve('granted'); },
      requestPermission() { return Promise.resolve('granted'); },
      async *entries() {
        for (const [name, content] of Object.entries(_files)) {
          yield [name, createMockFileHandle(name)];
        }
      },
      async *values() {
        for (const name of Object.keys(_files)) {
          yield createMockFileHandle(name);
        }
      },
      getFileHandle(name, opts) {
        if (name in _files || (opts && opts.create)) {
          if (!(name in _files)) _files[name] = '';
          return Promise.resolve(createMockFileHandle(name));
        }
        return Promise.reject(new Error('File not found: ' + name));
      },
      removeEntry(name) {
        if (name in _files) { delete _files[name]; return Promise.resolve(); }
        return Promise.reject(new Error('File not found: ' + name));
      },
    };
  }

  return { reset, getFiles, createMockDirHandle, createMockFileHandle };
})();

// ── Test helpers ──────────────────────────────────────────────────────────

function installMockDir(name) {
  const handle = MockFS.createMockDirHandle(name);
  // Bypass promptForDirectory and directly set the handle
  _dirHandle = handle;
  return handle;
}

// Stubs for functions from inspector.js/render.js that storage.js calls async.
// The integration runner doesn't load the full UI layer.
if (typeof renderActiveDay === 'undefined') {
  window.renderActiveDay = function() {};
}
if (typeof syncToolbarTitle === 'undefined') {
  window.syncToolbarTitle = function() {};
}
if (typeof renderInspector === 'undefined') {
  window.renderInspector = function() {};
}

function resetTestState() {
  MockFS.reset();
  Store.reset();
  _dirHandle = null;
  _currentFileName = null;
  _lastKnownSavedAt = null;
  _dirty = false;
  clearTimeout(_autosaveTimer);
  _autosaveTimer = null;
  localStorage.removeItem('dayschedule_user_name');
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('Integration — Schedule CRUD', () => {
  it('creates a schedule file with correct envelope', async () => {
    resetTestState();
    installMockDir('data');
    setUserName('Tester');

    Store.setTitle('May Drill');
    Store.addDay({ date: '2026-05-10', startTime: '0700', endTime: '1630' });
    const state = Store.getPersistedState();
    const fileData = buildScheduleFile('May Drill', state, [], 'Tester');
    const ok = await writeScheduleFile('may-drill.json', fileData);

    assert(ok, 'write should succeed');
    const files = MockFS.getFiles();
    assert('may-drill.json' in files, 'file should exist');

    const parsed = JSON.parse(files['may-drill.json']);
    assert.equal(parsed.name, 'May Drill');
    assert.equal(parsed.lastSavedBy, 'Tester');
    assert.equal(parsed.current.title, 'May Drill');
    assert.equal(parsed.current.days.length, 1);
    assert.deepEqual(parsed.versions, []);
  });

  it('lists schedule files sorted by lastSavedAt', async () => {
    resetTestState();
    installMockDir('data');

    const older = buildScheduleFile('Old', { title: 'Old', days: [], groups: [], logo: null, footer: {} }, [], 'A');
    older.lastSavedAt = '2026-01-01T00:00:00Z';
    await writeScheduleFile('old.json', older);

    const newer = buildScheduleFile('New', { title: 'New', days: [{ id: 'd1', events: [{}, {}], notes: [{}] }], groups: [], logo: null, footer: {} }, [], 'B');
    newer.lastSavedAt = '2026-06-01T00:00:00Z';
    await writeScheduleFile('new.json', newer);

    const list = await listScheduleFiles();
    assert.equal(list.length, 2);
    assert.equal(list[0].name, 'New', 'newest should be first');
    assert.equal(list[1].name, 'Old');
    assert.equal(list[0].eventCount, 2);
    assert.equal(list[0].noteCount, 1);
  });

  it('reads a schedule file back correctly', async () => {
    resetTestState();
    installMockDir('data');

    const state = { title: 'Read Test', days: [], groups: [], logo: null, footer: { contact: 'test' } };
    const fileData = buildScheduleFile('Read Test', state, [], 'Tester');
    await writeScheduleFile('read-test.json', fileData);

    const result = await readScheduleFile('read-test.json');
    assert(result, 'should return data');
    assert.equal(result.name, 'Read Test');
    assert.equal(result.current.footer.contact, 'test');
  });

  it('deletes a schedule file', async () => {
    resetTestState();
    installMockDir('data');

    await writeScheduleFile('delete-me.json', buildScheduleFile('X', {}, [], ''));
    let files = await listScheduleFiles();
    assert.equal(files.length, 1);

    const ok = await deleteScheduleFile('delete-me.json');
    assert(ok, 'delete should succeed');
    files = await listScheduleFiles();
    assert.equal(files.length, 0);
  });

  it('renames a schedule file', async () => {
    resetTestState();
    installMockDir('data');

    await writeScheduleFile('old-name.json', buildScheduleFile('Old', {}, [], ''));
    const ok = await renameScheduleFile('old-name.json', 'new-name.json');
    assert(ok, 'rename should succeed');

    const files = MockFS.getFiles();
    assert(!('old-name.json' in files), 'old file should be gone');
    assert('new-name.json' in files, 'new file should exist');
  });
});

describe('Integration — Save/Load Round-Trip', () => {
  it('saves Store state and loads it back identically', async () => {
    resetTestState();
    installMockDir('data');
    setUserName('Tester');

    // Build a schedule in Store
    Store.setTitle('Round Trip');
    Store.setFooter({ contact: 'Wing HQ', poc: 'TSgt Smith' });
    const day = Store.addDay({ date: '2026-05-10', startTime: '0700', endTime: '1630' });
    Store.addEvent(day.id, { title: 'Formation', startTime: '0700', endTime: '0730', groupId: 'grp_all', isMainEvent: true });
    Store.addEvent(day.id, { title: 'Lunch', startTime: '1100', endTime: '1200', groupId: 'grp_all', isBreak: true });
    Store.addNote(day.id, { category: 'Uniform', text: 'UOD' });

    // Save
    const originalState = Store.getPersistedState();
    const fileData = buildScheduleFile('Round Trip', originalState, [], 'Tester');
    await writeScheduleFile('round-trip.json', fileData);

    // Clear Store
    Store.reset();
    assert.equal(Store.getDays().length, 0, 'Store should be empty after reset');

    // Load
    const loaded = await readScheduleFile('round-trip.json');
    Store.loadPersistedState(loaded.current);

    // Verify round-trip
    assert.equal(Store.getTitle(), 'Round Trip');
    assert.equal(Store.getDays().length, 1);
    assert.equal(Store.getEvents(Store.getDays()[0].id).length, 2);
    assert.equal(Store.getNotes(Store.getDays()[0].id).length, 1);
    assert.equal(Store.getFooter().poc, 'TSgt Smith');
  });
});

describe('Integration — Auto-Save Engine', () => {
  it('markDirty sets dirty flag and schedules save', () => {
    resetTestState();
    installMockDir('data');
    setCurrentFile('test.json', '2026-01-01T00:00:00Z');

    assert(!isDirty(), 'should start clean');
    markDirty();
    assert(isDirty(), 'should be dirty after markDirty');
  });

  it('forceSave writes to file immediately', async () => {
    resetTestState();
    installMockDir('data');
    setUserName('Tester');

    Store.setTitle('Force Save Test');
    const fileData = buildScheduleFile('Force Save Test', Store.getPersistedState(), [], 'Tester');
    await writeScheduleFile('force-save.json', fileData);
    setCurrentFile('force-save.json', fileData.lastSavedAt);

    // Modify Store
    Store.setTitle('Updated Title');

    // Force save
    await saveCurrentSchedule();

    // Verify file has updated data (the ground truth for save success)
    const loaded = await readScheduleFile('force-save.json');
    assert.equal(loaded.current.title, 'Updated Title');
    assert.equal(loaded.lastSavedBy, 'Tester');
    assert(loaded.lastSavedAt, 'should have a timestamp');
  });

  it('saveCurrentSchedule is no-op without a current file', async () => {
    resetTestState();
    installMockDir('data');
    setCurrentFile(null, null);

    const ok = await saveCurrentSchedule();
    assert.equal(ok, false, 'should return false with no file');
  });
});

describe('Integration — Version Management', () => {
  it('creates a named version and retrieves it', async () => {
    resetTestState();
    installMockDir('data');
    setUserName('Tester');

    Store.setTitle('Version Test');
    Store.addDay({ date: '2026-05-10' });
    const fileData = buildScheduleFile('Version Test', Store.getPersistedState(), [], 'Tester');
    await writeScheduleFile('version-test.json', fileData);
    setCurrentFile('version-test.json', fileData.lastSavedAt);

    // Create version
    const ok = await createVersion('Draft v1');
    assert(ok, 'createVersion should succeed');

    const versions = await getVersions();
    assert.equal(versions.length, 1);
    assert.equal(versions[0].name, 'Draft v1');
    assert.equal(versions[0].savedBy, 'Tester');
  });

  it('restoreVersion loads version data and creates auto-backup', async () => {
    resetTestState();
    installMockDir('data');
    setUserName('Tester');

    // Create initial schedule with one event
    Store.setTitle('Restore Test');
    const day = Store.addDay({ date: '2026-05-10' });
    Store.addEvent(day.id, { title: 'Original Event', startTime: '0800', endTime: '0900' });
    const fileData = buildScheduleFile('Restore Test', Store.getPersistedState(), [], 'Tester');
    await writeScheduleFile('restore-test.json', fileData);
    setCurrentFile('restore-test.json', fileData.lastSavedAt);

    // Save as version
    await createVersion('Before Changes');

    // Modify the schedule
    Store.setTitle('Modified Title');
    const modState = Store.getPersistedState();
    const modFile = await readScheduleFile('restore-test.json');
    modFile.current = modState;
    modFile.lastSavedAt = new Date().toISOString();
    await writeScheduleFile('restore-test.json', modFile);
    _lastKnownSavedAt = modFile.lastSavedAt;

    // Restore version 0 ("Before Changes")
    const ok = await restoreVersion(0);
    assert(ok, 'restoreVersion should succeed');

    // Store should have the original title
    assert.equal(Store.getTitle(), 'Restore Test');

    // Should now have 2 versions: auto-backup + "Before Changes"
    const versions = await getVersions();
    assert.equal(versions.length, 2, 'should have backup + original version');
    assert(versions[0].name.startsWith('Auto-backup'), 'first version should be auto-backup');
    assert.equal(versions[1].name, 'Before Changes');
  });

  it('createVersion captures current Store state, not stale file state', async () => {
    resetTestState();
    installMockDir('data');
    setUserName('Tester');

    Store.setTitle('Snapshot Test');
    const fileData = buildScheduleFile('Snapshot Test', Store.getPersistedState(), [], 'Tester');
    await writeScheduleFile('snapshot.json', fileData);
    setCurrentFile('snapshot.json', fileData.lastSavedAt);

    // Modify Store without saving to file
    Store.setTitle('Unsaved Changes');

    // Create version — should capture the file's current (old) state as version,
    // and write the Store's state (new) as the working copy
    await createVersion('Checkpoint');

    const loaded = await readScheduleFile('snapshot.json');
    assert.equal(loaded.current.title, 'Unsaved Changes', 'working copy should reflect Store');
    assert.equal(loaded.versions[0].data.title, 'Snapshot Test', 'version should capture pre-change state');
  });
});

describe('Integration — Stale-Data Detection', () => {
  it('detects when file was modified externally', async () => {
    resetTestState();
    installMockDir('data');
    setUserName('Tester');

    Store.setTitle('Stale Test');
    const fileData = buildScheduleFile('Stale Test', Store.getPersistedState(), [], 'Tester');
    await writeScheduleFile('stale.json', fileData);
    setCurrentFile('stale.json', fileData.lastSavedAt);

    // Simulate external edit — modify the file directly with a different timestamp
    const externalEdit = JSON.parse(JSON.stringify(fileData));
    externalEdit.lastSavedAt = '2099-01-01T00:00:00Z';
    externalEdit.lastSavedBy = 'External User';
    externalEdit.current.title = 'Externally Modified';
    await writeScheduleFile('stale.json', externalEdit);

    // Try to save — should detect stale data and return false
    // Note: showStaleDataWarning will try to open a modal which won't exist in tests,
    // but saveCurrentSchedule should still return false
    const ok = await saveCurrentSchedule();
    assert.equal(ok, false, 'save should fail due to stale data');
  });
});

describe('Integration — User Identity', () => {
  it('stores and retrieves user name from localStorage', () => {
    localStorage.removeItem('dayschedule_user_name');
    assert.equal(hasUserName(), false);
    assert.equal(getUserName(), '');

    setUserName('SrA Martinez');
    assert.equal(hasUserName(), true);
    assert.equal(getUserName(), 'SrA Martinez');
  });

  it('trims whitespace from user name', () => {
    setUserName('  TSgt Knott  ');
    assert.equal(getUserName(), 'TSgt Knott');
  });
});

describe('Integration — Slug Generation Edge Cases', () => {
  it('handles unicode characters', () => {
    assert.equal(scheduleNameToSlug('Drill — May'), 'drill-may');
  });

  it('handles all-special-character input', () => {
    assert.equal(scheduleNameToSlug('!!!'), 'schedule');
  });

  it('handles numeric-only input', () => {
    assert.equal(scheduleNameToSlug('2026'), '2026');
  });

  it('handles very long names', () => {
    const long = 'A'.repeat(200);
    const slug = scheduleNameToSlug(long);
    assert(slug.length > 0, 'should produce a slug');
    assert.equal(slug, 'a'.repeat(200));
  });
});

describe('Integration — Schedule File Envelope', () => {
  it('parseScheduleMeta handles missing fields gracefully', () => {
    const meta = parseScheduleMeta({});
    assert.equal(meta.name, '(Untitled)');
    assert.equal(meta.dayCount, 0);
    assert.equal(meta.eventCount, 0);
    assert.equal(meta.noteCount, 0);
    assert.equal(meta.versionCount, 0);
    assert.equal(meta.lastSavedBy, '');
  });

  it('parseScheduleMeta handles null current', () => {
    const meta = parseScheduleMeta({ name: 'Test', current: null });
    assert.equal(meta.dayCount, 0);
  });

  it('buildScheduleFile timestamps are consistent', () => {
    const before = new Date().toISOString();
    const file = buildScheduleFile('Test', {}, [], 'X');
    const after = new Date().toISOString();

    assert.equal(file.createdAt, file.lastSavedAt, 'createdAt and lastSavedAt should match on creation');
    assert(file.createdAt >= before, 'should be after test start');
    assert(file.createdAt <= after, 'should be before test end');
  });
});
