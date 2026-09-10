#!/usr/bin/env node
/* Isolated iframe regression checks; requires an installed Playwright package.
 * Override its module location with DAYSCHEDULE_PLAYWRIGHT_MODULE if needed.
 * No generated files are written to the checkout. No native dialogs are tested.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const engines = require(process.env.DAYSCHEDULE_PLAYWRIGHT_MODULE || 'playwright');
const repo = path.resolve(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dayschedule-embed-test-'));
let server;
let appServer;

async function waitForStart(frame) {
  await frame.waitForFunction(() => document.getElementById('libraryView')?.classList.contains('active'));
}
async function hostState(page) {
  return page.evaluate(() => ({
    heading: getComputedStyle(document.querySelector('h1')).color,
    font: getComputedStyle(document.querySelector('h1')).fontFamily,
    margin: getComputedStyle(document.body).margin,
    toolbar: getComputedStyle(document.getElementById('host-toolbar')).display,
    app: getComputedStyle(document.getElementById('host-app')).display,
    input: document.getElementById('host-input').value,
    theme: document.body.getAttribute('data-editor-theme'),
  }));
}
async function getAppFrame(page) {
  const element = await page.locator('iframe').elementHandle();
  const frame = await element.contentFrame();
  assert.ok(frame, 'The app needs its own iframe document.');
  await waitForStart(frame);
  return frame;
}
async function createSchedule(frame) {
  await frame.locator('#libraryNewName').fill('Host isolation check');
  await frame.locator('#libraryNewBtn').click();
  await frame.waitForFunction(() => !document.getElementById('libraryView').classList.contains('active'));
  assert.equal(await frame.evaluate(() => Store.getTitle()), 'Host isolation check');
}

async function main() {
  for (const directory of ['app', 'tools']) {
    fs.cpSync(path.join(repo, directory), path.join(scratch, directory), { recursive: true });
  }
  fs.copyFileSync(path.join(repo, 'LICENSE'), path.join(scratch, 'LICENSE'));
  execFileSync('python3', [path.join(scratch, 'tools/build-sharepoint-embed.py'), '--build-dist']);
  const snippet = fs.readFileSync(path.join(scratch, 'dist/DaySchedule.sharepoint.html'), 'utf8');
  const standalone = fs.readFileSync(path.join(scratch, 'dist/DaySchedule.html'), 'utf8');
  const host = fs.readFileSync(path.join(repo, 'tools/sharepoint-host-check.html'), 'utf8')
    .replace('<!-- DAYSCHEDULE_EMBED -->', snippet);
  const fileHost = path.join(scratch, 'host.html');
  fs.writeFileSync(fileHost, host);
  appServer = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    response.end(standalone);
  });
  await new Promise(resolve => appServer.listen(0, '127.0.0.1', resolve));
  const appOrigin = 'http://127.0.0.1:' + appServer.address().port;
  let blockedRequests = 0;
  server = http.createServer((request, response) => {
    if (request.url === '/must-be-blocked') blockedRequests++;
    response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    response.end(request.url === '/app.html' ? standalone : request.url === '/cross-origin'
      ? '<iframe title="Cross-origin app" src="' + appOrigin + '" width="1100" height="900"></iframe>' : host);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  for (const name of ['chromium', 'firefox', 'webkit']) {
    const browser = await engines[name].launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin);
      let frame = await getAppFrame(page);
      const expected = {
        heading: 'rgb(139, 0, 0)', font: 'Georgia, serif', margin: '40px',
        toolbar: 'block', app: 'block', input: 'Host controls stay independent', theme: null,
      };
      assert.deepEqual(await hostState(page), expected);
      const lightCard = await frame.locator('.library-start-card:not(.library-start-card-primary)').evaluate(element => getComputedStyle(element).backgroundColor);
      await frame.locator('#editorThemeToggle').click();
      assert.equal(await frame.locator('body').getAttribute('data-editor-theme'), 'dark');
      const darkCard = await frame.locator('.library-start-card:not(.library-start-card-primary)').evaluate(element => getComputedStyle(element).backgroundColor);
      assert.notEqual(darkCard, lightCard, 'Dark theme must reach descendants inside the frame.');
      const reference = await context.newPage();
      await reference.goto(origin + '/app.html');
      await waitForStart(reference);
      assert.equal(await reference.locator('.library-start-card:not(.library-start-card-primary)').evaluate(element => getComputedStyle(element).backgroundColor), darkCard);
      await reference.close();
      const hostShortcutUntouched = await page.evaluate(() => {
        const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });
        document.getElementById('host-input').dispatchEvent(event);
        return !event.defaultPrevented;
      });
      assert.equal(hostShortcutUntouched, true, 'App shortcuts must not capture host input.');
      const requestsBefore = blockedRequests;
      assert.equal(await frame.evaluate(async url => {
        try { await fetch(url); return false; } catch (_) { return true; }
      }, origin + '/must-be-blocked'), true, 'The frame must enforce its own connect-src CSP.');
      assert.equal(blockedRequests, requestsBefore, 'Blocked fetch must never reach the server.');
      await createSchedule(frame);
      assert.deepEqual(await hostState(page), expected);
      // Force the documented fallback instead of opening an OS file picker.
      await frame.evaluate(() => { window.showSaveFilePicker = undefined; });
      const downloadPromise = page.waitForEvent('download');
      assert.equal(await frame.evaluate(() => saveScheduleWorkbookFile({ silent: true })), true);
      const download = await downloadPromise;
      assert.match(download.suggestedFilename(), /\.schedule$/);
      const saved = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
      assert.ok(saved.schedules.some(schedule => schedule.current.title === 'Host isolation check'));
      await frame.evaluate(() => discardSessionDraft());
      await page.locator('iframe').evaluate(element => element.replaceWith(element.cloneNode(true)));
      frame = await getAppFrame(page);
      await createSchedule(frame);
      assert.deepEqual(await hostState(page), expected);
      assert.deepEqual(errors, [], 'Embedded flows must not throw page errors.');
      await context.close();
      const fileContext = await browser.newContext();
      const filePage = await fileContext.newPage();
      await filePage.goto(pathToFileURL(fileHost).href);
      await createSchedule(await getAppFrame(filePage));
      await fileContext.close();
      const crossContext = await browser.newContext({ acceptDownloads: true });
      const crossPage = await crossContext.newPage();
      await crossPage.goto(origin + '/cross-origin');
      const crossFrame = await getAppFrame(crossPage);
      const hasNativePicker = await crossFrame.evaluate(() => {
        if (!window.showSaveFilePicker) return false;
        const picker = window.showSaveFilePicker.bind(window);
        window.showSaveFilePicker = async (...args) => {
          try { return await picker(...args); }
          catch (error) { window.nativePickerDenial = error.name; throw error; }
        };
        return true;
      });
      await createSchedule(crossFrame);
      // Loopback origins are secure contexts. Different ports still make this
      // a cross-origin frame, where Chromium denies before opening an OS picker.
      if (name === 'chromium') assert.equal(hasNativePicker, true);
      const [crossDownload] = await Promise.all([
        crossPage.waitForEvent('download', { timeout: 5000 }),
        (async () => {
          await crossFrame.locator('#overflowBtn').click();
          await crossFrame.locator('#saveScheduleFileBtn').click();
        })(),
      ]);
      const crossWorkbook = JSON.parse(fs.readFileSync(await crossDownload.path(), 'utf8'));
      assert.ok(crossWorkbook.schedules.some(schedule => schedule.current.title === 'Host isolation check'));
      assert.match(await crossFrame.locator('#saveIndicator').innerText(), /Downloaded/);
      if (hasNativePicker) assert.equal(await crossFrame.evaluate(() => window.nativePickerDenial), 'SecurityError');
      await crossContext.close();
      console.log(name + ' ' + browser.version() + ': host isolation, dark theme, CSP, remount, download, file boot, cross-origin save passed');
    } finally {
      await browser.close();
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (appServer) await new Promise(resolve => appServer.close(resolve));
  fs.rmSync(scratch, { recursive: true, force: true });
});
