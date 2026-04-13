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
  window.getLastSavedAt = function() { return null; };

  sessionStorage.clear();
  Store.reset();
  Store.setTitle('Inspector Tests');
  Store.setActiveDay(null);
  selectEntity(null);
}

describe('inspector — day sheet modal', () => {
  it('opens with the selected event expanded and shows attendees', () => {
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
    assert(attendeesInput, 'expanded event should show attendees input');
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
