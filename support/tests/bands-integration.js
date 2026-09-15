// Local developer fixture UI. Uses the real parser and app entry points; no
// operational data, mocked layout, or production sample-loading code.
const frame = document.getElementById('app');
const result = document.getElementById('result');
frame.addEventListener('load', async () => {
  await frame.contentWindow.appReady;
  document.getElementById('load').disabled = false;
  document.getElementById('snapshot').disabled = false;
  document.getElementById('proof').disabled = false;
  result.textContent = 'Choose a sample to load into the real editor.';
});
document.getElementById('load').onclick = () => {
  try {
    const workbook = structuredClone(APPROVED_BAND_EXAMPLES);
    workbook.activeScheduleId = document.getElementById('sample').value;
    const app = frame.contentWindow;
    app.clearScheduleWorkbookTarget();
    app.loadParsedScheduleData(app.parseScheduleWorkbookContent(JSON.stringify(workbook), 'Synthetic examples.schedule'));
    app.hideLibrary();
    result.textContent = 'Loaded synthetic workbook through the app parser.';
  } catch (error) { result.textContent = 'FAIL: ' + error.message; }
};
document.getElementById('snapshot').onclick = () => {
  const doc = frame.contentDocument, sheet = doc.querySelector('.band-sheet');
  if (!sheet) { result.textContent = 'No banded page to inspect.'; return; }
  const ids = Array.from(sheet.querySelectorAll('[data-event-id]'), el => el.dataset.eventId);
  const print = frame.contentWindow.measurePrintPlan({});
  result.textContent = JSON.stringify({fit:sheet.dataset.fit,columns:sheet.dataset.columns,events:ids.length,uniqueEvents:new Set(ids).size,names:sheet.querySelectorAll('[data-person]').length,print});
};

// Capture only fit decisions and a content checksum from real app print DOM.
// A separate build script freezes these into script-free PDF input.
document.getElementById('proof').onclick = () => {
  const app = frame.contentWindow, doc = frame.contentDocument;
  const capture = [];
  const host = doc.createElement('div'); host.className = 'print-measurement'; doc.body.appendChild(host);
  try {
    for (const sample of ['main', 'normal', 'stress', 'forty']) {
      const workbook = structuredClone(APPROVED_BAND_EXAMPLES); workbook.activeScheduleId = sample;
      app.loadParsedScheduleData(app.parseScheduleWorkbookContent(JSON.stringify(workbook)));
      app.preparePrintPages(host, {});
      for (const sheet of host.querySelectorAll('.band-sheet')) {
        let hash = 2166136261;
        const text = sheet.textContent.replace(/\s/g, '');
        for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
        const columns = sheet.querySelector('.attendance-columns');
        capture.push({sample, day:sheet.dataset.day,fit:sheet.dataset.fit,classes:sheet.className,style:sheet.getAttribute('style'),
          columns:columns?.className, columnStyle:columns?.getAttribute('style'),
          groups:columns ? Array.from(columns.children, col => Array.from(col.querySelectorAll('article'), event => event.dataset.eventId)) : [],
          textHash:hash >>> 0,names:sheet.querySelectorAll('[data-person]').length});
      }
    }
    result.textContent = JSON.stringify(capture);
  } catch (error) {result.textContent = 'FAIL: ' + error.stack;}
  finally {host.remove();app.hideLibrary();}
};
