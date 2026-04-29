function mountInspectorFixture() {
  let fixture = document.getElementById('inspectorFixture');
  if (!fixture) {
    fixture = document.createElement('div');
    fixture.id = 'inspectorFixture';
    document.body.appendChild(fixture);
  }

  fixture.innerHTML = ''
    + '<div id="saveIndicator" class="save-status"></div>'
    + '<div id="toast" class="toast"></div>'
    + '<input type="text" id="tbTitle">'
    + '<div id="dayTabs"></div>'
    + '<div id="scheduleContainer"></div>'
    + '<div id="inspectorPanel"></div>'
    + '<div class="modal-overlay" id="settingsModal"><div class="modal" id="settingsModalContent"></div></div>'
    + '<div class="modal-overlay" id="dayEventSheetModal"><div class="modal" id="dayEventSheetModalContent"></div></div>';

  window.renderDay = function() {};
  window.returnToLibrary = function() {};
  window.openHelpModal = function() {};
  window.openVersionPanel = function() {};
  window.printAllDays = function() {};
  window.renameScheduleFile = function() { return Promise.resolve(true); };
  window.hasDirectoryAccess = function() { return false; };
  window.setCurrentFile = function() {};
  window.setCurrentScheduleFileData = function() {};
  window.getCurrentScheduleFileData = function() { return null; };
  window.getLastSavedAt = function() { return null; };

  sessionStorage.clear();
  Store.reset();
  Store.setTitle('Inspector Tests');
  Store.setActiveDay(null);
  selectEntity(null);
}

describe('inspector — day sheet modal', () => {
  it('shows specific people fields inline for the selected event', () => {
    mountInspectorFixture();

    const day = Store.addDay({ date: '2026-04-13', startTime: '0700', endTime: '1630' });
    const evt = Store.addEvent(day.id, {
      title: 'Weapons Qualification',
      startTime: '0830',
      endTime: '1100',
      groupId: 'grp_chiefs',
      attendees: 'RSO: TSgt Park, Ammo: SrA Bell',
    });
    Store.setActiveDay(day.id);

    selectEntity('event', day.id, evt.id);
    openDayEventSheetModal();

    const overlay = document.getElementById('dayEventSheetModal');
    const attendeesInput = document.querySelector(
      '#dayEventSheetModalContent [data-event-id="' + evt.id + '"][data-field="attendees"]'
    );

    assert(overlay.classList.contains('active'), 'day sheet modal should be active');
    assert(attendeesInput, 'selected event should show specific-people input');
    assert.equal(attendeesInput.value, 'RSO: TSgt Park, Ammo: SrA Bell');
  });

  it('commitDayEventSheetUpdate persists attendee edits and rerenders the modal', () => {
    mountInspectorFixture();

    const day = Store.addDay({ date: '2026-04-13', startTime: '0700', endTime: '1630' });
    const evt = Store.addEvent(day.id, {
      title: 'Aircraft Launch Sim',
      startTime: '1200',
      endTime: '1400',
      groupId: 'grp_chiefs',
      attendees: 'Crew chiefs',
    });
    Store.setActiveDay(day.id);

    selectEntity('event', day.id, evt.id);
    openDayEventSheetModal();
    commitDayEventSheetUpdate(day.id, evt.id, { attendees: 'Crew chiefs, AGE' }, { rerenderModal: true });

    const stored = Store.getEvents(day.id).find(e => e.id === evt.id);
    const attendeesInput = document.querySelector(
      '#dayEventSheetModalContent [data-event-id="' + evt.id + '"][data-field="attendees"]'
    );

    assert.equal(stored.attendees, 'Crew chiefs, AGE');
    assert.equal(attendeesInput.value, 'Crew chiefs, AGE');
  });

  it('rejects invalid quick-edit time ranges and restores the prior value', async () => {
    mountInspectorFixture();

    const day = Store.addDay({ date: '2026-04-13', startTime: '0700', endTime: '1630' });
    const evt = Store.addEvent(day.id, {
      title: 'Aircraft Launch Sim',
      startTime: '1200',
      endTime: '1400',
      groupId: 'grp_chiefs',
    });
    Store.setActiveDay(day.id);

    selectEntity('event', day.id, evt.id);
    openDayEventSheetModal();

    const endInput = document.querySelector(
      '#dayEventSheetModalContent .day-sheet-time-input[data-event-id="' + evt.id + '"][data-field="endTime"]'
    );
    endInput.value = '1100';
    endInput.dispatchEvent(new Event('blur'));
    await wait(0);

    const stored = Store.getEvents(day.id).find(item => item.id === evt.id);
    assert.equal(stored.endTime, '1400');
    assert.equal(endInput.value, '1400');
    assert.equal(document.getElementById('toast').textContent, 'End time must be after start time.');
  });

  it('explains that main-track placement usually comes from the selected audience', () => {
    mountInspectorFixture();

    const day = Store.addDay({ date: '2026-04-13', startTime: '0700', endTime: '1630' });
    Store.addEvent(day.id, {
      title: 'Formation',
      startTime: '0700',
      endTime: '0730',
      groupId: 'grp_all',
      isMainEvent: true,
    });
    Store.setActiveDay(day.id);

    openDayEventSheetModal();

    const autoLabel = document.querySelector('#dayEventSheetModalContent .day-sheet-cell-note');
    const statusBadge = document.querySelector('#dayEventSheetModalContent .day-sheet-badge-track');
    const specificPeopleLabel = document.querySelector('#dayEventSheetModalContent .day-sheet-detail-label');
    const detailsBtn = document.querySelector('#daySheetOpenDetails');

    assert.equal(autoLabel.textContent.trim(), 'Auto');
    assert.equal(statusBadge.textContent.trim(), 'Main');
    assert.equal(specificPeopleLabel.textContent.trim(), 'Specific people');
    assert.equal(detailsBtn.textContent.trim(), 'Details');
  });

  it('opens the full event editor from quick edit', () => {
    mountInspectorFixture();

    const day = Store.addDay({ date: '2026-04-13', startTime: '0700', endTime: '1630' });
    const evt = Store.addEvent(day.id, {
      title: 'Commander Update',
      startTime: '0900',
      endTime: '0930',
      groupId: 'grp_all',
    });
    Store.setActiveDay(day.id);

    openDayEventSheetModal();

    const btn = document.querySelector('#daySheetOpenDetails');
    btn.click();

    assert(!_daySheetSelectedEventId, 'quick edit selection should clear when modal closes');
    assert.equal(_selection.type, 'event');
    assert.equal(_selection.dayId, day.id);
    assert.equal(_selection.entityId, evt.id);
    assert(document.getElementById('inspectorPanel').textContent.includes('Event'));
  });
});

describe('inspector — settings and event details copy', () => {
  it('keeps Primary and Supporting labels when toggling audience groups', () => {
    mountInspectorFixture();

    const modal = document.getElementById('settingsModalContent');
    renderSettingsModal(modal);

    const audiencesTab = modal.querySelector('.settings-tab[data-settings-tab="audiences"]');
    assert(audiencesTab, 'audiences tab should exist at the top level');
    audiencesTab.click();

    const scopeBtn = modal.querySelector('.insp-group-scope');
    assert(scopeBtn, 'group scope button should exist');

    const firstLabel = scopeBtn.textContent.trim();
    scopeBtn.click();
    const secondLabel = scopeBtn.textContent.trim();

    assert(firstLabel === 'Primary' || firstLabel === 'Supporting');
    assert(secondLabel === 'Primary' || secondLabel === 'Supporting');
    assert(firstLabel !== secondLabel, 'toggling should swap the label');
  });

  it('preserves highlighted limited-event overrides when an audience switches from Primary to Supporting', () => {
    mountInspectorFixture();

    const day = Store.addDay({ date: '2026-04-13', startTime: '0700', endTime: '1630' });
    const evt = Store.addEvent(day.id, {
      title: 'Flight Training',
      startTime: '0800',
      endTime: '1000',
      groupId: 'grp_flight',
      isMainEvent: true,
    });
    Store.setActiveDay(day.id);

    const modal = document.getElementById('settingsModalContent');
    renderSettingsModal(modal);
    modal.querySelector('.settings-tab[data-settings-tab="audiences"]').click();

    const scopeBtn = modal.querySelector('.insp-group-item[data-group-id="grp_flight"] .insp-group-scope');
    scopeBtn.click();

    const updated = Store.getEvents(day.id).find(item => item.id === evt.id);
    assert.equal(Store.getGroup('grp_flight').scope, 'limited');
    assert.equal(updated.isMainEvent, true);
  });

  it('explains main-track placement in event details', () => {
    mountInspectorFixture();

    const day = Store.addDay({ date: '2026-04-13', startTime: '0700', endTime: '1630' });
    const evt = Store.addEvent(day.id, {
      title: 'Weapons Qualification',
      startTime: '0830',
      endTime: '1100',
      groupId: 'grp_snco',
    });
    Store.setActiveDay(day.id);

    selectEntity('event', day.id, evt.id);
    renderInspector();

    const panel = document.getElementById('inspectorPanel');
    const text = panel.textContent;

    assert(text.includes('Audience'));
    assert(text.includes('Specific People'));
    assert(text.includes('Main Track'));
  });

  it('rejects invalid full-editor time ranges and restores the previous value', () => {
    mountInspectorFixture();

    const day = Store.addDay({ date: '2026-04-13', startTime: '0700', endTime: '1630' });
    const evt = Store.addEvent(day.id, {
      title: 'Weapons Qualification',
      startTime: '0830',
      endTime: '1100',
      groupId: 'grp_snco',
    });
    Store.setActiveDay(day.id);

    selectEntity('event', day.id, evt.id);
    renderInspector();

    const panel = document.getElementById('inspectorPanel');
    const endInput = panel.querySelector('#insp-evt-end');
    endInput.value = '0800';
    endInput.dispatchEvent(new Event('blur'));

    const stored = Store.getEvents(day.id).find(item => item.id === evt.id);
    assert.equal(stored.endTime, '1100');
    assert.equal(endInput.value, '1100');
    assert.equal(document.getElementById('toast').textContent, 'End time must be after start time.');
  });

  it('explains shared-time exceptions in event details', () => {
    mountInspectorFixture();
    const limitedAudienceName = Store.getGroup('grp_snco').name;

    const day = Store.addDay({ date: '2026-04-13', startTime: '0700', endTime: '1630' });
    const shared = Store.addEvent(day.id, {
      title: 'All-Hands Cyber Awareness',
      startTime: '1500',
      endTime: '1530',
      groupId: 'grp_all',
    });
    const limited = Store.addEvent(day.id, {
      title: 'Convoy Ops Brief',
      startTime: '1400',
      endTime: '1530',
      groupId: 'grp_snco',
      attendees: 'MSgt Franklin',
    });
    Store.setActiveDay(day.id);

    selectEntity('event', day.id, shared.id);
    renderInspector();
    let panel = document.getElementById('inspectorPanel');
    assert(panel.textContent.includes('Exceptions active during this block'));
    assert(panel.textContent.includes(limitedAudienceName));
    assert(panel.textContent.includes('Named people: MSgt Franklin'));

    selectEntity('event', day.id, limited.id);
    renderInspector();
    panel = document.getElementById('inspectorPanel');
    assert(panel.textContent.includes('It will read as an exception for ' + limitedAudienceName));
    assert(panel.textContent.includes('All-Hands Cyber Awareness'));
    assert(panel.textContent.includes('Named people: MSgt Franklin'));
  });
});

describe('inspector — conflict detection', () => {
  it('warns when a highlighted limited event overlaps a main event', () => {
    mountInspectorFixture();

    const day = Store.addDay({ date: '2026-04-13', startTime: '0700', endTime: '1630' });
    Store.addEvent(day.id, {
      title: 'Formation',
      startTime: '0800',
      endTime: '0900',
      groupId: 'grp_all',
    });
    const evt = Store.addEvent(day.id, {
      title: 'SNCO Sync',
      startTime: '0830',
      endTime: '0930',
      groupId: 'grp_snco',
      isMainEvent: true,
    });

    checkTimeConflict(day.id, evt.id);

    assert(
      document.getElementById('toast').textContent.includes('Formation'),
      'toast should mention the conflicting main event'
    );
  });
});
