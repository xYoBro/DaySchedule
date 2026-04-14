#!/usr/bin/env node

const assert = require('assert/strict');
const fs = require('fs/promises');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const HOST = '127.0.0.1';
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FAILURE_SCREENSHOT = path.join(REPO_ROOT, 'output', 'playwright', 'live-ui-smoke-failure.png');
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};
const SMOKE_SKINS = ['bands', 'grid', 'cards', 'phases'];

function getContentType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function createStaticServer(rootDir) {
  const rootWithSep = rootDir.endsWith(path.sep) ? rootDir : rootDir + path.sep;
  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = req.url || '/';
      const pathname = decodeURIComponent(new URL(requestUrl, `http://${HOST}`).pathname);
      let filePath = path.join(rootDir, pathname.replace(/^\/+/, ''));
      if (filePath !== rootDir && !filePath.startsWith(rootWithSep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }

      let stats = null;
      try {
        stats = await fs.stat(filePath);
      } catch (_error) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }

      if (stats.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }

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
  return {
    server,
    origin: `http://${HOST}:${address.port}`,
  };
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function bootSampleEditor(page) {
  await page.goto('/app/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() =>
    typeof loadSampleData === 'function' &&
    typeof hideLibrary === 'function' &&
    typeof renderActiveDay === 'function' &&
    typeof getCurrentScheduleFileData === 'function'
  );

  await page.evaluate(() => {
    function minutesToTime(totalMinutes) {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return String(hours).padStart(2, '0') + String(minutes).padStart(2, '0');
    }

    Store.reset();
    loadSampleData();

    const firstDay = Store.getDays()[0];
    if (!firstDay) throw new Error('Sample data did not create a day');
    Store.setActiveDay(firstDay.id);

    const groups = Store.getGroups().filter(group => group && group.id);
    for (let i = 0; i < 18; i += 1) {
      const start = 420 + (i * 15);
      Store.addEvent(firstDay.id, {
        id: `smoke-scroll-${i}`,
        title: `Smoke Scroll ${i}`,
        startTime: minutesToTime(start),
        endTime: minutesToTime(start + 10),
        groupId: groups[i % groups.length] ? groups[i % groups.length].id : '',
        isMainEvent: i % 2 === 0,
      });
    }

    setCurrentScheduleFileData({
      name: Store.getTitle(),
      current: Store.getPersistedState(),
      versions: [],
      theme: { skin: 'bands', palette: 'classic', customColors: null },
    });

    hideLibrary();
    syncToolbarTitle();
    renderActiveDay();
    renderInspector();
  });

  return page.evaluate(() => {
    const dayId = Store.getActiveDay();
    const target = Store.getEvents(dayId).find(evt => evt.title === 'Weapons Qualification')
      || Store.getEvents(dayId).find(evt => !evt.isBreak)
      || Store.getEvents(dayId)[0];
    if (!target) throw new Error('No target event available for smoke selection checks');
    return { id: target.id, title: target.title };
  });
}

async function setSkin(page, skin) {
  await page.evaluate(nextSkin => {
    const fileData = getCurrentScheduleFileData();
    if (!fileData) throw new Error('Schedule file data is not available');
    if (!fileData.theme) fileData.theme = {};
    fileData.theme.skin = nextSkin;
    renderActiveDay();
  }, skin);
  await wait(50);
}

async function verifyScroll(page) {
  const preview = page.locator('.preview-area');
  await assert.doesNotReject(async () => preview.waitFor({ state: 'visible', timeout: 5000 }));

  const before = await preview.evaluate(el => ({
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
    scrollTop: el.scrollTop,
  }));

  assert(before.scrollHeight > before.clientHeight, 'preview area should own overflow for a tall schedule');

  const after = await preview.evaluate(el => {
    el.scrollTop = 220;
    return {
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      scrollTop: el.scrollTop,
    };
  });

  assert(after.scrollTop > before.scrollTop, 'preview area should accept scrolling');

  const shell = await page.evaluate(() => ({
    bodyHeight: document.body.clientHeight,
    htmlHeight: document.documentElement.clientHeight,
  }));

  assert.equal(shell.bodyHeight, shell.htmlHeight, 'editor shell should stay pinned to the viewport');

  return {
    before,
    after,
    shell,
  };
}

async function verifySelectionAcrossSkins(page, target) {
  const results = {};
  for (const skin of SMOKE_SKINS) {
    await setSkin(page, skin);

    const locator = page.locator(`#scheduleContainer [data-event-id="${target.id}"]`).first();
    const count = await locator.count();
    assert(count > 0, `${skin} should render target event ${target.id}`);

    await locator.click();
    await wait(50);

    const selected = await page.evaluate(eventId => ({
      entityId: _selection.entityId,
      type: _selection.type,
      highlightedCount: document.querySelectorAll(`#scheduleContainer [data-event-id="${eventId}"].selected`).length,
      inspectorTitle: document.getElementById('insp-evt-title')
        ? document.getElementById('insp-evt-title').value
        : '',
    }), target.id);

    assert.equal(selected.type, 'event', `${skin} should keep event selection type`);
    assert.equal(selected.entityId, target.id, `${skin} should select the clicked event`);
    assert(selected.highlightedCount > 0, `${skin} should visibly highlight the selected event`);
    assert.equal(selected.inspectorTitle, target.title, `${skin} should show the selected event in the inspector`);

    await page.evaluate(() => renderActiveDay());
    await wait(50);

    const afterRerender = await page.evaluate(eventId => ({
      highlightedCount: document.querySelectorAll(`#scheduleContainer [data-event-id="${eventId}"].selected`).length,
      entityId: _selection.entityId,
    }), target.id);

    assert(afterRerender.highlightedCount > 0, `${skin} should preserve selected styling after rerender`);
    assert.equal(afterRerender.entityId, target.id, `${skin} should preserve selected event id after rerender`);

    results[skin] = {
      renderedTargets: count,
      highlightedCount: afterRerender.highlightedCount,
    };
  }
  return results;
}

async function captureFailureScreenshot(page) {
  if (!page) return;
  await fs.mkdir(path.dirname(FAILURE_SCREENSHOT), { recursive: true });
  await page.screenshot({ path: FAILURE_SCREENSHOT, fullPage: true });
}

async function removeFailureScreenshot() {
  await fs.rm(FAILURE_SCREENSHOT, { force: true });
}

async function main() {
  let browser = null;
  let page = null;
  const { server, origin } = await createStaticServer(REPO_ROOT);

  try {
    await removeFailureScreenshot();
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({
      baseURL: origin,
      viewport: { width: 1728, height: 1117 },
    });

    const target = await bootSampleEditor(page);
    const scroll = await verifyScroll(page);
    const selection = await verifySelectionAcrossSkins(page, target);

    await removeFailureScreenshot();

    console.log(JSON.stringify({
      ok: true,
      origin,
      target,
      scroll,
      selection,
    }, null, 2));
  } catch (error) {
    await captureFailureScreenshot(page);
    console.error(error.stack || String(error));
    console.error(`Failure screenshot: ${FAILURE_SCREENSHOT}`);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main();
