#!/usr/bin/env node
// Real app + actual PDF checks for Cards, Grid and Phases. Synthetic workbooks
// only; isolated browser contexts never touch an editor's current schedule.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const engines = require(process.env.DAYSCHEDULE_PLAYWRIGHT_MODULE || 'playwright');
const fixture = require('./fixtures/bands-approved.json');
const { specimen } = require('./fixtures/bands-random.cjs');
const root = path.resolve(__dirname, '../..');
const skins = (process.env.DAYSCHEDULE_VIEW_SKINS || 'cards,grid,phases').split(',');
assert(skins.length && skins.every(skin => ['cards', 'grid', 'phases'].includes(skin)), 'Known view selection');
const output = path.join(root, process.env.DAYSCHEDULE_VIEW_OUTPUT || 'output/playwright/alternate-views');
const compact = value => value.replace(/\s/g, '');
const server = http.createServer((request, response) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(response);
});

function workbook(sample) {
  if (sample === 'groups') return structuredClone(require('./fixtures/alternate-groups.json'));
  const book = structuredClone(fixture);
  book.activeScheduleId = ['main', 'normal', 'forty', 'stress'].includes(sample) ? sample : 'normal';
  const schedule = book.schedules.find(schedule => schedule.id === book.activeScheduleId);
  if (sample === 'light' || sample === 'empty' || sample === 'concurrent') {
    schedule.current.title = 'Professional Development Conference';
    schedule.current.footer.contact = 'Training and practical workshops';
    schedule.theme.bands.showLogo = false;
    schedule.current.days.forEach(day => {
      day.events = sample === 'empty' ? [] : sample === 'concurrent' ? day.events.filter(event => !event.isMainEvent) : day.events.filter(event => event.isMainEvent).slice(0, 3)
        .concat(day.events.filter(event => !event.isMainEvent).slice(0, 2));
    });
  }
  if (sample === 'edges') {
    schedule.current.title = 'Cross-block assignments & long event details';
    schedule.current.days = [schedule.current.days[0]];
    const day = schedule.current.days[0];
    const event = (id, placement, startTime, endTime, extra = {}) => ({ id, title: id, placement, startTime, endTime, ...extra });
    day.events = [event('Main A', 'main', '0800', '0900', { groupId: 'all', emphasized: true }),
      event('Main B', 'main', '1000', '1200', { groupId: 'all' }), event('Main C', 'main', '1200', '1600', { groupId: 'all' }),
      event('Spanning assignment', 'concurrent', '0830', '1030', { attendees: 'Doe, Smith & Chan', attendeeFormat: 'suggested', location: 'North annex, second floor, room 201', poc: 'MSgt Doe', description: 'Report directly to the north entrance.' }),
      event('Gap assignment', 'concurrent', '0930', '0945', { attendees: 'John Doe\nAlex Smith\nDmitri Chan', attendeeFormat: 'lines' }),
      event('Endpoint assignment', 'concurrent', '0900', '0930', { attendees: 'Doe Smith Chan', attendeeFormat: 'text' }),
      event('Long title <img src=x onerror=alert(1)> is literal text', 'concurrent', '1400', '1500', { attendees: 'Doe, Jane; Smith & Chan; Doe, Jane', attendeeFormat: 'suggested', location: 'Conference venue with a deliberately long room name and access instructions', description: 'Keep every original entry. No surname inference.' })];
  }
  return book;
}

async function checkPage(page, book, skin, sample, generatedNames) {
  return page.evaluate(({ book, skin, sample, generatedNames }) => {
    loadParsedScheduleData(parseScheduleWorkbookContent(JSON.stringify(book))); hideLibrary();
    getCurrentScheduleFileData().theme.skin = skin;
    const before = JSON.stringify(Store.getPersistedState());
    const days = Store.getDays().map(day => {
      Store.setActiveDay(day.id); renderActiveDay();
      const sheet = document.querySelector('.alternate-sheet');
      const records = Array.from(sheet.querySelectorAll('article[data-event-id]'));
      const errors = [], check = (ok, message) => { if (!ok) errors.push(message); };
      const normalized = text => text.replace(/\s/g, '');
      const map = Object.fromEntries(Store.getGroups().map(group => [group.id, group]));
      const primary = event => ['main', 'concurrent'].includes(event.placement) ? event.placement === 'main' : !!(event.isMainEvent || event.isBreak || map[event.groupId]?.scope === 'main');
      const main = day.events.filter(primary);
      const concurrent = day.events.filter(event => !primary(event)).slice().sort((a, b) => a.startTime.localeCompare(b.startTime));
      check(records.length === day.events.length, 'Event count');
      check(new Set(records.map(node => node.dataset.eventId)).size === records.length, 'Duplicate event records');
      day.events.forEach(event => {
        const record = records.find(node => node.dataset.eventId === event.id);
        if (!record) { errors.push('Missing event ' + event.id); return; }
        ['title', 'location', 'poc', 'description'].forEach(key => check(!event[key] || normalized(record.textContent).includes(normalized(event[key])), event.id + ': missing ' + key));
        (event.flightActivities || []).forEach(activity => ['flight', 'title', 'location', 'poc', 'description'].forEach(key =>
          check(!activity[key] || normalized(record.textContent).includes(normalized(activity[key])), event.id + ': missing flight ' + key)));
        check(record.tabIndex === 0, 'Keyboard access ' + event.id);
        check(record.classList.contains('av-emphasized') === !!event.emphasized, 'Unrequested emphasis ' + event.id);
        const listed = Array.from(record.querySelectorAll('[data-person]'), node => node.dataset.person);
        // Independent oracle for these fixtures, including duplicate entries and
        // commas inside a semicolon-delimited name. Never call the app parser.
        const raw = event.attendees || '', format = event.attendeeFormat || 'text';
        const expected = generatedNames?.[event.id]?.entries || (format === 'text' ? [] : (raw.includes('\n') ? raw.split(/\r?\n/) : raw.includes(';') ? raw.split(';') : raw.split(/,|\s+&\s+/)).map(x => x.trim()).filter(Boolean));
        check(JSON.stringify(listed) === JSON.stringify(expected), event.id + ': name parsing/order');
        if (format === 'text' && raw.trim()) check(record.querySelector('.av-literal')?.textContent === raw, event.id + ': literal attendees');
        if (main.includes(event)) {
          const expectedRefs = concurrent.filter(other => event.startTime < other.endTime && other.startTime < event.endTime).map(other => other.id);
          const refs = Array.from(record.querySelectorAll('[data-event-ref]'), node => node.dataset.eventRef);
          check(JSON.stringify(refs) === JSON.stringify(expectedRefs), event.id + ': interval references');
        } else {
          const number = record.querySelector('.av-number');
          check(Number(number?.textContent) === concurrent.indexOf(event) + 1, event.id + ': number');
        }
      });
      if (skin === 'cards') {
        const panels = Array.from(sheet.querySelectorAll('.av-group-panel'));
        concurrent.forEach(event => {
          const panel = panels.find(node => node.querySelector('[data-event-id="' + event.id + '"]'));
          check(!!panel && panel.dataset.laneGroup === (map[event.groupId] ? event.groupId : ''), 'Card group membership ' + event.id);
        });
      }
      if (skin === 'phases') check(getComputedStyle(sheet.querySelector('.av-phase-sequence')).display === 'block', 'Vertical phase progression');
      if (skin === 'grid') {
        check(!!sheet.querySelector('table.av-matrix'), 'Time × groups table');
        concurrent.forEach(event => {
          const record = records.find(node => node.dataset.eventId === event.id), cell = record?.closest('td');
          check(cell?.dataset.laneGroup === (map[event.groupId] ? event.groupId : ''), 'Grid group column ' + event.id);
          check(record?.closest('tr').dataset.start === event.startTime, 'Grid start row ' + event.id);
        });
        const times = records.map(node => day.events.find(event => event.id === node.dataset.eventId).startTime);
        check(JSON.stringify(times) === JSON.stringify(times.slice().sort()), 'Grid start order');
      }
      sheet.querySelectorAll('.av-flow').forEach(flow => {
        const nums = Array.from(flow.querySelectorAll('.av-concurrent .av-number'), node => Number(node.textContent));
        check(JSON.stringify(nums) === JSON.stringify(nums.slice().sort((a, b) => a - b)), 'Concurrent column order');
      });
      const size = node => parseFloat(getComputedStyle(node).fontSize) * .75;
      sheet.querySelectorAll('.av-description,.av-location,.av-poc,.av-note,.av-flight,.av-audience').forEach(node => check(size(node) >= 8.99, 'Detail font floor ' + node.className));
      sheet.querySelectorAll('.av-people').forEach(node => check(size(node) >= (node.classList.contains('av-roster') || sheet.classList.contains('av-dense') ? 9.49 : 10.49), 'Name font floor'));
      sheet.querySelectorAll('.av-main h3').forEach(node => check(size(node) >= 11.49, 'Main title floor'));
      check(!sheet.querySelector('h3 img'), 'Unescaped title');
      const fit = sheet.dataset.fit === 'true', rect = sheet.getBoundingClientRect();
      const fitted = sheet.style.cssText;
      AlternateViews.fit(sheet);
      check(sheet.dataset.fit === String(fit) && sheet.style.cssText === fitted, 'Stable repeat fitting');
      check(Math.abs(rect.width * .75 - 612) < .1, 'Letter width');
      if (fit) {
        check(Math.abs(rect.height * .75 - 792) < .1, 'Letter height');
        check(AlternateViews.geometry(sheet).fits, 'Actual geometry');
        sheet.querySelectorAll('.av-event:has(.av-flights)').forEach(record => {
          const flights = record.querySelector('.av-flights'), refs = record.querySelector('.av-references');
          if (refs) check(flights.getBoundingClientRect().top >= refs.getBoundingClientRect().bottom - 1, 'Flight details clear references');
          const columns = Array.from(flights.querySelectorAll('.av-flight:not(.av-varied-logistics)>.av-flight-meta'), node => node.getBoundingClientRect().left);
          check(columns.length < 2 || Math.max(...columns) - Math.min(...columns) < 1, 'Aligned flight logistics');
        });
      } else check(document.querySelector('.alternate-fit-notice').textContent.length > 0, 'Missing overflow notice');
      const logo = sheet.querySelector('.av-logo');
      if (logo) { const box = logo.getBoundingClientRect(); check(Math.abs(box.width * .75 - 72) < .1 && Math.abs(box.height * .75 - 72) < .1, 'Logo size'); }
      check(sheet.querySelector('.av-notes .av-section-heading').textContent === 'Notes & Reminders', 'Notes heading');
      if (fit) check(Math.abs(sheet.querySelector('.av-notes').getBoundingClientRect().height * .75 - getBandSettings(getCurrentScheduleFileData().theme).notesHeight) < .1, 'Reserved reminder space');
      return { day: day.id, fit, scale: Number(sheet.style.getPropertyValue('--av-scale')), events: records.length, errors };
    });
    // Active-day navigation is allowed; event data and workbook settings aren't.
    const after = Store.getPersistedState(), original = JSON.parse(before); delete after.activeDay; delete original.activeDay;
    return { sample, skin, days, unchanged: JSON.stringify(original) === JSON.stringify(after) };
  }, { book, skin, sample, generatedNames });
}

async function main() {
  fs.mkdirSync(output, { recursive: true }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const results = [];
  try {
    for (const engine of (process.env.DAYSCHEDULE_BROWSERS || 'chromium,webkit').split(',')) {
      const browser = await engines[engine].launch({ headless: true });
      try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.goto('http://127.0.0.1:' + server.address().port + '/app/index.html'); await page.evaluate(() => appReady);
        const samples = process.env.DAYSCHEDULE_VIEW_RANDOM_ONLY === '1' ? [] : ['groups', 'empty', 'light', 'main', 'concurrent', 'normal', 'forty', 'stress', 'edges'];
        for (const skin of skins) for (const sample of samples) {
          const book = workbook(sample), result = await checkPage(page, book, skin, sample); result.engine = engine;
          assert(result.unchanged, 'Renderer changed saved data'); result.days.forEach(day => assert.deepEqual(day.errors, [], engine + '/' + skin + '/' + sample + '/' + day.day));
          result.days.forEach(day => assert(day.fit, engine + '/' + skin + '/' + sample + '/' + day.day + ' should fit'));
          if (['groups', 'normal', 'forty', 'light'].includes(sample)) await page.locator('.alternate-sheet').screenshot({ path: path.join(output, engine + '-' + skin + '-' + sample + '.png') });
          if (engine === 'chromium') {
            const mode = result.days.every(day => day.fit) ? 'fit' : 'readable';
            await page.evaluate(async mode => { window.print = () => window.dispatchEvent(new Event('beforeprint')); await printSchedule({ mode }); }, mode);
            const file = path.join(output, skin + '-' + sample + '.pdf');
            await page.pdf({ path: file, preferCSSPageSize: true, format: 'Letter', printBackground: true, displayHeaderFooter: false });
            const text = compact(execFileSync('pdftotext', ['-raw', file, '-'], { encoding: 'utf8' }));
            const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
            const count = Number(info.match(/^Pages:\s+(\d+)/m)[1]);
            if (mode === 'fit') assert.equal(count, result.days.length, file);
            assert(/612 x 792/.test(info), 'US Letter: ' + file);
            const schedule = book.schedules.find(schedule => schedule.id === book.activeScheduleId);
            schedule.current.days.forEach(day => {
              day.events.forEach(event => ['title', 'description', 'location', 'poc'].forEach(key => { if (event[key]) assert(text.includes(compact(event[key])), file + ': ' + event.id + '/' + key); }));
              day.events.forEach(event => {
                const raw = event.attendees || '';
                const entries = !event.attendeeFormat || event.attendeeFormat === 'text' ? [raw] : (raw.includes('\n') ? raw.split(/\r?\n/) : raw.includes(';') ? raw.split(';') : raw.split(/,|\s+&\s+/)).map(value => value.trim()).filter(Boolean);
                entries.forEach(name => { if (name) assert(text.includes(compact(name)), file + ': attendee ' + name); });
              });
              day.events.flatMap(event => event.flightActivities || []).forEach(activity => ['flight', 'title', 'location', 'poc', 'description'].forEach(key => { if (activity[key]) assert(text.includes(compact(activity[key])), file + ': flight ' + key); }));
              day.notes.forEach(note => assert(text.includes(compact(note.text)), file + ': reminder'));
            });
            result.pdf = { mode, pages: count, file };
            await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
          }
          results.push(result); console.log(engine, skin, sample, result.days.map(day => day.fit ? 'fit' : 'overflow').join('/'));
        }
        for (let seed = 1; seed <= Number(process.env.DAYSCHEDULE_VIEW_SEEDS || 16); seed++) {
          const generated = specimen(seed);
          for (const skin of skins) {
            const result = await checkPage(page, generated.workbook, skin, 'seed-' + seed, generated.expected);
            result.days.forEach(day => assert.deepEqual(day.errors, [], engine + '/' + skin + '/seed-' + seed + '/' + day.day));
            assert(result.unchanged); results.push({ ...result, engine, random: true, seed, profile: generated.profile });
          }
        }
        console.log(engine, 'seeded layout cases passed');
        for (const skin of skins) {
          await checkPage(page, workbook('normal'), skin, 'mobile');
          await page.setViewportSize({ width: 390, height: 844 });
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          await page.locator('.av-event').first().click();
          assert(await page.locator('#insp-evt-title').isVisible());
          await page.locator('#insp-close').click();
          await page.locator('.av-note .note-select').first().click();
          await page.locator('#insp-note-text').fill('Mobile reminder verified.');
          assert(await page.locator('.av-note.selected').textContent().then(text => text.includes('Mobile reminder verified.')));
          await page.screenshot({ path: path.join(output, engine + '-' + skin + '-mobile.png') });
          await page.locator('#insp-close').click();
          await page.setViewportSize({ width: 1440, height: 1200 });
          const book = workbook('groups');
          book.schedules.find(schedule => schedule.id === 'groups').theme.palette = 'mono';
          const mono = await checkPage(page, book, skin, 'mono');
          mono.days.forEach(day => assert(day.fit && !day.errors.length));
          if (engine === 'chromium') {
            await page.evaluate(async () => { window.print = () => window.dispatchEvent(new Event('beforeprint')); await printSchedule({ mode: 'fit' }); });
            const file = path.join(output, skin + '-mono.pdf');
            await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
            const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
            assert.equal(Number(info.match(/^Pages:\s+(\d+)/m)[1]), 2);
            await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
          }
          results.push({ ...mono, engine, mobile: 'event and reminder editing passed' });
        }
        console.log(engine, 'narrow-screen interactions and Mono pages passed');
        assert.deepEqual(errors, [], 'Browser errors'); await page.close();
      } finally { await browser.close(); }
    }
  } finally { fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
