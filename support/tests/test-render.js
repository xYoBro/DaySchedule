describe('UI Harness — render and skins', () => {
  it('renders clickable event nodes for every skin', () => {
    SKIN_NAMES.forEach(skin => {
      resetUiHarnessState();
      const seeded = seedUiSchedule({ skin: skin });
      renderDay(seeded.day1.id);

      const page = document.getElementById('previewPage');
      const container = document.getElementById('scheduleContainer');

      assert(page.classList.contains('skin-' + skin), 'page should reflect the active skin');
      assert(container.querySelector('[data-event-id]'), 'skin should emit clickable event nodes');
    });
  });

  it('keeps the selected event visibly selected across every skin', () => {
    SKIN_NAMES.forEach(skin => {
      resetUiHarnessState();
      const seeded = seedUiSchedule({ skin: skin });
      const target = Store.getEvents(seeded.day1.id).find(evt => evt.title === 'Weapons Qualification');

      selectEntity('event', seeded.day1.id, target.id);
      renderActiveDay();

      assert(
        document.querySelector('#scheduleContainer [data-event-id="' + target.id + '"].selected'),
        skin + ' should keep the selected event marked in the preview'
      );
    });
  });

  it('clicking an event marks it selected across every skin', () => {
    SKIN_NAMES.forEach(skin => {
      resetUiHarnessState();
      const seeded = seedUiSchedule({ skin: skin });
      const expected = Store.getEvents(seeded.day1.id).find(evt => evt.title === 'Weapons Qualification');

      renderActiveDay();

      const target = document.querySelector('#scheduleContainer [data-event-id="' + expected.id + '"]');

      target.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      assert(
        document.querySelector('#scheduleContainer [data-event-id="' + expected.id + '"].selected'),
        skin + ' should mark the clicked event as selected'
      );
      assert.equal(_selection.type, 'event');
      assert.equal(_selection.dayId, seeded.day1.id);
      assert.equal(_selection.entityId, expected.id);
    });
  });

  it('applies palette colors from file-level theme data during render', () => {
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'bands', palette: 'airforce' });

    renderDay(seeded.day1.id);

    assert.equal(
      document.documentElement.style.getPropertyValue('--sch-accent').trim(),
      PALETTES.airforce.accent
    );
  });

  it('bands main and supporting entries remain keyboard controls for the event editor', () => {
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'bands' });
    renderActiveDay();
    ['Formation', 'Weapons Qualification'].forEach(title => {
      const event = Store.getEvents(seeded.day1.id).find(evt => evt.title === title);
      ['Enter', ' '].forEach(key => {
        selectEntity(null);
        const card = document.querySelector('#scheduleContainer article.event[data-event-id="' + event.id + '"]');
        assert(card, 'event should have a complete selectable Bands entry');
        assert.equal(card.tagName, 'ARTICLE');
        assert.equal(card.tabIndex, 0);
        assert((card.getAttribute('aria-label') || '').includes(title), 'the control should identify its event');
        card.focus();
        card.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
        assert.equal(_selection.type, 'event');
        assert.equal(_selection.entityId, event.id);
        assert.equal(_selection.dayId, seeded.day1.id);
        assert(document.querySelector('#scheduleContainer [data-event-id="' + event.id + '"].selected'), 'keyboard activation should keep visible selection feedback');
      });
    });
  });

  it('bands shows complete concurrent attendees in one shared screen entry', () => {
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'bands', longConcurrentAttendees: true });

    renderDay(seeded.day1.id);

    const container = document.getElementById('scheduleContainer');
    const concurrent = Store.getEvents(seeded.day1.id).find(evt => evt.title === 'Weapons Qualification');
    assert(container.querySelector('.main-event > .time'), 'Bands should preserve the original main-band time gutter');
    const entries = container.querySelectorAll('[data-event-id="' + concurrent.id + '"]');
    assert(container.querySelector('.band-sheet'), 'screen should use the same Bands structure as readable print');
    assert.equal(entries.length, 1, 'concurrent event details should have one canonical entry');
    assert(entries[0].textContent.includes(concurrent.attendees), 'the complete attendee list belongs with the event');
    assert.equal(container.querySelectorAll('.dagger-note').length, 0, 'complete attendees need no detached footnote');
  });

  it('bands gives main details fixed fields and each concurrent event one complete entry below', () => {
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'bands', longConcurrentAttendees: true });
    const main = Store.getEvents(seeded.day1.id).find(evt => evt.title === 'AFSC Training');
    const concurrent = Store.getEvents(seeded.day1.id).find(evt => evt.title === 'Weapons Qualification');
    ['Team check', 'Equipment review'].forEach(title => Store.addEvent(seeded.day1.id, {
      title, startTime: '0830', endTime: '1030', groupId: 'grp_mx', description: title + ' instructions',
    }));
    renderActiveDay();
    const container = document.getElementById('scheduleContainer');
    const band = container.querySelector('.main-event[data-event-id="' + main.id + '"]');
    assert.equal(band.querySelector('h3').textContent, main.title);
    assert.equal(band.querySelector('.duration').textContent, '3h');
    assert.equal(band.querySelector('.description').textContent, main.description);
    assert(band.querySelector('.detail-location').textContent.includes(main.location));
    assert(band.querySelector('.audience').textContent.includes('By Flight'));
    const card = container.querySelector('.attendance-area [data-event-id="' + concurrent.id + '"]');
    assert(card.textContent.includes(concurrent.attendees));
    assert(card.textContent.includes(concurrent.description));
    assert.equal(container.querySelectorAll('[data-event-id]').length, Store.getEvents(seeded.day1.id).length);
    assert(band.querySelector('[data-event-ref="' + concurrent.id + '"]'));
  });

  it('bands keeps dense concurrent entries in a separate continuous list with no duplicate records', () => {
    resetUiHarnessState();
    loadSampleData();
    const dayId = Store.getDays()[0].id;
    setCurrentScheduleFileData({ name: Store.getTitle(), current: Store.getPersistedState(), versions: [], theme: { skin: 'bands', palette: 'classic' } });
    renderDay(dayId);
    const container = document.getElementById('scheduleContainer');
    const events = Store.getEvents(dayId);
    events.forEach(evt => assert.equal(container.querySelectorAll('[data-event-id="' + evt.id + '"]').length, 1, evt.title));
    const cards = Array.from(container.querySelectorAll('.attendance-area article'));
    assert(cards.length > 0);
    assert.deepEqual(cards.map(card => card.dataset.eventId), BandLayout.model(Store.getDay(dayId)).concurrent.map(event => event.id));
    assert(!container.textContent.includes('Between main events'));
  });

  it('bands can switch layouts and back through the existing Customize toolbar', () => {
    resetUiHarnessState();
    loadSampleData();
    const dayId = Store.getDays()[0].id;
    setCurrentScheduleFileData({
      name: Store.getTitle(),
      current: Store.getPersistedState(),
      versions: [],
      theme: { skin: 'bands', palette: 'classic' },
    });

    renderDay(dayId);

    document.getElementById('customizeBtn').click();
    assert(document.getElementById('settingsModal').classList.contains('active'), 'Customize should remain available');
    ['grid', 'cards', 'phases', 'bands'].forEach(skin => {
      document.querySelector('#settingsModal .skin-option[data-skin="' + skin + '"]').click();
      assert(document.getElementById('previewPage').classList.contains('skin-' + skin), 'toolbar should switch to ' + skin);
      assert.equal(getCurrentScheduleFileData().theme.skin, skin);
    });
    closeModal('settingsModal');
    assert(document.querySelector('#scheduleContainer .band-sheet'), 'returning to Bands should restore the connected screen renderer');
  });

  it('bands preserves day-tab navigation without carrying another day’s selection', () => {
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'bands', dayCount: 2 });
    const firstEvent = Store.getEvents(seeded.day1.id)[0];
    renderActiveDay();
    document.querySelector('#scheduleContainer [data-event-id="' + firstEvent.id + '"]').click();
    document.querySelector('#dayTabs [data-day-id="' + seeded.day2.id + '"]').click();
    assert.equal(Store.getActiveDay(), seeded.day2.id);
    assert.equal(_selection.type, null);
    assert(document.querySelector('#scheduleContainer .band-sheet'));
    assert(document.getElementById('scheduleContainer').textContent.includes('Day 2 Formation'));
    assert(!document.querySelector('#scheduleContainer [data-event-id="' + firstEvent.id + '"]'));
    document.querySelector('#dayTabs [data-day-id="' + seeded.day1.id + '"]').click();
    assert.equal(Store.getActiveDay(), seeded.day1.id);
    assert(document.querySelector('#scheduleContainer article.event[data-event-id="' + firstEvent.id + '"]'));
  });

  it('bands references are native keyboard buttons which select the original event', () => {
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'bands' });
    const spanning = Store.addEvent(seeded.day1.id, {
      title: 'Early supporting activity', startTime: '0645', endTime: '0835',
      groupId: 'grp_med', description: 'Keep this original full description.',
    });
    renderActiveDay();
    {
      selectEntity(null);
      const reference = document.querySelector('#scheduleContainer [data-event-ref="' + spanning.id + '"]');
      assert(reference, 'a cross-boundary event should have a continuation reference');
      assert.equal(reference.tagName, 'BUTTON');
      assert.equal(reference.tabIndex, 0);
      reference.click();
      assert.equal(_selection.type, 'event');
      assert.equal(_selection.entityId, spanning.id);
      assert.equal(_selection.dayId, seeded.day1.id);
      assert(document.querySelector('#scheduleContainer [data-event-id="' + spanning.id + '"].selected'), 'reference activation should highlight its canonical event');
      assert.equal(document.querySelectorAll('#scheduleContainer [data-event-id="' + spanning.id + '"]').length, 1);
    }
  });

  it('bands retains demoted main events in the chronological concurrent list', () => {
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'bands' });
    Store.updateGroup('grp_flight', { scope: 'limited' });
    Store.getEvents(seeded.day1.id).filter(evt => evt.groupId === 'grp_flight')
      .forEach(evt => Store.updateEvent(seeded.day1.id, evt.id, { isMainEvent: false }));
    renderDay(seeded.day1.id);
    Store.getEvents(seeded.day1.id).filter(evt => evt.groupId === 'grp_flight').forEach(evt => {
      assert(document.querySelector('.attendance-area [data-event-id="' + evt.id + '"]'));
      assert(!document.querySelector('.main-panel [data-event-id="' + evt.id + '"]'));
    });
  });

  it('bands separates the title, time, location and contact into predictable fields', () => {
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'bands' });
    const target = Store.getEvents(seeded.day1.id).find(evt => evt.title === 'Formation');
    renderDay(seeded.day1.id);
    const band = document.querySelector('.main-event[data-event-id="' + target.id + '"]');
    assert.equal(band.querySelector('h3').textContent, 'Formation');
    assert(band.querySelector('.time').textContent.startsWith('0700-0730'));
    assert(band.querySelector('.detail-location').textContent.includes('Bldg 200 Apron'));
    assert(!band.querySelector('h3').textContent.includes('Bldg 200 Apron'));
  });

  it('repeats event time without collapsing the title hierarchy', () => {
    ['grid', 'cards', 'phases'].forEach(skin => {
      resetUiHarnessState();
      const seeded = seedUiSchedule({ skin: skin });

      renderDay(seeded.day1.id);

      if (skin === 'grid') {
        const cell = Array.from(document.querySelectorAll('.grid-cell')).find(node => node.textContent.includes('Weapons Qualification'));
        assert.equal(cell.querySelector('.grid-cell-title').textContent.trim(), 'Weapons Qualification');
        assert.equal(cell.querySelector('.grid-cell-time').textContent.trim(), '0830–1030');
        assert(cell.querySelector('.grid-cell-meta-line').textContent.includes('Range 3'), 'grid should keep location in secondary metadata');
      }

      if (skin === 'cards') {
        const card = Array.from(document.querySelectorAll('.cards-event')).find(node => node.textContent.includes('Weapons Qualification'));
        assert.equal(card.querySelector('.cards-event-title').textContent.trim(), 'Weapons Qualification');
        assert.equal(card.querySelector('.cards-event-time').textContent.trim(), '0830–1030');
        assert(card.querySelector('.cards-event-meta').textContent.includes('Range 3'), 'cards should keep location in secondary metadata');
      }

      if (skin === 'phases') {
        const task = Array.from(document.querySelectorAll('.phase-task')).find(node => node.textContent.includes('Weapons Qualification'));
        assert(task.querySelector('.phase-task-meta').textContent.includes('0830–1030'), 'phases should repeat time in task metadata');
      }
    });
  });

  it('shows exception nudges when limited events overlap a shared block', () => {
    ['grid', 'cards', 'phases'].forEach(skin => {
      resetUiHarnessState();
      const seeded = seedUiSchedule({ skin: skin });
      Store.addEvent(seeded.day1.id, {
        title: 'All-Hands Cyber Awareness',
        startTime: '1500',
        endTime: '1530',
        groupId: 'grp_all',
        isMainEvent: true,
      });
      Store.addEvent(seeded.day1.id, {
        title: 'Convoy Ops Brief',
        startTime: '1400',
        endTime: '1530',
        groupId: 'grp_chiefs',
        attendees: 'MSgt Franklin',
      });

      renderDay(seeded.day1.id);

      assert(
        document.getElementById('scheduleContainer').textContent.includes('Exceptions: Flight Chiefs'),
        skin + ' should nudge users when a shared event has limited-audience exceptions'
      );
      assert(
        document.getElementById('scheduleContainer').textContent.includes('MSgt Franklin'),
        skin + ' should surface named exceptions inline with the exception note'
      );
    });
  });

  it('grid skin renders shared banners and continuation cells as clickable elements', () => {
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'grid' });
    Store.addEvent(seeded.day1.id, {
      title: 'Mid-Block Check',
      startTime: '1300',
      endTime: '1330',
      groupId: 'grp_all',
      isMainEvent: true,
    });

    renderDay(seeded.day1.id);

    assert(document.querySelector('.grid-banner[data-event-id]'), 'grid skin should render shared banners');
    assert(document.querySelector('.grid-banner-stack'), 'grid shared banners should render a centered content stack');
    assert(document.querySelector('.grid-cell-cont[data-event-id]'), 'grid continuation cells should keep event ids');
  });

  it('grid skin keeps limited events visible when a shared event starts in the same slot', () => {
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'grid' });
    Store.addEvent(seeded.day1.id, {
      title: 'Shared Start Drill',
      startTime: '0700',
      endTime: '0715',
      description: 'Short maintenance drill under formation.',
      location: 'Hangar 4',
      groupId: 'grp_mx',
    });

    renderDay(seeded.day1.id);

    assert(
      document.getElementById('scheduleContainer').textContent.includes('Shared Start Drill'),
      'grid should still show group events that start under a shared banner'
    );
  });

  it('grid skin renders every shared event that starts in the same slot', () => {
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'grid' });
    Store.addEvent(seeded.day1.id, {
      title: 'Commander Opening Remarks',
      startTime: '0700',
      endTime: '0715',
      groupId: 'grp_all',
      isMainEvent: true,
    });

    renderDay(seeded.day1.id);

    assert(document.getElementById('scheduleContainer').textContent.includes('Formation'));
    assert(document.getElementById('scheduleContainer').textContent.includes('Commander Opening Remarks'));
    assert(
      Array.from(document.querySelectorAll('#scheduleContainer .grid-banner[data-event-id]'))
        .some(node => node.textContent.includes('Commander Opening Remarks')),
      'the same-start commander remarks banner should render alongside formation'
    );
    assert.equal(
      Array.from(document.querySelectorAll('#scheduleContainer .grid-slot > .grid-time-col'))
        .filter(node => node.textContent.trim() === '0700').length,
      1,
      'same-start shared banners should stay grouped under one visible time row'
    );
  });

  it('grid skin stacks overlapping events in a group lane instead of hiding the later event', () => {
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'grid' });
    const overlap = Store.addEvent(seeded.day1.id, {
      title: 'Second Qualification Block',
      startTime: '0845',
      endTime: '0945',
      description: 'Intentional overlap to verify lane stacking.',
      location: 'Range 2',
      groupId: 'grp_chiefs',
    });

    renderDay(seeded.day1.id);

    assert(
      document.querySelector('.grid-cell[data-event-id="' + overlap.id + '"]'),
      'the later overlapping event should still render as a selectable grid cell'
    );
    assert(
      Array.from(document.querySelectorAll('#scheduleContainer .grid-cell-stack'))
        .some(node => node.textContent.includes('Weapons Qualification') && node.textContent.includes('Second Qualification Block')),
      'overlapping lane events should be visibly stacked together at the later start time'
    );
  });

  it('highlighted limited-audience events render on the main track in every structured skin', () => {
    ['grid', 'cards', 'phases'].forEach(skin => {
      resetUiHarnessState();
      const seeded = seedUiSchedule({ skin: skin });
      const highlighted = Store.addEvent(seeded.day1.id, {
        title: 'Commander-Highlighted SNCO Sync',
        startTime: '1530',
        endTime: '1600',
        groupId: 'grp_snco',
        isMainEvent: true,
      });

      renderDay(seeded.day1.id);

      if (skin === 'grid') {
        assert(
          document.querySelector('.grid-banner[data-event-id="' + highlighted.id + '"]'),
          'grid should place highlighted limited events in the shared banner track'
        );
      }
      if (skin === 'cards') {
        assert(
          document.querySelector('.cards-shared-item[data-event-id="' + highlighted.id + '"]'),
          'cards should place highlighted limited events in the shared timeline'
        );
      }
      if (skin === 'phases') {
        assert(
          document.querySelector('.phase-header[data-event-id="' + highlighted.id + '"]'),
          'phases should place highlighted limited events as phase headers'
        );
      }
    });
  });

  it('every layout exposes every sample event at least once', () => {
    resetUiHarnessState();
    loadSampleData();
    const dayId = Store.getDays()[0].id;
    const fileData = {
      name: Store.getTitle(),
      current: Store.getPersistedState(),
      versions: [],
      theme: { skin: 'bands', palette: 'classic' },
    };
    setCurrentScheduleFileData(fileData);

    SKIN_NAMES.forEach(skin => {
      fileData.theme.skin = skin;
      renderDay(dayId);

      const renderedIds = new Set(Array.from(document.querySelectorAll('#scheduleContainer [data-event-id]'))
        .map(node => node.getAttribute('data-event-id')));

      assert.equal(renderedIds.size, Store.getEvents(dayId).length, skin + ' should expose all sample events');
    });

    fileData.theme.skin = 'grid';
    renderDay(dayId);
    assert(document.getElementById('scheduleContainer').textContent.includes('Tool Inventory'), 'grid should show short maintenance events that begin under shared banners');
    assert(document.getElementById('scheduleContainer').textContent.includes('SABC Refresher'), 'grid should show short medical events that begin under shared banners');
  });

  it('grid warns when overlapping events share the same group lane', () => {
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'grid' });
    Store.addEvent(seeded.day1.id, {
      title: 'Second Qualification Block',
      startTime: '0845',
      endTime: '0945',
      description: 'Intentional overlap to verify warning copy.',
      location: 'Range 2',
      groupId: 'grp_chiefs',
    });

    renderDay(seeded.day1.id);

    const note = document.querySelector('.grid-view-note');
    assert(note, 'grid should warn when one lane contains overlapping events');
    assert(note.textContent.includes('Use Cards or Phases'), 'grid warning should point to layouts that show every event');
  });

  it('uses contrasting text colors for group-colored labels', () => {
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'grid' });
    Store.updateGroup('grp_chiefs', { color: '#fff3a0' });
    Store.updateGroup('grp_mx', { color: '#1f3a5f' });

    renderDay(seeded.day1.id);

    const gridHeader = Array.from(document.querySelectorAll('.grid-group-col'))
      .find(node => node.textContent.includes('Flight Chiefs'));
    const darkLabel = document.querySelector('.grid-group-col[style*="#1f3a5f"]');
    const chiefsEvent = Store.getEvents(seeded.day1.id).find(evt => evt.title === 'Weapons Qualification');
    const mxEvent = Store.getEvents(seeded.day1.id).find(evt => evt.title === 'Aircraft Launch Sim');
    const chiefsCell = document.querySelector('.grid-cell[data-event-id="' + chiefsEvent.id + '"]');
    const mxCell = document.querySelector('.grid-cell[data-event-id="' + mxEvent.id + '"]');
    const chiefsAudience = chiefsCell.querySelector('.grid-cell-audience');
    const mxAudience = mxCell.querySelector('.grid-cell-audience');

    assert(gridHeader, 'grid header should exist for the updated group');
    assert(gridHeader.getAttribute('style').includes('color:#1d1d1f'), 'light group colors should use dark text');
    assert(darkLabel && darkLabel.getAttribute('style').includes('color:#ffffff'), 'dark group colors should keep white text');
    assert(chiefsCell.getAttribute('style').includes('--grid-accent:#fff3a0'), 'grid event rails should use the group color');
    assert(chiefsCell.getAttribute('style').includes('--grid-accent-text:#1d1d1f'), 'light grid event accents should use dark text');
    assert(chiefsAudience.textContent.includes('Flight Chiefs'), 'grid event cards should label the audience without relying on color alone');
    assert(mxCell.getAttribute('style').includes('--grid-accent:#1f3a5f'), 'grid event rails should follow updated dark group colors');
    assert(mxCell.getAttribute('style').includes('--grid-accent-text:#ffffff'), 'dark grid event accents should use white text');
    assert(mxAudience.textContent.includes('Maintenance'), 'grid event cards should include the group label');
  });

  it('cards and phases skins expose attendee details in event content', () => {
    ['cards', 'phases'].forEach(skin => {
      resetUiHarnessState();
      const seeded = seedUiSchedule({ skin: skin });

      renderDay(seeded.day1.id);

      assert(
        document.getElementById('scheduleContainer').textContent.includes('Crew chiefs, specialists, AGE'),
        skin + ' skin should show attendee details'
      );
    });
  });
});

describe('UI Harness — content fidelity and keyboard notes', () => {
  it('preserves event and break descriptions, locations, contacts and attendees in every skin', () => {
    SKIN_NAMES.forEach(skin => {
      resetUiHarnessState();
      const seeded = seedUiSchedule({ skin });
      const events = Store.getEvents(seeded.day1.id);
      const formation = events.find(evt => evt.title === 'Formation');
      const lunch = events.find(evt => evt.isBreak);
      Store.updateEvent(seeded.day1.id, formation.id, { description: 'Shared description sentinel' });
      Store.updateEvent(seeded.day1.id, lunch.id, { description: 'Break description sentinel', location: 'Break location sentinel', poc: 'Break contact sentinel', attendees: 'Break attendee sentinel' });
      renderDay(seeded.day1.id);
      const text = document.getElementById('scheduleContainer').textContent;
      ['Shared description sentinel', 'Break description sentinel', 'Break location sentinel', 'Break contact sentinel', 'Break attendee sentinel'].forEach(value => assert(text.includes(value), skin + ' missing ' + value));
    });
  });

  it('screen and print preserve identical Bands records, references and complete fields', () => {
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'bands', longConcurrentAttendees: true });
    Store.addEvent(seeded.day1.id, { title: 'Cross-boundary activity', startTime: '0645', endTime: '0815', groupId: 'grp_med', description: 'Cross-boundary instructions', attendees: 'Assigned named people' });
    renderActiveDay();
    const signature = root => Array.from(root.querySelectorAll('article[data-event-id]')).map(node => ({
      id: node.dataset.eventId, text: node.textContent,
      references: Array.from(node.querySelectorAll('[data-ref-event]'), ref => [ref.dataset.refEvent, ref.textContent]),
    }));
    const expected = signature(document.getElementById('scheduleContainer'));
    ['readable', 'fit'].forEach(mode => {
      const output = document.createElement('div');
      output.innerHTML = buildPrintMarkup({ mode });
      assert.deepEqual(signature(output), expected);
      assert(output.querySelector('.print-fit.band-page'), 'Bands always uses bounded one-day sheets');
      assert.equal(output.querySelectorAll('[data-event-id]').length, Store.getEvents(seeded.day1.id).length);
    });
  });

  it('renders existing notes as native keyboard buttons which select the note editor', () => {
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'bands' });
    renderDay(seeded.day1.id);
    const note = Store.getNotes(seeded.day1.id)[0];
    const button = document.querySelector('.band-sheet [data-note-id="' + note.id + '"] button');
    assert(button, 'note must expose a native button');
    assert.equal(button.tabIndex, 0);
    button.click();
    assert.equal(_selection.type, 'note');
    assert.equal(_selection.entityId, note.id);
  });

  it('bands keeps a newly added blank note editable and visibly selected after typing', () => {
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'bands' });
    renderActiveDay();
    document.getElementById('addNoteBtn').click();
    const noteId = _selection.entityId;
    assert.equal(_selection.type, 'note');
    assert.equal(Store.getNotes(seeded.day1.id).length, 2);
    const button = document.querySelector('#scheduleContainer [data-note-id="' + noteId + '"] .note-select');
    assert(button, 'the blank note must remain reachable on the screen');
    assert.equal(button.tagName, 'BUTTON');
    assert.equal(button.tabIndex, 0);
    selectEntity(null);
    button.click();
    assert.equal(_selection.entityId, noteId);
    const input = document.getElementById('insp-note-text');
    input.value = 'Editable note sentinel';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    assert.equal(Store.getNotes(seeded.day1.id).find(note => note.id === noteId).text, 'Editable note sentinel');
    const selected = document.querySelector('#scheduleContainer [data-note-id="' + noteId + '"].selected');
    assert(selected && selected.textContent.includes('Editable note sentinel'), 'typing should update the same selected note');
    assert(document.querySelector('#scheduleContainer .band-sheet'), 'note editing should keep the shared Bands layout');
  });
});

describe('UI Harness — Bands preservation', () => {
  it('keeps complete attendees, durations and escaped text in full and overview output', () => {
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'bands', longConcurrentAttendees: true });
    const concurrent = Store.getEvents(seeded.day1.id).find(evt => evt.title === 'Weapons Qualification');
    Store.updateEvent(seeded.day1.id, concurrent.id, { description: '<img src=x onerror=alert(1)> literal instructions' });
    const output = document.createElement('div');
    output.innerHTML = buildPrintMarkup({ mode: 'readable' });
    assert.equal(output.querySelectorAll('article[data-event-id]').length, Store.getEvents(seeded.day1.id).length);
    assert(output.textContent.includes(concurrent.attendees));
    assert(output.textContent.includes('30m'));
    assert(output.textContent.includes('<img src=x onerror=alert(1)> literal instructions'));
    assert.equal(output.querySelectorAll('img[onerror]').length, 0);
    output.innerHTML = buildPrintMarkup({ detail: 'overview' });
    assert(!output.textContent.includes('literal instructions'));
    assert(output.textContent.includes(concurrent.poc));
    assert(output.textContent.includes(concurrent.attendees));
  });

  it('preserves oversized Unicode descriptions whole and blocks incomplete printing', async () => {
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'bands' });
    const event = seeded.day1.events[0];
    const text = '🚁 e\u0301 👩‍👩‍👧‍👦 Complete instructions. '.repeat(500);
    Store.updateEvent(seeded.day1.id, event.id, { description: text });
    renderActiveDay();
    const card = document.querySelector('[data-event-id="' + event.id + '"]');
    assert.equal(card.querySelector('.description').textContent, text);
    assert.equal(document.querySelector('.band-sheet').dataset.fit, 'false');
    assert.equal(document.querySelectorAll('[data-event-id="' + event.id + '"]').length, 1);
    assert(document.querySelector('.band-fit-notice').textContent.length > 0);
    const originalPrint = window.print;
    let calls = 0;
    window.print = () => calls++;
    try {
      await printSchedule({});
      assert.equal(calls, 0, 'overflow cannot open app printing with a partial schedule');
      openPrintReview();
      assert(document.getElementById('printReviewConfirm').disabled);
      closeModal('printReviewModal');
    } finally { window.print = originalPrint; window.dispatchEvent(new Event('afterprint')); }
  });
});
