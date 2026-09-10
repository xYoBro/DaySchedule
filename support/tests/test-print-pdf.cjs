#!/usr/bin/env node
// Optional Chromium PDF regression. Requires Playwright and Poppler's
// pdftotext/pdfinfo on PATH. Uses only synthetic data and an isolated profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.DAYSCHEDULE_PLAYWRIGHT_MODULE || 'playwright');
const repo = path.resolve(__dirname, '../..');
const output = path.join(repo, 'output/playwright/release');
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
const server = http.createServer((request, response) => {
  const file = path.resolve(repo, '.' + new URL(request.url, 'http://localhost').pathname);
  if (!file.startsWith(repo + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404); response.end(); return;
  }
  response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(response);
});

async function main() {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    for (const paper of ['Letter', 'A4']) {
      for (const skin of ['grid', 'cards', 'bands', 'phases']) {
        for (const mode of ['fit', 'readable']) {
          await page.goto(origin + '/app/index.html');
          await page.waitForFunction(() => typeof renderActiveDay === 'function');
          const metrics = await page.evaluate(({ skin, mode }) => {
            Store.reset();
            Store.setTitle('Print review ' + skin + ' ' + mode);
            const day = Store.addDay({ id: 'density-day', date: '2026-09-10', startTime: '0800', endTime: '1700' });
            Store.setActiveDay(day.id);
            for (let g = 0; g < 6; g++) {
              const group = Store.addGroup({ id: 'audience' + g, name: 'Audience ' + g, scope: 'limited' });
              for (let i = 0; i < 8; i++) {
                Store.addEvent(day.id, {
                  id: 'event' + g + '-' + i, title: 'Event ' + i + ' for audience ' + g,
                  startTime: minutesToTime(480 + i * 45), endTime: minutesToTime(510 + i * 45),
                  groupId: group.id, location: 'Training room ' + g, poc: 'Team leader ' + g,
                  attendees: 'Member ' + g,
                  description: 'Bring safety equipment and complete checklist before participating. Q' + g + i + 'Q',
                });
              }
            }
            setCurrentScheduleFileData({ name: Store.getTitle(), current: Store.getPersistedState(), versions: [], theme: { skin, palette: 'classic' } });
            hideLibrary();
            renderActiveDay();
            window.pdfPrintReady = false;
            window.print = () => { window.pdfPrintReady = true; };
            const measured = measurePrintPlan({ mode });
            printSchedule({ mode });
            return measured;
          }, { skin, mode });
          await page.waitForFunction(() => window.pdfPrintReady);
          const file = path.join(output, 'print-' + paper + '-' + skin + '-' + mode + '.pdf');
          await page.pdf({ path: file, format: paper, printBackground: true });
          const text = execFileSync('pdftotext', [file, '-'], { encoding: 'utf8' });
          const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
          const pages = Number(info.match(/^Pages:\s+(\d+)/m)[1]);
          const compact = text.replace(/\s+/g, '');
          // Unique tail markers prove all 48 complete descriptions survive.
          // PDF extraction can split words in narrow columns; ignore whitespace.
          for (let g = 0; g < 6; g++) for (let i = 0; i < 8; i++) {
            assert(compact.includes('Q' + g + i + 'Q'), 'Missing description: ' + paper + '/' + skin + '/' + mode + '/' + g + '/' + i);
          }
          assert.equal((text.match(/participating\./g) || []).length, 48);
          if (mode === 'fit') assert.equal(pages, 1, 'Fit mode must stay on one page.');
          if (mode === 'readable' && skin === 'bands') {
            for (const printedPage of text.split('\f')) {
              assert(!/\d{4}\s+\d+\s+EVENTS\s*$/i.test(printedPage), 'A time-group heading must not be stranded at the page end.');
            }
          }
          // This is the pre-print measurement at the app's Letter geometry.
          // Paper settings may scale the final PDF; this is not a physical font guarantee.
          if (mode === 'readable') assert(metrics[0].smallestTextPt >= 9);
          const result = { paper, skin, mode, pages, completeDescriptions: 48, metrics, file };
          results.push(result);
          console.log(paper, skin, mode, pages + ' page(s), 48 complete descriptions');
        }
      }
    }
  } finally {
    fs.writeFileSync(path.join(output, 'print-results.json'), JSON.stringify(results, null, 2));
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
