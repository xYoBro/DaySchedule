/* Authoring contracts: placement, attendance and emphasis are independent. */
describe('Bands authoring — explicit choices', () => {
  function edit(eventId) {
    const day = Store.getDay(Store.getActiveDay());
    selectEntity('event', day.id, eventId);
    return day.events.find(event => event.id === eventId);
  }
  function change(selector, value) {
    const input = document.querySelector(selector);
    input.value = value; input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  it('keeps a legacy workbook in its original sections until an explicit choice is made', () => {
    loadApprovedBands('normal');
    const day = Store.getDay(Store.getActiveDay());
    const before = BandLayout.model(day).mains.map(event => event.id);
    const event = day.events.find(event => !isEventEffectiveMain(event, Store.getGroups()));
    edit(event.id);
    assert.equal(event.placement, undefined, 'opening the editor must not mutate imported events');
    assert(document.querySelector('#insp-placement-concurrent').checked);
    change('#insp-evt-group', Store.getGroups().find(group => group.scope === 'main').id);
    assert.equal(event.placement, 'concurrent');
    assert.deepEqual(BandLayout.model(day).mains.map(event => event.id), before);
    document.querySelector('#insp-placement-main').click();
    assert(BandLayout.model(day).mains.some(item => item.id === event.id));
    assert.equal(document.activeElement.id, 'insp-placement-main');
    document.querySelector('#insp-placement-concurrent').click();
    assert(!document.querySelector('#toast').classList.contains('show'));
  });

  it('honors explicit placement over both audience scope and break flags in the shared classifier', () => {
    loadApprovedBands('main');
    const day = Store.getDay(Store.getActiveDay());
    const group = Store.getGroups().find(group => group.scope === 'main');
    const event = Store.addEvent(day.id, { title: 'Named meal', startTime: '0830', endTime: '0900',
      groupId: group.id, placement: 'concurrent', isBreak: true, isMainEvent: true });
    assert(!isEventEffectiveMain(event, Store.getGroups()));
    assert(!isSharedTrackEvent(event, Store.getGroups()));
    assert(BandLayout.model(day).concurrent.some(item => item.id === event.id));
    assert(!classifyEvents(day.events, Store.getGroups()).mainBands.some(band => band.event.id === event.id));
    Store.updateEvent(day.id, event.id, { placement: 'main', groupId: '', isMainEvent: false, isBreak: false });
    assert(isEventEffectiveMain(event, Store.getGroups()));
    assert(classifyEvents(day.events, Store.getGroups()).mainBands.some(band => band.event.id === event.id));
  });

  it('keeps section and names when emphasis or meal flags change, with Undo and Redo', () => {
    loadApprovedBands('normal');
    const day = Store.getDay(Store.getActiveDay());
    const event = edit(day.events.find(event => !isEventEffectiveMain(event, Store.getGroups())).id);
    const names = event.attendees;
    finishUndoGroup(); clearUndoHistory();
    document.querySelector('#insp-evt-emphasis').click();
    document.querySelector('#insp-evt-break').click();
    assert.equal(event.placement, 'concurrent');
    assert.equal(event.attendees, names);
    assert(event.isBreak && event.emphasized);
    undo();
    let stored = Store.getEvents(day.id).find(item => item.id === event.id);
    assert(!stored.isBreak && !stored.emphasized);
    redo(); stored = Store.getEvents(day.id).find(item => item.id === event.id);
    assert.equal(stored.placement, 'concurrent');
    assert(stored.isBreak && stored.emphasized);
  });

  it('makes new events main even when no shared audience exists', () => {
    loadApprovedBands('main');
    Store.getGroups().forEach(group => Store.updateGroup(group.id, { scope: 'limited' }));
    const day = Store.getDay(Store.getActiveDay());
    openAddEvent(day.id);
    const event = day.events.find(item => item.id === _selection.entityId);
    assert.equal(event.placement, 'main');
    assert(document.querySelector('#insp-placement-main').checked);
    openDayEventSheetModal();
    document.querySelector('#daySheetAddEvent').click();
    assert.equal(day.events.find(item => item.id === _daySheetSelectedEventId).placement, 'main');
    closeDayEventSheetModal();
  });

  it('preserves event positions when an audience role changes or is removed', () => {
    loadApprovedBands('normal');
    const before = Store.getDays().map(day => BandLayout.model(day).mains.map(event => event.id));
    openSettingsModal();
    document.querySelector('[data-settings-tab="audiences"]').click();
    document.querySelector('.insp-group-scope').click();
    assert.deepEqual(Store.getDays().map(day => BandLayout.model(day).mains.map(event => event.id)), before);
    const remove = document.querySelector('.insp-group-remove'); remove.click(); remove.click();
    assert.deepEqual(Store.getDays().map(day => BandLayout.model(day).mains.map(event => event.id)), before);
    document.querySelector('#settings-done').click();
  });

  it('preserves multiline names and exact entries through Quick Edit formatting and placement changes', () => {
    loadApprovedBands('normal');
    const day = Store.getDay(Store.getActiveDay());
    const event = edit(day.events[0].id);
    openDayEventSheetModal();
    const selector = '#daySheetDetailPanel [data-field="attendees"]';
    const names = 'Doe, John\nAlex Smith\nChan\nChan';
    assert.equal(document.querySelector(selector).tagName, 'TEXTAREA');
    change(selector, names); change('#sheet-attendee-format', 'lines');
    assert.equal(event.attendees, names);
    assert.equal(event.attendeeFormat, 'lines');
    assert.equal(document.querySelector('#sheet-attendee-preview .attendee-count').textContent, '4 entries · entered order');
    change('.day-sheet-row[data-event-id="' + event.id + '"] .day-sheet-placement-select', 'concurrent');
    assert.equal(event.placement, 'concurrent');
    assert.equal(document.querySelector(selector).value, names);
    document.querySelector('#daySheetOpenDetails').click();
    assert(document.querySelector('#insp-placement-concurrent').checked);
    assert.equal(document.querySelector('#insp-evt-attendees').value, names);
  });

  it('accepts named attendance without a group and still warns when no attendance is supplied', () => {
    loadApprovedBands('main');
    const day = Store.getDay(Store.getActiveDay());
    const event = day.events[0];
    Store.updateEvent(day.id, event.id, { groupId: '', attendees: 'Doe; Smith', isBreak: false });
    assert(!getScheduleReviewIssues([day], Store.getGroups()).some(issue => issue.type === 'audience' && issue.eventIds.includes(event.id)));
    Store.updateEvent(day.id, event.id, { attendees: '' });
    assert(getScheduleReviewIssues([day], Store.getGroups()).some(issue => issue.type === 'audience' && issue.eventIds.includes(event.id)));
  });

  it('round trips explicit placement through schema 3, versions and inactive schedules', () => {
    loadApprovedBands('normal');
    const day = Store.getDay(Store.getActiveDay());
    const event = day.events[0];
    Store.updateEvent(day.id, event.id, { placement: 'concurrent' });
    const state = buildVersionState();
    const workbook = getScheduleWorkbookSnapshot();
    const inactive = workbook.schedules.find(schedule => schedule.id !== workbook.activeScheduleId);
    inactive.current.days[0].events[0].placement = 'main';
    loadParsedScheduleData(parseScheduleWorkbookContent(JSON.stringify(workbook))); hideLibrary();
    assert.equal(Store.getEvents(day.id).find(item => item.id === event.id).placement, 'concurrent');
    assert.deepEqual(getScheduleWorkbookSnapshot().schedules.find(schedule => schedule.id === inactive.id), inactive);
    Store.updateEvent(day.id, event.id, { placement: 'main' }); loadVersionState(state);
    assert.equal(Store.getEvents(day.id).find(item => item.id === event.id).placement, 'concurrent');
    assert.equal(getScheduleWorkbookSnapshot().schemaVersion, 3);
    assert.equal(normalizeEvent({ ...event, placement: 'invalid' }).placement, undefined);
  });

  it('previews uncommitted Quick Edit names and commits the same text with a format choice', () => {
    loadApprovedBands('normal');
    const event = edit(Store.getDay(Store.getActiveDay()).events[0].id);
    openDayEventSheetModal();
    const input = document.querySelector('#daySheetDetailPanel [data-field="attendees"]');
    input.value = 'Van Dyke\nDe la Cruz'; input.dispatchEvent(new Event('input', { bubbles: true }));
    assert(document.querySelector('#sheet-attendee-preview').textContent.includes('Van Dyke'));
    change('#sheet-attendee-format', 'lines');
    assert.equal(event.attendees, 'Van Dyke\nDe la Cruz');
    assert.equal(document.querySelector('#sheet-attendee-preview .attendee-count').textContent, '2 entries · entered order');
    closeDayEventSheetModal();
  });

  it('blocks stale authoring controls and disables the new controls while read-only', () => {
    loadApprovedBands('normal');
    const event = edit(Store.getDay(Store.getActiveDay()).events[0].id);
    const before = JSON.stringify(Store.getPersistedState());
    try {
      _navigationSaving = true;
      document.querySelector('#insp-placement-concurrent').click();
      assert.equal(JSON.stringify(Store.getPersistedState()), before);
      renderInspector();
      assert(document.querySelector('#insp-placement-main').disabled);
      assert(document.querySelector('#insp-attendee-format').disabled);
      assert(document.querySelector('#insp-add-flight').disabled);
      // Quick Edit only opens while editable. Simulate access changing after
      // opening, then send a stale change through its capture guard.
      _navigationSaving = false;
      openDayEventSheetModal();
      _navigationSaving = true;
      change('.day-sheet-placement-select', 'concurrent');
      assert(document.querySelector('.day-sheet-placement-select').disabled);
      assert(document.querySelector('#sheet-attendee-format').disabled);
      assert(!document.querySelector('#daySheetClose').disabled);
      change('.day-sheet-placement-select', 'concurrent');
      assert.equal(JSON.stringify(Store.getPersistedState()), before);
    } finally { _navigationSaving = false; closeDayEventSheetModal(); edit(event.id); }
  });

  it('flags flight times after the parent changes and offers the current full-event range', () => {
    loadApprovedBands('main');
    const day = Store.getDay(Store.getActiveDay());
    const event = edit(day.events[0].id);
    document.querySelector('#insp-add-flight').click();
    const input = document.querySelector('#insp-evt-end');
    const end = minutesToTime(timeToMinutes(event.endTime) - 5);
    input.value = end; input.dispatchEvent(new Event('blur'));
    const warning = document.querySelector('.flight-time-warning');
    assert(!warning.hidden);
    assert(document.querySelector('.flight-editor-item summary').textContent.includes('Review times'));
    const button = document.querySelector('[data-flight-full-time]');
    assert(button.textContent.includes(end));
    button.click();
    assert(warning.hidden);
    assert.equal(event.flightActivities[0].endTime, end);
    assert(!document.querySelector('.flight-editor-item summary').textContent.includes('Review times'));
  });
});

// Release audit regressions: assert the intended result, not just a valid value.
describe('Authoring and handoff — release audit', () => {
  function seed() {
    resetUiHarnessState();
    const { day1 } = seedUiSchedule({ skin: 'bands' });
    const event = day1.events[0];
    Store.updateEvent(day1.id, event.id, { startTime: '0800', endTime: '0830', placement: 'main' });
    selectEntity('event', day1.id, event.id);
    return { day: Store.getDay(day1.id), event };
  }
  it('edits Start then End as one range, preserving the intended later start', () => {
    const { day, event } = seed();
    const start = document.getElementById('insp-evt-start'), end = document.getElementById('insp-evt-end');
    start.focus(); start.value = '0905'; end.focus();
    assert.equal(start.value, '0905', 'keep draft while entering its partner');
    assert.equal(event.startTime, '0800', 'do not persist an incomplete range');
    end.value = '0937'; document.getElementById('insp-evt-title').focus();
    assert.deepEqual([event.startTime, event.endTime], ['0905', '0937']);
    assert(BandLayout.page(day).includes('0905-0937'));
  });
  it('supports End then Start when moving an event earlier', () => {
    const { event } = seed();
    const start = document.getElementById('insp-evt-start'), end = document.getElementById('insp-evt-end');
    end.focus(); end.value = '07:37'; start.focus();
    assert.equal(end.value, '07:37');
    start.value = '07:05'; document.getElementById('insp-evt-title').focus();
    assert.deepEqual([event.startTime, event.endTime], ['0705', '0737']);
  });
  it('keeps the selected event identity when an empty title is restored', () => {
    const { event } = seed();
    const title = document.getElementById('insp-evt-title'), before = event.title;
    title.focus(); title.value = ''; title.dispatchEvent(new Event('input'));
    document.getElementById('insp-evt-start').focus();
    assert.equal(event.title, before);
    assert.equal(document.getElementById('insp-event-identity').textContent, before);
  });
  it('explains a rejected range beside the fields and retains the last valid pair', () => {
    const { event } = seed();
    const start = document.getElementById('insp-evt-start'), end = document.getElementById('insp-evt-end');
    start.focus(); start.value = '2500'; end.focus(); end.value = '2600';
    document.getElementById('insp-evt-title').focus();
    assert.deepEqual([event.startTime, event.endTime], ['0800', '0830']);
    const feedback = document.getElementById('insp-time-feedback');
    assert(!feedback.hidden && feedback.textContent.includes('Time change not applied') && feedback.textContent.includes('0800–0830'));
  });
  it('retains named assignments by default in group handouts, lists exclusions and keeps their conflict checks', () => {
    const { day } = seed();
    const first = Store.addEvent(day.id, { title: 'Records review', startTime: '1200', endTime: '1300', placement: 'concurrent', groupId: '', attendees: 'Chan; Bell', attendeeFormat: 'suggested' });
    const second = Store.addEvent(day.id, { title: 'Equipment issue', startTime: '1230', endTime: '1330', placement: 'concurrent', groupId: '', attendees: 'Chan; Doe', attendeeFormat: 'suggested' });
    const html = buildPrintMarkup({ audienceId: 'grp_all' });
    assert(html.includes('Records review') && html.includes('Equipment issue'));
    openPrintReview();
    const audience = document.getElementById('printAudience'); audience.value = 'grp_all'; audience.dispatchEvent(new Event('change'));
    const named = document.getElementById('printIncludeNamed'); assert(named.checked);
    named.checked = false; named.dispatchEvent(new Event('change'));
    const omissions = document.getElementById('printOmissions');
    assert(!omissions.hidden && omissions.textContent.includes(first.title) && omissions.textContent.includes(second.title));
    assert(document.getElementById('printReviewIssues').textContent.includes('matching attendee entries'));
    assert(document.querySelector('.print-review-checks').open);
    assert(!buildPrintMarkup({ audienceId: 'grp_all', includeNamed: false }).includes('Records review'));
    assert(day.events.includes(first) && day.events.includes(second), 'filtering never edits the workbook');
    closeModal('printReviewModal');
  });
  it('links overlapping named assignments in the event editor without flagging intentional main exceptions', () => {
    const { day } = seed();
    Store.updateEvent(day.id, day.events[0].id, { startTime: '1200', endTime: '1400', attendees: 'Chan', attendeeFormat: 'lines' });
    const first = Store.addEvent(day.id, { title: 'Records review', startTime: '1200', endTime: '1300', placement: 'concurrent', groupId: '', attendees: 'Chan', attendeeFormat: 'lines' });
    const second = Store.addEvent(day.id, { title: 'Equipment issue', startTime: '1230', endTime: '1330', placement: 'concurrent', groupId: '', attendees: 'Chan', attendeeFormat: 'lines' });
    selectEntity('event', day.id, first.id);
    const review = document.getElementById('insp-assignment-review');
    assert(review.textContent.includes('confirm identity'));
    assert.equal(review.querySelectorAll('[data-review-event]').length, 1);
    review.querySelector('button').click(); assert.equal(_selection.entityId, second.id);
    const names = document.getElementById('insp-evt-attendees'); names.value = 'Smith'; names.dispatchEvent(new Event('input'));
    assert(document.getElementById('insp-assignment-review').hidden, 'resolved warning clears while typing');
  });
  it('keeps legacy export separate from workbook backup and does not acknowledge unsaved workbook edits', async () => {
    seed(); markDirty();
    const originalPicker = window.showSaveFilePicker, originalDownload = window.triggerDownload;
    window.showSaveFilePicker = undefined; window.triggerDownload = () => {};
    try {
      await saveDataFile();
      assert(isDirty(), 'partial export must never mark the complete workbook saved');
      assert(!_manualDraftExported);
      assert(document.getElementById('toast').textContent.includes('current schedule only'));
      openSettingsModal('advanced');
      const legacy = document.querySelector('.legacy-export');
      assert(!legacy.open && legacy.textContent.includes('Excludes other schedules and saved versions'));
      assert(!document.getElementById('settings-save-schedule-file').closest('details'), 'complete save stays visible');
      closeSettingsModal();
    } finally { window.showSaveFilePicker = originalPicker; window.triggerDownload = originalDownload; }
  });
  it('opens a downloaded workbook without inventing an edit, then identifies a real edit', async () => {
    seed();
    const snapshot = getScheduleWorkbookSnapshot(), original = Store.getPersistedState();
    await openImportedLocalDraft(original, 'October.schedule', original.title, snapshot.schedule);
    assert(!isDirty()); assert.equal(document.getElementById('saveIndicator').textContent, 'Opened');
    const button = document.getElementById('editorManualExportBtn');
    markDirty();
    assert.equal(document.getElementById('editorManualExportBtn'), button, 'a blur commit must not replace the Save click target');
    assert(document.getElementById('editorAccessText').textContent.includes('new download'));
    assert.equal(document.getElementById('saveIndicator').textContent, 'Unsaved');
  });
});
