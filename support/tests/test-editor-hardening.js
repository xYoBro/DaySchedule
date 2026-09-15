describe('Editor — reliability and keyboard regressions', () => {
  it('stacks a recovery dialog above Customize and returns to the rendered header', async () => {
    resetUiHarnessState();
    const seeded = await seedUiScheduleFile('Nested dialogs', { skin: 'bands' });
    await openSchedule(seeded.fileName);
    await claimCurrentScheduleLock({ silent: true });
    document.querySelector('[data-band-customize]').focus();
    openSettingsModal();
    document.querySelector('#staleWarningModal .modal').innerHTML = '<h2>Review recovery</h2><button>Cancel</button>';
    openModal('staleWarningModal');
    assert(Number(document.getElementById('staleWarningModal').style.zIndex) > Number(document.getElementById('settingsModal').style.zIndex));
    assert(document.getElementById('staleWarningModal').contains(document.activeElement));
    closeModal('staleWarningModal');
    closeSettingsModal();
    assert.equal(document.activeElement, document.querySelector('[data-band-customize]'));
  });

  it('rejects mutations when an already open editor loses edit access', async () => {
    resetUiHarnessState();
    const seeded = await seedUiScheduleFile('Lost access', { skin: 'bands' });
    await openSchedule(seeded.fileName);
    await claimCurrentScheduleLock({ silent: true });
    _settingsActiveTab = 'look';
    openSettingsModal();
    document.querySelector('[data-palette="custom"]').click();
    const before = JSON.stringify(getCurrentScheduleFileData().theme);
    _editorReadOnly = true;
    const input = document.querySelector('[data-custom-color="accent"]');
    input.value = '#123456';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    assert.equal(JSON.stringify(getCurrentScheduleFileData().theme), before);
    document.querySelector('[data-skin="grid"]').click();
    assert.equal(JSON.stringify(getCurrentScheduleFileData().theme), before);
    closeSettingsModal();
  });
  it('preserves exact imported minutes on blur and in Quick Edit', async () => {
    resetUiHarnessState();
    const seeded = await seedUiScheduleFile('Exact minutes', { skin: 'bands' });
    await openSchedule(seeded.fileName);
    await claimCurrentScheduleLock({ silent: true });
    const dayId = Store.getActiveDay();
    const evt = Store.addEvent(dayId, { title: 'Exact', startTime: '1405', endTime: '1437', groupId: 'grp_all' });
    selectEntity('event', dayId, evt.id);
    const start = document.getElementById('insp-evt-start');
    start.dispatchEvent(new Event('blur'));
    assert.equal(Store.getEvents(dayId).find(e => e.id === evt.id).startTime, '1405');
    openDayEventSheetModal();
    const modal = document.getElementById('dayEventSheetModalContent');
    const times = getDayEventSheetTimeInputs(modal, evt.id);
    times.startInput.value = '14:05';
    commitDayEventSheetTimeRange(modal, dayId, evt.id);
    assert.equal(Store.getEvents(dayId).find(e => e.id === evt.id).endTime, '1437');
    assert.equal(times.startInput.value, '1405');
    closeDayEventSheetModal();
  });

  it('adds subsequent events to the new active day', async () => {
    resetUiHarnessState();
    const seeded = await seedUiScheduleFile('New day', { skin: 'bands' });
    await openSchedule(seeded.fileName);
    await claimCurrentScheduleLock({ silent: true });
    const originalId = Store.getActiveDay();
    const originalCount = Store.getEvents(originalId).length;
    document.getElementById('addDayBtn').click();
    const newId = Store.getActiveDay();
    assert(newId !== originalId, 'new day must be selected');
    document.getElementById('addEventBtn').click();
    assert.equal(Store.getEvents(newId).length, 1);
    assert.equal(Store.getEvents(originalId).length, originalCount);
  });

  it('cancels a pending Quick Edit cell before closing the dialog', async () => {
    resetUiHarnessState();
    const seeded = await seedUiScheduleFile('Cancel cell', { skin: 'bands' });
    await openSchedule(seeded.fileName);
    await claimCurrentScheduleLock({ silent: true });
    openDayEventSheetModal();
    const input = document.querySelector('.day-sheet-title-input');
    const before = input.value;
    input.focus();
    input.value = 'Do not commit';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert.equal(input.value, before);
    assert(document.getElementById('dayEventSheetModal').classList.contains('active'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert(!document.getElementById('dayEventSheetModal').classList.contains('active'));
  });

  it('contains keyboard focus and restores the opener for a shared modal', async () => {
    resetUiHarnessState();
    const opener = document.getElementById('libraryHelpBtn');
    opener.focus();
    openModal('helpModal');
    const modal = document.getElementById('helpModal');
    assert.equal(modal.getAttribute('role'), 'dialog');
    assert.equal(modal.getAttribute('aria-modal'), 'true');
    const controls = getModalFocusable(modal);
    assert(controls.length > 1);
    controls[0].focus();
    controls[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    assert.equal(document.activeElement, controls[controls.length - 1]);
    closeModal('helpModal');
    assert.equal(document.activeElement, opener);
    assert(!opener.closest('[inert]'));
  });

  it('keeps explicit placement and keyboard focus after toggling meal or break', async () => {
    resetUiHarnessState();
    const seeded = await seedUiScheduleFile('Break state', { skin: 'bands' });
    await openSchedule(seeded.fileName);
    await claimCurrentScheduleLock({ silent: true });
    const dayId = Store.getActiveDay();
    const evt = Store.addEvent(dayId, { title: 'Support', startTime: '1400', endTime: '1500', groupId: '' });
    selectEntity('event', dayId, evt.id);
    const toggle = document.getElementById('insp-evt-break');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    assert(document.querySelector('#insp-placement-concurrent').checked);
    assert(document.querySelector('#insp-evt-break').checked);
    assert.equal(Store.getEvents(dayId).find(event => event.id === evt.id).placement, 'concurrent');
    assert.equal(document.getElementById('insp-evt-main'), null);
    assert.equal(document.activeElement.id, 'insp-evt-break');
  });

  it('provides named Quick Edit controls and editable custom palette colors', async () => {
    resetUiHarnessState();
    const seeded = await seedUiScheduleFile('Accessible controls', { skin: 'bands' });
    await openSchedule(seeded.fileName);
    await claimCurrentScheduleLock({ silent: true });
    openDayEventSheetModal();
    document.querySelectorAll('#dayEventSheetModalContent input, #dayEventSheetModalContent select, #dayEventSheetModalContent textarea').forEach(input => {
      assert(input.labels.length || input.getAttribute('aria-label'), 'control needs a name');
    });
    closeDayEventSheetModal();
    _settingsActiveTab = 'look';
    openSettingsModal();
    document.querySelector('[data-palette="custom"]').click();
    const input = document.querySelector('[data-custom-color="accent"]');
    assert(!input.closest('[hidden]'));
    input.value = '#123456';
    input.dispatchEvent(new Event('change'));
    assert.equal(getCurrentScheduleFileData().theme.customColors.accent, '#123456');
    closeSettingsModal();
  });
});
