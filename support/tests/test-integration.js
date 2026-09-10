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
  // Overwrites a file with raw (typically invalid) content so tests can
  // simulate "exists but unreadable" without going through writeScheduleFile.
  function corruptFile(fileName, content) {
    _files[fileName] = content !== undefined ? content : '{corrupt';
  }

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

  return { reset, getFiles, corruptFile, createMockDirHandle, createMockFileHandle };
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
if (typeof getCurrentScheduleFileData === 'undefined') {
  window.getCurrentScheduleFileData = function() { return null; };
}

function resetTestState() {
  MockFS.reset();
  Store.reset();
  discardSessionDraft();
  clearScheduleWorkbookTarget();
  clearUndoHistory();
  _editSequence = 0;
  _savedEditSequence = 0;
  _workbookSavePromise = null;
  _legacySavePromise = null;
  _versionPersistencePromise = null;
  _saveInProgress = false;
  _navigationSaving = false;
  _autosaveFailureNotified = false;
  _recoveryUnavailableNotified = false;
  _dirHandle = null;
  _currentFileName = null;
  _lastKnownSavedAt = null;
  _dirty = false;
  _currentScheduleLock = null;
  _editorReadOnly = true;
  clearTimeout(_autosaveTimer);
  _autosaveTimer = null;
  clearTimeout(_lockRefreshTimer);
  _lockRefreshTimer = null;
  localStorage.removeItem('dayschedule_user_name');
  localStorage.removeItem('dayschedule_help_seen');
  localStorage.removeItem('dayschedule_help_coachmark_dismissed');
  sessionStorage.removeItem(LOCK_SESSION_KEY);
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

  it('ignores lock files when listing schedules', async () => {
    resetTestState();
    installMockDir('data');

    const fileData = buildScheduleFile('Lock Test', { title: 'Lock Test', days: [], groups: [], logo: null, footer: {} }, [], 'A');
    await writeScheduleFile('lock-test.json', fileData);
    await writeScheduleFile('lock-test.lock.json', {
      scheduleFile: 'lock-test.json',
      ownerName: 'Other',
      sessionId: 'other-session',
      token: 'token_1',
      acquiredAt: '2026-01-01T00:00:00Z',
      refreshedAt: '2026-01-01T00:00:00Z',
      expiresAt: '2099-01-01T00:00:00Z',
    });

    const list = await listScheduleFiles();
    assert.equal(list.length, 1, 'lock file should not appear as a schedule');
    assert.equal(list[0].fileName, 'lock-test.json');
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
  it('treats schedules without a current file as locally editable', () => {
    resetTestState();
    assert.equal(isCurrentScheduleEditable(), true, 'manual mode should remain editable');
  });

  it('markDirty sets dirty flag and schedules save', async () => {
    resetTestState();
    installMockDir('data');
    setUserName('Tester');
    setCurrentFile('test.json', '2026-01-01T00:00:00Z');
    await claimCurrentScheduleLock({ silent: true });

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
    await claimCurrentScheduleLock({ silent: true });

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

describe('Integration — Edit Locks', () => {
  it('claims a lock for the current session', async () => {
    resetTestState();
    installMockDir('data');
    setUserName('Tester');

    const fileData = buildScheduleFile('Lockable', Store.getPersistedState(), [], 'Tester');
    await writeScheduleFile('lockable.json', fileData);
    setCurrentFile('lockable.json', fileData.lastSavedAt);

    const result = await claimCurrentScheduleLock({ silent: true });
    assert.equal(result.ok, true, 'lock claim should succeed');
    assert.equal(isCurrentScheduleEditable(), true, 'current schedule should become editable');

    const files = MockFS.getFiles();
    assert('lockable.lock.json' in files, 'lock file should be written');

    const status = await getScheduleLockStatus('lockable.json');
    assert.equal(status.state, 'mine');
    assert.equal(status.lock.ownerName, 'Tester');
  });

  it('reports another active lock as read-only', async () => {
    resetTestState();
    installMockDir('data');

    const fileData = buildScheduleFile('Locked', Store.getPersistedState(), [], 'Tester');
    await writeScheduleFile('locked.json', fileData);
    await writeScheduleFile('locked.lock.json', {
      scheduleFile: 'locked.json',
      ownerName: 'Other User',
      sessionId: 'other-session',
      token: 'token_2',
      acquiredAt: '2026-01-01T00:00:00Z',
      refreshedAt: '2026-01-01T00:00:00Z',
      expiresAt: '2099-01-01T00:00:00Z',
    });

    const status = await getScheduleLockStatus('locked.json');
    assert.equal(status.state, 'locked');
    assert.equal(status.lock.ownerName, 'Other User');
  });

  it('treats expired locks as available', async () => {
    resetTestState();
    installMockDir('data');

    const fileData = buildScheduleFile('Expired', Store.getPersistedState(), [], 'Tester');
    await writeScheduleFile('expired.json', fileData);
    await writeScheduleFile('expired.lock.json', {
      scheduleFile: 'expired.json',
      ownerName: 'Old Editor',
      sessionId: 'other-session',
      token: 'token_3',
      acquiredAt: '2026-01-01T00:00:00Z',
      refreshedAt: '2026-01-01T00:00:00Z',
      expiresAt: '2000-01-01T00:00:00Z',
    });

    const status = await getScheduleLockStatus('expired.json');
    assert.equal(status.state, 'available');
  });

  it('releases the current lock file', async () => {
    resetTestState();
    installMockDir('data');
    setUserName('Tester');

    const fileData = buildScheduleFile('Release', Store.getPersistedState(), [], 'Tester');
    await writeScheduleFile('release.json', fileData);
    setCurrentFile('release.json', fileData.lastSavedAt);
    await claimCurrentScheduleLock({ silent: true });

    const ok = await releaseCurrentScheduleLock();
    assert.equal(ok, true, 'release should succeed');
    assert.equal(isCurrentScheduleEditable(), false, 'current schedule should return to read-only');

    const files = MockFS.getFiles();
    assert(!('release.lock.json' in files), 'lock file should be removed');
  });

  it('allows a lead to take over another active lock', async () => {
    resetTestState();
    installMockDir('data');
    setUserName('Lead Editor');

    const fileData = buildScheduleFile('Takeover', Store.getPersistedState(), [], 'Tester');
    await writeScheduleFile('takeover.json', fileData);
    await writeScheduleFile('takeover.lock.json', {
      scheduleFile: 'takeover.json',
      ownerName: 'Original Editor',
      sessionId: 'other-session',
      token: 'token_4',
      acquiredAt: '2026-01-01T00:00:00Z',
      refreshedAt: '2026-01-01T00:00:00Z',
      expiresAt: '2099-01-01T00:00:00Z',
    });
    setCurrentFile('takeover.json', fileData.lastSavedAt);

    const result = await takeOverCurrentScheduleLock({ confirmed: true, silent: true });
    assert.equal(result.ok, true, 'takeover should succeed');
    assert.equal(isCurrentScheduleEditable(), true, 'current session should become editable');

    const status = await getScheduleLockStatus('takeover.json');
    assert.equal(status.state, 'mine');
    assert.equal(status.lock.ownerName, 'Lead Editor');
    assert(status.lock.token !== 'token_4', 'lock token should be replaced');

    const activity = await getRecentActivity();
    assert.equal(activity[0].text, 'Took over edit lock from Original Editor');
    assert.equal(activity[0].user, 'Lead Editor');
  });

  it('blocks saving after another editor takes over the lock', async () => {
    resetTestState();
    installMockDir('data');
    setUserName('Original Editor');

    Store.setTitle('Ownership Test');
    const fileData = buildScheduleFile('Ownership Test', Store.getPersistedState(), [], 'Original Editor');
    await writeScheduleFile('ownership.json', fileData);
    setCurrentFile('ownership.json', fileData.lastSavedAt);
    await claimCurrentScheduleLock({ silent: true });

    Store.setTitle('Local Unsaved Change');
    await writeScheduleFile('ownership.lock.json', {
      scheduleFile: 'ownership.json',
      ownerName: 'Lead Editor',
      sessionId: 'other-session',
      token: 'token_5',
      acquiredAt: '2026-01-01T00:00:00Z',
      refreshedAt: '2026-01-01T00:00:00Z',
      expiresAt: '2099-01-01T00:00:00Z',
    });

    const ok = await saveCurrentSchedule();
    assert.equal(ok, false, 'save should fail after takeover');
    assert.equal(isCurrentScheduleEditable(), false, 'tab should switch to read-only');

    const loaded = await readScheduleFile('ownership.json');
    assert.equal(loaded.current.title, 'Ownership Test', 'taken-over tab should not overwrite the file');
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
    await claimCurrentScheduleLock({ silent: true });

    // Create version
    const ok = await createVersion('Draft v1');
    assert(ok, 'createVersion should succeed');

    const versions = await getVersions();
    assert.equal(versions.length, 1);
    assert.equal(versions[0].name, 'Draft v1');
    assert.equal(versions[0].savedBy, 'Tester');

    const activity = await getRecentActivity();
    assert.equal(activity[0].text, 'Saved version "Draft v1"');
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
    await claimCurrentScheduleLock({ silent: true });

    // Save as version
    await createVersion('Before Changes');

    // Modify the working copy in memory without saving it to disk
    Store.setTitle('Modified Title');

    // Restore version 0 ("Before Changes")
    const ok = await restoreVersion(0);
    assert(ok, 'restoreVersion should succeed');

    // Store should have the original title
    assert.equal(Store.getTitle(), 'Restore Test');

    // Should now have 2 versions: auto-backup + "Before Changes"
    const versions = await getVersions();
    const loaded = await readScheduleFile('restore-test.json');
    assert.equal(versions.length, 2, 'should have backup + original version');
    assert(versions[0].name.startsWith('Auto-backup'), 'first version should be auto-backup');
    assert.equal(loaded.versions[0].data.title, 'Modified Title', 'auto-backup should capture the unsaved working copy');
    assert.equal(versions[1].name, 'Before Changes');

    const activity = await getRecentActivity();
    assert.equal(activity[0].text, 'Restored version "Before Changes"');
  });

  it('createVersion captures current Store state, not stale file state', async () => {
    resetTestState();
    installMockDir('data');
    setUserName('Tester');

    Store.setTitle('Snapshot Test');
    const fileData = buildScheduleFile('Snapshot Test', Store.getPersistedState(), [], 'Tester');
    await writeScheduleFile('snapshot.json', fileData);
    setCurrentFile('snapshot.json', fileData.lastSavedAt);
    await claimCurrentScheduleLock({ silent: true });

    // Modify Store without saving to file
    Store.setTitle('Unsaved Changes');

    // Create version — both the saved version and working copy should capture the in-memory Store state
    await createVersion('Checkpoint');

    const loaded = await readScheduleFile('snapshot.json');
    assert.equal(loaded.current.title, 'Unsaved Changes', 'working copy should reflect Store');
    assert.equal(loaded.versions[0].data.title, 'Unsaved Changes', 'version should capture the current Store state');
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
    await claimCurrentScheduleLock({ silent: true });

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

describe('Integration — Theme System', () => {
  it('getScheduleTheme returns defaults for undefined', () => {
    const theme = getScheduleTheme(undefined);
    assert.equal(theme.skin, 'bands');
    assert.equal(theme.palette, 'classic');
    assert.equal(theme.customColors, null);
  });

  it('getScheduleTheme preserves provided values', () => {
    const theme = getScheduleTheme({ skin: 'grid', palette: 'ocp', customColors: { accent: '#ff0000' } });
    assert.equal(theme.skin, 'grid');
    assert.equal(theme.palette, 'ocp');
    assert.equal(theme.customColors.accent, '#ff0000');
  });

  it('applyPalette sets CSS variables on root', () => {
    applyPalette('darkops', null);
    const root = document.documentElement;
    assert.equal(root.style.getPropertyValue('--sch-bg'), '#1a1a2e');
    assert.equal(root.style.getPropertyValue('--sch-accent'), '#5b8def');
    // Reset
    applyPalette('classic', null);
  });

  it('applyPalette applies custom color overrides', () => {
    applyPalette('classic', { accent: '#ff0000' });
    const root = document.documentElement;
    assert.equal(root.style.getPropertyValue('--sch-accent'), '#ff0000');
    assert.equal(root.style.getPropertyValue('--sch-bg'), '#ffffff');
    applyPalette('classic', null);
  });

  it('editor theme persists to localStorage', () => {
    applyEditorTheme('dark');
    assert.equal(getEditorTheme(), 'dark');
    assert.equal(document.body.getAttribute('data-editor-theme'), 'dark');
    applyEditorTheme('light');
    assert.equal(getEditorTheme(), 'light');
  });

  it('SKIN_NAMES has all 4 skins', () => {
    assert.equal(SKIN_NAMES.length, 4);
    assert(SKIN_NAMES.includes('bands'));
    assert(SKIN_NAMES.includes('grid'));
    assert(SKIN_NAMES.includes('cards'));
    assert(SKIN_NAMES.includes('phases'));
  });

  it('all palettes have required color keys', () => {
    const keys = ['bg', 'text', 'textSecondary', 'textMuted', 'accent', 'accentSecondary', 'accentTertiary', 'border', 'surface'];
    PALETTE_NAMES.forEach(name => {
      keys.forEach(key => {
        assert(PALETTES[name][key] !== undefined, name + ' missing ' + key);
      });
    });
  });
});

describe('Integration — Workbook Versions (no directory)', () => {
  function installWorkbookFileData() {
    const fileData = {
      name: Store.getTitle() || 'Workbook Test',
      current: Store.getPersistedState(),
      versions: [],
      activity: [],
      lastSavedAt: '2026-05-01T00:00:00.000Z',
    };
    window.getCurrentScheduleFileData = function() { return fileData; };
    return fileData;
  }
  function removeWorkbookFileData() {
    window.getCurrentScheduleFileData = function() { return null; };
  }

  it('createVersion works in the primary workbook flow', async () => {
    resetTestState();
    setUserName('Tester');
    Store.setTitle('Workbook Versions');
    Store.addDay({ date: '2026-05-10' });
    const fileData = installWorkbookFileData();

    const ok = await createVersion('Draft v1');
    assert(ok, 'createVersion should succeed in workbook mode');
    assert.equal(fileData.versions.length, 1);
    assert.equal(fileData.versions[0].name, 'Draft v1');

    const versions = await getVersions();
    assert.equal(versions.length, 1);
    assert.equal(versions[0].name, 'Draft v1');

    const activity = await getRecentActivity();
    assert.equal(activity[0].text, 'Saved version "Draft v1"');

    removeWorkbookFileData();
  });

  it('restoreVersion restores data and creates an auto-backup in workbook mode', async () => {
    resetTestState();
    setUserName('Tester');
    Store.setTitle('Original Title');
    Store.addDay({ date: '2026-05-10' });
    const fileData = installWorkbookFileData();

    await createVersion('Checkpoint');
    Store.setTitle('Changed Title');

    const ok = await restoreVersion(0);
    assert(ok, 'restoreVersion should succeed in workbook mode');
    assert.equal(Store.getTitle(), 'Original Title');
    assert.equal(fileData.versions.length, 2, 'auto-backup + checkpoint');
    assert(fileData.versions[0].name.indexOf('Auto-backup') === 0, 'newest version is the auto-backup');

    removeWorkbookFileData();
  });

  it('getLastSavedAt falls back to the workbook envelope', () => {
    resetTestState();
    const fileData = installWorkbookFileData();
    assert.equal(getLastSavedAt(), fileData.lastSavedAt);
    removeWorkbookFileData();
  });
});

describe('Integration — Read-only guards', () => {
  it('undo is blocked while the schedule is read-only', () => {
    resetTestState();
    clearUndoHistory();
    Store.setTitle('First');
    saveUndoState();
    _undoPending = false;
    Store.setTitle('Second');

    _currentFileName = 'locked.json';
    _editorReadOnly = true;
    undo();
    assert.equal(Store.getTitle(), 'Second', 'undo must not mutate a read-only schedule');

    _currentFileName = null;
    clearUndoHistory();
  });
});

describe('Integration — Core event flow (create → edit → delete)', () => {
  it('round-trips create, edit, and delete through file save/load', async () => {
    resetTestState();
    installMockDir('data');
    setUserName('Tester');

    Store.setTitle('Flow Test');
    const day = Store.addDay({ date: '2026-06-01' });
    Store.addEvent(day.id, { title: 'Briefing', startTime: '0800', endTime: '0900' });
    const fileData = buildScheduleFile('Flow Test', Store.getPersistedState(), [], 'Tester');
    await writeScheduleFile('flow-test.json', fileData);
    setCurrentFile('flow-test.json', fileData.lastSavedAt);
    await claimCurrentScheduleLock({ silent: true });

    const evtId = Store.getEvents(day.id)[0].id;
    Store.updateEvent(day.id, evtId, { title: 'Morning Briefing', endTime: '0930' });
    assert(await saveCurrentSchedule(), 'save after edit should succeed');
    let onDisk = await readScheduleFile('flow-test.json');
    assert.equal(onDisk.current.days[0].events[0].title, 'Morning Briefing');
    assert.equal(onDisk.current.days[0].events[0].endTime, '0930');

    Store.removeEvent(day.id, evtId);
    assert(await saveCurrentSchedule(), 'save after delete should succeed');
    onDisk = await readScheduleFile('flow-test.json');
    assert.equal(onDisk.current.days[0].events.length, 0);
  });

  it('pauses the save when the file exists but is unreadable, preserving it', async () => {
    resetTestState();
    installMockDir('data');
    setUserName('Tester');

    Store.setTitle('Guard Test');
    Store.addDay({ date: '2026-06-01' });
    const fileData = buildScheduleFile('Guard Test', Store.getPersistedState(), [], 'Tester');
    await writeScheduleFile('guard-test.json', fileData);
    setCurrentFile('guard-test.json', fileData.lastSavedAt);
    await claimCurrentScheduleLock({ silent: true });

    MockFS.corruptFile('guard-test.json');
    _dirty = true;
    const ok = await saveCurrentSchedule();
    assert.equal(ok, false, 'save must pause instead of rebuilding the file');
    assert.equal(MockFS.getFiles()['guard-test.json'], '{corrupt', 'unreadable file must not be overwritten');
  });
});

describe('Integration — cleared title never writes a nameless file', () => {
  it('falls back to the existing file name when the title is blank', async () => {
    resetTestState();
    installMockDir('data');
    setUserName('Tester');
    Store.setTitle('Named Schedule');
    Store.addDay({ date: '2026-06-01' });
    const fileData = buildScheduleFile('Named Schedule', Store.getPersistedState(), [], 'Tester');
    await writeScheduleFile('named.json', fileData);
    setCurrentFile('named.json', fileData.lastSavedAt);
    await claimCurrentScheduleLock({ silent: true });

    Store.setTitle('   ');
    assert(await saveCurrentSchedule(), 'save should still succeed');
    const onDisk = await readScheduleFile('named.json');
    assert.equal(onDisk.name, 'Named Schedule', 'file name must not become blank');
  });
});

describe('Integration — reattaching a remembered handle', () => {
  it('refuses a handle whose file no longer exists', async () => {
    resetTestState();
    const deadHandle = {
      name: 'gone.schedule',
      queryPermission() { return Promise.resolve('granted'); },
      createWritable() { return Promise.resolve({ write() {}, close() {} }); },
      getFile() { return Promise.reject(new Error('NotFoundError')); },
    };
    const ok = await adoptScheduleWorkbookHandle(deadHandle);
    assert.equal(ok, false);
    assert.equal(hasScheduleWorkbookHandle(), false, 'dead handle must not be adopted');
  });
  it('adopts a handle whose file still exists', async () => {
    resetTestState();
    const liveContent = JSON.stringify({ title: 'Live', groups: [], days: [{ id: 'd1', events: [], notes: [] }] });
    const liveHandle = {
      name: 'live.schedule',
      queryPermission() { return Promise.resolve('granted'); },
      createWritable() { return Promise.resolve({ write() {}, close() {} }); },
      getFile() { return Promise.resolve({ name: 'live.schedule', text() { return Promise.resolve(liveContent); } }); },
    };
    const ok = await adoptScheduleWorkbookHandle(liveHandle);
    assert.equal(ok, true);
    clearScheduleWorkbookTarget();
  });
});

describe('Integration — Continue reattach keeps sibling schedules and versions', () => {
  it('brings the whole workbook and the active envelope identity back when a remembered handle is adopted', async () => {
    resetTestState();
    clearScheduleWorkbookTarget();
    Store.setTitle('Alpha');
    Store.addDay({ date: '2026-06-01' });
    window.getCurrentScheduleFileData = function() {
      return { id: 'alpha', name: 'Alpha', current: Store.getPersistedState(), versions: [], activity: [] };
    };
    let captured = null;
    window.setCurrentScheduleFileData = function(d) { captured = d; };
    const file = {
      fileType: 'dayschedule', schemaVersion: 1, activeScheduleId: 'alpha',
      schedules: [
        { id: 'alpha', name: 'Alpha', current: { title: 'Alpha', days: [{ id: 'd1', events: [], notes: [] }], groups: [] },
          versions: [{ name: 'V1', savedAt: '2026-01-01T00:00:00Z', data: { title: 'Alpha', days: [] } }], activity: [] },
        { id: 'bravo', name: 'Bravo', current: { title: 'Bravo', days: [{ id: 'd2', events: [], notes: [] }], groups: [] }, versions: [], activity: [] },
        { id: 'charlie', name: 'Charlie', current: { title: 'Charlie', days: [{ id: 'd3', events: [], notes: [] }], groups: [] }, versions: [], activity: [] },
      ],
    };
    const handle = {
      name: 'ops.schedule',
      queryPermission() { return Promise.resolve('granted'); },
      createWritable() { return Promise.resolve({ write() {}, close() {} }); },
      getFile() { return Promise.resolve({ name: 'ops.schedule', text() { return Promise.resolve(JSON.stringify(file)); } }); },
    };
    const ok = await adoptScheduleWorkbookHandle(handle);
    assert(ok, 'adopt should succeed');
    const snapshot = getScheduleWorkbookSnapshot({ includeCurrent: false });
    assert.equal(snapshot.schedules.length, 3, 'sibling schedules must be back in memory');
    assert(captured && captured.id === 'alpha', 'active envelope identity must be restored');
    assert.equal(captured.versions.length, 1, 'named versions must be restored');
    assert.equal(captured.current.title, 'Alpha', 'the draft stays the working content');
    clearScheduleWorkbookTarget();
    window.getCurrentScheduleFileData = function() { return null; };
    delete window.setCurrentScheduleFileData;
  });
});

describe('Integration — opening a file resets undo', () => {
  it('Ctrl+Z right after opening cannot blank the schedule', () => {
    resetTestState();
    clearUndoHistory();
    clearScheduleWorkbookTarget();
    Store.setTitle('Before');
    saveUndoState();
    _undoPending = false;
    const parsed = parseScheduleWorkbookContent(JSON.stringify({
      title: 'Opened', groups: [],
      days: [{ id: 'd', events: [{ title: 'E', startTime: '0800', endTime: '0900' }], notes: [] }],
    }), 'x.json');
    loadParsedScheduleData(parsed);
    undo();
    assert.equal(Store.getTitle(), 'Opened', 'undo must not revert to the pre-open state');
    clearScheduleWorkbookTarget();
    clearUndoHistory();
  });
});

describe('Integration — workbook recovery and save boundaries', () => {
  function workbook() {
    resetTestState();
    clearScheduleWorkbookTarget();
    clearUndoHistory();
    discardSessionDraft();
    let current = null;
    window.getCurrentScheduleFileData = () => current;
    window.setCurrentScheduleFileData = data => { current = data; };
    Store.setTitle('Alpha');
    Store.addDay({ id: 'recovery_day', date: '2026-09-10' });
    current = buildScheduleFile('Alpha', Store.getPersistedState(), [], 'Tester');
    return () => current;
  }

  function delayedHandle() {
    let finish;
    let entered;
    const gate = new Promise(resolve => { finish = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    let content = buildScheduleWorkbookContent();
    const handle = {
      name: 'recovery.schedule',
      queryPermission: async () => 'granted',
      getFile: async () => ({ name: 'recovery.schedule', text: async () => content }),
      createWritable: async () => ({
        write: async text => { entered(); await gate; content = text; },
        close: async () => {},
        abort: async () => {},
      }),
    };
    return { handle, started, finish, read: () => JSON.parse(content) };
  }

  it('recovers every unsaved sibling and named version, including a zero-day active schedule', async () => {
    workbook();
    createScheduleInWorkbook('Bravo');
    await createVersion('Checkpoint');
    await wait(550);
    Store.reset();
    setCurrentScheduleFileData(null);
    clearScheduleWorkbookTarget();
    assert(sessionLoad(), 'recovery should load');
    assert.equal(getScheduleWorkbookEntries().length, 2);
    assert.equal(getCurrentScheduleFileData().versions.length, 1);
    assert(isDirty(), 'recovered uncommitted work must remain dirty');
    discardSessionDraft();
    clearScheduleWorkbookTarget();
  });

  it('new typing after Undo cannot retain the abandoned Redo branch', () => {
    workbook();
    saveUndoState();
    Store.setTitle('Bravo');
    undo();
    saveUndoState();
    Store.setTitle('Charlie');
    redo();
    assert.equal(Store.getTitle(), 'Charlie');
    undo();
    assert.equal(Store.getTitle(), 'Alpha');
    discardSessionDraft();
  });

  it('restores document appearance with a named version', async () => {
    const current = workbook();
    current().theme = { skin: 'bands', palette: 'ocp' };
    await createVersion('Original');
    current().theme = { skin: 'grid', palette: 'classic' };
    await restoreVersion(0);
    assert.equal(current().theme.skin, 'bands');
    assert.equal(current().theme.palette, 'ocp');
    discardSessionDraft();
  });

  it('keeps newer inactive-schedule edits when an older save finishes', async () => {
    workbook();
    createScheduleInWorkbook('Bravo');
    switchScheduleInWorkbook('alpha');
    const mock = delayedHandle();
    const picker = window.showSaveFilePicker;
    const remember = window.saveWorkbookFileRecord;
    window.showSaveFilePicker = async () => mock.handle;
    window.saveWorkbookFileRecord = async () => true;
    try {
      const saving = saveScheduleWorkbookFile({ silent: true });
      await mock.started;
      Store.setTitle('Alpha amended');
      sessionSave();
      switchScheduleInWorkbook('bravo');
      mock.finish();
      await saving;
      const alpha = getScheduleWorkbookSnapshot().schedules.find(item => item.id === 'alpha');
      assert.equal(alpha.current.title, 'Alpha amended');
      assert(isDirty(), 'newer workbook revision is not committed');
    } finally {
      mock.finish();
      window.showSaveFilePicker = picker;
      window.saveWorkbookFileRecord = remember;
      discardSessionDraft();
      clearScheduleWorkbookTarget();
    }
  });

  it('recovers the complete draft from durable storage after the tab backup is gone', async () => {
    workbook();
    createScheduleInWorkbook('Bravo');
    await createVersion('Durable checkpoint');
    assert(await flushSessionBackup());
    sessionStorage.removeItem('schedule_state');
    _lastRecoveryRecord = null;
    Store.reset();
    setCurrentScheduleFileData(null);
    clearScheduleWorkbookTarget();
    assert(await restoreDurableRecovery());
    assert(sessionLoad());
    assert.equal(getScheduleWorkbookEntries().length, 2);
    assert.equal(getCurrentScheduleFileData().versions[0].name, 'Durable checkpoint');
    assert(isDirty());
    await discardSessionDraft();
  });

  it('prefers newer disk data after a clean sequential handoff', async () => {
    workbook();
    let disk = '';
    const handle = {
      name: 'handoff.schedule', queryPermission: async () => 'granted',
      getFile: async () => ({ name: 'handoff.schedule', text: async () => disk }),
      createWritable: async () => ({ write: async text => { disk = text; }, close: async () => {} }),
    };
    const picker = window.showSaveFilePicker;
    const remember = window.saveWorkbookFileRecord;
    window.showSaveFilePicker = async () => handle;
    window.saveWorkbookFileRecord = async () => true;
    try {
      assert(await saveScheduleWorkbookFile({ silent: true }));
      await flushSessionBackup();
      const changed = JSON.parse(disk);
      changed.schedules[0].current.title = 'Teammate final copy';
      changed.schedule = changed.schedules[0];
      disk = JSON.stringify(changed);
      Store.reset();
      setCurrentScheduleFileData(null);
      clearScheduleWorkbookTarget();
      assert(sessionLoad());
      assert(!isDirty(), 'saved baseline survived recovery');
      assert(await adoptScheduleWorkbookHandle(handle));
      assert.equal(Store.getTitle(), 'Teammate final copy');
      Store.setFooter({ contact: 'New phone' });
      sessionSave();
      assert(await saveScheduleWorkbookFile({ silent: true }));
      assert.equal(JSON.parse(disk).schedules[0].current.title, 'Teammate final copy');
    } finally {
      window.showSaveFilePicker = picker;
      window.saveWorkbookFileRecord = remember;
      await discardSessionDraft();
      clearScheduleWorkbookTarget();
    }
  });

  it('keeps both full copies after an unsaved recovery conflicts with disk', async () => {
    workbook();
    createScheduleInWorkbook('Unsaved sibling');
    const latest = buildStandaloneScheduleWorkbookObject(buildScheduleFile('Teammate', {
      title: 'Teammate', days: [], groups: [], logo: null, footer: {},
    }, [], 'Other'));
    const handle = {
      name: 'conflict.schedule', queryPermission: async () => 'granted',
      getFile: async () => ({ name: 'conflict.schedule', text: async () => JSON.stringify(latest) }),
      createWritable: async () => ({}),
    };
    const review = window.reviewWorkbookConflict;
    try {
      window.reviewWorkbookConflict = async () => false;
      assert.equal(await adoptScheduleWorkbookHandle(handle), false);
      assert.equal(getScheduleWorkbookEntries().length, 2, 'cancel leaves the local workbook intact');
      assert.equal(hasScheduleWorkbookHandle(), false, 'cancel cannot attach an overwrite target');
      window.reviewWorkbookConflict = async () => true;
      assert(await adoptScheduleWorkbookHandle(handle));
      const saved = getScheduleWorkbookSnapshot();
      assert.equal(saved.schedules.length, 3, 'latest plus both recovered siblings');
      assert(saved.schedules.some(item => item.current.title === 'Teammate'));
      assert(saved.schedules.some(item => item.current.title === 'Alpha (Recovered)'));
      assert(saved.schedules.some(item => item.current.title === 'Unsaved sibling (Recovered)'));
    } finally {
      window.reviewWorkbookConflict = review;
      await discardSessionDraft();
      clearScheduleWorkbookTarget();
    }
  });

  it('a completed save cannot reattach a previous workbook after Start fresh', async () => {
    workbook();
    const mock = delayedHandle();
    const picker = window.showSaveFilePicker;
    window.showSaveFilePicker = async () => mock.handle;
    try {
      const saving = saveScheduleWorkbookFile({ silent: true });
      await mock.started;
      clearScheduleWorkbookTarget();
      Store.reset();
      Store.setTitle('Fresh');
      setCurrentScheduleFileData(buildScheduleFile('Fresh', Store.getPersistedState(), [], ''));
      sessionSave();
      mock.finish();
      assert.equal(await saving, false);
      assert.equal(hasScheduleWorkbookHandle(), false);
      assert.equal(Store.getTitle(), 'Fresh');
      assert(isDirty());
    } finally {
      mock.finish();
      window.showSaveFilePicker = picker;
      await discardSessionDraft();
      clearScheduleWorkbookTarget();
    }
  });

  it('archives and restores schedules without losing their versions', async () => {
    workbook();
    await createVersion('Keep me');
    createScheduleInWorkbook('Bravo');
    assert(archiveWorkbookSchedule('alpha'));
    assert.equal(getScheduleWorkbookEntries().length, 1);
    assert.equal(getArchivedWorkbookSchedules().length, 1);
    assert.equal(archiveWorkbookSchedule('bravo'), false, 'last schedule remains available');
    assert(restoreArchivedWorkbookSchedule(0));
    assert.equal(getCurrentScheduleFileData().versions[0].name, 'Keep me');
    assert.equal(getArchivedWorkbookSchedules().length, 0);
    await discardSessionDraft();
  });

  it('previews date shifting and clears only selected old details on the copy', () => {
    workbook();
    Store.addDay({ id: 'second_day', date: '2026-09-12' });
    Store.addEvent('recovery_day', { title: 'Brief', startTime: '0800', endTime: '0900', poc: 'Old POC', attendees: 'Old person' });
    Store.addNote('recovery_day', { text: 'Old note' });
    Store.setFooter({ contact: 'Old contact' });
    const options = { duplicate: true, firstDate: '2026-10-03', clearContacts: true, clearNotes: true };
    const preview = previewWorkbookDuplicate('Next drill', options);
    assert.deepEqual(preview.days.map(day => day.to), ['2026-10-03', '2026-10-05']);
    assert.equal(Store.getDays()[0].date, '2026-09-10', 'preview cannot mutate the source');
    createScheduleInWorkbook('Next drill', options);
    assert.equal(Store.getDays()[0].date, '2026-10-03');
    assert.equal(Store.getDays()[0].events[0].poc, '');
    assert.equal(Store.getDays()[0].events[0].attendees, 'Old person');
    assert.equal(Store.getDays()[0].notes.length, 0);
    switchScheduleInWorkbook('alpha');
    assert.equal(Store.getFooter().contact, 'Old contact');
    assert.equal(Store.getDays()[0].notes.length, 1);
    discardSessionDraft();
  });

  it('renames and removes a version without changing current schedule content', async () => {
    workbook();
    await createVersion('First');
    await createVersion('Second');
    assert(await renameVersion(1, 'Baseline'));
    assert.equal((await getVersions())[1].name, 'Baseline');
    assert(await deleteVersion(0));
    assert.equal((await getVersions()).length, 1);
    assert.equal(Store.getTitle(), 'Alpha');
    assert.equal((await getVersions())[0].name, 'Baseline');
    await discardSessionDraft();
  });


  it('keeps legacy edits during a slow read dirty until the newer state is saved', async () => {
    workbook();
    installMockDir();
    setUserName('Tester');
    const file = buildScheduleFile('Alpha', Store.getPersistedState(), [], 'Tester');
    await writeScheduleFile('alpha.json', file);
    setCurrentFile('alpha.json', file.lastSavedAt);
    await claimCurrentScheduleLock({ silent: true });
    let finish;
    let entered;
    const gate = new Promise(resolve => { finish = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    const read = window.readScheduleFile;
    window.readScheduleFile = async (name, options) => {
      if (name === 'alpha.json') { entered(); await gate; }
      return read(name, options);
    };
    try {
      const saving = saveCurrentSchedule();
      await started;
      Store.setTitle('Typed during read');
      sessionSave();
      finish();
      assert(await saving);
      assert(isDirty());
      window.readScheduleFile = read;
      assert(await saveCurrentSchedule());
      assert.equal((await read('alpha.json')).current.title, 'Typed during read');
    } finally {
      finish();
      window.readScheduleFile = read;
      await discardSessionDraft();
    }
  });

  it('a second legacy checkpoint retains a protected checkpoint whose earlier write failed', async () => {
    workbook();
    installMockDir();
    setUserName('Tester');
    const file = buildScheduleFile('Alpha', Store.getPersistedState(), [], 'Tester');
    await writeScheduleFile('alpha.json', file);
    setCurrentScheduleFileData(file);
    setCurrentFile('alpha.json', file.lastSavedAt);
    await claimCurrentScheduleLock({ silent: true });
    const write = window.writeScheduleFile;
    window.writeScheduleFile = async (name, data) => name === 'alpha.json' ? false : write(name, data);
    try {
      assert.equal(await createVersion('Protected first checkpoint'), false);
      assert.equal(getCurrentScheduleFileData().versions.length, 1);
      assert.equal((await getVersions())[0].name, 'Protected first checkpoint', 'the version panel must show the protected unsaved checkpoint');
      window.writeScheduleFile = write;
      assert(await createVersion('Second checkpoint'));
      const written = await readScheduleFile('alpha.json');
      assert.deepEqual(written.versions.map(version => version.name), ['Second checkpoint', 'Protected first checkpoint']);
    } finally {
      window.writeScheduleFile = write;
      await discardSessionDraft();
    }
  });

  it('legacy Save Version cannot bypass an external-change warning', async () => {
    workbook();
    installMockDir();
    setUserName('Tester');
    const file = buildScheduleFile('Alpha', Store.getPersistedState(), [], 'Tester');
    await writeScheduleFile('alpha.json', file);
    setCurrentFile('alpha.json', file.lastSavedAt);
    await claimCurrentScheduleLock({ silent: true });
    file.lastSavedAt = '2099-01-01T00:00:00.000Z';
    file.current.title = 'Externally completed';
    await writeScheduleFile('alpha.json', file);
    assert.equal(await createVersion('Do not overwrite'), false);
    assert.equal((await readScheduleFile('alpha.json')).current.title, 'Externally completed');
    closeModal('staleWarningModal');
    await discardSessionDraft();
  });

  it('a failed attached write never silently downloads or marks the draft clean', async () => {
    workbook();
    const picker = window.showSaveFilePicker;
    const download = window.triggerDownload;
    const forget = window.clearWorkbookFileRecord;
    let downloads = 0;
    const handle = {
      name: 'failed.schedule', queryPermission: async () => 'granted',
      createWritable: async () => { throw new Error('Disk write refused'); },
    };
    _scheduleWorkbookHandle = handle;
    window.showSaveFilePicker = async () => handle;
    window.triggerDownload = () => { downloads++; };
    window.clearWorkbookFileRecord = async () => true;
    sessionSave();
    try {
      assert.equal(await saveScheduleWorkbookFile({ silent: true }), false);
      assert.equal(downloads, 0);
      assert(isDirty());
      assert.equal(hasScheduleWorkbookHandle(), false);
    } finally {
      window.showSaveFilePicker = picker;
      window.triggerDownload = download;
      window.clearWorkbookFileRecord = forget;
      await discardSessionDraft();
      clearScheduleWorkbookTarget();
    }
  });


  it('keeps this tab on its own workbook when another tab has a newer durable draft', async () => {
    workbook();
    sessionSave();
    await flushSessionBackup();
    const first = sessionStorage.getItem('schedule_state');
    clearScheduleWorkbookTarget();
    Store.setTitle('Other tab workbook');
    setCurrentScheduleFileData(buildScheduleFile('Other tab workbook', Store.getPersistedState(), [], ''));
    sessionSave();
    const other = buildRecoveryRecord();
    other.updatedAt = new Date(Date.now() + 1000).toISOString();
    await writeRecoveryRecord(other);
    sessionStorage.setItem('schedule_state', first);
    Store.reset();
    setCurrentScheduleFileData(null);
    clearScheduleWorkbookTarget();
    _lastRecoveryRecord = null;
    assert(await restoreDurableRecovery());
    assert(sessionLoad());
    assert.equal(Store.getTitle(), 'Alpha');
    await discardSessionDraft();
  });

  it('preserves divergent same-workbook tab recovery when the other tab saves a newer backup', async () => {
    workbook();
    sessionSave();
    await flushSessionBackup();
    const first = sessionStorage.getItem('schedule_state');
    const firstRecord = JSON.parse(first);
    Store.setTitle('Other tab divergent edits');
    sessionSave();
    const other = buildRecoveryRecord();
    other.updatedAt = new Date(Date.now() + 1000).toISOString();
    assert.equal(other.workbook.workbookId, firstRecord.workbook.workbookId);
    await writeRecoveryRecord(other);
    sessionStorage.setItem('schedule_state', first);
    clearTimeout(_sessionSaveTimer);
    Store.reset();
    setCurrentScheduleFileData(null);
    clearScheduleWorkbookTarget();
    _lastRecoveryRecord = null;
    assert(await restoreDurableRecovery());
    assert(sessionLoad());
    assert.equal(Store.getTitle(), 'Alpha');
    await discardSessionDraft();
    const remaining = await readRecoveryRecord();
    assert.equal(remaining.backupId, other.backupId, 'leaving this tab cannot erase the other tab recovery');
    await deleteRecoveryRecord(other.backupId);
    assert.equal(await readRecoveryRecord(), null, 'the matching backup can be removed');
  });

  it('downloads honestly after a revoked target and a blocked picker without writing that old target', async () => {
    workbook();
    let writes = 0;
    let downloads = 0;
    const picker = window.showSaveFilePicker;
    const download = window.triggerDownload;
    const forget = window.clearWorkbookFileRecord;
    _scheduleWorkbookHandle = {
      name: 'revoked.schedule', queryPermission: async () => 'denied',
      createWritable: async () => { writes++; throw new Error('Must not write a revoked target'); },
    };
    window.showSaveFilePicker = async () => { throw new DOMException('Embedded picker unavailable', 'SecurityError'); };
    window.triggerDownload = () => { downloads++; };
    window.clearWorkbookFileRecord = async () => true;
    sessionSave();
    try {
      assert(await saveScheduleWorkbookFile());
      assert.equal(writes, 0);
      assert.equal(downloads, 1);
      assert.equal(hasScheduleWorkbookHandle(), false);
      assert(getWorkbookSaveStatus().startsWith('Downloaded copy'));
    } finally {
      window.showSaveFilePicker = picker;
      window.triggerDownload = download;
      window.clearWorkbookFileRecord = forget;
      await discardSessionDraft();
      clearScheduleWorkbookTarget();
    }
  });

  it('an old Reopen result cannot overwrite work created while its read was pending', async () => {
    workbook();
    const old = buildScheduleWorkbookContent();
    let finish;
    let begin;
    const gate = new Promise(resolve => { finish = resolve; });
    const started = new Promise(resolve => { begin = resolve; });
    const handle = {
      name: 'old.schedule', queryPermission: async () => 'granted',
      getFile: async () => { begin(); await gate; return { name: 'old.schedule', text: async () => old }; },
    };
    const opening = openScheduleWorkbookFromHandle(handle);
    await started;
    clearScheduleWorkbookTarget();
    Store.setTitle('New work while opening');
    setCurrentScheduleFileData(buildScheduleFile('New work while opening', Store.getPersistedState(), [], ''));
    sessionSave();
    finish();
    assert.equal(await opening, false);
    assert.equal(Store.getTitle(), 'New work while opening');
    assert.equal(hasScheduleWorkbookHandle(), false);
    assert(isDirty());
    await discardSessionDraft();
  });

  it('rejects future formats and ambiguous workbook IDs before loading anything', () => {
    workbook();
    const file = JSON.parse(buildScheduleWorkbookContent());
    file.schemaVersion = 99;
    assert.throws(() => parseScheduleWorkbookContent(JSON.stringify(file)));
    file.schemaVersion = 1;
    file.schedules.push(cloneScheduleData(file.schedules[0]));
    assert.throws(() => parseScheduleWorkbookContent(JSON.stringify(file)));
    file.schedules[1].id = 'unreadable-sibling';
    delete file.schedules[1].current.days;
    assert.throws(() => parseScheduleWorkbookContent(JSON.stringify(file)), 'an unreadable inactive sibling must not become an empty schedule');
    assert.equal(Store.getTitle(), 'Alpha');
    discardSessionDraft();
  });

});
