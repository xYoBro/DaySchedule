describe('persistence — undo and redo', () => {
  it('saves the restored snapshot after undo and redo', () => {
    Store.reset();
    const originalSetTimeout = window.setTimeout;
    const originalClearTimeout = window.clearTimeout;
    const originalRenderActiveDay = window.renderActiveDay;
    const originalRenderInspector = window.renderInspector;
    const originalToast = window.toast;

    window.setTimeout = (fn) => { fn(); return 1; };
    window.clearTimeout = () => {};
    window.renderActiveDay = () => {};
    window.renderInspector = () => {};
    window.toast = () => {};
    sessionStorage.clear();
    try {
      Store.setTitle('Before');
      saveUndoState();
      Store.setTitle('After');
      undo();
      assert.equal(JSON.parse(sessionStorage.getItem('schedule_state')).title, 'Before');

      redo();
      assert.equal(JSON.parse(sessionStorage.getItem('schedule_state')).title, 'After');
    } finally {
      window.setTimeout = originalSetTimeout;
      window.clearTimeout = originalClearTimeout;
      window.renderActiveDay = originalRenderActiveDay;
      window.renderInspector = originalRenderInspector;
      window.toast = originalToast;
    }
  });
});

describe('inspector — snapToQuarter', () => {
  it('rounds late-night values forward to 2400 instead of backward', () => {
    assert.equal(snapToQuarter('2353'), '2400');
    assert.equal(snapToQuarter('2359'), '2400');
  });
});
