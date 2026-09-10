/* Full UI-shell checks for navigation and workbook management. */
describe('Workbook reliability — navigation and review', () => {
  it('Back drains edits made during its save before removing recovery', async () => {
    resetUiHarnessState();
    await createNewSchedule('Before save');
    const day = Store.addDay({ date: '2026-09-10' });
    Store.setActiveDay(day.id);
    let disk = '';
    let begin;
    let finish;
    let writes = 0;
    const started = new Promise(resolve => { begin = resolve; });
    const gate = new Promise(resolve => { finish = resolve; });
    const handle = {
      name: 'leave.schedule', queryPermission: async () => 'granted',
      getFile: async () => ({ name: 'leave.schedule', text: async () => disk }),
      createWritable: async () => ({
        write: async content => {
          writes++;
          if (writes === 1) { begin(); await gate; }
          disk = content;
        }, close: async () => {}, abort: async () => {},
      }),
    };
    const picker = window.showSaveFilePicker;
    const remember = window.saveWorkbookFileRecord;
    window.showSaveFilePicker = async () => handle;
    window.saveWorkbookFileRecord = async () => true;
    try {
      const leaving = returnToLibrary();
      await started;
      Store.setTitle('Latest edit during save');
      sessionSave();
      finish();
      await leaving;
      assert.equal(JSON.parse(disk).schedules[0].current.title, 'Latest edit during save');
      assert.equal(writes, 2);
      assert.equal(Store.getDays().length, 0);
      assert.equal(sessionStorage.getItem('schedule_state'), null);
      assert(document.getElementById('libraryView').classList.contains('active'));
    } finally {
      finish();
      window.showSaveFilePicker = picker;
      window.saveWorkbookFileRecord = remember;
      await discardSessionDraft();
    }
  });

  it('Back saves a recovered unsaved draft even without a subsequent edit', async () => {
    resetUiHarnessState();
    await createNewSchedule('Recovered work');
    Store.addDay({ date: '2026-09-10' });
    sessionSave();
    await flushSessionBackup();
    const raw = sessionStorage.getItem('schedule_state');
    Store.reset();
    setCurrentScheduleFileData(null);
    clearScheduleWorkbookTarget();
    _dirty = false;
    sessionStorage.setItem('schedule_state', raw);
    assert(sessionLoad());
    assert(isDirty());
    const save = window.saveScheduleWorkbookFile;
    let saved = null;
    window.saveScheduleWorkbookFile = async () => {
      saved = buildScheduleWorkbookContent();
      markScheduleWorkbookSaved();
      return true;
    };
    try {
      await returnToLibrary();
      assert.equal(JSON.parse(saved).schedules[0].current.title, 'Recovered work');
      assert.equal(sessionStorage.getItem('schedule_state'), null);
    } finally {
      window.saveScheduleWorkbookFile = save;
      await discardSessionDraft();
    }
  });

  it('the visible archive and restore actions preserve schedule content', async () => {
    resetUiHarnessState();
    await createNewSchedule('Original');
    const original = getCurrentScheduleFileData().id;
    createScheduleInWorkbook('Second');
    openWorkbookModal();
    document.querySelector('[data-archive-schedule="' + original + '"]').click();
    assert.equal(getScheduleWorkbookEntries().length, 1);
    const restore = document.querySelector('[data-restore-schedule="0"]');
    assert(restore, 'an archived schedule has a visible restore action');
    restore.click();
    assert.equal(getScheduleWorkbookEntries().length, 2);
    assert.equal(Store.getTitle(), 'Original');
    closeWorkbookModal();
    await discardSessionDraft();
  });

  it('dated duplication requires its preview confirmation', async () => {
    resetUiHarnessState();
    await createNewSchedule('September');
    Store.addDay({ date: '2026-09-10' });
    openWorkbookModal();
    document.getElementById('workbookFirstDate').value = '2026-10-08';
    document.getElementById('workbookDuplicateBtn').click();
    assert.equal(getScheduleWorkbookEntries().length, 1, 'preview must not create a copy');
    assert(!document.getElementById('workbookDuplicatePreview').hidden);
    assert(document.getElementById('workbookDuplicatePreview').textContent.includes('2026-10-08'));
    document.getElementById('workbookConfirmDuplicate').click();
    assert.equal(getScheduleWorkbookEntries().length, 2);
    assert.equal(Store.getDays()[0].date, '2026-10-08');
    await discardSessionDraft();
  });

  it('Escape resolves a recovery conflict as Cancel without mutation', async () => {
    resetUiHarnessState();
    await createNewSchedule('Unsaved');
    const latest = buildScheduleWorkbookObject();
    const pending = reviewWorkbookConflict(latest);
    assert(document.getElementById('staleWarningModal').classList.contains('active'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert.equal(await pending, false);
    assert.equal(Store.getTitle(), 'Unsaved');
    assert(isDirty());
    await discardSessionDraft();
  });

  it('Back waits for a new checkpoint and preserves it if saving fails and the picker is cancelled', async () => {
    resetUiHarnessState();
    await createNewSchedule('Checkpoint work');
    Store.addDay({ date: '2026-09-10' });
    markScheduleWorkbookSaved();
    let begin;
    let finish;
    const started = new Promise(resolve => { begin = resolve; });
    const gate = new Promise(resolve => { finish = resolve; });
    const picker = window.showSaveFilePicker;
    const forget = window.clearWorkbookFileRecord;
    window.showSaveFilePicker = async () => { throw new DOMException('Cancelled', 'AbortError'); };
    window.clearWorkbookFileRecord = async () => true;
    _scheduleWorkbookHandle = {
      name: 'checkpoint.schedule', queryPermission: async () => 'granted',
      createWritable: async () => ({
        write: async () => { begin(); await gate; throw new Error('Disk refused write'); },
        close: async () => {}, abort: async () => {},
      }),
    };
    try {
      const version = createVersion('Important checkpoint');
      assert(isDirty(), 'version must become dirty before any asynchronous write');
      assert.equal(JSON.parse(sessionStorage.getItem('schedule_state')).workbook.schedule.versions.length, 1);
      await started;
      const leaving = returnToLibrary();
      assert.equal(Store.getTitle(), 'Checkpoint work');
      finish();
      await version;
      await leaving;
      assert.equal(Store.getTitle(), 'Checkpoint work');
      assert.equal(getCurrentScheduleFileData().versions.length, 1);
      assert.equal(JSON.parse(sessionStorage.getItem('schedule_state')).workbook.schedule.versions.length, 1);
      assert(isDirty());
    } finally {
      finish();
      window.showSaveFilePicker = picker;
      window.clearWorkbookFileRecord = forget;
      await discardSessionDraft();
      clearScheduleWorkbookTarget();
    }
  });

  it('Escape closes only the top modal while Versions keeps its accessible name and focus', async () => {
    resetUiHarnessState();
    await createNewSchedule('Modal stack');
    await openVersionPanel();
    const overlay = document.getElementById('versionModal');
    assert(document.getElementById(overlay.getAttribute('aria-labelledby')), 'rendered Versions heading must match its accessible name');
    assert(overlay.contains(document.activeElement), 'rendering versions should retain keyboard focus');
    openHelpModal({ tab: 'faq' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert(!document.getElementById('helpModal').classList.contains('active'));
    assert(overlay.classList.contains('active'), 'Escape must not close the underlying Versions dialog');
    assert(overlay.contains(document.activeElement));
    closeVersionPanel();
    await discardSessionDraft();
  });

  it('closing Versions while its records load prevents a late render from moving focus', async () => {
    resetUiHarnessState();
    await createNewSchedule('Delayed versions');
    const read = window.getVersions;
    let finish;
    window.getVersions = () => new Promise(resolve => { finish = resolve; });
    try {
      const opening = openVersionPanel();
      closeVersionPanel();
      const focus = document.activeElement;
      finish([]);
      await opening;
      assert(!document.getElementById('versionModal').classList.contains('active'));
      assert.equal(document.activeElement, focus);
      assert.equal(document.getElementById('versionSaveBtn'), null);
    } finally {
      window.getVersions = read;
      await discardSessionDraft();
    }
  });

});
