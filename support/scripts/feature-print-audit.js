#!/usr/bin/env node

const assert = require('assert/strict');
const fs = require('fs/promises');
const http = require('http');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const HOST = '127.0.0.1';
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUTPUT_DIR = path.join(REPO_ROOT, 'output', 'playwright');
const DIST_APP = path.join(REPO_ROOT, 'dist', 'DaySchedule.html');
const SKINS = ['bands', 'grid', 'cards', 'phases'];
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const PRINT_TARGET_PX = (10.32 * 96) - 48;

function getContentType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function createStaticServer(rootDir) {
  const rootWithSep = rootDir.endsWith(path.sep) ? rootDir : rootDir + path.sep;
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url || '/', `http://${HOST}`).pathname);
      let filePath = path.join(rootDir, pathname.replace(/^\/+/, ''));
      if (filePath !== rootDir && !filePath.startsWith(rootWithSep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }
      let stats;
      try {
        stats = await fs.stat(filePath);
      } catch (_error) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }
      if (stats.isDirectory()) filePath = path.join(filePath, 'index.html');
      const data = await fs.readFile(filePath);
      res.writeHead(200, { 'Content-Type': getContentType(filePath) });
      res.end(data);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(error.stack || String(error));
    }
  });

  await new Promise(resolve => server.listen(0, HOST, resolve));
  const address = server.address();
  return { server, origin: `http://${HOST}:${address.port}` };
}

async function addFilePickerMocks(page) {
  await page.addInitScript(() => {
    window.__auditSavedFiles = {};
    window.showSaveFilePicker = async options => {
      const fileName = (options && options.suggestedName) || 'audit.schedule';
      return {
        kind: 'file',
        name: fileName,
        async createWritable() {
          const chunks = [];
          return {
            async write(content) {
              if (typeof content === 'string') chunks.push(content);
              else if (content instanceof Blob) chunks.push(await content.text());
              else chunks.push(String(content));
            },
            async close() {
              window.__auditSavedFiles[fileName] = chunks.join('');
            },
          };
        },
      };
    };
  });
}

async function bootDistApp(page, origin) {
  await fs.access(DIST_APP);
  await page.goto(`${origin}/dist/DaySchedule.html`, { waitUntil: 'load' });
  await page.waitForFunction(() =>
    typeof Store === 'object' &&
    typeof renderActiveDay === 'function' &&
    typeof renderInspector === 'function' &&
    typeof setCurrentScheduleFileData === 'function' &&
    typeof buildStandaloneScheduleWorkbookObject === 'function'
  );
}

async function verifyStartScreen(page) {
  const result = await page.evaluate(() => ({
    title: document.querySelector('.library-title') ? document.querySelector('.library-title').textContent.trim() : '',
    openButton: !!document.getElementById('libraryImportBtn'),
    createButton: !!document.getElementById('libraryNewBtn'),
    mentionsSchedule: document.body.textContent.includes('.schedule'),
  }));
  assert.equal(result.openButton, true, 'start screen should expose Open .schedule');
  assert.equal(result.createButton, true, 'start screen should expose Create');
  assert.equal(result.mentionsSchedule, true, 'start screen should explain .schedule workflow');
  return result;
}

async function seedAuditWorkbook(page) {
  return page.evaluate(() => {
    function ensureGroup(group) {
      if (!Store.getGroup(group.id)) Store.addGroup(group);
    }
    function addEvent(dayId, event) {
      const added = Store.addEvent(dayId, event);
      if (!added) throw new Error('Failed to add event: ' + event.title);
      return added;
    }

    Store.reset();
    Store.setTitle('Automated Feature Audit');
    Store.setFooter({ contact: 'Ops Desk', poc: 'Scheduler' });
    ensureGroup({ id: 'grp_mx', name: 'Maintenance', scope: 'limited', color: '#1a7a40' });
    ensureGroup({ id: 'grp_med', name: 'Medical', scope: 'limited', color: '#c23616' });
    ensureGroup({ id: 'grp_log', name: 'Logistics', scope: 'limited', color: '#7c3aed' });

    const day1 = Store.addDay({ id: 'audit-day-1', date: '2026-04-28', startTime: '0600', endTime: '1700', label: 'Dense Ops' });
    const day2 = Store.addDay({ id: 'audit-day-2', date: '2026-04-29', startTime: '0700', endTime: '1630', label: 'Training' });
    const day3 = Store.addDay({ id: 'audit-day-3', date: '2026-04-30', startTime: '0730', endTime: '1500', label: 'Recovery' });

    addEvent(day1.id, { id: 'evt-formation', title: 'Formation', startTime: '0600', endTime: '0630', location: 'Apron', poc: 'First Sergeant', groupId: 'grp_all', isMainEvent: true });
    addEvent(day1.id, { id: 'evt-brief', title: 'Commander Brief', startTime: '0630', endTime: '0730', location: 'Auditorium', poc: 'CC', groupId: 'grp_all', isMainEvent: true });
    addEvent(day1.id, { id: 'evt-main-0800', title: 'Main Track Block', startTime: '0800', endTime: '0900', groupId: 'grp_all', isMainEvent: true });
    addEvent(day1.id, { id: 'evt-main-0800b', title: 'Same Time Commander Update', startTime: '0800', endTime: '0830', groupId: 'grp_all', isMainEvent: true });
    addEvent(day1.id, { id: 'evt-chief-overlap-a', title: 'Chiefs Range', startTime: '0815', endTime: '1015', location: 'Range 3', groupId: 'grp_chiefs', attendees: 'RSO, ammo, safety' });
    addEvent(day1.id, { id: 'evt-chief-overlap-b', title: 'Chiefs Debrief Prep', startTime: '0845', endTime: '0930', location: 'Bldg 100', groupId: 'grp_chiefs' });
    addEvent(day1.id, { id: 'evt-mx', title: 'Maintenance Launch Sim', startTime: '0830', endTime: '1030', location: 'Hangar 4', groupId: 'grp_mx', attendees: 'Crew chiefs, specialists, AGE' });
    addEvent(day1.id, { id: 'evt-med', title: 'Medical Screenings', startTime: '0830', endTime: '1030', location: 'Clinic', groupId: 'grp_med' });
    addEvent(day1.id, { id: 'evt-lunch', title: 'Lunch', startTime: '1100', endTime: '1200', groupId: 'grp_all', isMainEvent: true, isBreak: true });
    addEvent(day1.id, { id: 'evt-cbt', title: 'CBT Completion', startTime: '1200', endTime: '1430', groupId: 'grp_flight', isMainEvent: true, location: 'Computer Lab' });
    addEvent(day1.id, { id: 'evt-log', title: 'Mobility Bags', startTime: '1230', endTime: '1400', groupId: 'grp_log', location: 'Warehouse' });
    addEvent(day1.id, { id: 'evt-close', title: 'End of Day Formation', startTime: '1600', endTime: '1630', groupId: 'grp_all', isMainEvent: true });
    Store.addNote(day1.id, { id: 'note-uniform', category: 'Uniform', text: 'OCP unless mission tasking requires otherwise.' });

    addEvent(day2.id, { id: 'evt-d2-open', title: 'Day 2 Formation', startTime: '0700', endTime: '0730', groupId: 'grp_all', isMainEvent: true });
    addEvent(day2.id, { id: 'evt-d2-main', title: 'AFSC Training', startTime: '0800', endTime: '1100', groupId: 'grp_flight', isMainEvent: true, location: 'Work Centers' });
    addEvent(day2.id, { id: 'evt-d2-snco', title: 'SNCO Sync', startTime: '0830', endTime: '0930', groupId: 'grp_snco', attendees: 'SNCOs by name' });
    addEvent(day2.id, { id: 'evt-d2-mx', title: 'Tool Inventory', startTime: '0930', endTime: '1030', groupId: 'grp_mx' });
    addEvent(day2.id, { id: 'evt-d2-lunch', title: 'Lunch', startTime: '1130', endTime: '1230', groupId: 'grp_all', isMainEvent: true, isBreak: true });
    addEvent(day2.id, { id: 'evt-d2-close', title: 'Hotwash', startTime: '1500', endTime: '1530', groupId: 'grp_all', isMainEvent: true });
    Store.addNote(day2.id, { id: 'note-med', category: 'Medical', text: 'Bring IMR printouts if flagged.' });

    addEvent(day3.id, { id: 'evt-d3-open', title: 'Recovery Formation', startTime: '0730', endTime: '0800', groupId: 'grp_all', isMainEvent: true });
    addEvent(day3.id, { id: 'evt-d3-reset', title: 'Equipment Reset', startTime: '0830', endTime: '1100', groupId: 'grp_mx' });
    addEvent(day3.id, { id: 'evt-d3-admin', title: 'Admin Closeout', startTime: '1200', endTime: '1400', groupId: 'grp_flight', isMainEvent: true });
    Store.addNote(day3.id, { id: 'note-admin', category: 'Admin', text: 'Return borrowed equipment before release.' });

    Store.setActiveDay(day1.id);
    setCurrentFile(null, null);
    const fileData = {
      name: Store.getTitle(),
      current: Store.getPersistedState(),
      versions: [],
      theme: { skin: 'bands', palette: 'classic', customColors: null },
    };
    setCurrentScheduleFileData(fileData);
    hideLibrary();
    syncToolbarTitle();
    renderActiveDay();
    renderInspector();

    return {
      dayIds: Store.getDays().map(day => day.id),
      dayCount: Store.getDays().length,
      day1EventCount: Store.getEvents(day1.id).length,
    };
  });
}

async function verifyToolbarAndCrud(page) {
  const before = await page.evaluate(() => ({
    dayCount: Store.getDays().length,
    eventCount: Store.getEvents(Store.getActiveDay()).length,
    noteCount: Store.getNotes(Store.getActiveDay()).length,
    toolbarButtons: Array.from(document.querySelectorAll('.toolbar button')).map(btn => btn.textContent.trim()),
  }));
  assert(before.toolbarButtons.includes('+ Event'), 'toolbar should expose + Event');
  assert(before.toolbarButtons.includes('+ Note'), 'toolbar should expose + Note');
  assert(before.toolbarButtons.includes('+ Day'), 'toolbar should expose + Day');
  assert(before.toolbarButtons.includes('Quick Edit'), 'toolbar should expose Quick Edit');
  assert(before.toolbarButtons.includes('Customize'), 'toolbar should expose Customize');

  await page.locator('#addEventBtn').click();
  await page.locator('#insp-evt-title').fill('UI Added Event');
  await page.locator('#insp-evt-start').fill('1445');
  await page.locator('#insp-evt-end').fill('1515');
  await page.locator('#insp-evt-group').selectOption('grp_med');

  await page.locator('#addNoteBtn').click();
  await page.locator('#insp-note-cat').fill('Audit');
  await page.locator('#insp-note-text').fill('UI added note path is writable.');

  await page.locator('#addDayBtn').click();

  const after = await page.evaluate(() => ({
    dayCount: Store.getDays().length,
    firstDayEventTitles: Store.getEvents('audit-day-1').map(evt => evt.title),
    firstDayNotes: Store.getNotes('audit-day-1').map(note => note.text),
  }));
  assert.equal(after.dayCount, before.dayCount + 1, '+ Day should create a new day');
  assert(after.firstDayEventTitles.includes('UI Added Event'), '+ Event inspector edits should persist');
  assert(after.firstDayNotes.includes('UI added note path is writable.'), '+ Note inspector edits should persist');

  await page.evaluate(() => {
    Store.setActiveDay('audit-day-1');
    selectEntity(null);
    renderActiveDay();
    renderInspector();
  });
  return { before, after };
}

async function verifyQuickEdit(page) {
  await page.locator('#daySheetBtn').click();
  await page.locator('#dayEventSheetModal.active').waitFor({ state: 'visible', timeout: 5000 });
  const result = await page.evaluate(() => ({
    active: document.getElementById('dayEventSheetModal').classList.contains('active'),
    rows: document.querySelectorAll('#dayEventSheetModalContent tbody tr[data-event-id]').length,
    title: document.querySelector('.day-sheet-title') ? document.querySelector('.day-sheet-title').textContent.trim() : '',
  }));
  assert.equal(result.active, true, 'Quick Edit modal should open');
  assert(result.rows >= 1, 'Quick Edit should list event rows');
  await page.locator('#daySheetClose').click();
  return result;
}

async function setSkin(page, skin) {
  await page.evaluate(nextSkin => {
    const fileData = getCurrentScheduleFileData();
    fileData.theme.skin = nextSkin;
    Store.setActiveDay('audit-day-1');
    renderActiveDay();
    renderInspector();
  }, skin);
}

async function verifyViewsAndSelection(page) {
  const results = {};
  for (const skin of SKINS) {
    await setSkin(page, skin);
    const target = page.locator('#scheduleContainer [data-event-id="evt-chief-overlap-a"]').first();
    const count = await target.count();
    assert(count >= 1, `${skin} should render target event`);
    await target.click();
    const result = await page.evaluate((expectedSkin) => {
      const allEventIds = new Set(Store.getEvents('audit-day-1').map(evt => evt.id));
      const renderedIds = new Set(Array.from(document.querySelectorAll('#scheduleContainer [data-event-id]')).map(node => node.getAttribute('data-event-id')));
      const missing = Array.from(allEventIds).filter(id => !renderedIds.has(id));
      const page = document.getElementById('scheduleContainer').closest('.page') || document.getElementById('scheduleContainer');
      return {
        pageClass: page ? page.className : '',
        missing,
        selection: { ..._selection },
        selectedNodes: document.querySelectorAll('#scheduleContainer [data-event-id="evt-chief-overlap-a"].selected').length,
        inspectorTitle: document.getElementById('insp-evt-title') ? document.getElementById('insp-evt-title').value : '',
        gridDuplicate0800Rows: expectedSkin === 'grid'
          ? Array.from(document.querySelectorAll('#scheduleContainer .grid-slot > .grid-time-col')).filter(node => node.textContent.trim() === '0800').length
          : null,
      };
    }, skin);
    assert(result.pageClass.includes(`skin-${skin}`), `${skin} should set page skin class`);
    assert.deepEqual(result.missing, [], `${skin} should expose every event id`);
    assert.equal(result.selection.entityId, 'evt-chief-overlap-a', `${skin} should select clicked event`);
    assert(result.selectedNodes >= 1, `${skin} should visibly mark selected event`);
    assert.equal(result.inspectorTitle, 'Chiefs Range', `${skin} inspector should track selected event`);
    if (skin === 'grid') {
      assert.equal(result.gridDuplicate0800Rows, 1, 'grid should group same-start main events under one 0800 row');
    }
    results[skin] = result;
  }
  return results;
}

async function verifySettingsModal(page) {
  await page.locator('#customizeBtn').click();
  await page.locator('#settingsModal.active').waitFor({ state: 'visible', timeout: 5000 });
  for (const skin of SKINS) {
    await page.locator(`.skin-option[data-skin="${skin}"]`).click();
    const activeSkin = await page.evaluate(() => getCurrentScheduleFileData().theme.skin);
    assert.equal(activeSkin, skin, `settings modal should switch to ${skin}`);
  }
  await page.locator('#settings-done').click();
  return { switchedSkins: SKINS };
}

async function verifyWorkbookSerialization(page) {
  const result = await page.evaluate(async () => {
    const fileData = getCurrentScheduleFileData();
    fileData.current = Store.getPersistedState();
    const workbook = buildStandaloneScheduleWorkbookObject(fileData);
    const content = JSON.stringify(workbook, null, 2) + '\n';
    const parsed = parseScheduleWorkbookContent(content, 'audit.schedule');
    const saved = await saveScheduleWorkbookFile({ fileData, suggestedName: 'audit.schedule', reuseHandle: false });
    return {
      fileType: workbook.fileType,
      scheduleCount: workbook.schedules.length,
      activeScheduleId: workbook.activeScheduleId,
      parsedTitle: parsed.fileData.current.title,
      saved,
      savedNames: Object.keys(window.__auditSavedFiles || {}),
      savedContentHasSchedule: Object.values(window.__auditSavedFiles || {}).some(text => text.includes('"fileType": "dayschedule"')),
    };
  });
  assert.equal(result.fileType, 'dayschedule', 'workbook should use the DaySchedule workbook file type');
  assert.equal(result.scheduleCount, 1, 'standalone workbook should contain the active schedule');
  assert.equal(result.parsedTitle, 'Automated Feature Audit', 'workbook should parse back to the same title');
  assert.equal(result.saved, true, 'mocked .schedule save should succeed');
  assert.equal(result.savedContentHasSchedule, true, 'saved file should contain workbook envelope');
  return result;
}

function getPdfPageCount(pdfPath) {
  const output = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
  const match = output.match(/^Pages:\s+(\d+)/m);
  if (!match) throw new Error('Unable to read PDF page count for ' + pdfPath);
  return Number(match[1]);
}

async function buildPrintPages(page, skin) {
  return page.evaluate(({ nextSkin, printTargetPx }) => {
    const fileData = getCurrentScheduleFileData();
    fileData.theme.skin = nextSkin;
    const theme = getScheduleTheme(fileData.theme);
    applyPalette(theme.palette, theme.customColors);
    const renderer = SKIN_RENDERERS[theme.skin] || SKIN_RENDERERS.bands;
    let printContainer = document.getElementById('printContainer');
    if (!printContainer) {
      printContainer = document.createElement('div');
      printContainer.id = 'printContainer';
      document.body.appendChild(printContainer);
    }
    let html = '';
    const savedActiveDay = Store.getActiveDay();
    Store.getDays().forEach(day => {
      Store.setActiveDay(day.id);
      html += '<div class="page print-page skin-' + theme.skin + '">';
      html += renderHeader(day);
      html += renderer(day.id);
      html += renderFooter();
      html += '</div>';
    });
    Store.setActiveDay(savedActiveDay);
    printContainer.innerHTML = html;
    const previewArea = document.querySelector('.preview-area');
    if (previewArea) previewArea.style.display = 'none';
    printContainer.style.display = 'block';
    applyPrintScaling(true);
    const pages = Array.from(printContainer.querySelectorAll('.print-page')).map((page, index) => {
      const originalMinHeight = page.style.minHeight;
      if (!page.dataset.printScaled) page.style.minHeight = '0';
      const rect = page.getBoundingClientRect();
      const zoom = parseFloat(page.style.zoom || '1');
      const metric = {
        index,
        scrollHeight: page.scrollHeight,
        rectHeight: rect.height,
        zoom,
        scaled: page.dataset.printScaled === '1',
        withinTarget: rect.height <= printTargetPx + 1,
      };
      page.style.minHeight = originalMinHeight;
      return metric;
    });
    return { skin: nextSkin, pageCount: pages.length, pages };
  }, { nextSkin: skin, printTargetPx: PRINT_TARGET_PX });
}

async function verifyPrintOneSheetPerDay(page, expectedDayCount) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const results = {};
  for (const skin of SKINS) {
    const metrics = await buildPrintPages(page, skin);
    assert.equal(metrics.pageCount, expectedDayCount, `${skin} should build one print page element per day`);
    metrics.pages.forEach(pageMetric => {
      assert.equal(
        pageMetric.withinTarget,
        true,
        `${skin} print page ${pageMetric.index + 1} should fit the print target: ${JSON.stringify(pageMetric)}`
      );
    });

    await page.emulateMedia({ media: 'print' });
    const pdfPath = path.join(OUTPUT_DIR, `feature-print-audit-${skin}.pdf`);
    await page.pdf({
      path: pdfPath,
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.15in', right: '0.15in', bottom: '0.15in', left: '0.15in' },
    });
    const pdfPages = getPdfPageCount(pdfPath);
    assert.equal(pdfPages, expectedDayCount, `${skin} PDF should produce exactly one sheet per day`);
    results[skin] = { ...metrics, pdfPath, pdfPages };
  }
  return results;
}

async function main() {
  let browser = null;
  let page = null;
  const { server, origin } = await createStaticServer(REPO_ROOT);
  try {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ baseURL: origin, viewport: { width: 1728, height: 1117 } });
    await addFilePickerMocks(page);
    await bootDistApp(page, origin);

    const startScreen = await verifyStartScreen(page);
    const seed = await seedAuditWorkbook(page);
    const toolbarCrud = await verifyToolbarAndCrud(page);
    const quickEdit = await verifyQuickEdit(page);
    const views = await verifyViewsAndSelection(page);
    const settings = await verifySettingsModal(page);
    const workbook = await verifyWorkbookSerialization(page);
    const print = await verifyPrintOneSheetPerDay(page, seed.dayCount + 1);

    console.log(JSON.stringify({
      ok: true,
      origin,
      startScreen,
      seed,
      toolbarCrud,
      quickEdit,
      views: Object.fromEntries(Object.entries(views).map(([skin, result]) => [skin, {
        missing: result.missing,
        selectedNodes: result.selectedNodes,
        gridDuplicate0800Rows: result.gridDuplicate0800Rows,
      }])),
      settings,
      workbook,
      print: Object.fromEntries(Object.entries(print).map(([skin, result]) => [skin, {
        pdfPages: result.pdfPages,
        pdfPath: result.pdfPath,
        pageCount: result.pageCount,
        pages: result.pages,
      }])),
    }, null, 2));
  } catch (error) {
    if (page) {
      await fs.mkdir(OUTPUT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(OUTPUT_DIR, 'feature-print-audit-failure.png'), fullPage: true });
    }
    console.error(error.stack || String(error));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
