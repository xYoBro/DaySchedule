// Developer review only. Real parser, renderer, selection and save controls.
// Serve on an isolated loopback origin when testing; never auto-load data.
const frame = document.getElementById('app');
const status = document.getElementById('status');
let groupExample;
let exampleLoaded = false;
frame.addEventListener('load', async () => {
  await frame.contentWindow.appReady;
  try {
    const response = await fetch('fixtures/alternate-groups.json');
    if (!response.ok) throw new Error('Example could not be read');
    groupExample = await response.json();
    document.getElementById('load').disabled = false;
    status.textContent = 'Load an example to try the actual editor. Loading replaces this tab’s workbook.';
  } catch (error) { status.textContent = 'Serve this developer review over localhost: ' + error.message; }
});
document.getElementById('load').addEventListener('click', () => {
  const sample = document.getElementById('sample').value;
  const workbook = structuredClone(sample === 'groups' ? groupExample : APPROVED_BAND_EXAMPLES);
  workbook.activeScheduleId = sample;
  workbook.schedules.find(schedule => schedule.id === sample).theme.skin = document.getElementById('view').value;
  const app = frame.contentWindow;
  app.clearScheduleWorkbookTarget();
  app.loadParsedScheduleData(app.parseScheduleWorkbookContent(JSON.stringify(workbook), 'Synthetic examples.schedule'));
  app.hideLibrary();
  exampleLoaded = true;
  status.textContent = 'Synthetic example loaded. Click an event or reminder to edit; use the app’s day tabs, Print and Save controls.';
});
document.getElementById('view').addEventListener('change', () => {
  if (!exampleLoaded) return;
  const app = frame.contentWindow;
  app.getCurrentScheduleFileData().theme.skin = document.getElementById('view').value;
  app.renderActiveDay();
  status.textContent = 'View changed. Your edits to this synthetic workbook are retained.';
});
