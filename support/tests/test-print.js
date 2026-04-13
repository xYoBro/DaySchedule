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
