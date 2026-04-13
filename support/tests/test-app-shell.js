describe('UI Harness — app shell', () => {
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
