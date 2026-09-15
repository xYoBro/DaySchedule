describe('UI Harness — alternate-view interactions', () => {
  it('fits alternate paper after the library reveals the editor', () => {
    ['cards', 'grid', 'phases'].forEach(skin => {
      resetUiHarnessState(); const seeded = seedUiSchedule({ skin });
      Store.getDay(seeded.day1.id).events = [];
      Store.addEvent(seeded.day1.id, { title: 'Opening brief', startTime: '0800', endTime: '0900', placement: 'main' });
      document.querySelector('.app-body').style.display = 'none';
      renderActiveDay(); hideLibrary();
      assert.equal(document.querySelector('.alternate-sheet').dataset.fit, 'true', 'Fit after revealing ' + skin);
    });
  });
  it('preserves group comparison, group agendas and a vertical phase sequence', () => {
    ['cards', 'grid', 'phases'].forEach(skin => {
      resetUiHarnessState(); const seeded = seedUiSchedule({ skin });
      Store.getDay(seeded.day1.id).events = [];
      const groups = Store.getGroups().filter(group => group.scope !== 'main');
      const a = groups[0]; assert(a, 'Fixture has a limited audience');
      const b = Store.addGroup({ name: 'Second team', scope: 'limited', color: '#556677' });
      const main = Store.addEvent(seeded.day1.id, { title: 'Field exercise', startTime: '0900', endTime: '1200', placement: 'main' });
      const first = Store.addEvent(seeded.day1.id, { title: 'Radio check', startTime: '0900', endTime: '1000', groupId: a.id, placement: 'concurrent' });
      const second = Store.addEvent(seeded.day1.id, { title: 'Route planning', startTime: '0900', endTime: '1000', groupId: b.id, placement: 'concurrent' });
      Store.addEvent(seeded.day1.id, { title: 'Next team task', startTime: '0930', endTime: '1000', groupId: b.id, placement: 'concurrent' });
      renderActiveDay();
      if (skin === 'cards') {
        const panels = document.querySelectorAll('.av-group-panel'); assert.equal(panels.length, 2);
        assert(panels[0].querySelector('[data-event-id="' + first.id + '"]'));
        assert(panels[1].querySelector('[data-event-id="' + second.id + '"]'));
        assert(document.querySelector('.av-shared-timeline [data-event-id="' + main.id + '"]'));
      } else if (skin === 'grid') {
        const table = document.querySelector('table.av-matrix'); assert(table);
        assert(table.querySelector('thead').textContent.includes(a.name));
        assert(table.querySelector('thead').textContent.includes(b.name));
        const row = table.querySelector('[data-event-id="' + first.id + '"]').closest('tr');
        assert(row.querySelector('[data-event-id="' + second.id + '"]'), 'Same start time is aligned across groups');
        assert(row.querySelector('[data-lane-group="' + a.id + '"] [data-event-id="' + first.id + '"]'));
        assert.equal(row.querySelector('[data-lane-group="' + a.id + '"]').rowSpan, 2, 'Continuing work joins later empty cells without repeating its record');
      } else {
        const sequence = document.querySelector('ol.av-phase-sequence'); assert(sequence);
        assert.equal(getComputedStyle(sequence).display, 'block');
        const phase = sequence.querySelector('[data-event-id="' + main.id + '"]').closest('.av-phase');
        assert(phase.querySelector('[data-event-id="' + first.id + '"]'));
        assert(phase.querySelector('[data-event-id="' + second.id + '"]'));
      }
    });
  });
  it('selects events by keyboard and follows matching concurrent references', () => {
    ['cards', 'grid', 'phases'].forEach(skin => {
      resetUiHarnessState(); const seeded = seedUiSchedule({ skin });
      const main = Store.addEvent(seeded.day1.id, { title: 'Primary block', startTime: '1100', endTime: '1400', placement: 'main' });
      const task = Store.addEvent(seeded.day1.id, { title: 'Named appointment', startTime: '1230', endTime: '1330', placement: 'concurrent', attendees: 'Doe' });
      renderActiveDay();
      const record = document.querySelector('.av-event[data-event-id="' + main.id + '"]');
      record.focus(); record.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      assert(document.querySelector('.av-event[data-event-id="' + main.id + '"].selected'));
      document.querySelector('.av-main[data-event-id="' + main.id + '"] [data-event-ref="' + task.id + '"]').click();
      assert(document.querySelector('.av-event[data-event-id="' + task.id + '"].selected'));
      assert.equal(document.getElementById('insp-evt-title').value, 'Named appointment');
    });
  });

  it('selects and edits reminders from every alternate paper view', () => {
    ['cards', 'grid', 'phases'].forEach(skin => {
      resetUiHarnessState(); const seeded = seedUiSchedule({ skin }); renderActiveDay();
      const note = Store.getNotes(seeded.day1.id)[0];
      document.querySelector('.alternate-sheet [data-note-id="' + note.id + '"] .note-select').click();
      const input = document.getElementById('insp-note-text'); assert(input);
      input.value = 'Bring your notebook.'; input.dispatchEvent(new Event('input', { bubbles: true }));
      assert.equal(Store.getNotes(seeded.day1.id).find(item => item.id === note.id).text, 'Bring your notebook.');
      assert(document.querySelector('.av-note.selected').textContent.includes('Bring your notebook.'));
    });
  });

  it('opens the existing Customize dialog from the paper heading with Space', () => {
    ['cards', 'grid', 'phases'].forEach(skin => {
      resetUiHarnessState(); seedUiSchedule({ skin }); renderActiveDay();
      const header = document.querySelector('.av-header'); header.focus();
      header.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      assert(document.getElementById('settingsModal').classList.contains('active'));
      const logo = document.getElementById('settings-band-logo'); assert(logo);
      logo.checked = false; logo.dispatchEvent(new Event('change', { bubbles: true }));
      assert(!document.querySelector('.alternate-sheet .av-logo'));
      const notes = document.getElementById('settings-band-notes'); assert(notes);
      notes.value = '108'; notes.dispatchEvent(new Event('change', { bubbles: true }));
      assert.equal(getBandSettings(getCurrentScheduleFileData().theme).notesHeight, 108);
      closeSettingsModal();
    });
  });

  it('keeps changing flight locations next to their own activities', () => {
    ['cards', 'grid', 'phases'].forEach(skin => {
      resetUiHarnessState(); const seeded = seedUiSchedule({ skin });
      const event = Store.addEvent(seeded.day1.id, { title: 'Training', startTime: '1200', endTime: '1600', placement: 'main', flightActivities: [
        { id: 'a', flight: 'Alpha', title: 'First practical', startTime: '1200', endTime: '1400', location: 'Room A', poc: 'SSgt Doe', description: 'First instructions.' },
        { id: 'b', flight: 'Alpha', title: 'Second practical', startTime: '1400', endTime: '1600', location: 'Room B', poc: 'MSgt Chan', description: 'Second instructions.' },
      ] });
      renderActiveDay();
      const activities = document.querySelectorAll('.av-event[data-event-id="' + event.id + '"] .av-flight-activity');
      assert.equal(activities.length, 2);
      assert(activities[0].textContent.includes('Room A') && activities[0].textContent.includes('SSgt Doe'));
      assert(!activities[0].textContent.includes('Room B'));
      assert(activities[1].textContent.includes('Room B') && activities[1].textContent.includes('MSgt Chan'));
      assert(!activities[1].textContent.includes('Room A'));
    });
  });

  it('blocks oversized Fit jobs and gives native print an explicit error sheet', async () => {
    ['cards', 'grid', 'phases'].forEach(skin => {
      resetUiHarnessState(); const seeded = seedUiSchedule({ skin });
      Store.updateEvent(seeded.day1.id, Store.getEvents(seeded.day1.id)[0].id, { description: 'A complete instruction. '.repeat(3000) });
      renderActiveDay();
      const host = document.createElement('div'); host.className = 'print-measurement'; document.body.appendChild(host);
      preparePrintPages(host, { mode: 'fit' });
      assert(host.querySelector('.alternate-sheet[data-fit="false"] .av-print-error'));
      assert(host.textContent.includes('A complete instruction.'));
      host.remove();
    });
  });
});
