// Build script-free print input from the production renderer and CUA-captured
// fit decisions. This does not drive a browser or run a second layout engine.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const capture = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const output = path.resolve(process.argv[3] || path.join(root, 'output/pdf/integrated-bands'));
const fixtures = require('./fixtures/bands-approved.json');
const context = vm.createContext({ console, structuredClone, window: { addEventListener() {} } });
for (const file of ['constants', 'utils', 'schema', 'app-state', 'personnel-input', 'data-helpers', 'band-palettes', 'themes', 'band-layout', 'render']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'app/js/' + file + '.js'), 'utf8'), context);
}
const run = source => vm.runInContext(source, context);
const decode = html => html.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, (_, key) => ({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"})[key]);
function hash(text) { let h = 2166136261; for (const c of text.replace(/\s/g, '')) { for (let i = 0; i < c.length; i++) h = Math.imul(h ^ c.charCodeAt(i), 16777619); } return h >>> 0; }
const pages = [], expected = [];
for (const spec of capture) {
  assert.equal(spec.fit, 'true', spec.sample + '/' + spec.day + ' not ready to print');
  context.schedule = fixtures.schedules.find(item => item.id === spec.sample);
  context.spec = spec;
  run('Store.loadPersistedState(schedule.current); setCurrentScheduleFileData(schedule);');
  let html = run('BandLayout.page(Store.getDay(spec.day))');
  const records = new Map(Array.from(html.matchAll(/<article\b[^>]*data-event-id="([^"]+)"[\s\S]*?<\/article>/g), match => [match[1], match[0]]));
  if (spec.groups.length) {
    const inner = spec.groups.map(group => '<div class="event-column">' + group.map(id => {
      assert(records.has(id)); return records.get(id);
    }).join('') + '</div>').join('');
    html = html.replace(/<div class="attendance-columns">[\s\S]*?<\/div><\/section><\/div>/,
      '<div class="' + spec.columns + '" style="' + spec.columnStyle + '">' + inner + '</div></section></div>');
  }
  html = html.replace('class="sheet band-sheet roomy"', 'class="' + spec.classes + '"')
    .replace(/style="[^"]*"/, 'style="' + spec.style + '"');
  assert.equal(hash(decode(html)), spec.textHash, spec.sample + '/' + spec.day + ': frozen text differs from live app');
  assert.equal(Array.from(html.matchAll(/data-person=/g)).length, spec.names);
  const ids = Array.from(html.matchAll(/data-event-id="([^"]+)"/g), match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate event details');
  pages.push('<div class="page print-page skin-bands band-page print-fit">' + html + '</div>');
  expected.push({ ...spec, title:context.schedule.current.title, notes:context.schedule.current.days.find(day => day.id === spec.day).notes,
    events:context.schedule.current.days.find(day => day.id === spec.day).events, nameEntries:run('Store.getDay(spec.day).events.flatMap(e => BandLayout.attendance(e).entries)') });
}
const css = ['style.css', 'bands.css'].map(file => fs.readFileSync(path.join(root, 'app/css', file), 'utf8')).join('\n');
const document = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Integrated DaySchedule print proof</title><style>' + css + '\nbody{margin:0;background:white}body>.proof-pages{display:block!important}</style></head><body><main class="proof-pages">' + pages.join('') + '</main></body></html>';
assert(!document.includes('<script'));
fs.mkdirSync(output, {recursive:true});
fs.writeFileSync(path.join(output, 'packet.html'), document);
fs.writeFileSync(path.join(output, 'expected.json'), JSON.stringify(expected, null, 2));
console.log('Frozen ' + pages.length + ' live-verified pages. All text checksums, names and unique event records match.');
