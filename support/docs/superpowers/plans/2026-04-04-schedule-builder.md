# Schedule Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a drill schedule builder that lets an airman create, edit, and print multi-day event schedules with automatic layout, concurrent event detection, and adaptive print scaling.

**Architecture:** Single-page vanilla JS app following the Org Chart's proven patterns — centralized Store, schema normalization, `<script>` tag loading with explicit dependency order, FSAPI persistence with download fallback. The print layout engine renders events as horizontal bands with three visual tiers (main, supporting, break) and auto-detects concurrent events for the "Also happening" indicators and bottom concurrent row.

**Tech Stack:** HTML5, CSS3, vanilla JavaScript. No frameworks, no build step. Works from `file://` URLs.

**Reference spec:** `docs/superpowers/specs/2026-04-04-schedule-builder-design.md`
**Reference mockup:** `.superpowers/brainstorm/32449-1775326319/content/layout-v20-refined.html`

---

## File Structure

```
/
├── index.html              ← app shell (HTML + script tags)
├── CLAUDE.md               ← project documentation
├── css/
│   └── style.css           ← all styles (screen + print)
├── js/
│   ├── constants.js        ← default groups, color palette, layout targets
│   ├── app-state.js        ← Store object + global state
│   ├── utils.js            ← generateId, esc, formatTime, formatDuration, timeToMinutes
│   ├── ui-core.js          ← modal, toast, dropdown primitives
│   ├── schema.js           ← normalizeEvent, normalizeGroup, normalizeNote, normalizeDay
│   ├── data-helpers.js     ← sortEvents, getOverlaps, classifyEvents, computeDuration
│   ├── render.js           ← renderDay(), band HTML generation, concurrent row
│   ├── print.js            ← print layout engine, adaptive scaling, PDF generation
│   ├── events.js           ← click handlers, keyboard shortcuts
│   ├── editing.js          ← inline event editor, add/delete, auto-sort
│   ├── groups.js           ← group management panel (CRUD, scope, color)
│   ├── schedule-setup.js   ← schedule title, logo, day management, notes
│   ├── persistence.js      ← FSAPI save, download fallback, sessionStorage, undo/redo
│   └── init.js             ← sample data and initialization (loads last)
├── data/
│   └── scheduledata.js     ← externalized state (SAVED_STATE)
├── tests/
│   ├── runner.html         ← open in browser to run all tests
│   ├── test-runner.js      ← minimal assertion library
│   ├── test-utils.js       ← utility function tests
│   ├── test-schema.js      ← schema normalization tests
│   ├── test-data-helpers.js ← overlap detection, classification tests
│   └── test-store.js       ← Store state management tests
└── docs/
    └── superpowers/
        ├── specs/
        │   └── 2026-04-04-schedule-builder-design.md
        └── plans/
            └── 2026-04-04-schedule-builder.md
```

### Script Load Order

1. **Foundation:** constants.js → app-state.js → utils.js → ui-core.js
2. **Data layer:** schema.js → data-helpers.js → persistence.js
3. **Rendering:** render.js → print.js
4. **UI:** events.js → editing.js → groups.js → schedule-setup.js
5. **Data + Init:** data/scheduledata.js → init.js (must be last)

---

### Task 1: Test Runner and Utility Functions

**Files:**
- Create: `tests/runner.html`
- Create: `tests/test-runner.js`
- Create: `js/utils.js`
- Create: `tests/test-utils.js`

- [ ] **Step 1: Create the test runner (browser-based)**

```html
<!-- tests/runner.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Schedule Builder Tests</title>
  <style>
    body { font-family: -apple-system, sans-serif; padding: 24px; background: #f5f5f7; }
    .pass { color: #1a7a40; } .fail { color: #ff3b30; }
    .suite { margin: 16px 0; padding: 12px; background: white; border-radius: 8px; }
    .suite h3 { margin-bottom: 8px; }
    .result { padding: 2px 0 2px 16px; font-size: 14px; }
    #summary { font-size: 18px; font-weight: 700; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div id="summary"></div>
  <div id="results"></div>
  <script src="test-runner.js"></script>
  <script src="../js/constants.js"></script>
  <script src="../js/utils.js"></script>
  <script src="test-utils.js"></script>
  <script>TestRunner.run();</script>
</body>
</html>
```

- [ ] **Step 2: Create the minimal test runner library**

```js
// tests/test-runner.js
const TestRunner = (() => {
  const suites = [];
  let currentSuite = null;

  function describe(name, fn) {
    currentSuite = { name, tests: [], pass: 0, fail: 0 };
    suites.push(currentSuite);
    fn();
    currentSuite = null;
  }

  function it(name, fn) {
    if (!currentSuite) throw new Error('it() must be inside describe()');
    try {
      fn();
      currentSuite.tests.push({ name, passed: true });
      currentSuite.pass++;
    } catch (e) {
      currentSuite.tests.push({ name, passed: false, error: e.message });
      currentSuite.fail++;
    }
  }

  function assert(condition, msg) {
    if (!condition) throw new Error(msg || 'Assertion failed');
  }

  assert.equal = (a, b, msg) => {
    if (a !== b) throw new Error(msg || 'Expected ' + JSON.stringify(a) + ' to equal ' + JSON.stringify(b));
  };

  assert.deepEqual = (a, b, msg) => {
    if (JSON.stringify(a) !== JSON.stringify(b))
      throw new Error(msg || 'Expected ' + JSON.stringify(a) + ' to deep-equal ' + JSON.stringify(b));
  };

  assert.throws = (fn, msg) => {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    if (!threw) throw new Error(msg || 'Expected function to throw');
  };

  function run() {
    const el = document.getElementById('results');
    const sum = document.getElementById('summary');
    let totalPass = 0, totalFail = 0;
    let html = '';
    for (const s of suites) {
      totalPass += s.pass;
      totalFail += s.fail;
      html += '<div class="suite"><h3>' + s.name + ' (' + s.pass + '/' + (s.pass + s.fail) + ')</h3>';
      for (const t of s.tests) {
        html += '<div class="result ' + (t.passed ? 'pass' : 'fail') + '">'
          + (t.passed ? '\u2713' : '\u2717') + ' ' + t.name
          + (t.error ? ' \u2014 ' + t.error : '') + '</div>';
      }
      html += '</div>';
    }
    el.innerHTML = html;
    sum.innerHTML = '<span class="' + (totalFail ? 'fail' : 'pass') + '">'
      + totalPass + ' passed, ' + totalFail + ' failed</span>';
  }

  window.describe = describe;
  window.it = it;
  window.assert = assert;
  return { run };
})();
```

- [ ] **Step 3: Write failing tests for utility functions**

```js
// tests/test-utils.js
describe('utils — timeToMinutes', () => {
  it('converts 0700 to 420', () => { assert.equal(timeToMinutes('0700'), 420); });
  it('converts 1630 to 990', () => { assert.equal(timeToMinutes('1630'), 990); });
  it('converts 0000 to 0', () => { assert.equal(timeToMinutes('0000'), 0); });
  it('converts 2359 to 1439', () => { assert.equal(timeToMinutes('2359'), 1439); });
});

describe('utils — minutesToTime', () => {
  it('converts 420 to 0700', () => { assert.equal(minutesToTime(420), '0700'); });
  it('converts 990 to 1630', () => { assert.equal(minutesToTime(990), '1630'); });
  it('converts 0 to 0000', () => { assert.equal(minutesToTime(0), '0000'); });
});

describe('utils — formatDuration', () => {
  it('formats 30 min', () => { assert.equal(formatDuration(30), '30 min'); });
  it('formats 60 min as 1 hr', () => { assert.equal(formatDuration(60), '1 hr'); });
  it('formats 90 min as 1.5 hrs', () => { assert.equal(formatDuration(90), '1.5 hrs'); });
  it('formats 120 min as 2 hrs', () => { assert.equal(formatDuration(120), '2 hrs'); });
});

describe('utils — generateId', () => {
  it('returns a string starting with the prefix', () => {
    const id = generateId('evt');
    assert(id.startsWith('evt'), 'should start with prefix');
  });
  it('returns unique values', () => {
    const a = generateId('x'), b = generateId('x');
    assert(a !== b, 'should be unique');
  });
});

describe('utils — esc', () => {
  it('escapes HTML entities', () => {
    assert.equal(esc('<b>"hi"&</b>'), '&lt;b&gt;&quot;hi&quot;&amp;&lt;/b&gt;');
  });
  it('handles empty string', () => { assert.equal(esc(''), ''); });
  it('handles null/undefined', () => { assert.equal(esc(null), ''); });
});
```

- [ ] **Step 4: Open runner.html to verify tests fail**

Open `tests/runner.html` in a browser. All tests should fail with "function not defined" errors.

- [ ] **Step 5: Implement utility functions**

```js
// js/utils.js
function timeToMinutes(t) {
  const s = String(t).replace(':', '').padStart(4, '0');
  return parseInt(s.slice(0, 2), 10) * 60 + parseInt(s.slice(2, 4), 10);
}

function minutesToTime(m) {
  const h = Math.floor(m / 60), min = m % 60;
  return String(h).padStart(2, '0') + String(min).padStart(2, '0');
}

function formatDuration(minutes) {
  if (minutes < 60) return minutes + ' min';
  const hrs = minutes / 60;
  return (hrs === Math.floor(hrs) ? hrs : hrs.toFixed(1)) + (hrs === 1 ? ' hr' : ' hrs');
}

function generateId(prefix) {
  return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

- [ ] **Step 6: Open runner.html to verify all tests pass**

- [ ] **Step 7: Commit**

```bash
git add tests/ js/utils.js
git commit -m "feat: add test runner and utility functions (timeToMinutes, formatDuration, esc, generateId)"
```

---

### Task 2: Constants and Store

**Files:**
- Create: `js/constants.js`
- Create: `js/app-state.js`
- Create: `tests/test-store.js`

- [ ] **Step 1: Create constants**

```js
// js/constants.js
const DEFAULT_GROUPS = [
  { id: 'grp_all',     name: 'All Personnel', scope: 'main',    color: '#2558a8' },
  { id: 'grp_flight',  name: 'By Flight',     scope: 'main',    color: '#b06a10' },
  { id: 'grp_snco',    name: 'All SNCOs',     scope: 'limited', color: '#4a5568' },
  { id: 'grp_chiefs',  name: 'Flight Chiefs', scope: 'limited', color: '#4a5568' },
];

const DEFAULT_COLOR_PALETTE = [
  '#2558a8', '#b06a10', '#4a5568', '#6b3fa0',
  '#1a7a40', '#c23616', '#2d98da', '#6D214F',
];

const TIME_INCREMENT = 15; // minutes for time picker dropdowns

const LAYOUT_TARGETS = {
  band: {
    mainPadV:    [10, 4],   // [comfortable, compressed]
    mainPadH:    [16, 8],
    supPadV:     [8, 3],
    supPadH:     [14, 6],
    titleFs:     [13.5, 10],
    descFs:      [9, 7],
    metaFs:      [8, 6.5],
    tagFs:       [7, 5.5],
    timeStartFs: [14, 10],
    timeEndFs:   [9, 7],
    timeDurFs:   [7, 5.5],
  },
  notes: {
    fs:        [7.5, 6],
    lineH:     [1.5, 1.3],
  },
  conc: {
    titleFs: [10, 8],
    timeFs:  [8.5, 7],
    detailFs:[7.5, 6],
  },
};
```

- [ ] **Step 2: Write failing Store tests**

```js
// tests/test-store.js
describe('Store — schedule state', () => {
  it('initializes with empty schedule', () => {
    Store.reset();
    assert.equal(Store.getTitle(), '');
    assert.deepEqual(Store.getDays(), []);
    assert.equal(Store.getGroups().length > 0, true);
  });

  it('sets and gets title', () => {
    Store.reset();
    Store.setTitle('April RSD');
    assert.equal(Store.getTitle(), 'April RSD');
  });

  it('adds a day', () => {
    Store.reset();
    Store.addDay({ date: '2026-03-15', startTime: '0700', endTime: '1630' });
    assert.equal(Store.getDays().length, 1);
    assert.equal(Store.getDays()[0].date, '2026-03-15');
  });

  it('adds an event to a day', () => {
    Store.reset();
    Store.addDay({ date: '2026-03-15', startTime: '0700', endTime: '1630' });
    const dayId = Store.getDays()[0].id;
    Store.addEvent(dayId, { title: 'Formation', startTime: '0700', endTime: '0730', groupId: 'grp_all' });
    const events = Store.getEvents(dayId);
    assert.equal(events.length, 1);
    assert.equal(events[0].title, 'Formation');
  });

  it('events auto-sort by start time', () => {
    Store.reset();
    Store.addDay({ date: '2026-03-15', startTime: '0700', endTime: '1630' });
    const dayId = Store.getDays()[0].id;
    Store.addEvent(dayId, { title: 'B', startTime: '0900', endTime: '1000', groupId: 'grp_all' });
    Store.addEvent(dayId, { title: 'A', startTime: '0700', endTime: '0800', groupId: 'grp_all' });
    const events = Store.getEvents(dayId);
    assert.equal(events[0].title, 'A');
    assert.equal(events[1].title, 'B');
  });

  it('snapshot and restore for undo', () => {
    Store.reset();
    Store.setTitle('Test');
    const snap = Store.snapshot();
    Store.setTitle('Changed');
    assert.equal(Store.getTitle(), 'Changed');
    Store.restore(snap);
    assert.equal(Store.getTitle(), 'Test');
  });
});
```

- [ ] **Step 3: Add test-store.js to runner.html**

Add these lines before `<script>TestRunner.run();</script>`:
```html
<script src="../js/app-state.js"></script>
<script src="test-store.js"></script>
```

- [ ] **Step 4: Open runner.html to verify Store tests fail**

- [ ] **Step 5: Implement Store**

```js
// js/app-state.js
let _title = '';
let _days = [];
let _groups = JSON.parse(JSON.stringify(DEFAULT_GROUPS));
let _logo = null;
let _activeDay = null;
let _footer = { contact: '', poc: '', updated: '' };

const Store = {
  // Title
  getTitle()    { return _title; },
  setTitle(v)   { _title = v; },

  // Logo
  getLogo()     { return _logo; },
  setLogo(v)    { _logo = v; },

  // Footer
  getFooter()   { return _footer; },
  setFooter(v)  { _footer = { ..._footer, ...v }; },

  // Days
  getDays()     { return _days; },
  addDay(d) {
    const day = {
      id: d.id || generateId('day'),
      date: d.date || '',
      label: d.label || null,
      startTime: d.startTime || '0700',
      endTime: d.endTime || '1630',
      events: [],
      notes: [],
    };
    _days.push(day);
    _days.sort((a, b) => a.date.localeCompare(b.date));
    return day;
  },
  getDay(dayId) {
    return _days.find(d => d.id === dayId) || null;
  },
  updateDay(dayId, updates) {
    const day = Store.getDay(dayId);
    if (!day) return;
    Object.assign(day, updates);
  },
  removeDay(dayId) {
    _days = _days.filter(d => d.id !== dayId);
  },

  // Active day
  getActiveDay()  { return _activeDay; },
  setActiveDay(v) { _activeDay = v; },

  // Events
  getEvents(dayId) {
    const day = Store.getDay(dayId);
    return day ? day.events : [];
  },
  addEvent(dayId, e) {
    const day = Store.getDay(dayId);
    if (!day) return null;
    const group = Store.getGroup(e.groupId);
    const event = {
      id: e.id || generateId('evt'),
      title: e.title || '',
      startTime: e.startTime || '0700',
      endTime: e.endTime || '0730',
      description: e.description || '',
      location: e.location || '',
      poc: e.poc || '',
      groupId: e.groupId || '',
      isBreak: e.isBreak || false,
      isMainEvent: e.isMainEvent != null ? e.isMainEvent : (group ? group.scope === 'main' : true),
    };
    day.events.push(event);
    day.events.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    return event;
  },
  updateEvent(dayId, eventId, updates) {
    const day = Store.getDay(dayId);
    if (!day) return;
    const evt = day.events.find(e => e.id === eventId);
    if (!evt) return;
    Object.assign(evt, updates);
    day.events.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  },
  removeEvent(dayId, eventId) {
    const day = Store.getDay(dayId);
    if (!day) return;
    day.events = day.events.filter(e => e.id !== eventId);
  },

  // Groups
  getGroups()   { return _groups; },
  getGroup(id)  { return _groups.find(g => g.id === id) || null; },
  addGroup(g) {
    const group = {
      id: g.id || generateId('grp'),
      name: g.name || 'New Group',
      scope: g.scope || 'limited',
      color: g.color || DEFAULT_COLOR_PALETTE[_groups.length % DEFAULT_COLOR_PALETTE.length],
    };
    _groups.push(group);
    return group;
  },
  updateGroup(id, updates) {
    const g = Store.getGroup(id);
    if (g) Object.assign(g, updates);
  },
  removeGroup(id) {
    _groups = _groups.filter(g => g.id !== id);
  },

  // Notes (per day)
  getNotes(dayId) {
    const day = Store.getDay(dayId);
    return day ? day.notes : [];
  },
  addNote(dayId, n) {
    const day = Store.getDay(dayId);
    if (!day) return null;
    const note = { id: n.id || generateId('note'), category: n.category || '', text: n.text || '' };
    day.notes.push(note);
    return note;
  },
  updateNote(dayId, noteId, updates) {
    const day = Store.getDay(dayId);
    if (!day) return;
    const note = day.notes.find(n => n.id === noteId);
    if (note) Object.assign(note, updates);
  },
  removeNote(dayId, noteId) {
    const day = Store.getDay(dayId);
    if (!day) return;
    day.notes = day.notes.filter(n => n.id !== noteId);
  },

  // Undo support
  snapshot() {
    return JSON.parse(JSON.stringify({
      title: _title, days: _days, groups: _groups, logo: _logo, footer: _footer,
    }));
  },
  restore(snap) {
    _title = snap.title || '';
    _days = snap.days || [];
    _groups = snap.groups || JSON.parse(JSON.stringify(DEFAULT_GROUPS));
    _logo = snap.logo || null;
    _footer = snap.footer || { contact: '', poc: '', updated: '' };
  },

  // Reset
  reset() {
    _title = '';
    _days = [];
    _groups = JSON.parse(JSON.stringify(DEFAULT_GROUPS));
    _logo = null;
    _activeDay = null;
    _footer = { contact: '', poc: '', updated: '' };
  },

  // Full persisted state
  getPersistedState() {
    return { title: _title, days: _days, groups: _groups, logo: _logo, footer: _footer };
  },
  loadPersistedState(state) {
    if (state.title != null) _title = state.title;
    if (state.days) _days = state.days;
    if (state.groups) _groups = state.groups;
    if (state.logo !== undefined) _logo = state.logo;
    if (state.footer) _footer = state.footer;
  },
};
```

- [ ] **Step 6: Open runner.html to verify all tests pass**

- [ ] **Step 7: Commit**

```bash
git add js/constants.js js/app-state.js tests/test-store.js tests/runner.html
git commit -m "feat: add constants, Store state management, and Store tests"
```

---

### Task 3: Schema Normalization

**Files:**
- Create: `js/schema.js`
- Create: `tests/test-schema.js`

- [ ] **Step 1: Write failing schema tests**

```js
// tests/test-schema.js
describe('schema — normalizeEvent', () => {
  it('normalizes a complete event', () => {
    const e = normalizeEvent({ title: 'Test', startTime: '0700', endTime: '0800', groupId: 'grp_all' });
    assert.equal(e.title, 'Test');
    assert(e.id.startsWith('evt'), 'should generate id');
  });

  it('pads time values', () => {
    const e = normalizeEvent({ title: 'X', startTime: '700', endTime: '800', groupId: 'grp_all' });
    assert.equal(e.startTime, '0700');
    assert.equal(e.endTime, '0800');
  });

  it('rejects event without title', () => {
    const e = normalizeEvent({ startTime: '0700', endTime: '0800', groupId: 'grp_all' });
    assert.equal(e, null);
  });

  it('sets isBreak for break events', () => {
    const e = normalizeEvent({ title: 'Lunch', startTime: '1100', endTime: '1200', groupId: 'grp_all', isBreak: true });
    assert.equal(e.isBreak, true);
  });
});

describe('schema — normalizeGroup', () => {
  it('normalizes a group with defaults', () => {
    const g = normalizeGroup({ name: 'Test Group' });
    assert.equal(g.name, 'Test Group');
    assert.equal(g.scope, 'limited');
    assert(g.id.startsWith('grp'), 'should generate id');
    assert(g.color, 'should have a color');
  });

  it('preserves scope when provided', () => {
    const g = normalizeGroup({ name: 'All', scope: 'main' });
    assert.equal(g.scope, 'main');
  });
});

describe('schema — normalizeNote', () => {
  it('normalizes a note', () => {
    const n = normalizeNote({ category: 'Medical', text: 'A1C Snuffy' });
    assert.equal(n.category, 'Medical');
    assert.equal(n.text, 'A1C Snuffy');
    assert(n.id.startsWith('note'), 'should generate id');
  });

  it('rejects note without text', () => {
    const n = normalizeNote({ category: 'TDY' });
    assert.equal(n, null);
  });
});
```

- [ ] **Step 2: Add to runner.html**

Add before `TestRunner.run()`:
```html
<script src="../js/schema.js"></script>
<script src="test-schema.js"></script>
```

- [ ] **Step 3: Verify tests fail**

- [ ] **Step 4: Implement schema normalization**

```js
// js/schema.js
function normalizeTime(t) {
  return String(t || '').replace(':', '').padStart(4, '0');
}

function normalizeEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = (raw.title || '').trim();
  if (!title) return null;
  const startTime = normalizeTime(raw.startTime);
  const endTime = normalizeTime(raw.endTime);
  return {
    id:          raw.id || generateId('evt'),
    title,
    startTime,
    endTime,
    description: (raw.description || '').trim(),
    location:    (raw.location || '').trim(),
    poc:         (raw.poc || '').trim(),
    groupId:     raw.groupId || '',
    isBreak:     !!raw.isBreak,
    isMainEvent: raw.isMainEvent != null ? !!raw.isMainEvent : true,
  };
}

function normalizeGroup(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id:    raw.id || generateId('grp'),
    name:  (raw.name || 'Unnamed Group').trim(),
    scope: raw.scope === 'main' ? 'main' : 'limited',
    color: raw.color || DEFAULT_COLOR_PALETTE[0],
  };
}

function normalizeNote(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const text = (raw.text || '').trim();
  if (!text) return null;
  return {
    id:       raw.id || generateId('note'),
    category: (raw.category || '').trim(),
    text,
  };
}

function normalizeDay(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id:        raw.id || generateId('day'),
    date:      raw.date || '',
    label:     raw.label || null,
    startTime: normalizeTime(raw.startTime || '0700'),
    endTime:   normalizeTime(raw.endTime || '1630'),
    events:    Array.isArray(raw.events) ? raw.events.map(normalizeEvent).filter(Boolean) : [],
    notes:     Array.isArray(raw.notes) ? raw.notes.map(normalizeNote).filter(Boolean) : [],
  };
}
```

- [ ] **Step 5: Verify all tests pass**

- [ ] **Step 6: Commit**

```bash
git add js/schema.js tests/test-schema.js tests/runner.html
git commit -m "feat: add schema normalization for events, groups, notes, days"
```

---

### Task 4: Data Helpers — Overlap Detection and Event Classification

**Files:**
- Create: `js/data-helpers.js`
- Create: `tests/test-data-helpers.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/test-data-helpers.js
describe('data-helpers — eventsOverlap', () => {
  it('detects overlapping events', () => {
    assert.equal(eventsOverlap(
      { startTime: '0800', endTime: '1100' },
      { startTime: '0900', endTime: '1000' }
    ), true);
  });

  it('detects non-overlapping events', () => {
    assert.equal(eventsOverlap(
      { startTime: '0800', endTime: '0900' },
      { startTime: '0900', endTime: '1000' }
    ), false);
  });

  it('detects partial overlap', () => {
    assert.equal(eventsOverlap(
      { startTime: '0730', endTime: '0830' },
      { startTime: '0800', endTime: '1100' }
    ), true);
  });
});

describe('data-helpers — classifyEvents', () => {
  it('separates main, supporting, and concurrent events', () => {
    const groups = [
      { id: 'g1', scope: 'main', name: 'All', color: '#000' },
      { id: 'g2', scope: 'limited', name: 'Few', color: '#000' },
    ];
    const events = [
      { id: 'e1', title: 'Formation',  startTime: '0700', endTime: '0800', groupId: 'g1', isMainEvent: true, isBreak: false },
      { id: 'e2', title: 'Promo Board', startTime: '0730', endTime: '1000', groupId: 'g2', isMainEvent: false, isBreak: false },
      { id: 'e3', title: 'Safety',     startTime: '0800', endTime: '0830', groupId: 'g2', isMainEvent: false, isBreak: false },
    ];
    const result = classifyEvents(events, groups);
    // e1 is main
    assert.equal(result.mainBands.some(b => b.event.id === 'e1'), true);
    // e2 overlaps with e1 (main), so it's concurrent
    assert.equal(result.concurrent.some(c => c.id === 'e2'), true);
    // e3 fits in the gap after e1 (0800-0830), so it's supporting
    assert.equal(result.mainBands.some(b => b.event.id === 'e3'), true);
  });
});

describe('data-helpers — getOverlappingConcurrent', () => {
  it('finds concurrent events overlapping a main event', () => {
    const mainEvt = { startTime: '0900', endTime: '1100' };
    const concurrents = [
      { id: 'c1', startTime: '0800', endTime: '1100', title: 'Board' },
      { id: 'c2', startTime: '1200', endTime: '1400', title: 'Other' },
    ];
    const overlapping = getOverlappingConcurrent(mainEvt, concurrents);
    assert.equal(overlapping.length, 1);
    assert.equal(overlapping[0].id, 'c1');
  });
});

describe('data-helpers — computeDuration', () => {
  it('calculates duration in minutes', () => {
    assert.equal(computeDuration({ startTime: '0700', endTime: '0730' }), 30);
    assert.equal(computeDuration({ startTime: '0900', endTime: '1100' }), 120);
  });
});
```

- [ ] **Step 2: Add to runner.html**

Add before `TestRunner.run()`:
```html
<script src="../js/data-helpers.js"></script>
<script src="test-data-helpers.js"></script>
```

- [ ] **Step 3: Verify tests fail**

- [ ] **Step 4: Implement data helpers**

```js
// js/data-helpers.js
function computeDuration(event) {
  return timeToMinutes(event.endTime) - timeToMinutes(event.startTime);
}

function eventsOverlap(a, b) {
  const aStart = timeToMinutes(a.startTime), aEnd = timeToMinutes(a.endTime);
  const bStart = timeToMinutes(b.startTime), bEnd = timeToMinutes(b.endTime);
  return aStart < bEnd && bStart < aEnd;
}

function getOverlappingConcurrent(mainEvt, concurrents) {
  return concurrents.filter(c => eventsOverlap(mainEvt, c));
}

function classifyEvents(events, groups) {
  const groupMap = {};
  groups.forEach(g => { groupMap[g.id] = g; });

  // Separate into main-eligible and limited
  const mainEvents = [];
  const limitedEvents = [];

  events.forEach(evt => {
    if (evt.isBreak) {
      mainEvents.push(evt);
      return;
    }
    if (evt.isMainEvent) {
      mainEvents.push(evt);
    } else {
      limitedEvents.push(evt);
    }
  });

  // Sort main events by start time
  mainEvents.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  // For each limited event, check if it overlaps any main event
  const concurrent = [];
  const supporting = [];

  limitedEvents.forEach(evt => {
    const overlapsMain = mainEvents.some(m => !m.isBreak && eventsOverlap(m, evt));
    if (overlapsMain) {
      concurrent.push(evt);
    } else {
      supporting.push(evt);
    }
  });

  // Build the band sequence: interleave main and supporting events in chronological order
  const allBandEvents = [...mainEvents, ...supporting]
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  const mainBands = allBandEvents.map(evt => ({
    event: evt,
    tier: evt.isBreak ? 'break' : evt.isMainEvent ? 'main' : 'supporting',
    group: groupMap[evt.groupId] || null,
    concurrent: evt.isMainEvent && !evt.isBreak
      ? getOverlappingConcurrent(evt, concurrent)
      : [],
  }));

  return { mainBands, concurrent };
}
```

- [ ] **Step 5: Verify all tests pass**

- [ ] **Step 6: Commit**

```bash
git add js/data-helpers.js tests/test-data-helpers.js tests/runner.html
git commit -m "feat: add data helpers — overlap detection, event classification, duration"
```

---

### Task 5: UI Core Primitives

**Files:**
- Create: `js/ui-core.js`

- [ ] **Step 1: Implement UI primitives**

```js
// js/ui-core.js
let _previousFocus = null;

function openModal(id) {
  _previousFocus = document.activeElement;
  const modal = document.getElementById(id);
  modal.classList.add('active');
  const focusable = modal.querySelector('input:not([type="hidden"]), select, textarea, button, [tabindex]:not([tabindex="-1"])');
  if (focusable) setTimeout(() => focusable.focus(), 50);
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
  if (_previousFocus && _previousFocus.focus) {
    _previousFocus.focus();
    _previousFocus = null;
  }
}

let _toastTimer = null;
function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

function closeDropdowns() {
  document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('open'));
}

document.addEventListener('click', e => {
  if (!e.target.closest('.dropdown')) closeDropdowns();
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const active = document.querySelector('.modal-overlay.active');
  if (active) { e.preventDefault(); closeModal(active.id); }
});
```

- [ ] **Step 2: Commit**

```bash
git add js/ui-core.js
git commit -m "feat: add UI core — modal, toast, dropdown primitives"
```

---

### Task 6: Render Engine — Day View

**Files:**
- Create: `js/render.js`

This is the core rendering engine that generates the band layout HTML from Store data.

- [ ] **Step 1: Implement renderDay()**

```js
// js/render.js
function renderDay(dayId) {
  const day = Store.getDay(dayId);
  if (!day) return;
  const groups = Store.getGroups();
  const { mainBands, concurrent } = classifyEvents(day.events, groups);
  const notes = Store.getNotes(dayId);
  const container = document.getElementById('scheduleContainer');
  if (!container) return;

  let html = '';

  // Header
  html += renderHeader(day);

  // Schedule bands
  html += '<div class="schedule">';
  let prevTier = null;
  mainBands.forEach((band, i) => {
    // Section break before breaks
    if (band.tier === 'break' && prevTier && prevTier !== 'break') {
      html += '<div class="section-break"></div>';
    }
    html += renderBand(band);
    // Section break after breaks
    if (band.tier === 'break') {
      const next = mainBands[i + 1];
      if (next && next.tier !== 'break') {
        html += '<div class="section-break"></div>';
      }
    }
    prevTier = band.tier;
  });
  html += '</div>';

  // Concurrent row
  if (concurrent.length > 0) {
    html += renderConcurrentRow(concurrent, groups);
  }

  // Notes
  if (notes.length > 0) {
    html += renderNotes(notes);
  }

  // Footer
  html += renderFooter();

  container.innerHTML = html;
}

function renderHeader(day) {
  const totalDays = Store.getDays().length;
  const dayIndex = Store.getDays().findIndex(d => d.id === day.id) + 1;
  const dayLabel = day.label || ('Day ' + dayIndex + ' of ' + totalDays);
  const logo = Store.getLogo();
  const footer = Store.getFooter();
  const dateStr = day.date ? formatDateDisplay(day.date) : '';

  let html = '<div class="hdr">';
  html += '<div class="hdr-text">';
  html += '<div class="hdr-title">' + esc(Store.getTitle()) + '</div>';
  html += '<div class="hdr-sub">' + esc(dateStr) + ' &ensp;\u2014&ensp; ' + esc(dayLabel) + '</div>';
  html += '<div class="hdr-meta">' + esc(footer.contact || '') + '</div>';
  html += '</div>';
  if (logo) {
    html += '<div class="hdr-logo"><img src="' + esc(logo) + '" alt="Unit Logo"></div>';
  } else {
    html += '<div class="hdr-logo"><span>Unit<br>Logo</span></div>';
  }
  html += '</div>';
  return html;
}

function renderBand(band) {
  const { event: evt, tier, group, concurrent: concList } = band;
  const dur = computeDuration(evt);
  const durStr = formatDuration(dur);

  const tierClass = tier === 'main' ? 'main' : tier === 'break' ? 'brk' : 'sup';
  const accentStyle = tier === 'main' && group ? ' style="--accent:' + esc(group.color) + ';"' : '';

  let html = '<div class="band ' + tierClass + '"' + accentStyle + ' data-event-id="' + esc(evt.id) + '">';

  // Time block
  html += '<div class="band-time">';
  html += '<div class="t-start">' + esc(evt.startTime) + '</div>';
  html += '<div class="t-end">' + esc(evt.endTime) + '</div>';
  if (tier === 'main' && !evt.isBreak) {
    html += '<div class="t-dur">' + esc(durStr) + '</div>';
  }
  html += '</div>';

  // Content
  html += '<div class="band-content">';
  html += '<div class="band-title">' + esc(evt.title) + '</div>';
  if (evt.description && tier !== 'break') {
    html += '<div class="band-desc">' + esc(evt.description) + '</div>';
  }
  if ((evt.location || evt.poc) && tier !== 'break') {
    const locParts = [evt.location, evt.poc ? 'POC: ' + evt.poc : ''].filter(Boolean);
    html += '<div class="band-loc">' + esc(locParts.join(' \u00b7 ')) + '</div>';
  }
  if (group && tier !== 'break') {
    html += '<div><span class="band-tag">' + esc(group.name) + '</span></div>';
  }
  html += '</div>';

  // "Also happening" concurrent indicators
  if (concList && concList.length > 0) {
    concList.forEach(c => {
      const cGroup = Store.getGroup(c.groupId);
      html += '<div class="band-conc">';
      html += '<div class="cc-label">Also happening</div>';
      html += '<div class="cc-title">' + esc(c.title) + '</div>';
      html += '<div class="cc-detail">' + esc(c.startTime + '\u2013' + c.endTime);
      if (c.location) html += ' &ensp;\u00b7&ensp; ' + esc(c.location);
      html += '</div>';
      if (cGroup) html += '<div class="cc-badge">' + esc(cGroup.name) + '</div>';
      html += '</div>';
    });
  }

  html += '</div>';
  return html;
}

function renderConcurrentRow(concurrent, groups) {
  const groupMap = {};
  groups.forEach(g => { groupMap[g.id] = g; });

  let html = '<div class="conc-section">';
  html += '<div class="conc-section-label">Long-Running Concurrent Events</div>';
  html += '<div class="conc-row">';
  concurrent.forEach(c => {
    const g = groupMap[c.groupId];
    html += '<div class="conc-item">';
    html += '<div class="ci-time">' + esc(c.startTime + ' \u2013 ' + c.endTime) + '</div>';
    html += '<div class="ci-title">' + esc(c.title) + '</div>';
    const parts = [c.location, c.poc].filter(Boolean);
    if (parts.length) html += '<div class="ci-detail">' + esc(parts.join(' \u00b7 ')) + '</div>';
    if (c.description) html += '<div class="ci-detail">' + esc(c.description) + '</div>';
    if (g) html += '<div class="ci-badge">' + esc(g.name) + '</div>';
    html += '</div>';
  });
  html += '</div></div>';
  return html;
}

function renderNotes(notes) {
  let html = '<div class="notes">';
  html += '<div class="notes-label">Notes</div>';
  html += '<ul class="notes-list">';
  notes.forEach(n => {
    html += '<li>';
    if (n.category) html += '<strong>' + esc(n.category) + ' \u2014</strong> ';
    html += esc(n.text) + '</li>';
  });
  html += '</ul></div>';
  return html;
}

function renderFooter() {
  const f = Store.getFooter();
  const parts = [f.contact, f.poc ? 'Schedule POC: ' + f.poc : '', f.updated ? 'Updated: ' + f.updated : ''].filter(Boolean);
  if (!parts.length) return '';
  return '<div class="footer">' + esc(parts.join(' \u00b7 ')) + '</div>';
}

function formatDateDisplay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return days[d.getDay()] + ', ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}
```

- [ ] **Step 2: Commit**

```bash
git add js/render.js
git commit -m "feat: add render engine — band layout, concurrent row, notes, header/footer"
```

---

### Task 7: CSS Stylesheet

**Files:**
- Create: `css/style.css`

- [ ] **Step 1: Create the full stylesheet**

Port all CSS from the approved mockup (`layout-v20-refined.html`) into `css/style.css`. Add screen-mode UI styles (editing panel, modals, buttons, day tabs, settings panel). Add `@media print` rules that hide editing UI and apply print-specific sizing.

The CSS from the mockup is the print layout foundation. Add:
- `.editing` class styles for inline event editing panels
- `.modal-overlay` and `.modal` styles for settings/group management
- `.day-tabs` for multi-day navigation
- `.toolbar` for the top action bar (Add Event, Print, Settings buttons)
- `@media print` block that hides `.toolbar`, `.day-tabs`, `.editing` and sets page margins
- Toast notification styles
- Button styles consistent with the Org Chart's design language

The full CSS is extensive — the implementing agent should reference the mockup file at `.superpowers/brainstorm/32449-1775326319/content/layout-v20-refined.html` for exact print layout values and adapt/extend for screen mode.

- [ ] **Step 2: Commit**

```bash
git add css/style.css
git commit -m "feat: add stylesheet — print band layout + screen editing UI"
```

---

### Task 8: App Shell (index.html)

**Files:**
- Create: `index.html`

- [ ] **Step 1: Create the app shell**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Schedule Builder</title>
  <link rel="stylesheet" href="css/style.css">
  <script src="js/constants.js"></script>
</head>
<body>
  <!-- Toolbar -->
  <div class="toolbar">
    <div class="toolbar-left">
      <button class="btn btn-primary" id="addEventBtn">+ Add Event</button>
      <button class="btn" id="addNoteBtn">+ Note</button>
    </div>
    <div class="toolbar-center">
      <div class="day-tabs" id="dayTabs"></div>
    </div>
    <div class="toolbar-right">
      <button class="btn" id="printBtn">Print / PDF</button>
      <button class="btn" id="settingsBtn">Settings</button>
      <button class="btn" id="saveBtn">Save</button>
    </div>
  </div>

  <!-- Schedule Container -->
  <div id="scheduleContainer" class="page"></div>

  <!-- Toast -->
  <div id="toast" class="toast"></div>

  <!-- Modals will be added by groups.js and schedule-setup.js -->
  <div class="modal-overlay" id="settingsModal">
    <div class="modal" id="settingsModalContent"></div>
  </div>
  <div class="modal-overlay" id="groupsModal">
    <div class="modal" id="groupsModalContent"></div>
  </div>

  <!-- Scripts — load order matters -->
  <script src="js/app-state.js"></script>
  <script src="js/utils.js"></script>
  <script src="js/ui-core.js"></script>
  <script src="js/schema.js"></script>
  <script src="js/data-helpers.js"></script>
  <script src="js/persistence.js"></script>
  <script src="js/render.js"></script>
  <script src="js/print.js"></script>
  <script src="js/events.js"></script>
  <script src="js/editing.js"></script>
  <script src="js/groups.js"></script>
  <script src="js/schedule-setup.js"></script>
  <script src="data/scheduledata.js"></script>
  <script src="js/init.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add app shell with script loading order and UI structure"
```

---

### Task 9: Persistence (Save/Load/Undo)

**Files:**
- Create: `js/persistence.js`
- Create: `data/scheduledata.js`

- [ ] **Step 1: Implement persistence**

```js
// js/persistence.js
let _fileHandle = null;
let _saveInProgress = false;
let _undoStack = [];
let _redoStack = [];
const UNDO_MAX = 30;

function saveUndoState() {
  _undoStack.push(Store.snapshot());
  if (_undoStack.length > UNDO_MAX) _undoStack.shift();
  _redoStack = [];
}

function undo() {
  if (!_undoStack.length) return;
  _redoStack.push(Store.snapshot());
  Store.restore(_undoStack.pop());
  renderActiveDay();
  toast('Undo');
}

function redo() {
  if (!_redoStack.length) return;
  _undoStack.push(Store.snapshot());
  Store.restore(_redoStack.pop());
  renderActiveDay();
  toast('Redo');
}

function sessionSave() {
  try {
    sessionStorage.setItem('schedule_state', JSON.stringify(Store.getPersistedState()));
  } catch (e) { /* ignore quota errors */ }
}

function sessionLoad() {
  try {
    const raw = sessionStorage.getItem('schedule_state');
    if (raw) {
      Store.loadPersistedState(JSON.parse(raw));
      return true;
    }
  } catch (e) { /* ignore */ }
  return false;
}

async function saveDataFile() {
  if (_saveInProgress) { toast('Save already in progress.'); return false; }
  _saveInProgress = true;
  try {
    const state = Store.getPersistedState();
    const timestamp = new Date().toISOString();
    const content = '// Schedule Data \u2014 Auto-saved\n'
      + '// Last saved: ' + timestamp + '\n\n'
      + 'const SAVED_STATE = ' + JSON.stringify(state, null, 2) + ';\n';

    if (window.showSaveFilePicker) {
      try {
        if (!_fileHandle) {
          _fileHandle = await window.showSaveFilePicker({
            suggestedName: 'scheduledata.js',
            types: [{ description: 'JavaScript', accept: { 'text/javascript': ['.js'] } }],
          });
        }
        const writable = await _fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        sessionSave();
        toast('Saved to ' + _fileHandle.name);
        return true;
      } catch (err) {
        if (err.name === 'AbortError') return false;
        console.warn('FSAPI save failed, falling back:', err);
      }
    }

    const blob = new Blob([content], { type: 'text/javascript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'scheduledata.js';
    a.click();
    URL.revokeObjectURL(a.href);
    sessionSave();
    toast('Downloaded scheduledata.js \u2014 place it in the data/ folder.');
    return true;
  } finally {
    _saveInProgress = false;
  }
}
```

- [ ] **Step 2: Create empty data file**

```js
// data/scheduledata.js
// Schedule data will be saved here by the application.
// const SAVED_STATE = {};
```

- [ ] **Step 3: Commit**

```bash
git add js/persistence.js data/scheduledata.js
git commit -m "feat: add persistence — FSAPI save, download fallback, undo/redo, session storage"
```

---

### Task 10: Editing Interface

**Files:**
- Create: `js/editing.js`
- Create: `js/events.js`

- [ ] **Step 1: Implement inline event editing**

```js
// js/editing.js
let _editingEventId = null;

function openEventEditor(dayId, eventId) {
  closeEventEditor();
  const evt = Store.getEvents(dayId).find(e => e.id === eventId);
  if (!evt) return;
  _editingEventId = eventId;
  const band = document.querySelector('[data-event-id="' + eventId + '"]');
  if (!band) return;

  const groups = Store.getGroups();
  const groupOptions = groups.map(g =>
    '<option value="' + esc(g.id) + '"' + (g.id === evt.groupId ? ' selected' : '') + '>' + esc(g.name) + '</option>'
  ).join('');

  const timeOptions = buildTimeOptions();

  const editorHtml = '<div class="editor-panel" data-editing="' + esc(eventId) + '">'
    + '<div class="editor-row">'
    + '<label>Title <input type="text" class="ed-title" value="' + esc(evt.title) + '"></label>'
    + '</div>'
    + '<div class="editor-row editor-row-time">'
    + '<label>Start <select class="ed-start">' + timeOptions.replace('value="' + evt.startTime + '"', 'value="' + evt.startTime + '" selected') + '</select></label>'
    + '<label>End <select class="ed-end">' + timeOptions.replace('value="' + evt.endTime + '"', 'value="' + evt.endTime + '" selected') + '</select></label>'
    + '<label>Group <select class="ed-group">' + groupOptions + '</select></label>'
    + '</div>'
    + '<div class="editor-row">'
    + '<label>Description <textarea class="ed-desc" rows="2">' + esc(evt.description) + '</textarea></label>'
    + '</div>'
    + '<div class="editor-row editor-row-half">'
    + '<label>Location <input type="text" class="ed-loc" value="' + esc(evt.location) + '"></label>'
    + '<label>POC <input type="text" class="ed-poc" value="' + esc(evt.poc) + '"></label>'
    + '</div>'
    + '<div class="editor-row editor-row-checks">'
    + '<label><input type="checkbox" class="ed-main"' + (evt.isMainEvent ? ' checked' : '') + '> Main Event</label>'
    + '<label><input type="checkbox" class="ed-break"' + (evt.isBreak ? ' checked' : '') + '> Break</label>'
    + '</div>'
    + '<div class="editor-actions">'
    + '<button class="btn btn-primary ed-save">Done</button>'
    + '<button class="btn btn-danger ed-delete">Delete</button>'
    + '</div>'
    + '</div>';

  band.insertAdjacentHTML('afterend', editorHtml);
  band.classList.add('editing-active');

  const panel = band.nextElementSibling;
  panel.querySelector('.ed-save').onclick = () => saveEventEdit(dayId, eventId, panel);
  panel.querySelector('.ed-delete').onclick = () => deleteEvent(dayId, eventId);
  panel.querySelector('.ed-title').focus();
}

function saveEventEdit(dayId, eventId, panel) {
  saveUndoState();
  const group = Store.getGroup(panel.querySelector('.ed-group').value);
  Store.updateEvent(dayId, eventId, {
    title: panel.querySelector('.ed-title').value.trim(),
    startTime: panel.querySelector('.ed-start').value,
    endTime: panel.querySelector('.ed-end').value,
    description: panel.querySelector('.ed-desc').value.trim(),
    location: panel.querySelector('.ed-loc').value.trim(),
    poc: panel.querySelector('.ed-poc').value.trim(),
    groupId: panel.querySelector('.ed-group').value,
    isMainEvent: panel.querySelector('.ed-main').checked,
    isBreak: panel.querySelector('.ed-break').checked,
  });
  closeEventEditor();
  sessionSave();
  renderActiveDay();
}

function deleteEvent(dayId, eventId) {
  if (!confirm('Delete this event?')) return;
  saveUndoState();
  Store.removeEvent(dayId, eventId);
  closeEventEditor();
  sessionSave();
  renderActiveDay();
}

function closeEventEditor() {
  document.querySelectorAll('.editor-panel').forEach(p => p.remove());
  document.querySelectorAll('.editing-active').forEach(b => b.classList.remove('editing-active'));
  _editingEventId = null;
}

function openAddEvent(dayId) {
  saveUndoState();
  const groups = Store.getGroups();
  const defaultGroup = groups.find(g => g.scope === 'main') || groups[0];
  const evt = Store.addEvent(dayId, {
    title: 'New Event',
    startTime: '0800',
    endTime: '0900',
    groupId: defaultGroup ? defaultGroup.id : '',
  });
  sessionSave();
  renderActiveDay();
  if (evt) setTimeout(() => openEventEditor(dayId, evt.id), 100);
}

function buildTimeOptions() {
  let html = '';
  for (let m = 0; m < 24 * 60; m += TIME_INCREMENT) {
    const t = minutesToTime(m);
    html += '<option value="' + t + '">' + t + '</option>';
  }
  return html;
}
```

- [ ] **Step 2: Implement event handlers**

```js
// js/events.js
document.addEventListener('click', e => {
  const band = e.target.closest('.band[data-event-id]');
  if (band && !e.target.closest('.editor-panel') && !e.target.closest('.band-conc')) {
    const dayId = Store.getActiveDay();
    if (dayId) openEventEditor(dayId, band.getAttribute('data-event-id'));
    return;
  }
});

document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    undo();
  }
  if ((e.metaKey || e.ctrlKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    redo();
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add js/editing.js js/events.js
git commit -m "feat: add inline event editing — click to edit, add, delete, time pickers, undo"
```

---

### Task 11: Group Management and Schedule Setup

**Files:**
- Create: `js/groups.js`
- Create: `js/schedule-setup.js`

- [ ] **Step 1: Implement group management panel**

The `groups.js` file should render a modal with a list of current groups, each with editable name, scope toggle (main/limited), color picker, and delete button. Include an "Add Group" button. Changes update Store and re-render.

The implementing agent should reference the spec's Group Management section and build the modal UI following the Org Chart's modal pattern from `ui-core.js`.

- [ ] **Step 2: Implement schedule setup**

The `schedule-setup.js` file should handle:
- Schedule title editing (inline in the header or via settings modal)
- Logo upload (`<input type="file" accept="image/*">`, convert to data URL, store in Store)
- Day management (add/remove days, set date and time bounds)
- Day tabs rendering and switching
- Notes management per day (add/edit/delete notes with category and text)
- Footer configuration (contact info, POC, updated date)
- Print button handler
- Save button handler
- The `renderActiveDay()` function that calls `renderDay()` for the active day tab

- [ ] **Step 3: Commit**

```bash
git add js/groups.js js/schedule-setup.js
git commit -m "feat: add group management, schedule setup, day tabs, notes management"
```

---

### Task 12: Print Engine

**Files:**
- Create: `js/print.js`

- [ ] **Step 1: Implement adaptive print scaling**

```js
// js/print.js
function printActiveDay() {
  const dayId = Store.getActiveDay();
  if (!dayId) { toast('No day selected.'); return; }
  renderDay(dayId);
  setTimeout(() => {
    applyPrintScaling();
    window.print();
  }, 200);
}

function printAllDays() {
  // For multi-page: render each day into a separate .page div
  const container = document.getElementById('scheduleContainer');
  const days = Store.getDays();
  if (!days.length) { toast('No days to print.'); return; }

  let html = '';
  days.forEach(day => {
    // Temporarily set active day to render each
    const groups = Store.getGroups();
    const { mainBands, concurrent } = classifyEvents(day.events, groups);
    const notes = Store.getNotes(day.id);
    html += '<div class="page print-page">';
    html += renderHeader(day);
    html += '<div class="schedule">';
    let prevTier = null;
    mainBands.forEach((band, i) => {
      if (band.tier === 'break' && prevTier && prevTier !== 'break') html += '<div class="section-break"></div>';
      html += renderBand(band);
      if (band.tier === 'break') {
        const next = mainBands[i + 1];
        if (next && next.tier !== 'break') html += '<div class="section-break"></div>';
      }
      prevTier = band.tier;
    });
    html += '</div>';
    if (concurrent.length > 0) html += renderConcurrentRow(concurrent, groups);
    if (notes.length > 0) html += renderNotes(notes);
    html += renderFooter();
    html += '</div>';
  });
  container.innerHTML = html;
  setTimeout(() => {
    document.querySelectorAll('.print-page').forEach(applyPrintScalingToPage);
    window.print();
    // After print, re-render active day
    const activeDay = Store.getActiveDay();
    if (activeDay) renderDay(activeDay);
  }, 200);
}

function applyPrintScaling() {
  const page = document.querySelector('.page');
  if (page) applyPrintScalingToPage(page);
}

function applyPrintScalingToPage(page) {
  // Measure total content height vs available page height
  // If content overflows, progressively reduce padding and font sizes
  // using LAYOUT_TARGETS min/max ranges with linear interpolation
  const maxH = 10.2 * 96; // ~10.2 inches at 96 CSS px/in, accounting for margins
  const contentH = page.scrollHeight;
  if (contentH <= maxH) return; // fits, no scaling needed

  const ratio = Math.max(0.6, maxH / contentH); // clamp at 60% minimum
  const lerp = (range, t) => range[0] + (range[1] - range[0]) * (1 - t);
  const T = LAYOUT_TARGETS;

  // Apply scaled values via CSS custom properties
  page.style.setProperty('--band-main-pad-v', lerp(T.band.mainPadV, ratio) + 'px');
  page.style.setProperty('--band-main-pad-h', lerp(T.band.mainPadH, ratio) + 'px');
  page.style.setProperty('--band-title-fs', lerp(T.band.titleFs, ratio) + 'px');
  page.style.setProperty('--band-desc-fs', lerp(T.band.descFs, ratio) + 'px');
  page.style.setProperty('--band-meta-fs', lerp(T.band.metaFs, ratio) + 'px');
  page.style.setProperty('--notes-fs', lerp(T.notes.fs, ratio) + 'px');
}
```

- [ ] **Step 2: Commit**

```bash
git add js/print.js
git commit -m "feat: add print engine — adaptive scaling, single day and multi-day print"
```

---

### Task 13: Init and Sample Data

**Files:**
- Create: `js/init.js`

- [ ] **Step 1: Create initialization with sample data**

The `init.js` file should:
1. Check for `SAVED_STATE` (from `data/scheduledata.js`)
2. If not found, check `sessionStorage`
3. If neither, load sample data that matches the mockup (April RSD, Saturday with Formation, Commander's Call, Safety Brief, AFSC Training, Lunch, Ancillary, Outprocessing, Flight Debrief, Readiness Standup, End of Day, plus concurrent events PT Testing, E-7 Promotion Board, TCCC, IG Inspection Prep, and 7 sample notes)
4. Set active day to the first day
5. Render the day tabs and active day
6. Wire up toolbar buttons (Add Event, Print, Settings, Save)

The implementing agent should build the complete sample dataset from the mockup and spec.

- [ ] **Step 2: Commit**

```bash
git add js/init.js
git commit -m "feat: add init with sample drill schedule data"
```

---

### Task 14: CLAUDE.md

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: Write the project CLAUDE.md**

Document: tech stack, code standards (same as Org Chart), project structure with file responsibilities, script load order, state management pattern, data persistence approach, debugging standards, UI/UX standards, and known issues.

Follow the same format and level of detail as the Org Chart's CLAUDE.md at `~/Desktop/Org Chart/CLAUDE.md`.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add project CLAUDE.md"
```

---

### Task 15: Integration Test — Full Render Cycle

- [ ] **Step 1: Open index.html in a browser**

Open `index.html` in Chrome. The sample schedule should render with all events, concurrent row, and notes. Verify:
- Header shows "April RSD", date, metadata, logo placeholder
- Event bands render with correct main/supporting/break styling
- Concurrent "Also happening" indicators appear on overlapping bands
- Concurrent row at bottom shows all long-running concurrent events
- Notes render in two-column layout
- Clicking an event band opens the inline editor
- Adding a new event works and auto-sorts
- Undo/redo works (Cmd+Z / Cmd+Shift+Z)
- Print preview shows the band layout correctly

- [ ] **Step 2: Fix any issues found during integration testing**

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "fix: integration test fixes"
```

