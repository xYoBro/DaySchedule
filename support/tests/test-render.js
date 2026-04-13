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
    assert(document.querySelector('.grid-cell-cont[data-event-id]'), 'grid continuation cells should keep event ids');
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
