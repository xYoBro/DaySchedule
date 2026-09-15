#!/usr/bin/env node
// Optional browser automation: no app dependencies, remote services, or user profiles.
// DAYSCHEDULE_PLAYWRIGHT_MODULE may point to an existing Playwright installation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const engines = require(process.env.DAYSCHEDULE_PLAYWRIGHT_MODULE || 'playwright');
const repo = path.resolve(__dirname, '../..');
const output = path.join(repo, 'output/playwright/release');
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
const server = http.createServer((request, response) => {
  const file = path.resolve(repo, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  if (!file.startsWith(repo + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404); response.end(); return;
  }
  response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(response);
});

async function realApp(browser, origin, name) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  // Download mode is exercised deliberately; native file dialogs need manual testing.
  await context.addInitScript(() => { window.showSaveFilePicker = undefined; window.showOpenFilePicker = undefined; });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/app/index.html');
  await page.waitForFunction(() => document.getElementById('libraryView').classList.contains('active'));
  assert.equal(await page.locator('#libraryContinueStrip').isVisible(), false);
  const cards = await page.locator('.library-start-card').evaluateAll(elements => elements.map(el => {
    const box = el.getBoundingClientRect(); return { x: box.x, right: box.right, top: box.top, bottom: box.bottom, width: box.width };
  }));
  assert(cards.every(card => card.width > 240 && card.x >= 0 && card.right <= 390));
  assert(cards[1].top >= cards[0].bottom, 'Mobile cards must stack without overlap.');
  await page.screenshot({ path: path.join(output, name + '-start-mobile.png'), fullPage: true });

  await page.locator('#libraryHelpBtn').focus();
  await page.locator('#libraryHelpBtn').press('Enter');
  assert.equal(await page.locator('#helpModal').getAttribute('role'), 'dialog');
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Shift+Tab');
    assert(await page.evaluate(() => document.getElementById('helpModal').contains(document.activeElement)));
  }
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'libraryHelpBtn');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#libraryNewName').fill('Release smoke test');
  await page.locator('#libraryNewBtn').click();
  await page.locator('#addDayBtn').click();
  await page.locator('#addEventBtn').click();
  await page.locator('#insp-evt-title').fill('Synthetic briefing');
  await page.locator('#insp-evt-end').fill('1437');
  await page.locator('#insp-evt-end').press('Tab');
  await page.locator('#insp-evt-start').fill('1405');
  await page.locator('#insp-evt-start').press('Tab');
  assert.deepEqual(await page.evaluate(() => {
    const evt = Store.getEvents(Store.getActiveDay())[0]; return [evt.startTime, evt.endTime];
  }), ['1405', '1437']);
  await page.locator('#daySheetBtn').click();
  const title = page.locator('.day-sheet-title-input');
  await title.fill('Canceled change');
  await title.press('Escape');
  assert.equal(await title.inputValue(), 'Synthetic briefing');
  assert(await page.locator('#dayEventSheetModal').isVisible());
  await title.press('Escape');
  assert.equal(await page.locator('#dayEventSheetModal').isVisible(), false);

  const oldDay = await page.evaluate(() => Store.getActiveDay());
  await page.locator('#addDayBtn').click();
  await page.locator('#addEventBtn').click();
  const newDay = await page.evaluate(() => Store.getActiveDay());
  assert.notEqual(newDay, oldDay);
  assert.equal(await page.evaluate(id => Store.getEvents(id).length, oldDay), 1);
  assert.equal(await page.evaluate(id => Store.getEvents(id).length, newDay), 1);
  await page.locator('#customizeBtn').click();
  await page.locator('[data-settings-tab="look"]').click();
  await page.locator('[data-palette="custom"]').click();
  assert(await page.locator('.custom-palette-fields').isVisible());
  await page.locator('[data-custom-color="accent"]').fill('#123456');
  await page.locator('[data-custom-color="accent"]').dispatchEvent('change');
  assert.equal(await page.evaluate(() => getCurrentScheduleFileData().theme.customColors.accent), '#123456');
  await page.screenshot({ path: path.join(output, name + '-customize.png'), fullPage: true });
  await page.locator('#settings-done').click();
  await page.locator('#overflowBtn').click();
  await page.locator('#printBtn').click();
  assert.equal(await page.locator('#printMode').inputValue(), 'fit');
  assert(await page.locator('#printReviewSummary').textContent());
  await page.screenshot({ path: path.join(output, name + '-print-review.png'), fullPage: true });
  await page.locator('#printReviewCancel').click();

  // Save a real download, then prove the resulting workbook parses and retains both days.
  const downloaded = page.waitForEvent('download');
  await page.locator('#overflowBtn').click();
  await page.locator('#saveScheduleFileBtn').click();
  const download = await downloaded;
  const savedPath = await download.path();
  const workbook = JSON.parse(fs.readFileSync(savedPath, 'utf8'));
  assert.equal(workbook.schedules.length, 1);
  assert.equal(workbook.schedules[0].current.days.length, 2);
  assert.equal(workbook.schedules[0].current.days[0].events[0].title, 'Synthetic briefing');
  assert.equal(errors.length, 0, errors.join('\n'));
  await page.screenshot({ path: path.join(output, name + '-editor.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Editor chrome must fit phone width.');
  assert(await page.locator('.toolbar button').evaluateAll(buttons => buttons.filter(button => button.getClientRects().length)
    .every(button => button.getBoundingClientRect().height >= 44 && button.getBoundingClientRect().width >= 44)), 'Toolbar controls need usable touch targets.');
  await page.screenshot({ path: path.join(output, name + '-editor-mobile.png'), fullPage: true });

  // Reopen the downloaded file through the real file-input workflow.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#tbBack').click();
  const chooserReady = page.waitForEvent('filechooser');
  await page.locator('#libraryImportBtn').click();
  await (await chooserReady).setFiles(savedPath);
  await page.waitForFunction(() => !document.getElementById('libraryView').classList.contains('active'));
  assert.equal(await page.evaluate(() => Store.getDays().length), 2);
  assert.equal(await page.evaluate(() => getCurrentScheduleFileData().theme.customColors.accent), '#123456');

  // Complete the new workbook controls with actual clicks and a visible preview.
  await page.locator('#workbookSwitchBtn').click();
  await page.locator('.workbook-duplicate-options summary').click();
  await page.locator('#workbookFirstDate').fill('2026-10-01');
  await page.locator('#workbookDuplicateBtn').click();
  assert(await page.locator('#workbookDuplicatePreview').isVisible());
  await page.screenshot({ path: path.join(output, name + '-duplicate-preview.png'), fullPage: true });
  await page.locator('#workbookConfirmDuplicate').click();
  assert.equal(await page.evaluate(() => Store.getDays()[0].date), '2026-10-01');
  assert.equal(await page.evaluate(() => getScheduleWorkbookEntries().length), 2);
  await page.locator('#workbookSwitchBtn').click();
  await page.getByRole('button', { name: 'Archive Release smoke test', exact: true }).click();
  assert.equal(await page.evaluate(() => getScheduleWorkbookEntries().length), 1);
  await page.locator('.workbook-archive-list summary').click();
  await page.locator('[data-restore-schedule]').click();
  assert.equal(await page.evaluate(() => getScheduleWorkbookEntries().length), 2);
  await page.locator('#workbookCloseBtn').click();

  await page.locator('#overflowBtn').click();
  await page.locator('#versionsMenuBtn').click();
  await page.locator('#versionSaveBtn').click();
  await page.locator('#versionNameInput').fill('Review checkpoint');
  await page.locator('#versionSaveConfirm').click();
  await page.locator('.version-rename-btn').click();
  await page.getByRole('textbox', { name: 'New version name' }).fill('Reviewed copy');
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.version-item-name')?.textContent === 'Reviewed copy');
  await page.screenshot({ path: path.join(output, name + '-versions.png'), fullPage: true });
  page.once('dialog', dialog => dialog.accept());
  await page.locator('.version-delete-btn').click();
  await page.waitForFunction(() => !document.querySelector('.version-item'));
  await page.locator('#versionCloseBtn').click();
  assert.equal(errors.length, 0, errors.join('\n'));
  await context.close();
  return { checks: 'mobile start/editor, keyboard modal, exact times, cell cancel, new day, custom colors, print review, download/reopen roundtrip, dated duplication, archive/restore, version rename/delete', pageErrors: errors };
}

async function denseBandsScreen(browser, origin, name) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/app/index.html');
    await page.evaluate(() => appReady);
    const fixture = require('./fixtures/bands-approved.json');
    await page.evaluate(workbook => {
      workbook.activeScheduleId = 'forty';
      loadParsedScheduleData(parseScheduleWorkbookContent(JSON.stringify(workbook)));
      hideLibrary();
      Store.setActiveDay('sun'); renderActiveDay();
    }, fixture);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const geometry = await page.evaluate(() => {
        const sheet = document.querySelector('#scheduleContainer .band-sheet'), box = sheet.getBoundingClientRect();
        const entries = Array.from(sheet.querySelectorAll('article[data-event-id]'));
        const boxes = entries.concat(Array.from(sheet.querySelectorAll('.page-footer,.reminder-panel'))).map(element => element.getBoundingClientRect());
        return {count:entries.length, fit:sheet.dataset.fit, columns:Number(sheet.dataset.columns),
          paper:[box.width*.75,box.height*.75], logo:sheet.querySelector('.logo-slot').getBoundingClientRect().width*.75,
          contained:boxes.every(item => item.top>=box.top && item.bottom<=box.bottom && item.left>=box.left && item.right<=box.right),
          documentFits:document.documentElement.scrollWidth<=innerWidth};
      });
      assert.equal(geometry.count, 15); assert.equal(geometry.fit, 'true');
      assert(geometry.columns<=2); assert(geometry.contained);
      assert.deepEqual(geometry.paper, [612,792]); assert.equal(geometry.logo,72);
      assert(geometry.documentFits, 'The paper preview scrolls within the app at narrow widths.');
    }
    await page.setViewportSize({ width:1440,height:1000 });
    const supporting=page.locator('#scheduleContainer .attendance-area article').first();
    const eventId=await supporting.getAttribute('data-event-id');
    await supporting.press('Enter');
    await page.locator('#insp-evt-title').fill('Edited supporting activity');
    assert((await page.locator('#scheduleContainer [data-event-id="'+eventId+'"].selected').textContent()).includes('Edited supporting activity'));
    await page.screenshot({path:path.join(output,name+'-dense-bands-screen.png')});
    assert.deepEqual(errors,[]);
    return {events:15,widths:[1440,390],checks:'fixed Letter paper, complete events, two continuous columns, 72pt logo, keyboard selection and editing'};
  } finally {await context.close();}
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const results = [];
  for (const name of (process.env.DAYSCHEDULE_BROWSERS || 'chromium,firefox,webkit').split(',')) {
    const browser = await engines[name].launch({ headless: true });
    const result = { name, version: browser.version(), suites: [] };
    try {
      if (!process.argv.includes('--ui-only')) {
        for (const runner of ['runner.html', 'runner-integration.html', 'runner-ui.html']) {
          const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', error => errors.push(error.message));
          await page.goto(origin + '/support/tests/' + runner);
          await page.waitForFunction(() => /\d+ passed, \d+ failed/.test(document.querySelector('#summary').textContent), null, { timeout: 90000 });
          const summary = await page.locator('#summary').textContent();
          const failures = await page.locator('.result.fail').allTextContents();
          result.suites.push({ runner, summary, failures, errors });
          assert.equal(failures.length, 0, failures.join('\n'));
          assert.equal(errors.length, 0, errors.join('\n'));
          console.log(name, runner, summary);
          await context.close();
        }
      }
      result.realApp = await realApp(browser, origin, name);
      result.denseBandsScreen = await denseBandsScreen(browser, origin, name);
      console.log(name, 'real application checks passed');
    } catch (error) {
      result.error = error.stack;
      process.exitCode = 1;
      console.error(name, error.message);
    } finally { await browser.close(); }
    results.push(result);
  }
  fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify(results, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
