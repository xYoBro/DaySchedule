function stubScrollHeight(target, values) {
  let index = 0;
  const seq = Array.isArray(values) ? values.slice() : [values];
  Object.defineProperty(target, 'scrollHeight', {
    configurable: true,
    get() {
      const value = seq[Math.min(index, seq.length - 1)];
      index += 1;
      return value;
    },
  });
}

describe('UI Harness — print', () => {
  it('printAllDays builds one print page per day and restores the active day', async () => {
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'phases', dayCount: 2 });
    const originalActiveDay = Store.getActiveDay();
    let printCalls = 0;
    const originalPrint = window.print;
    window.print = () => { printCalls += 1; };

    try {
      printAllDays();
      await wait(250);
    } finally {
      window.print = originalPrint;
    }

    const printContainer = document.getElementById('printContainer');
    assert(printContainer, 'print container should be created');
    assert.equal(printContainer.querySelectorAll('.print-page').length, 2);
    assert(printContainer.querySelector('.print-page.skin-phases'), 'print pages should use the active skin');
    assert.equal(Store.getActiveDay(), originalActiveDay, 'active day should be restored after print prep');
    assert.equal(printCalls, 1, 'window.print should be called once');
    assert.equal(document.querySelector('.preview-area').style.display, '', 'screen preview should be restored');
  });

  it('afterprint rerenders the active day into the screen container', () => {
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'bands' });
    renderDay(seeded.day1.id);
    const event = Store.getEvents(seeded.day1.id)[0];
    selectEntity('event', seeded.day1.id, event.id);
    document.getElementById('scheduleContainer').innerHTML = '';

    window.dispatchEvent(new Event('afterprint'));

    assert(document.getElementById('scheduleContainer').textContent.includes('Formation'));
    assert(document.querySelector('#scheduleContainer .band-sheet'), 'return from print must restore the connected screen layout');
    assert(document.querySelector('#scheduleContainer [data-event-id="' + event.id + '"].selected'), 'return from print must preserve the current selection');
  });

  it('print fitting removes old whole-page zoom even on a legacy page', () => {
    resetUiHarnessState();

    const page = document.createElement('div');
    page.className = 'page';
    page.innerHTML = '<div class="footer"></div>';
    document.body.appendChild(page);

    try {
      stubScrollHeight(page, [2000, 2000, 2000]);
      applyPrintScalingToPage(page, true);

      assert.equal(page.dataset.printScaled, undefined);
      assert.equal(page.style.zoom, '', 'no print fallback may shrink the entire page');
    } finally {
      page.remove();
    }
  });

  it('alternate layouts use bounded text and report oversized content without zoom', () => {
    resetUiHarnessState(); const seeded = seedUiSchedule({ skin: 'phases' });
    const event = Store.getEvents(seeded.day1.id)[0];
    Store.updateEvent(seeded.day1.id, event.id, { description: 'Full instruction retained. '.repeat(2000) });
    renderDay(seeded.day1.id);
    const page = document.getElementById('previewPage'), sheet = page.querySelector('.alternate-sheet');
    assert.equal(sheet.dataset.fit, 'false');
    assert.equal(page.style.zoom, ''); assert.equal(page.dataset.printScaled, undefined);
    assert(sheet.textContent.includes('Full instruction retained.'));
    assert(document.querySelector('.alternate-fit-notice').textContent.includes('readable one-page limits'));
  });

  it('dense Bands screen flow preserves original main structure and clears previous layout compression', () => {
    resetUiHarnessState();
    loadSampleData();
    const dayId = Store.getDays()[0].id;
    setCurrentScheduleFileData({
      name: Store.getTitle(), current: Store.getPersistedState(), versions: [],
      theme: { skin: 'bands', palette: 'classic' },
    });
    const previewPage = document.getElementById('previewPage');
    previewPage.style.setProperty('--notes-fs', '7px');
    previewPage.style.zoom = '0.5';
    previewPage.style.minHeight = '2000px';
    previewPage.dataset.printScaled = '1';
    renderDay(dayId);

    assert.equal(previewPage.style.zoom, '');
    assert.equal(previewPage.style.minHeight, '');
    assert.equal(previewPage.style.getPropertyValue('--notes-fs'), '');
    assert.equal(previewPage.dataset.printScaled, undefined);
    assert.equal(previewPage.querySelectorAll('[data-event-id]').length, Store.getEvents(dayId).length);
    assert(previewPage.querySelector('.main-event > .time'), 'retain the original main-band time gutter');
    assert(previewPage.querySelector('.main-event h3'), 'retain the original title hierarchy');
    assert(previewPage.querySelector('.main-event .audience'), 'retain the original audience badges');
    assert(!previewPage.querySelector('[data-print-paginated]'), 'physical sheets must remain print-only');
  });

  it('removePrintScaling clears CSS vars and zoom state', () => {
    resetUiHarnessState();

    const page = document.createElement('div');
    page.className = 'page';
    page.dataset.printScaled = '1';
    page.style.zoom = '0.8';
    page.style.minHeight = '0';
    page.style.setProperty('--notes-fs', '7px');

    removePrintScaling(page);

    assert.equal(page.style.getPropertyValue('--notes-fs'), '');
    assert.equal(page.style.zoom, '');
    assert.equal(page.style.minHeight, '');
    assert.equal(page.dataset.printScaled, undefined);
  });
});

describe('UI Harness — print review and handouts', () => {
  it('prints only selected days and audiences while preserving shared events and Store state', () => {
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'cards', dayCount: 2 });
    const before = JSON.stringify(Store.getPersistedState());
    const originalDay = Store.getActiveDay();
    const html = buildPrintMarkup({ dayIds: [seeded.day1.id], audienceId: 'grp_chiefs', mode: 'readable' });
    const fixture = document.createElement('div');
    fixture.innerHTML = html;
    assert.equal(fixture.querySelectorAll('.print-page').length, 1);
    assert(html.includes('Formation'));
    assert(html.includes('Weapons Qualification'));
    assert(html.includes('Lunch'));
    assert(!html.includes('Aircraft Launch Sim'));
    assert(!html.includes('Day 2 Formation'));
    assert(html.includes('Audience: Flight Chiefs'));
    assert(html.includes('Accountability formation.'));
    assert.equal(Store.getActiveDay(), originalDay);
    assert.equal(JSON.stringify(Store.getPersistedState()), before);
  });

  it('labels an overview and omits only event descriptions while retaining day notes and other fields', () => {
    resetUiHarnessState();
    seedUiSchedule({ skin: 'grid' });
    const html = buildPrintMarkup({ detail: 'overview' });
    assert(html.includes('Overview: event notes omitted.'));
    assert(!html.includes('Accountability formation.'));
    assert(html.includes('Bldg 200 Apron'));
    assert(html.includes('OCP unless mission tasking requires otherwise.'));
    assert(buildPrintMarkup({ detail: 'full' }).includes('Accountability formation.'));
  });

  it('lets readable pages grow without any compression or zoom', () => {
    resetUiHarnessState();
    const page = document.createElement('div');
    page.className = 'page print-page print-readable';
    page.dataset.printMode = 'readable';
    page.style.zoom = '0.2';
    page.style.setProperty('--notes-fs', '5px');
    stubScrollHeight(page, 5000);
    applyPrintScalingToPage(page, true);
    assert.equal(page.style.zoom, '');
    assert.equal(page.style.getPropertyValue('--notes-fs'), '');
    assert.equal(page.dataset.printScaled, undefined);
  });

  it('requires at least one day and previews deliberate omissions before printing', () => {
    resetUiHarnessState();
    seedUiSchedule({ skin: 'cards', dayCount: 2 });
    openPrintReview();
    const modal = document.getElementById('printReviewModal');
    const detail = document.getElementById('printDetail');
    detail.value = 'overview';
    detail.dispatchEvent(new Event('change'));
    assert(document.getElementById('printReviewSummary').textContent.includes('event note(s) will be omitted'));
    modal.querySelectorAll('[name="printDay"]').forEach(input => { input.checked = false; });
    modal.querySelector('[name="printDay"]').dispatchEvent(new Event('change'));
    assert.equal(document.getElementById('printReviewConfirm').disabled, true);
    assert(document.getElementById('printReviewSummary').textContent.includes('0 day(s), 0 event(s)'));
    closeModal('printReviewModal');
  });

  it('blocks oversized Fit output and offers an explicit readable-page choice', () => {
    resetUiHarnessState(); seedUiSchedule({ skin: 'cards' });
    const originalMeasure = window.measurePrintPlan;
    window.measurePrintPlan = () => [{ estimatedPages: 1, smallestTextPt: 9, fits: false }];
    try {
      openPrintReview(); const mode = document.getElementById('printMode'); mode.value = 'fit'; mode.dispatchEvent(new Event('change'));
      assert(document.getElementById('printReviewSummary').textContent.includes('bounded text sizes'));
      assert(document.getElementById('printReviewSummary').textContent.includes('no names or details will be clipped'));
      assert.equal(document.getElementById('printReviewConfirm').disabled, true);
      assert(Array.from(mode.options).some(option => option.value === 'readable'));
    } finally { window.measurePrintPlan = originalMeasure; closeModal('printReviewModal'); }
  });

});

describe('UI Harness — print geometry', () => {
  it('keeps event details at least 9 pt and auxiliary labels at least 8 pt across alternate skins and removes temporary measurement nodes', async () => {
    // The UI harness deliberately omits the application stylesheet. Geometry
    // assertions need the real CSS, not browser-default button typography.
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '../../app/css/style.css';
    try {
      await new Promise((resolve, reject) => {
        stylesheet.onload = resolve;
        stylesheet.onerror = () => reject(new Error('Could not load print stylesheet'));
        document.head.appendChild(stylesheet);
      });
      ['grid', 'cards', 'phases'].forEach(skin => {
        resetUiHarnessState();
        seedUiSchedule({ skin, longConcurrentAttendees: true });
        const metrics = measurePrintPlan({ mode: 'readable' });
        assert.equal(metrics.length, 1);
        assert.equal(metrics[0].scale, 1);
        assert(metrics[0].smallestTextPt >= 8, skin + ' should retain auxiliary label floors');
        const host = document.createElement('div'); host.className = 'print-measurement'; document.body.appendChild(host);
        preparePrintPages(host, { mode: 'readable' });
        host.querySelectorAll('.av-description,.av-location,.av-poc,.av-people,.av-flight,.av-note').forEach(node => assert(parseFloat(getComputedStyle(node).fontSize) * .75 >= 8.99, skin + ': ' + node.className));
        host.remove();
        assert.equal(document.querySelector('.print-measurement'), null);
      });
    } finally {
      stylesheet.remove();
    }
  });

  it('measures the same bounded Bands pages and fit decisions as native preparation', async () => {
    window.dispatchEvent(new Event('afterprint'));
    resetUiHarnessState();
    const sample = structuredClone(APPROVED_BAND_EXAMPLES);
    sample.activeScheduleId = 'forty';
    loadParsedScheduleData(parseScheduleWorkbookContent(JSON.stringify(sample)));
    hideLibrary();
    const metrics = measurePrintPlan({});
    try {
      window.dispatchEvent(new Event('beforeprint'));
      const container = document.getElementById('printContainer');
      const pages = Array.from(container.querySelectorAll('.print-page'));
      assert.equal(pages.length, 2);
      assert.deepEqual(metrics.map(page => page.estimatedPages), [1, 1]);
      assert(metrics.every(page => page.fits && page.scale === 1));
      pages.forEach(page => {
        const sheet = page.querySelector('.band-sheet');
        assert.equal(sheet.dataset.fit, 'true');
        assert(Number(sheet.dataset.columns) <= 2);
        assert(!page.style.zoom);
        const fields = sheet.querySelectorAll('.description,.event-meta,.detail-field,.flight-activity,.flight-poc,.reminder');
        fields.forEach(field => assert(parseFloat(getComputedStyle(field).fontSize) * .75 >= 8.99, 'event detail minimum'));
        sheet.querySelectorAll('.large-event .person-label strong').forEach(field => assert(parseFloat(getComputedStyle(field).fontSize) * .75 >= 9.49, 'roster minimum'));
        sheet.querySelectorAll('.small-event .person-label strong').forEach(field => assert(parseFloat(getComputedStyle(field).fontSize) * .75 >= 10.49, 'small-event name minimum'));
      });
      assert.equal(document.querySelector('.print-measurement'), null);
    } finally { window.dispatchEvent(new Event('afterprint')); }
  });

});

describe('UI Harness — print cleanup', () => {
  it('labels PDF output and clears print-only state after a browser print failure', async () => {
    resetUiHarnessState();
    seedUiSchedule({ skin: 'cards' });
    window.dispatchEvent(new Event('afterprint'));
    const originalTitle = document.title;
    const originalPrint = window.print;
    let outputTitle = '';
    window.print = () => { outputTitle = document.title; throw new Error('Print unavailable'); };
    try {
      printSchedule({ audienceId: 'grp_chiefs', detail: 'overview' });
      await wait(20);
      assert(outputTitle.includes('Flight Chiefs') && outputTitle.includes('Overview'));
      assert.equal(document.getElementById('printContainer').innerHTML, '');
      assert.equal(document.body.classList.contains('printing-schedule'), false);
      assert.equal(document.title, originalTitle);
      assert(document.getElementById('toast').textContent.includes('Couldn’t open the print dialog'));
    } finally {
      window.print = originalPrint;
      window.dispatchEvent(new Event('afterprint'));
    }
  });
});

describe('UI Harness — native print lifecycle', () => {
  SKIN_NAMES.forEach(skin => {
    it('prepares current full bounded ' + skin + ' output for browser File → Print', () => {
      window.dispatchEvent(new Event('afterprint'));
      resetUiHarnessState();
      const seeded = seedUiSchedule({ skin, dayCount: 2 });
      renderDay(seeded.day1.id);
      const preview = document.getElementById('scheduleContainer').innerHTML;
      Store.updateEvent(seeded.day1.id, seeded.day1.events[0].id, {
        title: 'Updated formation', description: 'Newest instructions for the printed handout.',
      });
      const before = JSON.stringify(Store.getPersistedState());
      const originalTitle = document.title;
      try {
        window.dispatchEvent(new Event('beforeprint'));
        const container = document.getElementById('printContainer');
        assert(container.textContent.includes('Updated formation'));
        assert(container.textContent.includes('Newest instructions for the printed handout.'));
        assert(container.textContent.includes('Day 2 Formation'));
        assert(container.textContent.includes('Weapons Qualification'));
        assert(container.textContent.includes('Aircraft Launch Sim'));
        assert(container.querySelector('.print-fit.skin-' + skin));
        assert.equal(container.querySelector('.print-readable'), null);
        assert.equal(new Set(Array.from(container.querySelectorAll('.print-page')).map(page => page.dataset.printDay)).size, 2);
        assert.equal(document.getElementById('scheduleContainer').innerHTML, preview, 'native prep must not rewrite the editor');
        assert.equal(JSON.stringify(Store.getPersistedState()), before);
        assert.equal(Store.getActiveDay(), seeded.day1.id);
        assert(document.title.includes('Everyone') && document.title.includes('Full details'));
      } finally {
        window.dispatchEvent(new Event('afterprint'));
      }
      assert.equal(document.getElementById('printContainer').innerHTML, '');
      assert.equal(document.body.classList.contains('printing-schedule'), false);
      assert.equal(document.title, originalTitle);
      assert(document.getElementById('scheduleContainer').textContent.includes('Updated formation'));
    });
  });

  it('retains explicit review selections and Fit for every layout, then clears them for native printing', async () => {
    const originalPrint = window.print;
    window.print = () => window.dispatchEvent(new Event('beforeprint'));
    try {
      for (const skin of SKIN_NAMES) {
        window.dispatchEvent(new Event('afterprint'));
        resetUiHarnessState();
        const seeded = seedUiSchedule({ skin, dayCount: 2 });
        await printSchedule({ dayIds: [seeded.day1.id], audienceId: 'grp_chiefs', detail: 'overview', mode: 'fit' });
        const container = document.getElementById('printContainer');
        assert.equal(container.querySelectorAll('.print-page').length, 1);
        assert(container.querySelector('.skin-' + skin + '.print-fit'));
        assert(container.textContent.includes('Audience: Flight Chiefs'));
        assert(container.textContent.includes('Weapons Qualification'));
        assert(container.textContent.includes('Overview'));
        assert(!container.textContent.includes('Accountability formation.'));
        assert(!container.textContent.includes('Aircraft Launch Sim'));
        assert(!container.textContent.includes('Day 2 Formation'));
        window.dispatchEvent(new Event('afterprint'));
        window.dispatchEvent(new Event('beforeprint'));
        assert(container.querySelector('.print-fit.skin-' + skin));
        assert.equal(container.querySelector('.print-readable'), null);
        assert(container.textContent.includes('Accountability formation.'));
        assert(container.textContent.includes('Aircraft Launch Sim'));
        assert(container.textContent.includes('Day 2 Formation'));
        assert(!container.textContent.includes('Audience: Flight Chiefs'));
      }
    } finally {
      window.print = originalPrint;
      window.dispatchEvent(new Event('afterprint'));
    }
  });

  it('refreshes repeated native preparation and removes stale output when no days remain', () => {
    window.dispatchEvent(new Event('afterprint'));
    resetUiHarnessState();
    seedUiSchedule({ skin: 'cards' });
    const originalTitle = document.title;
    try {
      window.dispatchEvent(new Event('beforeprint'));
      const added = Store.addDay({ date: '2026-04-15' });
      Store.addEvent(added.id, { title: 'New day added after preparation' });
      window.dispatchEvent(new Event('beforeprint'));
      assert(document.getElementById('printContainer').textContent.includes('New day added after preparation'));
      assert(document.title.includes('2 day(s)'));
      Store.getDays().slice().forEach(day => Store.removeDay(day.id));
      window.dispatchEvent(new Event('beforeprint'));
      assert.equal(document.getElementById('printContainer').innerHTML, '');
      assert.equal(document.body.classList.contains('printing-schedule'), false);
      assert.equal(document.title, originalTitle);
    } finally {
      window.dispatchEvent(new Event('afterprint'));
    }
  });

  it('does not reopen printing when a logo decode finishes after afterprint', async () => {
    window.dispatchEvent(new Event('afterprint'));
    resetUiHarnessState();
    seedUiSchedule({ skin: 'cards' });
    Store.setLogo('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=');
    const originalDecode = HTMLImageElement.prototype.decode;
    const originalPrint = window.print;
    const originalTitle = document.title;
    let finishDecode;
    let printCalls = 0;
    HTMLImageElement.prototype.decode = () => new Promise(resolve => { finishDecode = resolve; });
    window.print = () => { printCalls += 1; };
    try {
      const prepared = printSchedule({ detail: 'overview' });
      window.dispatchEvent(new Event('afterprint'));
      finishDecode();
      await prepared;
      await wait(0); // Flush pending decode callbacks even if a print API returns no promise.
      assert.equal(printCalls, 0);
      assert.equal(document.getElementById('printContainer').innerHTML, '');
      assert.equal(document.title, originalTitle);
    } finally {
      HTMLImageElement.prototype.decode = originalDecode;
      window.print = originalPrint;
      window.dispatchEvent(new Event('afterprint'));
    }
  });

  it('prints only the newest request when an earlier logo decode finishes later', async () => {
    window.dispatchEvent(new Event('afterprint'));
    resetUiHarnessState();
    seedUiSchedule({ skin: 'cards' });
    Store.setLogo('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=');
    const originalDecode = HTMLImageElement.prototype.decode;
    const originalPrint = window.print;
    const decodes = [];
    const printedTitles = [];
    HTMLImageElement.prototype.decode = () => new Promise(resolve => { decodes.push(resolve); });
    window.print = () => { window.dispatchEvent(new Event('beforeprint')); printedTitles.push(document.title); };
    try {
      const older = printSchedule({ detail: 'overview', mode: 'fit' });
      const newer = printSchedule({ detail: 'full', mode: 'readable' });
      decodes[1]();
      await newer;
      await wait(0);
      decodes[0]();
      await older;
      await wait(0);
      assert.equal(printedTitles.length, 1);
      assert(printedTitles[0].includes('Full details'));
      assert(document.getElementById('printContainer').querySelector('.print-readable'));
    } finally {
      HTMLImageElement.prototype.decode = originalDecode;
      window.print = originalPrint;
      window.dispatchEvent(new Event('afterprint'));
    }
  });

  it('cancels a prepared snapshot if the schedule changes while decoding its logo', async () => {
    window.dispatchEvent(new Event('afterprint'));
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'cards' });
    Store.setLogo('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=');
    const originalDecode = HTMLImageElement.prototype.decode;
    const originalPrint = window.print;
    let finishDecode;
    let printCalls = 0;
    HTMLImageElement.prototype.decode = () => new Promise(resolve => { finishDecode = resolve; });
    window.print = () => { printCalls += 1; };
    try {
      const prepared = printSchedule();
      Store.updateEvent(seeded.day1.id, seeded.day1.events[0].id, { title: 'Latest unsaved edit' });
      finishDecode();
      await prepared;
      assert.equal(printCalls, 0);
      assert.equal(document.getElementById('printContainer').innerHTML, '');
      assert(document.getElementById('toast').textContent.includes('schedule changed'));
      assert.equal(Store.getEvents(seeded.day1.id)[0].title, 'Latest unsaved edit');
    } finally {
      HTMLImageElement.prototype.decode = originalDecode;
      window.print = originalPrint;
      window.dispatchEvent(new Event('afterprint'));
    }
  });
});
