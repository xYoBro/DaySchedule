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

  it('applies palette colors from file-level theme data during render', () => {
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'bands', palette: 'airforce' });

    renderDay(seeded.day1.id);

    assert.equal(
      document.documentElement.style.getPropertyValue('--sch-accent').trim(),
      PALETTES.airforce.accent
    );
  });

  it('bands skin creates dagger footnotes for long concurrent attendees', () => {
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'bands', longConcurrentAttendees: true });

    renderDay(seeded.day1.id);

    assert(document.querySelector('.band-conc[data-event-id]'), 'band skin should render concurrent cards');
    assert(document.querySelector('.dagger-note'), 'long attendees should be footnoted in notes');
  });

  it('bands skin separates title from time and metadata', () => {
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'bands' });
    const target = Store.getEvents(seeded.day1.id).find(evt => evt.title === 'Formation');

    renderDay(seeded.day1.id);

    const band = document.querySelector('.band[data-event-id="' + target.id + '"]');
    const title = band.querySelector('.band-title');
    const meta = band.querySelector('.band-meta-line');

    assert.equal(title.textContent.trim(), 'Formation');
    assert(meta.textContent.includes('0700–0730'), 'meta line should repeat the event time');
    assert(meta.textContent.includes('Bldg 200 Apron'), 'meta line should include location');
    assert(!title.textContent.includes('Bldg 200 Apron'), 'title should stay visually separate from metadata');
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

    assert(gridHeader, 'grid header should exist for the updated group');
    assert(gridHeader.getAttribute('style').includes('color:#1d1d1f'), 'light group colors should use dark text');
    assert(darkLabel && darkLabel.getAttribute('style').includes('color:#ffffff'), 'dark group colors should keep white text');
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
