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
    document.getElementById('scheduleContainer').innerHTML = '';

    window.dispatchEvent(new Event('afterprint'));

    assert(document.getElementById('scheduleContainer').textContent.includes('Formation'));
  });

  it('applyPrintScalingToPage falls back to zoom when content overflows badly', () => {
    resetUiHarnessState();

    const page = document.createElement('div');
    page.className = 'page';
    page.innerHTML = '<div class="footer"></div>';
    document.body.appendChild(page);

    try {
      stubScrollHeight(page, [2000, 2000, 2000]);
      applyPrintScalingToPage(page, true);

      assert.equal(page.dataset.printScaled, '1');
      assert(parseFloat(page.style.zoom) < 1, 'overflow fallback should zoom the page down');
    } finally {
      page.remove();
    }
  });

  it('screen rerender compresses the preview page but never zooms it', async () => {
    resetUiHarnessState();
    const seeded = seedUiSchedule({ skin: 'bands', dayCount: 2 });
    let printCalls = 0;
    const originalPrint = window.print;
    window.print = () => { printCalls += 1; };

    try {
      printAllDays();
      await wait(250);
      const previewPage = document.getElementById('previewPage');
      stubScrollHeight(previewPage, [2000, 2000, 2000, 2000]);
      renderDay(seeded.day1.id);

      assert.equal(printCalls, 1);
      // Compression stages apply to the preview page (not the print pages)…
      assert(previewPage.style.getPropertyValue('--notes-fs') !== '', 'compression vars should target the preview page');
      // …but the screen path must never hit the zoom fallback: the page
      // stretches to the content height instead of shrinking content below
      // readability (bands positions events absolutely, so the page cannot
      // grow on its own).
      assert.equal(previewPage.dataset.printScaled, undefined);
      assert.equal(previewPage.style.zoom, '');
      assert.equal(previewPage.style.minHeight, '2000px', 'screen page should stretch to the measured content height');
    } finally {
      window.print = originalPrint;
    }
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
    assert(html.includes('Overview · Event notes omitted.'));
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
});

describe('UI Harness — print geometry', () => {
  it('keeps readable text at least 9 pt across all skins and removes temporary measurement nodes', async () => {
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
      SKIN_NAMES.forEach(skin => {
        resetUiHarnessState();
        seedUiSchedule({ skin, longConcurrentAttendees: true });
        const metrics = measurePrintPlan({ mode: 'readable' });
        assert.equal(metrics.length, 1);
        assert.equal(metrics[0].scale, 1);
        assert(metrics[0].smallestTextPt >= 9, skin + ' should retain readable type');
        assert.equal(document.querySelector('.print-measurement'), null);
      });
    } finally {
      stylesheet.remove();
    }
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
