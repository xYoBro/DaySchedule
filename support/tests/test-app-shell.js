async function importUiFile(triggerImport, state, fileName) {
  const originalCreateElement = document.createElement.bind(document);
  let importInput = null;

  document.createElement = function(tagName, options) {
    const el = originalCreateElement(tagName, options);
    if (String(tagName).toLowerCase() === 'input' && !importInput) importInput = el;
    return el;
  };

  try {
    triggerImport();
    assert(importInput, 'import should create a file input');
    const isJs = /\.js$/i.test(fileName || '');
    const fileBody = isJs
      ? '// Schedule Data — Auto-saved\nconst SAVED_STATE = ' + JSON.stringify(state, null, 2) + ';\n'
      : JSON.stringify(state);
    Object.defineProperty(importInput, 'files', {
      configurable: true,
      value: [new File([fileBody], fileName || 'import.json', { type: isJs ? 'text/javascript' : 'application/json' })],
    });
    importInput.dispatchEvent(new Event('change'));
    await wait(160);
  } finally {
    document.createElement = originalCreateElement;
  }
}

async function importUiJson(state, fileName) {
  return importUiFile(() => importDataFile(), state, fileName);
}

async function importUiFromLibrary(state, fileName) {
  return importUiFile(() => document.getElementById('libraryImportBtn').click(), state, fileName);
}

describe('UI Harness — app shell', () => {
  it('scales editor chrome up for larger viewports without shrinking smaller ones', () => {
    resetUiHarnessState();

    const standardScale = computeViewportUiScale(1366, 768);
    const widescreenScale = computeViewportUiScale(3440, 1440);

    assert.equal(standardScale, 1);
    assert.equal(widescreenScale, 1.24);

    const originalViewport = window.visualViewport;
    window.visualViewport = { width: 3440, height: 1440 };
    try {
      assert.equal(applyViewportUiScale(), 1.24);
      assert.equal(document.documentElement.style.getPropertyValue('--ui-scale'), '1.240');
    } finally {
      window.visualViewport = originalViewport;
      document.documentElement.style.setProperty('--ui-scale', '1');
    }
  });

  it('app stylesheet pins the editor shell body to the viewport height', async () => {
    const css = await fetch('../../app/css/style.css').then(r => r.text());
    assert(/body\s*\{[\s\S]*height:\s*100vh;/.test(css), 'body rule should include height: 100vh');
  });

  it('openSchedule loads a saved file into the editor shell', async () => {
    resetUiHarnessState();
    const seeded = await seedUiScheduleFile('Open Schedule Test', { skin: 'bands' });

    Store.reset();
    setCurrentScheduleFileData(null);
    showLibrary();
    await wait(0);
    await openSchedule(seeded.fileName);

    assert.equal(Store.getTitle(), 'Open Schedule Test');
    assert(Store.getActiveDay(), 'opening a schedule should select a day');
    assert.equal(document.getElementById('tbTitle').value, 'Open Schedule Test');
    assert.equal(document.getElementById('libraryView').classList.contains('active'), false);
    assert(document.getElementById('scheduleContainer').textContent.includes('Formation'));
  });

  it('createNewSchedule writes a file and switches from library to editor', async () => {
    resetUiHarnessState();
    installUiMockDir('data');
    setUserName('Tester');

    await createNewSchedule('June Drill');

    const files = UiMockFS.getFiles();
    assert('june-drill.json' in files, 'new schedule should be written to the data directory');
    assert.equal(Store.getTitle(), 'June Drill');
    assert.equal(getCurrentFileName(), 'june-drill.json');
    assert.equal(document.getElementById('libraryView').classList.contains('active'), false);
  });

  it('createNewSchedule does not overwrite an existing shared-folder file', async () => {
    resetUiHarnessState();
    installUiMockDir('data');
    setUserName('Tester');

    const originalState = {
      title: 'Existing June Drill',
      days: [{
        id: 'day_existing',
        date: '2026-06-01',
        startTime: '0700',
        endTime: '1630',
        events: [],
        notes: [],
      }],
      groups: Store.getGroups(),
      logo: null,
      footer: { contact: '', poc: '', updated: '' },
    };
    const originalFile = buildScheduleFile('Existing June Drill', originalState, [], 'Original Owner');
    await writeScheduleFile('june-drill.json', originalFile);

    await createNewSchedule('June Drill');

    const saved = await readScheduleFile('june-drill.json');
    assert.equal(saved.current.title, 'Existing June Drill');
    assert.equal(saved.lastSavedBy, 'Original Owner');
    assert(Store.getTitle() !== 'June Drill', 'collision should not switch the editor to a new schedule');
    assert(getCurrentFileName() !== 'june-drill.json', 'collision should not claim the existing file');
  });

  it('createNewSchedule falls back to a local draft when folder access is unavailable', async () => {
    resetUiHarnessState();
    setUserName('Tester');
    showLibrary();
    await wait(0);

    await createNewSchedule('Safari Draft');
    await wait(600);

    const files = UiMockFS.getFiles();
    assert.equal(Object.keys(files).length, 0, 'local draft should not create a shared-folder file');
    assert.equal(Store.getTitle(), 'Safari Draft');
    assert.equal(getCurrentFileName(), null);
    assert.equal(isCurrentScheduleEditable(), true, 'local draft should stay editable');
    assert.equal(document.getElementById('libraryView').classList.contains('active'), false);
    assert.equal(JSON.parse(sessionStorage.getItem('schedule_state')).title, 'Safari Draft');
    assert.equal(document.getElementById('editorAccessBar').hidden, false, 'local draft warning should stay visible');
    assert(document.getElementById('editorAccessText').textContent.includes('.schedule'));
    assert.equal(document.getElementById('editorManualExportBtn').textContent, 'Save .schedule');
    assert.equal(
      document.getElementById('toast').textContent,
      'Created Safari Draft as a local draft'
    );
  });

  it('local draft save action persists after saving a .schedule file', async () => {
    resetUiHarnessState();
    setUserName('Tester');
    await createNewSchedule('Safari Draft');
    await wait(600);

    const originalSaveScheduleWorkbookFile = window.saveScheduleWorkbookFile;
    let saveCalls = 0;
    window.saveScheduleWorkbookFile = async () => {
      saveCalls += 1;
      return true;
    };

    try {
      document.getElementById('editorManualExportBtn').click();
      await wait(0);
    } finally {
      window.saveScheduleWorkbookFile = originalSaveScheduleWorkbookFile;
    }

    assert.equal(saveCalls, 1, 'schedule save action should stay available from the persistent warning');
    assert.equal(document.getElementById('editorAccessBar').hidden, false, 'warning should remain visible after export');
    assert(document.getElementById('editorAccessText').textContent.includes('Saved as a'));
    assert(document.getElementById('editorAccessText').textContent.includes('.schedule'));
    assert.equal(document.getElementById('editorManualExportBtn').textContent, 'Save Again');
  });

  it('library presents only the simple workbook actions when folder access is unavailable', async () => {
    resetUiHarnessState();
    showLibrary();
    await wait(0);

    assert.equal(document.getElementById('libraryImportBtn').textContent.trim(), 'Open Schedule');
    assert.equal(document.getElementById('libraryNewBtn').textContent.trim(), 'Create');
    assert.equal(document.getElementById('libraryNewName').value, 'New Schedule');
    assert.equal(document.querySelector('.library-stack').style.display, 'none');
    assert.equal(document.getElementById('libraryConnectPrompt').style.display, 'none');
  });

  it('home-screen import creates a shared schedule from exported JS when folder access is connected', async () => {
    resetUiHarnessState();
    installUiMockDir('data');
    setUserName('Tester');
    showLibrary();
    await wait(0);

    await importUiFromLibrary({
      title: 'Imported From Export',
      days: [{
        id: 'day_imported',
        date: '2026-05-01',
        startTime: '0700',
        endTime: '1630',
        events: [{ title: 'Import Brief', startTime: '0900', endTime: '1000', groupId: 'grp_all', isMainEvent: true }],
        notes: [],
      }],
      groups: Store.getGroups(),
      logo: null,
      footer: { contact: '', poc: '', updated: '' },
    }, 'scheduledata.js');
    await wait(40);

    const files = UiMockFS.getFiles();
    assert('imported-from-export.json' in files, 'import should create a shared schedule file');
    assert.equal(Store.getTitle(), 'Imported From Export');
    assert.equal(getCurrentFileName(), 'imported-from-export.json');
    assert.equal(document.getElementById('libraryView').classList.contains('active'), false);
    assert(document.getElementById('editorAccessText').textContent.includes('Editing as'));
  });

  it('home-screen import opens a local draft when the shared folder is not connected', async () => {
    resetUiHarnessState();
    showLibrary();
    await wait(0);

    await importUiFromLibrary({
      title: 'Offline Import',
      days: [{
        id: 'day_local_import',
        date: '2026-05-02',
        startTime: '0800',
        endTime: '1700',
        events: [{ title: 'Offline Brief', startTime: '1000', endTime: '1030', groupId: 'grp_all', isMainEvent: true }],
        notes: [],
      }],
      groups: Store.getGroups(),
      logo: null,
      footer: { contact: '', poc: '', updated: '' },
    }, 'scheduledata.js');
    await wait(40);

    assert.equal(Store.getTitle(), 'Offline Import');
    assert.equal(getCurrentFileName(), null);
    assert.equal(document.getElementById('libraryView').classList.contains('active'), false);
    assert.equal(document.getElementById('editorAccessBar').hidden, false);
    assert(document.getElementById('editorAccessText').textContent.includes('Local Draft'));
    assert.equal(document.getElementById('toast').textContent, 'Imported scheduledata.js as a local draft');
  });

  it('quick edit lets you change start and end before the row time range is validated', async () => {
    resetUiHarnessState();
    setUserName('Tester');
    const seeded = await seedUiScheduleFile('Quick Edit Time Harness', { skin: 'bands' });
    await openSchedule(seeded.fileName);
    await claimCurrentScheduleLock({ silent: true });

    const dayId = Store.getActiveDay();
    const evt = Store.getEvents(dayId)[0];

    openDayEventSheetModal({ eventId: evt.id, field: 'startTime' });
    await wait(0);

    const startSelector = '.day-sheet-time-input[data-event-id="' + evt.id + '"][data-field="startTime"]';
    const endSelector = '.day-sheet-time-input[data-event-id="' + evt.id + '"][data-field="endTime"]';
    const startInput = document.querySelector(startSelector);
    const endInput = document.querySelector(endSelector);

    startInput.focus();
    startInput.value = '0900';
    endInput.focus();
    await wait(20);

    assert.equal(startInput.value, '0900', 'start input should keep the staged time while the end time is being edited');
    assert.equal(Store.getEvents(dayId).find(item => item.id === evt.id).startTime, evt.startTime, 'store should not commit the first time change yet');

    endInput.value = '1000';
    endInput.blur();
    endInput.dispatchEvent(new Event('blur'));
    await wait(160);

    const updated = Store.getEvents(dayId).find(item => item.id === evt.id);
    assert.equal(updated.startTime, '0900');
    assert.equal(updated.endTime, '1000');
  });

  it('renames the file only when the title edit is committed', async () => {
    resetUiHarnessState();
    installUiMockDir('data');
    setUserName('Tester');
    await createNewSchedule('Original Title');

    const titleInput = document.getElementById('tbTitle');
    const originalRename = window.renameScheduleFile;
    const renameCalls = [];

    window.renameScheduleFile = async (oldFile, newFile) => {
      renameCalls.push([oldFile, newFile]);
      return true;
    };

    try {
      titleInput.value = 'Original Title Draft';
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      titleInput.value = 'Final Title';
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));

      assert.equal(renameCalls.length, 0, 'typing should not rename the file');

      titleInput.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(0);

      assert.deepEqual(renameCalls, [['original-title.json', 'final-title.json']]);
    } finally {
      window.renameScheduleFile = originalRename;
    }
  });

  it('title rename does not overwrite an existing schedule file', async () => {
    resetUiHarnessState();
    installUiMockDir('data');
    setUserName('Tester');
    await createNewSchedule('Original Title');
    const targetState = {
      title: 'Taken Title',
      days: [{
        id: 'day_taken',
        date: '2026-06-02',
        startTime: '0700',
        endTime: '1630',
        events: [],
        notes: [],
      }],
      groups: Store.getGroups(),
      logo: null,
      footer: { contact: '', poc: '', updated: '' },
    };
    const targetFile = buildScheduleFile('Taken Title', targetState, [], 'Target Owner');
    await writeScheduleFile('taken-title.json', targetFile);

    const titleInput = document.getElementById('tbTitle');
    titleInput.value = 'Taken Title';
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    titleInput.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(40);

    const targetAfter = await readScheduleFile('taken-title.json');
    const originalAfter = await readScheduleFile('original-title.json');
    assert.equal(targetAfter.current.title, 'Taken Title');
    assert.equal(targetAfter.lastSavedBy, 'Target Owner');
    assert.equal(originalAfter.current.title, 'Original Title');
    assert.equal(getCurrentFileName(), 'original-title.json');
  });

  it('returnToLibrary saves dirty state before resetting the editor', async () => {
    resetUiHarnessState();
    installUiMockDir('data');
    setUserName('Tester');
    await createNewSchedule('Return Test');

    Store.setTitle('Return Test Updated');
    syncToolbarTitle();
    markDirty();
    await returnToLibrary();
    await wait(0);

    const saved = await readScheduleFile('return-test.json');
    assert.equal(saved.current.title, 'Return Test Updated');
    assert.equal(Store.getTitle(), '');
    assert.equal(getCurrentFileName(), null);
    assert(document.getElementById('libraryView').classList.contains('active'), 'library view should be visible again');
  });

  it('version panel can save and restore through the modal UI', async () => {
    resetUiHarnessState();
    setUserName('Tester');
    const seeded = await seedUiScheduleFile('Version Harness', { skin: 'bands' });
    await openSchedule(seeded.fileName);
    await claimCurrentScheduleLock({ silent: true });

    await openVersionPanel();
    document.getElementById('versionSaveBtn').click();
    await wait(20);
    document.getElementById('versionNameInput').value = 'Draft Alpha';
    document.getElementById('versionSaveConfirm').click();
    await wait(40);

    let versions = await getVersions();
    assert.equal(versions.length, 1);
    assert.equal(versions[0].name, 'Draft Alpha');

    Store.setTitle('Version Harness Modified');
    await saveCurrentSchedule();
    await openVersionPanel();
    document.querySelector('.version-restore-btn').click();
    await wait(40);

    versions = await getVersions();
    assert.equal(Store.getTitle(), 'Version Harness');
    assert.equal(document.getElementById('versionModal').classList.contains('active'), false);
    assert.equal(versions.length, 2, 'restoring should create an auto-backup');
    await wait(600);
    assert.equal(JSON.parse(sessionStorage.getItem('schedule_state')).title, 'Version Harness');

    await openVersionPanel();
    assert(document.getElementById('versionModal').textContent.includes('Recent'));
    assert(document.getElementById('versionModal').textContent.includes('Restored version "Draft Alpha"'));
  });

  it('Escape delegates to modal-specific cleanup paths', async () => {
    resetUiHarnessState();
    setUserName('Tester');
    const seeded = await seedUiScheduleFile('Escape Harness', { skin: 'bands' });
    await openSchedule(seeded.fileName);
    await claimCurrentScheduleLock({ silent: true });

    openHelpModal({ tab: 'faq' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(0);
    assert.equal(document.getElementById('helpModal').classList.contains('active'), false);

    openSettingsModal();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(0);
    assert.equal(document.getElementById('settingsModal').classList.contains('active'), false);

    const evt = Store.getEvents(Store.getActiveDay())[0];
    selectEntity('event', Store.getActiveDay(), evt.id);
    openDayEventSheetModal();
    assert.equal(_daySheetSelectedEventId, evt.id);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(0);
    assert.equal(document.getElementById('dayEventSheetModal').classList.contains('active'), false);
    assert.equal(_daySheetSelectedEventId, null);

    await openVersionPanel();
    document.getElementById('versionSaveBtn').click();
    await wait(20);
    const nameInput = document.getElementById('versionNameInput');
    nameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(20);
    assert(document.getElementById('versionModal').classList.contains('active'), 'Escape in save mode should keep the version panel open');
    assert.equal(document.getElementById('versionNameInput'), null, 'Escape should exit inline save mode');
  });

  it('cancels sync confirmation on Escape and backdrop click', async () => {
    resetUiHarnessState();

    const escapePromise = showSyncConfirmation();
    await wait(0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(await escapePromise, false);

    const clickPromise = showSyncConfirmation();
    await wait(0);
    document.getElementById('syncConfirmModal').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert.equal(await clickPromise, false);
  });

  it('cancels the name prompt on Escape and backdrop click', async () => {
    resetUiHarnessState();

    const escapePromise = promptUserName();
    await wait(0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(await escapePromise, '');

    const clickPromise = promptUserName();
    await wait(0);
    document.getElementById('userNameModal').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert.equal(await clickPromise, '');
  });

  it('undo refreshes the toolbar title and persists the restored working copy', async () => {
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'bands', dayCount: 2, title: 'Undo Baseline' });

    renderActiveDay();
    syncToolbarTitle();
    saveUndoState();
    Store.setTitle('Undo Edited');
    Store.setActiveDay(seeded.day2.id);
    renderActiveDay();
    syncToolbarTitle();

    undo();

    assert.equal(Store.getTitle(), 'Undo Baseline');
    assert.equal(Store.getActiveDay(), seeded.day1.id);
    assert.equal(document.getElementById('tbTitle').value, 'Undo Baseline');

    await wait(600);
    const saved = JSON.parse(sessionStorage.getItem('schedule_state'));
    assert.equal(saved.title, 'Undo Baseline');
  });

  it('undo history is cleared when switching schedules', async () => {
    resetUiHarnessState();
    setUserName('Tester');
    const first = await seedUiScheduleFile('First Schedule', { skin: 'bands' });
    await openSchedule(first.fileName);
    saveUndoState();
    Store.setTitle('First Schedule Edited');

    const second = await seedUiScheduleFile('Second Schedule', { skin: 'grid' });
    await openSchedule(second.fileName);

    undo();

    assert.equal(Store.getTitle(), 'Second Schedule');
    assert.equal(getCurrentFileName(), 'second-schedule.json');
  });

  it('loading external changes replaces file metadata and refreshes the editor UI', async () => {
    resetUiHarnessState();
    setUserName('Tester');
    const seeded = await seedUiScheduleFile('Local Copy', { skin: 'bands' });
    await openSchedule(seeded.fileName);

    const oldEvent = Store.getEvents(Store.getActiveDay())[0];
    selectEntity('event', Store.getActiveDay(), oldEvent.id);

    const remoteState = {
      title: 'Remote Copy',
      days: [{
        id: 'day_remote',
        date: '2026-04-20',
        label: null,
        startTime: '0700',
        endTime: '1630',
        events: [{
          id: 'evt_remote',
          title: 'Remote Formation',
          startTime: '0700',
          endTime: '0730',
          description: '',
          location: '',
          poc: '',
          groupId: 'grp_all',
          attendees: '',
          isBreak: false,
          isMainEvent: true,
        }],
        notes: [],
      }],
      groups: Store.getGroups(),
      logo: null,
      footer: { contact: '', poc: '', updated: '' },
    };
    const otherData = buildScheduleFile('Remote Copy', remoteState, [{ name: 'Remote Version', data: remoteState }], 'Remote User');
    otherData.theme = { skin: 'grid', palette: 'airforce', customColors: null };

    showStaleDataWarning('Remote User', otherData.lastSavedAt, otherData);
    document.getElementById('staleLoadBtn').click();
    await wait(0);

    assert.equal(Store.getTitle(), 'Remote Copy');
    assert.equal(Store.getActiveDay(), 'day_remote');
    assert.equal(document.getElementById('tbTitle').value, 'Remote Copy');
    assert.equal(getCurrentScheduleFileData().theme.skin, 'grid');
    assert.equal(getCurrentScheduleFileData().versions[0].name, 'Remote Version');
    assert(document.getElementById('scheduleContainer').textContent.includes('Remote Formation'));
  });

  it('stale-data warning cannot be dismissed without choosing load or overwrite', async () => {
    resetUiHarnessState();

    const remoteState = {
      title: 'Remote Copy',
      days: [{
        id: 'day_remote',
        date: '2026-04-20',
        startTime: '0700',
        endTime: '1630',
        events: [],
        notes: [],
      }],
      groups: Store.getGroups(),
      logo: null,
      footer: { contact: '', poc: '', updated: '' },
    };
    const otherData = buildScheduleFile('Remote Copy', remoteState, [], 'Remote User');

    showStaleDataWarning('Remote User', otherData.lastSavedAt, otherData);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(0);

    assert(document.getElementById('staleWarningModal').classList.contains('active'));
  });

  it('clicking quick-edit rows does not change the preview selection', async () => {
    resetUiHarnessState();
    setUserName('Tester');
    const seeded = await seedUiScheduleFile('Quick Edit Selection Harness', { skin: 'bands' });
    await openSchedule(seeded.fileName);
    await claimCurrentScheduleLock({ silent: true });

    const events = Store.getEvents(Store.getActiveDay());
    selectEntity('event', Store.getActiveDay(), events[0].id);
    openDayEventSheetModal({ eventId: events[1].id, field: 'title' });
    await wait(0);

    const quickEditTitle = document.querySelector(
      '#dayEventSheetModalContent [data-event-id="' + events[1].id + '"][data-field="title"]'
    );
    quickEditTitle.click();

    assert.equal(_selection.entityId, events[0].id);
  });

  it('filters invalid top-level imports and rejects invalid imported event ranges', async () => {
    resetUiHarnessState();

    await importUiJson({
      title: 'Imported Schedule',
      days: [
        null,
        {
          id: 'day_valid',
          date: '2026-05-01',
          startTime: '0700',
          endTime: '1630',
          events: [
            { title: 'Valid Event', startTime: '0900', endTime: '1000', groupId: 'grp_all' },
            { title: 'Bad Event', startTime: '1000', endTime: '1000', groupId: 'grp_all' },
          ],
          notes: [],
        },
      ],
      groups: [null, { id: 'grp_extra', name: 'Extra', scope: 'limited', color: '#123456' }],
      logo: null,
      footer: { contact: '', poc: '', updated: '' },
    }, 'import.json');

    assert.equal(Store.getTitle(), 'Imported Schedule');
    assert.equal(Store.getDays().length, 1);
    assert.equal(Store.getGroups().length, 1);
    assert.equal(Store.getActiveDay(), 'day_valid');
    assert.equal(Store.getEvents('day_valid').length, 1);
    assert.equal(Store.getEvents('day_valid')[0].title, 'Valid Event');
  });

  it('home-screen import accepts first-party schedule envelopes without dropping theme metadata', async () => {
    resetUiHarnessState();
    installUiMockDir('data');
    setUserName('Tester');
    showLibrary();
    await wait(0);

    const importedState = {
      title: 'Envelope Import',
      days: [{
        id: 'day_envelope',
        date: '2026-05-03',
        startTime: '0700',
        endTime: '1630',
        events: [{ title: 'Envelope Brief', startTime: '0900', endTime: '1000', groupId: 'grp_all', isMainEvent: true }],
        notes: [],
      }],
      groups: Store.getGroups(),
      logo: null,
      footer: { contact: '', poc: '', updated: '' },
    };
    const envelope = buildScheduleFile('Envelope Import', importedState, [], 'Exporter');
    envelope.theme = { skin: 'grid', palette: 'airforce', customColors: null };

    await importUiFromLibrary(envelope, 'envelope.json');
    await wait(40);

    assert.equal(Store.getTitle(), 'Envelope Import');
    assert.equal(getCurrentFileName(), 'envelope-import.json');
    assert.equal(getCurrentScheduleFileData().theme.skin, 'grid');
    assert.equal(getCurrentScheduleFileData().theme.palette, 'airforce');
  });

  it('shows a clear error when an import has no valid days', async () => {
    resetUiHarnessState();
    Store.setTitle('Before Import');

    await importUiJson({
      title: 'Broken Import',
      days: [null],
      groups: [],
      logo: null,
      footer: { contact: '', poc: '', updated: '' },
    }, 'broken.json');

    assert.equal(Store.getTitle(), 'Before Import');
    assert.equal(document.getElementById('toast').textContent, 'Import failed: Invalid schedule file — no valid days found.');
  });

  it('prompts for a real name before claiming edit access', async () => {
    resetUiHarnessState();
    installUiMockDir('data');

    const fileData = buildScheduleFile('Prompt Test', Store.getPersistedState(), [], '');
    await writeScheduleFile('prompt-test.json', fileData);
    setCurrentFile('prompt-test.json', fileData.lastSavedAt);

    const claimPromise = claimCurrentScheduleLock({ silent: true });
    await wait(10);

    const overlay = document.getElementById('userNameModal');
    assert(overlay.classList.contains('active'), 'name prompt should appear before edit access is claimed');

    document.getElementById('userNameInput').value = 'SrA Tester';
    document.getElementById('userNameDone').click();

    const result = await claimPromise;
    assert.equal(result.ok, true, 'claim should continue after a valid name is entered');
    assert.equal(getUserName(), 'SrA Tester');
  });

  it('uses a quiet in-app help affordance instead of a separate handout', async () => {
    resetUiHarnessState();
    showLibrary();
    await wait(0);

    const libraryHelpBtn = document.getElementById('libraryHelpBtn');

    assert.equal(libraryHelpBtn.textContent, 'Help');

    libraryHelpBtn.click();
    await wait(0);

    assert(document.getElementById('helpModal').classList.contains('active'), 'library help should open the in-app help modal');
    assert(document.querySelector('[data-help-tab="start"]').classList.contains('active'), 'help should open on the Start tab');

    document.querySelector('[data-help-tab="faq"]').click();
    await wait(0);
    assert(document.querySelector('[data-help-tab="faq"]').classList.contains('active'), 'faq tab should activate when clicked');
    assert(document.querySelector('[data-help-panel="faq"]').classList.contains('active'), 'faq panel should activate when clicked');

    document.getElementById('helpCloseBtn').click();
    await wait(0);

    assert.equal(libraryHelpBtn.textContent, 'Help');

    libraryHelpBtn.click();
    await wait(0);
    assert(document.querySelector('[data-help-tab="faq"]').classList.contains('active'), 'after onboarding is seen, help should reopen on FAQ');
    document.getElementById('helpCloseBtn').click();
    await wait(0);
  });

  it('adds a new day with a real default date label instead of Day 1', () => {
    resetUiHarnessState();
    installUiMockDir('data');
    setUserName('Tester');

    const firstDay = Store.addDay({ date: '2026-03-15', startTime: '0700', endTime: '1630' });
    Store.setActiveDay(firstDay.id);
    renderActiveDay();

    document.getElementById('addDayBtn').click();

    const days = Store.getDays();
    const newDay = days.find(day => day.id !== firstDay.id);
    const tabText = document.getElementById('dayTabs').textContent;

    assert(newDay, 'a second day should be created');
    assert.equal(newDay.date, '2026-03-16');
    assert(tabText.includes('Sun, Mar 15'));
    assert(tabText.includes('Mon, Mar 16'));
    assert(!tabText.includes('Day 1'));
    assert(!tabText.includes('Day 2'));
  });

  it('keyboard shortcuts dispatch to the current shell handlers', () => {
    resetUiHarnessState();

    let saveCalls = 0;
    let printCalls = 0;
    let undoCalls = 0;
    let redoCalls = 0;
    const originalForceSave = window.forceSave;
    const originalPrintAllDays = window.printAllDays;
    const originalUndo = window.undo;
    const originalRedo = window.redo;

    window.forceSave = () => { saveCalls += 1; };
    window.printAllDays = () => { printCalls += 1; };
    window.undo = () => { undoCalls += 1; };
    window.redo = () => { redoCalls += 1; };

    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true }));

      const input = document.createElement('input');
      document.body.appendChild(input);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      input.remove();
    } finally {
      window.forceSave = originalForceSave;
      window.printAllDays = originalPrintAllDays;
      window.undo = originalUndo;
      window.redo = originalRedo;
    }

    assert.equal(saveCalls, 1);
    assert.equal(printCalls, 1);
    assert.equal(undoCalls, 1, 'undo should ignore text input targets');
    assert.equal(redoCalls, 1);
  });

  it('editor surfaces expose portable .schedule save without replacing autosave', async () => {
    resetUiHarnessState();

    let saveScheduleCalls = 0;
    const originalSaveScheduleWorkbookFile = window.saveScheduleWorkbookFile;
    window.saveScheduleWorkbookFile = () => {
      saveScheduleCalls += 1;
      return Promise.resolve(true);
    };

    try {
      document.getElementById('saveScheduleFileBtn').click();

      openSettingsModal();
      await wait(0);
      const settingsBtn = document.getElementById('settings-save-schedule-file');
      assert(settingsBtn, 'settings should expose the portable schedule save action');
      assert.equal(settingsBtn.textContent, 'Save .schedule');
      settingsBtn.click();
      await wait(0);
    } finally {
      window.saveScheduleWorkbookFile = originalSaveScheduleWorkbookFile;
      closeSettingsModal();
    }

    assert.equal(saveScheduleCalls, 2);
  });

  it('loadSampleData and migrateSavedState cover init shell helpers', async () => {
    resetUiHarnessState();
    loadSampleData();

    assert(Store.getDays().length > 0, 'sample data should create at least one day');
    assert(Store.getEvents(Store.getDays()[0].id).length >= 20, 'sample data should be dense enough for skin testing');
    assert(Store.getEvents(Store.getDays()[0].id).some(e => !!e.attendees), 'sample data should include attendees');

    const savedState = {
      title: 'Migrated Schedule',
      days: [],
      groups: Store.getGroups(),
      logo: null,
      footer: { contact: '', poc: '', updated: '' },
    };

    installUiMockDir('data');
    await migrateSavedState(savedState);
    await migrateSavedState(savedState);

    const files = await listScheduleFiles();
    assert.equal(files.length, 1, 'migration should be idempotent for the same title');
    assert.equal(files[0].name, 'Migrated Schedule');
  });
});
