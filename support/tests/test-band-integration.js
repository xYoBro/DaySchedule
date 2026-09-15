/* Integration contracts for the approved paper layout; fixtures are synthetic. */
function loadApprovedBands(id) {
  resetUiHarnessState();
  const workbook = structuredClone(APPROVED_BAND_EXAMPLES);
  workbook.activeScheduleId = id;
  loadParsedScheduleData(parseScheduleWorkbookContent(JSON.stringify(workbook)));
  hideLibrary();
}

describe('Bands — approved app integration', () => {
  it('opens legacy workbooks, saves version 2 and rejects unsupported future versions', () => {
    const legacy = structuredClone(APPROVED_BAND_EXAMPLES);
    legacy.schemaVersion = 1;
    legacy.schedules.forEach(schedule => {
      delete schedule.theme.bands; delete schedule.current.theme.bands;
      schedule.current.days.forEach(day => day.events.forEach(event => {
        delete event.emphasized; delete event.attendeeFormat; delete event.flightActivities;
      }));
    });
    resetUiHarnessState();
    loadParsedScheduleData(parseScheduleWorkbookContent(JSON.stringify(legacy)));
    const saved = getScheduleWorkbookSnapshot();
    assert.equal(saved.schemaVersion, 2);
    assert(Store.getDays().length > 0);
    assert.equal(Store.getDays()[0].events[0].attendeeFormat, undefined);
    saved.schemaVersion = 3;
    assert.throws(() => parseScheduleWorkbookContent(JSON.stringify(saved)));
  });

  it('clears nested flight POCs when the existing duplicate option clears contacts', () => {
    loadApprovedBands('forty');
    const state = structuredClone(Store.getPersistedState());
    const original = JSON.stringify(Store.getPersistedState());
    applyDuplicateOptions(state, { clearContacts: true });
    assert(state.days.flatMap(day => day.events).every(event => !event.poc && (event.flightActivities || []).every(activity => !activity.poc)));
    assert.equal(JSON.stringify(Store.getPersistedState()), original);
    assert(state.days.flatMap(day => day.events).some(event => event.attendees));
  });
  it('honors existing custom paper and text controls alongside the optional logo', () => {
    loadApprovedBands('normal');
    const file = getCurrentScheduleFileData();
    file.theme = { skin: 'bands', palette: 'custom', bands: { showLogo: false, notesHeight: 90 },
      customColors: { bg: '#faf8ef', text: '#17202a', textSecondary: '#314153', textMuted: '#475569', accent: '#542040', accentSecondary: '#273d59', accentTertiary: '#58652c', border: '#a7b8c9', surface: '#edf1f5' } };
    renderActiveDay();
    const sheet = document.querySelector('#scheduleContainer .band-sheet'), css = getComputedStyle(sheet);
    assert.equal(sheet.querySelector('.logo-slot'), null);
    assert.equal(css.backgroundColor, 'rgb(250, 248, 239)');
    assert.equal(css.color, 'rgb(23, 32, 42)');
    assert.equal(css.getPropertyValue('--paper-anchor').trim(), '#273d59');
    assert.equal(css.getPropertyValue('--paper-flight-accent').trim(), '#58652c');
    updateBandSettings({ showLogo: true });
    assert(document.querySelector('#scheduleContainer .logo-slot'));
    assert.equal(getCurrentScheduleFileData().theme.palette, 'custom');
  });
  it('fits both approved days with 15 or 40 surnames in at most two continuous columns', () => {
    ['normal', 'forty'].forEach(id => {
      loadApprovedBands(id);
      Store.getDays().forEach(day => {
        renderDay(day.id);
        const sheet = document.querySelector('#scheduleContainer .band-sheet');
        assert.equal(sheet.dataset.fit, 'true', id + '/' + day.id);
        assert(Number(sheet.dataset.columns) <= 2, id + '/' + day.id + ' should retain two columns');
        assert.equal(sheet.querySelectorAll('article[data-event-id]').length, day.events.length);
        const expected = day.events.flatMap(event => {
          const parsed = BandLayout.attendance(event);
          return parsed.mode === 'text' ? [] : parsed.entries;
        });
        const actual = Array.from(sheet.querySelectorAll('[data-person]'), node => node.dataset.person);
        assert.deepEqual(actual.slice().sort(), expected.slice().sort(), 'every literal entry including repeated surnames');
        const box = sheet.getBoundingClientRect(), logo = sheet.querySelector('.logo-slot').getBoundingClientRect();
        assert(Math.abs(box.width * .75 - 612) < .1 && Math.abs(box.height * .75 - 792) < .1);
        assert(Math.abs(logo.width * .75 - 72) < .1 && Math.abs(logo.height * .75 - 72) < .1);
        assert(Math.abs(sheet.querySelector('.reminder-panel').getBoundingClientRect().height * .75 - 90) < .1);
        assert.deepEqual(Array.from(sheet.querySelectorAll('.attendance-area article'), node => node.dataset.eventId), BandLayout.model(day).concurrent.map(event => event.id));
      });
    });
  });

  it('keeps main-only pages prominent and accommodates the fifteen-event stress fixture', () => {
    ['main', 'stress'].forEach(id => {
      loadApprovedBands(id);
      Store.getDays().forEach(day => {
        renderDay(day.id);
        const sheet = document.querySelector('#scheduleContainer .band-sheet');
        assert.equal(sheet.dataset.fit, 'true', id + '/' + day.id);
        if (id === 'main') {
          assert.equal(sheet.querySelector('.attendance-area'), null);
          assert(parseFloat(getComputedStyle(sheet).getPropertyValue('--main-extra')) > 0);
        } else {
          assert.equal(sheet.querySelectorAll('.attendance-area article').length, 15);
          assert(Number(sheet.dataset.columns) <= 3);
        }
      });
    });
  });

  it('uses strict full overlap, retains gap events and numbers every reference from the full list', () => {
    resetUiHarnessState();
    const day = Store.addDay({ date: '2026-09-12' });
    Store.setActiveDay(day.id);
    Store.addGroup({ id: 'all', name: 'All personnel', scope: 'main' });
    Store.addGroup({ id: 'named', name: 'Specific personnel', scope: 'limited' });
    const add = (id, startTime, endTime, main) => Store.addEvent(day.id, { id, title: id, startTime, endTime, groupId: main ? 'all' : 'named' });
    add('m1', '0800', '0900', true); add('m2', '0930', '1030', true);
    add('span', '0845', '1000'); add('gap', '0900', '0930'); add('after', '1030', '1100');
    const model = BandLayout.model(day);
    assert.deepEqual(model.byMain.get('m1').map(event => event.id), ['span']);
    assert.deepEqual(model.byMain.get('m2').map(event => event.id), ['span']);
    assert.deepEqual(Array.from(model.references.entries()), [['span', 1], ['gap', 2], ['after', 3]]);
    const output = document.createElement('div'); output.innerHTML = BandLayout.page(day, { interactive: true });
    assert.equal(output.querySelectorAll('[data-event-ref="span"]').length, 2);
    assert.equal(output.querySelectorAll('[data-event-ref="gap"], [data-event-ref="after"]').length, 0);
    ['span','gap','after'].forEach(id => {
      const event = output.querySelector('.attendance-area [data-event-id="' + id + '"]');
      assert.equal(event.querySelector('.start-ref').textContent, String(model.references.get(id)));
    });
  });

  it('preserves author-selected emphasis separately from main-track placement', () => {
    loadApprovedBands('normal');
    const day = Store.getDays()[0], model = BandLayout.model(day), event = model.concurrent[0];
    selectEntity('event', day.id, event.id); renderInspector(); clearUndoHistory();
    const toggle = document.getElementById('insp-evt-emphasis');
    toggle.checked = true; toggle.dispatchEvent(new Event('change', { bubbles: true }));
    assert(Store.getEvents(day.id).find(item => item.id === event.id).emphasized);
    assert(document.querySelector('.attendance-area [data-event-id="' + event.id + '"].highlighted'));
    assert.deepEqual(BandLayout.model(day).mains.map(item => item.id), model.mains.map(item => item.id));
    undo(); assert(!Store.getEvents(day.id).find(item => item.id === event.id).emphasized);
    redo(); assert(Store.getEvents(day.id).find(item => item.id === event.id).emphasized);
  });

  it('keeps ambiguous old input literal and makes separator interpretation an explicit previewed choice', () => {
    loadApprovedBands('normal');
    const day = Store.getDays()[0], event = BandLayout.model(day).concurrent[0];
    const text = 'John Doe, Alex Smith & Dmitri Chan';
    Store.updateEvent(day.id, event.id, { attendees: text, attendeeFormat: undefined });
    renderActiveDay(); selectEntity('event', day.id, event.id); renderInspector();
    assert.equal(document.querySelector('[data-event-id="' + event.id + '"] .attendee-free-text').textContent, text);
    const select = document.getElementById('insp-attendee-format');
    assert.equal(select.value, 'text');
    select.value = 'suggested'; select.dispatchEvent(new Event('change', { bubbles: true }));
    assert(document.getElementById('insp-attendee-preview').textContent.includes('3 entries will print'));
    assert.deepEqual(Array.from(document.querySelectorAll('[data-event-id="' + event.id + '"] [data-person]'), node => node.dataset.person), ['John Doe','Alex Smith','Dmitri Chan']);
    assert.equal(Store.getEvents(day.id).find(item => item.id === event.id).attendees, text);
    const cases = [
      ['Doe Smith Chan','text',[]], ['Doe Smith Chan','spaces',['Doe','Smith','Chan']],
      ['Doe, John; Smith, Alex','suggested',['Doe, John','Smith, Alex']],
      ['Van Dyke\nDe la Cruz','lines',['Van Dyke','De la Cruz']],
      ['Doe; Doe','suggested',['Doe','Doe']],
    ];
    cases.forEach(([raw, mode, entries]) => assert.deepEqual(parsePersonnelInput(raw, mode).entries, entries));
  });

  it('edits nested flight activities through the inspector and rejects out-of-parent times', () => {
    loadApprovedBands('normal');
    const day = Store.getDays()[0], event = day.events.find(item => item.id === 'm6');
    selectEntity('event', day.id, event.id); renderInspector(); clearUndoHistory();
    document.getElementById('insp-add-flight').click();
    assert.equal(document.activeElement.id, 'flight-0-flight');
    const set = (key, value, type = 'input') => {
      const input = document.getElementById('flight-0-' + key);
      input.value = value; input.dispatchEvent(new Event(type, { bubbles: true }));
    };
    set('flight', 'Alpha'); set('title', 'Exercise briefing'); set('location', 'Room A'); set('poc', 'MSgt Doe');
    set('endTime', '1700', 'change');
    assert.equal(document.getElementById('flight-0-endTime').value, event.endTime);
    set('endTime', '1300', 'change');
    const saved = Store.getEvents(day.id).find(item => item.id === event.id).flightActivities[0];
    assert.equal(saved.endTime, '1300');
    const table = document.querySelector('[data-event-id="' + event.id + '"] .main-content .flight-table');
    ['Alpha','Exercise briefing','Room A','MSgt Doe','1230-1300'].forEach(value => assert(table.textContent.includes(value), value));
    assert.equal(document.querySelector('[data-event-id="' + event.id + '"] > .time .flight-table'), null);
    undo(); assert(!Store.getEvents(day.id).find(item => item.id === event.id).flightActivities?.length);
    redo(); assert.equal(Store.getEvents(day.id).find(item => item.id === event.id).flightActivities[0].title, 'Exercise briefing');
  });

  it('retains Bands settings, flights, literal names and inactive schedules through workbook and version round trips', () => {
    loadApprovedBands('forty');
    updateBandSettings({ showLogo: false, notesHeight: 108 });
    const state = buildVersionState();
    assert.deepEqual(state.theme.bands, { showLogo: false, notesHeight: 108 });
    const original = getScheduleWorkbookSnapshot();
    const parsed = parseScheduleWorkbookContent(JSON.stringify(original));
    loadParsedScheduleData(parsed); hideLibrary();
    assert.deepEqual(getCurrentScheduleFileData().theme.bands, { showLogo: false, notesHeight: 108 });
    assert.deepEqual(Store.getDays(), state.days);
    assert.deepEqual(getScheduleWorkbookSnapshot().schedules.filter(item => item.id !== 'forty'), original.schedules.filter(item => item.id !== 'forty'));
    updateBandSettings({ showLogo: true }); loadVersionState(state); renderActiveDay();
    assert.equal(document.querySelector('.logo-slot'), null);
    assert.deepEqual(Store.getDays(), state.days);
  });

  it('keeps new fields visible in the other layouts until their separate design review', () => {
    loadApprovedBands('forty');
    const day = Store.getDays().find(item => item.id === 'sun');
    ['grid','cards','phases'].forEach(skin => {
      getCurrentScheduleFileData().theme.skin = skin; renderDay(day.id);
      const output = document.getElementById('scheduleContainer').textContent;
      day.events.flatMap(event => event.flightActivities || []).forEach(activity => {
        [activity.flight, activity.title, activity.location, activity.poc, activity.description].filter(Boolean).forEach(value => assert(output.includes(value), skin + ': ' + value));
      });
    });
  });
});
