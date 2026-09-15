#!/usr/bin/env node
// Isolated new-author journey. Uses the real controls and synthetic data only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const engines = require(process.env.DAYSCHEDULE_PLAYWRIGHT_MODULE || 'playwright');
const repo = path.resolve(__dirname, '../..');
const output = path.join(repo, 'output/playwright/authoring');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const file = path.resolve(repo, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(repo + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
const names = ['Morgan','Bell','Chen','Patel','Brooks','Reed','Ellis','Hayes','Rivera','Foster',
  'Parker','Bennett','Bailey','Fletcher','Emerson','Lawson','Adams','Allen','Baker','Campbell',
  'Collins','Cooper','Davis','Edwards','Evans','Garcia','Gray','Green','Hall','Harris',
  'Hill','Howard','Hughes','Jackson','James','Johnson','Kelly','King','Lee','Lewis'];

async function journey(browser, origin, name) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await context.addInitScript(() => { window.showSaveFilePicker = undefined; window.showOpenFilePicker = undefined; });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const shot = async suffix => page.screenshot({ path: path.join(output, name + '-' + suffix + '.png'), fullPage: true });
  const time = async (id, value) => { await page.locator(id).fill(value); await page.locator(id).press('Tab'); };
  try {
    await page.goto(origin + '/app/index.html');
    await page.locator('#libraryNewName').fill('September Training Weekend');
    await page.locator('#libraryNewBtn').click();
    await page.locator('#addDayBtn').click();
    await page.locator('#addEventBtn').click();
    await page.locator('#insp-evt-title').fill('Roll Call');
    await time('#insp-evt-end', '0830'); await time('#insp-evt-start', '0800');
    assert(await page.locator('#insp-placement-main').isChecked());
    await shot('new-event');
    await page.locator('#insp-evt-loc').fill('Squadron');
    await page.locator('#insp-evt-poc').fill('MSgt Doe');
    await page.locator('#insp-evt-desc').fill('Arrive before 0800.');
    await page.locator('#insp-evt-emphasis').check();

    await page.locator('#addEventBtn').click();
    await page.locator('#insp-evt-title').fill('Training by flight');
    await time('#insp-evt-end', '1600'); await time('#insp-evt-start', '1200');
    await page.locator('.flight-editor > summary').click();
    for (const [i, flight, title] of [[0, 'Alpha', 'Network practicals'], [1, 'Bravo', 'Mission rehearsal'], [2, 'Bravo', 'After-action review']]) {
      await page.locator('#insp-add-flight').click();
      await page.locator('#flight-' + i + '-flight').fill(flight);
      await page.locator('#flight-' + i + '-title').fill(title);
      await page.locator('#flight-' + i + '-location').fill('Room ' + (i + 1));
      await page.locator('#flight-' + i + '-poc').fill('MSgt Doe');
      if (i === 1) { await time('#flight-1-endTime', '1400'); }
      if (i === 2) {
        await time('#flight-2-startTime', '1400');
        await page.locator('[data-flight-full-time="2"]').click();
        assert.equal(await page.locator('#flight-2-startTime').inputValue(), '1200');
        await time('#flight-2-startTime', '1400');
      }
    }
    await shot('flights');

    await page.locator('#addEventBtn').click();
    await page.locator('#insp-evt-title').fill('CTF event');
    await time('#insp-evt-start', '1230'); await time('#insp-evt-end', '1330');
    // Native keyboard radio interaction must survive inspector rerendering.
    await page.locator('#insp-placement-main').focus();
    await page.keyboard.press('ArrowDown');
    assert(await page.locator('#insp-placement-concurrent').isChecked());
    assert.equal(await page.evaluate(() => document.activeElement.id), 'insp-placement-concurrent');
    await page.locator('#insp-evt-group').selectOption('');
    await page.locator('#insp-evt-attendees').fill(names.join('; '));
    await page.locator('#insp-attendee-format').selectOption('suggested');
    assert((await page.locator('#insp-attendee-preview').textContent()).includes('40 entries'));
    await page.locator('#insp-evt-loc').fill('Operations lab');
    await page.locator('#insp-evt-poc').fill('MSgt Chan');
    await page.locator('#insp-evt-desc').fill('Bring assigned equipment.');
    await page.locator('#insp-evt-emphasis').check();
    await shot('roster');
    const selected = await page.evaluate(() => _selection.entityId);
    await page.locator('#daySheetBtn').click();
    const row = '.day-sheet-row[data-event-id="' + selected + '"]';
    assert.equal(await page.locator(row + ' .day-sheet-placement-select').inputValue(), 'concurrent');
    await page.locator(row + ' .day-sheet-group-select').selectOption({ index: 1 });
    assert.equal(await page.locator(row + ' .day-sheet-placement-select').inputValue(), 'concurrent');
    await page.locator(row + ' .day-sheet-group-select').selectOption('');
    const multiline = 'Doe, John\nAlex Smith\nChan\nChan';
    await page.locator('#daySheetDetailPanel [data-field="attendees"]').fill(multiline);
    await page.locator('#sheet-attendee-format').focus();
    await page.locator('#sheet-attendee-format').selectOption('lines');
    assert.equal(await page.evaluate(id => Store.getEvents(Store.getActiveDay()).find(event => event.id === id).attendees, selected), multiline);
    await page.locator('#daySheetDetailPanel [data-field="attendees"]').fill(names.join('\n'));
    await page.locator('#sheet-attendee-format').focus();
    assert((await page.locator('#sheet-attendee-preview').textContent()).includes('40 entries'));
    await shot('quick-edit');
    await page.locator('#daySheetOpenDetails').click();
    assert.equal(await page.locator('#insp-evt-attendees').inputValue(), names.join('\n'));

    for (let i = 1; i <= 6; i++) {
      await page.locator('#addNoteBtn').click();
      await page.locator('#insp-note-text').fill('Reminder ' + i + ': confirm your training record.');
    }
    await shot('reminders');
    await page.locator('#customizeBtn').click();
    await page.locator('[data-settings-tab="basics"]').click();
    await page.locator('#settings-title').fill('September Training Weekend');
    await page.locator('#settings-contact').fill('Training & readiness');
    await page.locator('#settings-band-logo').uncheck();
    await page.locator('#settings-band-notes').selectOption('90');
    await shot('heading-settings');
    await page.locator('#settings-done').click();

    // One-page Bands still contains each complete record, roster, flight and reminder.
    assert.equal(await page.locator('#scheduleContainer .band-sheet').getAttribute('data-fit'), 'true');
    assert.equal(await page.locator('.attendance-area [data-person]').count(), 40);
    assert.equal(await page.locator('.flight-table .flight-activity').count(), 3);
    const before = await page.evaluate(() => Store.getPersistedState());
    const downloadReady = page.waitForEvent('download');
    await page.locator('#overflowBtn').click(); await page.locator('#saveScheduleFileBtn').click();
    const saved = await (await downloadReady).path();
    const workbook = JSON.parse(fs.readFileSync(saved, 'utf8'));
    assert.equal(workbook.schemaVersion, 3);
    fs.writeFileSync(path.join(output, name + '-synthetic.schedule'), JSON.stringify(workbook));
    await page.locator('#tbBack').click();
    const chooser = page.waitForEvent('filechooser'); await page.locator('#libraryImportBtn').click(); await (await chooser).setFiles(saved);
    await page.waitForFunction(() => !document.getElementById('libraryView').classList.contains('active'));
    assert.deepEqual(await page.evaluate(() => Store.getPersistedState()), before);
    await page.locator('[data-event-id="' + selected + '"]').first().click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#insp-evt-title').scrollIntoViewIfNeeded();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert(await page.locator('.placement-option').evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().height >= 44)));
    await shot('mobile');
    await page.locator('#insp-placement-main').focus(); await page.keyboard.press('Space');
    assert(await page.locator('#insp-placement-main').isChecked());
    await page.locator('#insp-placement-concurrent').check();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('#insp-close').click();
    await shot('paper');
    if (name === 'chromium') {
      await page.evaluate(async () => {
        window.print = () => window.dispatchEvent(new Event('beforeprint'));
        await printSchedule({ dayIds: [Store.getActiveDay()] });
      });
      await page.pdf({ path: path.join(output, 'authoring-proof.pdf'), preferCSSPageSize: true, printBackground: true });
      await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    }
    assert.deepEqual(errors, []);
    return { browser: name, version: browser.version(), events: 3, attendees: 40, flights: 3, reminders: 6,
      keyboard: true, mobile: true, downloadReopen: true, pageErrors: errors };
  } catch (error) { await shot('failure'); throw error; }
  finally { await context.close(); }
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port, results = [];
  for (const name of (process.env.DAYSCHEDULE_BROWSERS || 'chromium,webkit').split(',')) {
    const browser = await engines[name].launch({ headless: true, timeout: 30000 });
    try { results.push(await journey(browser, origin, name)); console.log(name, 'new-author journey passed'); }
    finally { await browser.close(); }
  }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
