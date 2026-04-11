# Schedule Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform DaySchedule from a single-schedule editor with manual export into a persistent schedule library with auto-save, version history, and file-based storage for Teams sync.

**Architecture:** New `js/library.js` manages schedule listing, directory access, and file I/O. New `js/storage.js` handles IndexedDB directory handle persistence, auto-save debounce, and stale-data detection. The existing editor code is untouched except for `init.js` (new boot flow) and `events.js` (Ctrl+S shortcut). `persistence.js` is refactored to delegate to storage.js for file writes.

**Tech Stack:** HTML5, CSS3, vanilla JavaScript. File System Access API for directory read/write. IndexedDB for directory handle persistence. localStorage for user identity.

---

### Task 1: Storage Layer — IndexedDB + Directory Handle

**Files:**
- Create: `js/storage.js`
- Test: `tests/test-storage.js`
- Modify: `tests/runner.html` (add test script)

This task builds the lowest layer: persisting the directory handle in IndexedDB and reading/writing JSON files through it.

- [ ] **Step 1: Write failing tests for IndexedDB handle persistence**

Add to `tests/runner.html` before the `TestRunner.run()` line:
```html
<script src="../js/storage.js"></script>
<script src="test-storage.js"></script>
```

Create `tests/test-storage.js`:
```javascript
describe('Storage — slug generation', () => {
  it('converts name to lowercase hyphenated slug', () => {
    assert.equal(scheduleNameToSlug('May Drill'), 'may-drill');
  });

  it('strips special characters', () => {
    assert.equal(scheduleNameToSlug('April RSD (2026)'), 'april-rsd-2026');
  });

  it('collapses multiple hyphens', () => {
    assert.equal(scheduleNameToSlug('June - - Drill'), 'june-drill');
  });

  it('trims leading/trailing hyphens', () => {
    assert.equal(scheduleNameToSlug('  May Drill  '), 'may-drill');
  });

  it('returns fallback for empty string', () => {
    assert.equal(scheduleNameToSlug(''), 'schedule');
  });
});

describe('Storage — buildScheduleFile', () => {
  it('wraps Store state in schedule envelope', () => {
    const state = { title: 'Test', days: [], groups: [], logo: null, footer: {} };
    const file = buildScheduleFile('Test Schedule', state, [], 'Tester');
    assert.equal(file.name, 'Test Schedule');
    assert.deepEqual(file.current, state);
    assert.deepEqual(file.versions, []);
    assert.equal(file.lastSavedBy, 'Tester');
    assert(file.lastSavedAt, 'should have timestamp');
    assert(file.createdAt, 'should have createdAt');
  });
});

describe('Storage — parseScheduleFile', () => {
  it('extracts metadata without full data load', () => {
    const file = {
      name: 'May Drill',
      createdAt: '2026-04-05T09:00:00Z',
      lastSavedBy: 'Tester',
      lastSavedAt: '2026-04-10T14:00:00Z',
      current: {
        title: 'May Drill',
        days: [{ id: 'd1', events: [{}, {}, {}], notes: [{}] }, { id: 'd2', events: [{}, {}], notes: [] }],
        groups: [], logo: null, footer: {}
      },
      versions: [{ name: 'v1' }]
    };
    const meta = parseScheduleMeta(file);
    assert.equal(meta.name, 'May Drill');
    assert.equal(meta.dayCount, 2);
    assert.equal(meta.eventCount, 5);
    assert.equal(meta.noteCount, 1);
    assert.equal(meta.versionCount, 1);
    assert.equal(meta.lastSavedBy, 'Tester');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Open `tests/runner.html` in browser.
Expected: FAIL — `scheduleNameToSlug`, `buildScheduleFile`, `parseScheduleMeta` not defined.

- [ ] **Step 3: Implement storage.js**

Create `js/storage.js`:
```javascript
/* ── storage.js ── Directory handle persistence, file I/O, schedule envelope ── */

const STORAGE_DB_NAME = 'DayScheduleDB';
const STORAGE_DB_VERSION = 1;
const STORAGE_STORE_NAME = 'handles';
const STORAGE_HANDLE_KEY = 'dataDir';
const AUTOSAVE_DELAY = 2000;

let _dirHandle = null;
let _autosaveTimer = null;
let _currentFileName = null;
let _lastKnownSavedAt = null;
let _dirty = false;

// ── Slug generation ────────────────────────────────────────────────────────

function scheduleNameToSlug(name) {
  const slug = (name || '').trim().toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'schedule';
}

// ── Schedule file envelope ─────────────────────────────────────────────────

function buildScheduleFile(name, storeState, versions, savedBy) {
  const now = new Date().toISOString();
  return {
    name: name,
    createdAt: now,
    lastSavedBy: savedBy || '',
    lastSavedAt: now,
    current: storeState,
    versions: versions || [],
  };
}

function parseScheduleMeta(fileData) {
  const days = (fileData.current && fileData.current.days) || [];
  let eventCount = 0;
  let noteCount = 0;
  days.forEach(d => {
    eventCount += (d.events || []).length;
    noteCount += (d.notes || []).length;
  });
  return {
    name: fileData.name || '(Untitled)',
    createdAt: fileData.createdAt || null,
    lastSavedBy: fileData.lastSavedBy || '',
    lastSavedAt: fileData.lastSavedAt || null,
    dayCount: days.length,
    eventCount: eventCount,
    noteCount: noteCount,
    versionCount: (fileData.versions || []).length,
  };
}

// ── IndexedDB — directory handle persistence ───────────────────────────────

function _openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(STORAGE_DB_NAME, STORAGE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORAGE_STORE_NAME)) {
        db.createObjectStore(STORAGE_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveDirectoryHandle(handle) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORAGE_STORE_NAME, 'readwrite');
    tx.objectStore(STORAGE_STORE_NAME).put(handle, STORAGE_HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadDirectoryHandle() {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORAGE_STORE_NAME, 'readonly');
    const req = tx.objectStore(STORAGE_STORE_NAME).get(STORAGE_HANDLE_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

// ── Directory access ───────────────────────────────────────────────────────

async function promptForDirectory() {
  if (!window.showDirectoryPicker) return null;
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    // Verify: folder name should be 'data' or contain scheduledata.js
    let verified = handle.name === 'data';
    if (!verified) {
      try {
        await handle.getFileHandle('scheduledata.js');
        verified = true;
      } catch (e) { /* not found — that's fine, could be empty data folder */ }
    }
    if (!verified) {
      // Check if it's empty (new setup) — allow it
      let fileCount = 0;
      for await (const entry of handle.values()) { fileCount++; if (fileCount > 0) break; }
      if (fileCount === 0) verified = true;
    }
    if (!verified) {
      toast("That doesn't look like the data folder — it should be the 'data' folder inside DaySchedule.");
      return null;
    }
    _dirHandle = handle;
    await saveDirectoryHandle(handle);
    return handle;
  } catch (e) {
    if (e.name === 'AbortError') return null;
    console.warn('Directory picker failed:', e);
    return null;
  }
}

async function restoreDirectoryHandle() {
  const handle = await loadDirectoryHandle();
  if (!handle) return null;
  // Verify permission — browser may prompt
  const perm = await handle.queryPermission({ mode: 'readwrite' });
  if (perm === 'granted') { _dirHandle = handle; return handle; }
  const req = await handle.requestPermission({ mode: 'readwrite' });
  if (req === 'granted') { _dirHandle = handle; return handle; }
  return null;
}

function getDirectoryHandle() {
  return _dirHandle;
}

function hasDirectoryAccess() {
  return _dirHandle !== null;
}

function hasFSAPI() {
  return typeof window.showDirectoryPicker === 'function';
}

// ── File I/O ───────────────────────────────────────────────────────────────

async function listScheduleFiles() {
  if (!_dirHandle) return [];
  const files = [];
  for await (const [name, entry] of _dirHandle.entries()) {
    if (entry.kind !== 'file' || !name.endsWith('.json')) continue;
    try {
      const file = await entry.getFile();
      const text = await file.text();
      const data = JSON.parse(text);
      const meta = parseScheduleMeta(data);
      meta.fileName = name;
      files.push(meta);
    } catch (e) {
      console.warn('Skipping unreadable file:', name, e);
    }
  }
  // Sort by lastSavedAt descending (newest first)
  files.sort((a, b) => (b.lastSavedAt || '').localeCompare(a.lastSavedAt || ''));
  return files;
}

async function readScheduleFile(fileName) {
  if (!_dirHandle) return null;
  try {
    const fileHandle = await _dirHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text);
  } catch (e) {
    console.warn('Failed to read schedule:', fileName, e);
    return null;
  }
}

async function writeScheduleFile(fileName, data) {
  if (!_dirHandle) return false;
  try {
    const fileHandle = await _dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
    return true;
  } catch (e) {
    console.warn('Failed to write schedule:', fileName, e);
    return false;
  }
}

async function deleteScheduleFile(fileName) {
  if (!_dirHandle) return false;
  try {
    await _dirHandle.removeEntry(fileName);
    return true;
  } catch (e) {
    console.warn('Failed to delete schedule:', fileName, e);
    return false;
  }
}

async function renameScheduleFile(oldName, newName) {
  if (!_dirHandle || oldName === newName) return true;
  const data = await readScheduleFile(oldName);
  if (!data) return false;
  const wrote = await writeScheduleFile(newName, data);
  if (!wrote) return false;
  await deleteScheduleFile(oldName);
  return true;
}

// ── Auto-save engine ───────────────────────────────────────────────────────

function markDirty() {
  _dirty = true;
  updateSaveIndicator('dirty');
  clearTimeout(_autosaveTimer);
  _autosaveTimer = setTimeout(() => autoSave(), AUTOSAVE_DELAY);
}

async function autoSave() {
  if (!_dirty || !_currentFileName || !_dirHandle) return;
  await saveCurrentSchedule();
}

async function saveCurrentSchedule() {
  if (!_currentFileName || !_dirHandle) return false;
  updateSaveIndicator('saving');

  const userName = getUserName();
  const state = Store.getPersistedState();
  const existing = await readScheduleFile(_currentFileName);

  // Stale-data detection
  if (existing && _lastKnownSavedAt && existing.lastSavedAt !== _lastKnownSavedAt) {
    updateSaveIndicator('dirty');
    showStaleDataWarning(existing.lastSavedBy, existing.lastSavedAt, existing);
    return false;
  }

  const now = new Date().toISOString();
  const fileData = existing || buildScheduleFile(state.title || 'Untitled', state, [], userName);
  fileData.current = state;
  fileData.lastSavedBy = userName;
  fileData.lastSavedAt = now;
  if (existing) fileData.name = state.title || fileData.name;

  const ok = await writeScheduleFile(_currentFileName, fileData);
  if (ok) {
    _dirty = false;
    _lastKnownSavedAt = now;
    updateSaveIndicator('saved');
    sessionSave(); // crash-recovery layer
  } else {
    updateSaveIndicator('dirty');
  }
  return ok;
}

function forceSave() {
  clearTimeout(_autosaveTimer);
  saveCurrentSchedule().then(ok => {
    if (ok) toast('Saved');
  });
}

function setCurrentFile(fileName, lastSavedAt) {
  _currentFileName = fileName;
  _lastKnownSavedAt = lastSavedAt || null;
  _dirty = false;
  updateSaveIndicator('saved');
}

function getCurrentFileName() {
  return _currentFileName;
}

// ── Save indicator ─────────────────────────────────────────────────────────

function updateSaveIndicator(state) {
  const dot = document.getElementById('saveIndicator');
  if (!dot) return;
  dot.className = 'save-dot';
  if (state === 'dirty') dot.classList.add('save-dirty');
  else if (state === 'saving') dot.classList.add('save-saving');
  else if (state === 'disconnected') dot.classList.add('save-disconnected');
  // 'saved' — no extra class, dot is hidden
}

// ── Stale-data warning ─────────────────────────────────────────────────────

function showStaleDataWarning(otherUser, otherTime, otherData) {
  const time = new Date(otherTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const msg = 'This schedule was updated by ' + (otherUser || 'someone else') + ' at ' + time + '. Load their changes, or overwrite with yours?';

  const overlay = document.getElementById('staleWarningModal');
  if (!overlay) return;
  const content = overlay.querySelector('.modal');
  content.innerHTML = '<h2>External Changes Detected</h2>'
    + '<p style="margin:12px 0;font-size:14px;color:#48484a;">' + esc(msg) + '</p>'
    + '<div class="modal-actions">'
    + '<button class="btn" id="staleLoadBtn">Load theirs</button>'
    + '<button class="btn btn-primary" id="staleOverwriteBtn">Overwrite</button>'
    + '</div>';

  overlay.classList.add('active');

  content.querySelector('#staleLoadBtn').onclick = () => {
    overlay.classList.remove('active');
    Store.loadPersistedState(otherData.current);
    _lastKnownSavedAt = otherData.lastSavedAt;
    _dirty = false;
    updateSaveIndicator('saved');
    renderActiveDay();
    syncToolbarTitle();
    toast('Loaded external changes');
  };

  content.querySelector('#staleOverwriteBtn').onclick = () => {
    overlay.classList.remove('active');
    _lastKnownSavedAt = otherData.lastSavedAt;
    saveCurrentSchedule();
  };
}

// ── User identity ──────────────────────────────────────────────────────────

const USER_NAME_KEY = 'dayschedule_user_name';

function getUserName() {
  return localStorage.getItem(USER_NAME_KEY) || '';
}

function setUserName(name) {
  localStorage.setItem(USER_NAME_KEY, (name || '').trim());
}

function hasUserName() {
  return !!getUserName();
}

function promptUserName() {
  return new Promise(resolve => {
    const overlay = document.getElementById('userNameModal');
    if (!overlay) { resolve(''); return; }
    const content = overlay.querySelector('.modal');
    content.innerHTML = '<h2>Welcome</h2>'
      + '<p style="margin:12px 0;font-size:14px;color:#48484a;">What\'s your name? This tags your saves so others know who made changes.</p>'
      + '<input type="text" id="userNameInput" placeholder="e.g., SrA Martinez" style="width:100%;padding:8px 12px;font-size:14px;border:1px solid #d2d2d7;border-radius:6px;">'
      + '<div class="modal-actions">'
      + '<button class="btn btn-primary" id="userNameDone">Continue</button>'
      + '</div>';

    overlay.classList.add('active');
    const input = content.querySelector('#userNameInput');
    setTimeout(() => input.focus(), 50);

    const done = () => {
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      setUserName(name);
      overlay.classList.remove('active');
      resolve(name);
    };

    content.querySelector('#userNameDone').onclick = done;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') done(); });
  });
}

// ── Version management ─────────────────────────────────────────────────────

async function createVersion(versionName) {
  if (!_currentFileName || !_dirHandle) return false;
  const fileData = await readScheduleFile(_currentFileName);
  if (!fileData) return false;

  const version = {
    name: versionName,
    savedBy: getUserName(),
    savedAt: new Date().toISOString(),
    data: JSON.parse(JSON.stringify(fileData.current)),
  };
  if (!fileData.versions) fileData.versions = [];
  fileData.versions.unshift(version);

  // Also update current from Store (latest state)
  fileData.current = Store.getPersistedState();
  fileData.lastSavedBy = getUserName();
  fileData.lastSavedAt = new Date().toISOString();

  const ok = await writeScheduleFile(_currentFileName, fileData);
  if (ok) {
    _dirty = false;
    _lastKnownSavedAt = fileData.lastSavedAt;
    updateSaveIndicator('saved');
  }
  return ok;
}

async function restoreVersion(versionIndex) {
  if (!_currentFileName || !_dirHandle) return false;
  const fileData = await readScheduleFile(_currentFileName);
  if (!fileData || !fileData.versions || !fileData.versions[versionIndex]) return false;

  // Safety: save current state as auto-backup version
  const backup = {
    name: 'Auto-backup before restore, ' + new Date().toLocaleString(),
    savedBy: getUserName(),
    savedAt: new Date().toISOString(),
    data: JSON.parse(JSON.stringify(fileData.current)),
  };
  fileData.versions.unshift(backup);

  // Restore the selected version (index shifted by 1 due to backup insert)
  const targetIndex = versionIndex + 1;
  const version = fileData.versions[targetIndex];
  fileData.current = JSON.parse(JSON.stringify(version.data));
  fileData.lastSavedBy = getUserName();
  fileData.lastSavedAt = new Date().toISOString();

  const ok = await writeScheduleFile(_currentFileName, fileData);
  if (ok) {
    Store.loadPersistedState(fileData.current);
    _lastKnownSavedAt = fileData.lastSavedAt;
    _dirty = false;
    updateSaveIndicator('saved');
    renderActiveDay();
    syncToolbarTitle();
  }
  return ok;
}

async function getVersions() {
  if (!_currentFileName || !_dirHandle) return [];
  const fileData = await readScheduleFile(_currentFileName);
  if (!fileData) return [];
  return (fileData.versions || []).map((v, i) => ({
    index: i,
    name: v.name,
    savedBy: v.savedBy,
    savedAt: v.savedAt,
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Open `tests/runner.html` in browser.
Expected: All `Storage` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add js/storage.js tests/test-storage.js tests/runner.html
git commit -m "feat: add storage layer — IndexedDB, file I/O, schedule envelope, auto-save engine"
```

---

### Task 2: Library UI — Home Screen

**Files:**
- Create: `js/library.js`
- Modify: `index.html` (add library view markup + script tag)
- Modify: `css/style.css` (add library styles)

This task builds the schedule library home screen — the list view, new schedule creation, and context menu.

- [ ] **Step 1: Add library HTML to index.html**

In `index.html`, add the library view before the toolbar (line 12), and add new modals before the closing `</body>` tag. Also add the new script tags.

After `<body>` (line 10), before the `<!-- Toolbar -->` comment (line 11), insert:
```html
  <!-- Library View -->
  <div class="library-view" id="libraryView">
    <div class="library-header">
      <div class="library-brand">Schedule Builder</div>
    </div>
    <div class="library-body">
      <div id="libraryConnectPrompt" class="library-connect" style="display:none;">
        <div class="library-connect-icon">&#x1F4C1;</div>
        <div class="library-connect-title">Connect your data folder</div>
        <div class="library-connect-desc">Pick the <code>data</code> folder inside your DaySchedule directory. This lets the app save directly — no downloads, no file pickers.</div>
        <button class="btn btn-primary" id="libraryConnectBtn">Choose Folder</button>
        <div class="library-connect-hint">You'll only need to do this once.</div>
      </div>
      <div id="libraryFallbackBanner" class="library-fallback" style="display:none;">
        Auto-save requires Chrome or Edge. You're in manual mode — use the Save button to download your data.
      </div>
      <button class="btn btn-primary library-new-btn" id="libraryNewBtn">+ New Schedule</button>
      <div class="library-new-inline" id="libraryNewInline" style="display:none;">
        <input type="text" id="libraryNewName" placeholder="Schedule name (e.g., June Drill)" class="library-new-input">
        <button class="btn btn-primary" id="libraryNewConfirm">Create</button>
        <button class="btn" id="libraryNewCancel">Cancel</button>
      </div>
      <div class="library-list" id="libraryList"></div>
    </div>
  </div>
```

Before the `<!-- Settings Modal -->` (line 50), add:
```html
  <!-- Stale Data Warning Modal -->
  <div class="modal-overlay" id="staleWarningModal">
    <div class="modal"></div>
  </div>

  <!-- User Name Modal -->
  <div class="modal-overlay" id="userNameModal">
    <div class="modal"></div>
  </div>

  <!-- Version Panel Modal -->
  <div class="modal-overlay" id="versionModal">
    <div class="modal"></div>
  </div>
```

In the script section, add `storage.js` and `library.js` after `persistence.js` and before `render.js`:
```html
  <script src="js/storage.js"></script>
  <script src="js/library.js"></script>
```

- [ ] **Step 2: Add library CSS styles**

At the end of `css/style.css`, before the `@media print` block, add:
```css
/* ══════════════════════════════════════════════════════════════
   LIBRARY — Schedule list home screen
   ══════════════════════════════════════════════════════════════ */
.library-view {
  display: none;
  flex-direction: column;
  min-height: 100vh;
  background: #f5f5f7;
}
.library-view.active {
  display: flex;
}
.library-header {
  padding: 16px 24px;
  background: white;
  border-bottom: 1px solid #e5e5ea;
}
.library-brand {
  font-size: 13px;
  font-weight: 700;
  color: #86868b;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.library-body {
  max-width: 600px;
  width: 100%;
  margin: 32px auto;
  padding: 0 24px;
}

/* Connect prompt */
.library-connect {
  background: white;
  border-radius: 12px;
  padding: 32px;
  text-align: center;
  margin-bottom: 24px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.library-connect-icon { font-size: 32px; margin-bottom: 12px; }
.library-connect-title { font-size: 15px; font-weight: 600; color: #1d1d1f; margin-bottom: 8px; }
.library-connect-desc { font-size: 12px; color: #86868b; line-height: 1.6; margin-bottom: 20px; }
.library-connect-desc code { background: #f0f0f2; padding: 1px 6px; border-radius: 3px; font-size: 11px; }
.library-connect-hint { font-size: 10px; color: #aeaeb2; margin-top: 12px; }

/* Fallback banner */
.library-fallback {
  background: #fff8e1;
  color: #8d6e00;
  font-size: 12px;
  padding: 10px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  line-height: 1.5;
}

/* New schedule */
.library-new-btn { width: 100%; margin-bottom: 16px; }
.library-new-inline {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  align-items: center;
}
.library-new-input {
  flex: 1;
  padding: 8px 12px;
  font-size: 14px;
  border: 1px solid #d2d2d7;
  border-radius: 6px;
  outline: none;
}
.library-new-input:focus { border-color: rgba(var(--app-accent), 0.5); box-shadow: 0 0 0 2px rgba(var(--app-accent), 0.15); }

/* Schedule list */
.library-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.library-item {
  background: white;
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: background 0.15s;
}
.library-item:hover { background: #f0f0f5; }
.library-item-info { flex: 1; min-width: 0; }
.library-item-name {
  font-size: 14px;
  font-weight: 600;
  color: #1d1d1f;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.library-item-meta {
  font-size: 11px;
  color: #86868b;
  margin-top: 2px;
}
.library-item-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
  flex-shrink: 0;
  margin-left: 12px;
}
.library-item-badge.draft { background: #f0f0f5; color: #86868b; }
.library-item-badge.final { background: #e8f5e9; color: #2e7d32; }
.library-empty {
  text-align: center;
  padding: 48px 24px;
  color: #aeaeb2;
  font-size: 14px;
}

/* Context menu */
.library-context {
  position: fixed;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  padding: 4px;
  z-index: 1000;
  min-width: 140px;
  display: none;
}
.library-context.active { display: block; }
.library-context-item {
  display: block;
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  color: #1d1d1f;
  background: none;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  text-align: left;
}
.library-context-item:hover { background: #f0f0f5; }
.library-context-item.danger { color: #ff3b30; }
.library-context-item.danger:hover { background: #fff5f5; }

/* Save indicator dot */
.save-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: none;
  flex-shrink: 0;
}
.save-dot.save-dirty { display: block; background: #e8a849; }
.save-dot.save-saving { display: block; background: #5b8def; animation: save-pulse 1s ease-in-out infinite; }
.save-dot.save-disconnected { display: block; background: #ff3b30; cursor: pointer; }
@keyframes save-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

/* Back button in toolbar */
.tb-back {
  background: none;
  border: none;
  font-size: 16px;
  color: rgba(var(--app-accent), 1);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}
.tb-back:hover { background: rgba(var(--app-accent), 0.08); }
```

- [ ] **Step 3: Implement library.js**

Create `js/library.js`:
```javascript
/* ── library.js ── Schedule library home screen ────────────────────────────── */

let _contextMenuTarget = null;

function showLibrary() {
  document.getElementById('libraryView').classList.add('active');
  document.querySelector('.toolbar').style.display = 'none';
  document.querySelector('.app-body').style.display = 'none';
  closeContextMenu();
  refreshLibraryList();
}

function hideLibrary() {
  document.getElementById('libraryView').classList.remove('active');
  document.querySelector('.toolbar').style.display = '';
  document.querySelector('.app-body').style.display = '';
}

async function refreshLibraryList() {
  const listEl = document.getElementById('libraryList');
  if (!listEl) return;

  if (!hasDirectoryAccess()) {
    listEl.innerHTML = '<div class="library-empty">Connect your data folder to get started.</div>';
    return;
  }

  const files = await listScheduleFiles();
  if (files.length === 0) {
    listEl.innerHTML = '<div class="library-empty">No schedules yet. Create one to get started.</div>';
    return;
  }

  let html = '';
  files.forEach(meta => {
    const timeAgo = meta.lastSavedAt ? formatTimeAgo(meta.lastSavedAt) : '';
    const stats = meta.dayCount + (meta.dayCount === 1 ? ' day' : ' days') + ' \u00b7 '
      + meta.eventCount + (meta.eventCount === 1 ? ' event' : ' events');
    const metaLine = [stats, timeAgo].filter(Boolean).join(' \u00b7 ');
    const badgeClass = meta.versionCount > 0 ? 'final' : 'draft';
    const badgeText = meta.versionCount > 0 ? 'Final' : 'Draft';

    html += '<div class="library-item" data-file="' + esc(meta.fileName) + '">';
    html += '<div class="library-item-info">';
    html += '<div class="library-item-name">' + esc(meta.name) + '</div>';
    html += '<div class="library-item-meta">' + esc(metaLine) + '</div>';
    html += '</div>';
    html += '<span class="library-item-badge ' + badgeClass + '">' + badgeText + '</span>';
    html += '</div>';
  });
  listEl.innerHTML = html;

  // Wire click handlers
  listEl.querySelectorAll('.library-item').forEach(item => {
    item.addEventListener('click', () => {
      openSchedule(item.getAttribute('data-file'));
    });
    item.addEventListener('contextmenu', e => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, item.getAttribute('data-file'));
    });
  });
}

async function openSchedule(fileName) {
  const data = await readScheduleFile(fileName);
  if (!data) { toast('Failed to open schedule.'); return; }

  // Ensure user identity
  if (!hasUserName()) await promptUserName();

  Store.reset();
  if (data.current) {
    Store.loadPersistedState(data.current);
  }
  const days = Store.getDays();
  if (days.length) Store.setActiveDay(days[0].id);

  setCurrentFile(fileName, data.lastSavedAt);
  hideLibrary();
  syncToolbarTitle();
  renderActiveDay();
  renderInspector();
}

async function createNewSchedule(name) {
  if (!hasUserName()) await promptUserName();

  const slug = scheduleNameToSlug(name);
  const fileName = slug + '.json';
  const userName = getUserName();

  Store.reset();
  Store.setTitle(name);
  const state = Store.getPersistedState();
  const fileData = buildScheduleFile(name, state, [], userName);

  const ok = await writeScheduleFile(fileName, fileData);
  if (!ok) { toast('Failed to create schedule.'); return; }

  setCurrentFile(fileName, fileData.lastSavedAt);
  hideLibrary();
  syncToolbarTitle();
  renderActiveDay();
  renderInspector();
  toast('Created ' + name);
}

async function duplicateSchedule(fileName) {
  const data = await readScheduleFile(fileName);
  if (!data) { toast('Failed to read schedule.'); return; }

  const newName = (data.name || 'Schedule') + ' (Copy)';
  const newSlug = scheduleNameToSlug(newName);
  const newFileName = newSlug + '.json';
  const userName = getUserName();

  const newData = buildScheduleFile(newName, data.current, [], userName);
  newData.current.title = newName;

  const ok = await writeScheduleFile(newFileName, newData);
  if (!ok) { toast('Failed to duplicate.'); return; }

  refreshLibraryList();
  toast('Duplicated as ' + newName);
}

async function deleteSchedule(fileName) {
  const ok = await deleteScheduleFile(fileName);
  if (ok) {
    refreshLibraryList();
    toast('Deleted');
  } else {
    toast('Failed to delete.');
  }
}

function returnToLibrary() {
  // Save current work before leaving
  if (_dirty && hasDirectoryAccess()) {
    saveCurrentSchedule();
  }
  setCurrentFile(null, null);
  Store.reset();
  showLibrary();
}

// ── Context menu ───────────────────────────────────────────────────────────

function showContextMenu(x, y, fileName) {
  _contextMenuTarget = fileName;
  let menu = document.getElementById('libraryContextMenu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'libraryContextMenu';
    menu.className = 'library-context';
    menu.innerHTML = '<button class="library-context-item" id="ctxDuplicate">Duplicate</button>'
      + '<button class="library-context-item danger" id="ctxDelete">Delete</button>';
    document.body.appendChild(menu);

    menu.querySelector('#ctxDuplicate').onclick = () => {
      closeContextMenu();
      if (_contextMenuTarget) duplicateSchedule(_contextMenuTarget);
    };
    menu.querySelector('#ctxDelete').onclick = () => {
      closeContextMenu();
      if (_contextMenuTarget && confirm('Delete this schedule? This cannot be undone.')) {
        deleteSchedule(_contextMenuTarget);
      }
    };
  }
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.classList.add('active');
}

function closeContextMenu() {
  const menu = document.getElementById('libraryContextMenu');
  if (menu) menu.classList.remove('active');
  _contextMenuTarget = null;
}

document.addEventListener('click', e => {
  if (!e.target.closest('.library-context')) closeContextMenu();
});

// ── Time formatting ────────────────────────────────────────────────────────

function formatTimeAgo(isoStr) {
  const d = new Date(isoStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return diffMin + 'm ago';
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return diffHr + 'h ago';
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return diffDay + 'd ago';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Library wiring (called from init) ──────────────────────────────────────

function wireLibrary() {
  const connectBtn = document.getElementById('libraryConnectBtn');
  if (connectBtn) {
    connectBtn.onclick = async () => {
      const handle = await promptForDirectory();
      if (handle) {
        document.getElementById('libraryConnectPrompt').style.display = 'none';
        refreshLibraryList();
      }
    };
  }

  const newBtn = document.getElementById('libraryNewBtn');
  const newInline = document.getElementById('libraryNewInline');
  const newInput = document.getElementById('libraryNewName');
  const newConfirm = document.getElementById('libraryNewConfirm');
  const newCancel = document.getElementById('libraryNewCancel');

  if (newBtn && newInline && newInput) {
    newBtn.onclick = () => {
      newBtn.style.display = 'none';
      newInline.style.display = 'flex';
      newInput.value = '';
      newInput.focus();
    };

    const doCreate = () => {
      const name = newInput.value.trim();
      if (!name) { newInput.focus(); return; }
      newInline.style.display = 'none';
      newBtn.style.display = '';
      createNewSchedule(name);
    };

    newConfirm.onclick = doCreate;
    newInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') doCreate();
      if (e.key === 'Escape') {
        newInline.style.display = 'none';
        newBtn.style.display = '';
      }
    });
    newCancel.onclick = () => {
      newInline.style.display = 'none';
      newBtn.style.display = '';
    };
  }
}
```

- [ ] **Step 4: Test library UI manually**

Open `index.html` in Chrome. Verify:
- Library view loads (may show connect prompt)
- "Choose Folder" opens directory picker
- "+ New Schedule" shows inline name input
- Creating a schedule transitions to editor
- Back button returns to library
- Context menu shows on right-click

- [ ] **Step 5: Commit**

```bash
git add js/library.js index.html css/style.css
git commit -m "feat: add schedule library home screen with list view and context menu"
```

---

### Task 3: Editor Toolbar Integration

**Files:**
- Modify: `index.html` (add back button, save dot, versions button to toolbar)
- Modify: `js/inspector.js:626-708` (update `wireToolbar` to add back button, Ctrl+S)
- Modify: `js/events.js:49-67` (add Ctrl+S handler)

This task wires the toolbar additions: back arrow, save indicator dot, Versions button, and Ctrl+S.

- [ ] **Step 1: Update toolbar HTML in index.html**

Replace the toolbar `<div>` (lines 12–35) with:
```html
  <!-- Toolbar -->
  <div class="toolbar">
    <div class="toolbar-left">
      <button class="tb-back" id="tbBack" title="Back to library">&larr;</button>
      <div class="tb-sep"></div>
      <div class="tb-brand">Schedule Builder</div>
      <div class="tb-sep"></div>
      <input type="text" class="tb-title" id="tbTitle" value="" placeholder="Schedule Title">
      <div class="save-dot" id="saveIndicator"></div>
      <div class="tb-sep"></div>
      <div class="day-tabs" id="dayTabs"></div>
    </div>
    <div class="toolbar-right">
      <button class="btn btn-primary" id="addEventBtn">+ Event</button>
      <button class="btn" id="addNoteBtn">+ Note</button>
      <button class="btn" id="addDayBtn">+ Day</button>
      <div class="tb-sep"></div>
      <button class="btn" id="versionsBtn">Versions</button>
      <div class="tb-overflow" id="overflowMenu">
        <button class="btn tb-overflow-btn" id="overflowBtn" title="More actions">&#x2026;</button>
        <div class="tb-overflow-dropdown" id="overflowDropdown">
          <button class="tb-overflow-item" id="settingsBtn">Settings</button>
          <button class="tb-overflow-item" id="printBtn">Print</button>
        </div>
      </div>
    </div>
  </div>
```

Note: "Save to File" and "Import File" overflow items are removed — saving is now automatic, and importing is replaced by the library.

- [ ] **Step 2: Wire back button and versions button in inspector.js**

In `js/inspector.js`, inside `wireToolbar()` (after the existing toolbar wiring, around line 695), add:
```javascript
  // Back to library
  const backBtn = document.getElementById('tbBack');
  if (backBtn) backBtn.onclick = () => returnToLibrary();

  // Versions panel
  const versionsBtn = document.getElementById('versionsBtn');
  if (versionsBtn) versionsBtn.onclick = () => openVersionPanel();
```

- [ ] **Step 3: Add Ctrl+S handler in events.js**

In `js/events.js`, inside the `keydown` listener (after the Ctrl+P block, around line 56), add:
```javascript
  // Cmd/Ctrl+S — save immediately
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    forceSave();
    return;
  }
```

- [ ] **Step 4: Hook auto-save into existing sessionSave calls**

In `js/persistence.js`, modify `sessionSave()` (line 39) to also trigger auto-save:
```javascript
function sessionSave() {
  clearTimeout(_sessionSaveTimer);
  _sessionSaveTimer = setTimeout(() => {
    try {
      sessionStorage.setItem('schedule_state', JSON.stringify(Store.getPersistedState()));
    } catch (e) { /* ignore quota errors */ }
  }, 500);
  // Trigger auto-save if connected
  if (typeof markDirty === 'function') markDirty();
}
```

- [ ] **Step 5: Test toolbar integration manually**

Open `index.html` in Chrome. Create a schedule, verify:
- Back arrow returns to library
- Amber dot appears after editing an event
- Dot clears after 2 seconds (auto-save)
- Ctrl+S saves immediately with toast "Saved"
- Versions button is visible (panel wiring comes in Task 4)

- [ ] **Step 6: Commit**

```bash
git add index.html js/inspector.js js/events.js js/persistence.js
git commit -m "feat: wire toolbar — back button, save indicator, Ctrl+S, versions button"
```

---

### Task 4: Version Panel UI

**Files:**
- Create: `js/versions.js`
- Modify: `index.html` (add script tag)
- Modify: `css/style.css` (version panel styles)

This task builds the version panel modal — creating named versions and restoring them.

- [ ] **Step 1: Add version panel styles to style.css**

Append before the `@media print` block:
```css
/* ══════════════════════════════════════════════════════════════
   VERSION PANEL
   ══════════════════════════════════════════════════════════════ */
.version-working {
  background: #f0f0f5;
  border-radius: 8px;
  padding: 12px 14px;
  border-left: 4px solid rgba(var(--app-accent), 1);
  margin-bottom: 16px;
}
.version-working-label { font-size: 10px; color: #86868b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
.version-working-title { font-size: 13px; font-weight: 600; color: #1d1d1f; }
.version-working-meta { font-size: 11px; color: #86868b; margin-top: 2px; }

.version-save-btn {
  display: block;
  width: 100%;
  padding: 8px;
  font-size: 12px;
  font-weight: 600;
  color: rgba(var(--app-accent), 1);
  background: none;
  border: 1.5px solid rgba(var(--app-accent), 1);
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 6px;
}
.version-save-btn:hover { background: rgba(var(--app-accent), 0.05); }
.version-save-hint { font-size: 10px; color: #aeaeb2; text-align: center; margin-bottom: 16px; }

.version-list-label { font-size: 10px; color: #86868b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
.version-item {
  background: #f0f0f5;
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2px;
}
.version-item-name { font-size: 12px; font-weight: 600; color: #1d1d1f; }
.version-item-meta { font-size: 10px; color: #86868b; margin-top: 2px; }
.version-restore-btn {
  font-size: 10px;
  color: rgba(var(--app-accent), 1);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  font-weight: 600;
}
.version-restore-btn:hover { text-decoration: underline; }
.version-empty { font-size: 13px; color: #aeaeb2; text-align: center; padding: 24px; }

.version-save-inline {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  align-items: center;
}
.version-save-input {
  flex: 1;
  padding: 6px 10px;
  font-size: 13px;
  border: 1px solid #d2d2d7;
  border-radius: 6px;
  outline: none;
}
.version-save-input:focus { border-color: rgba(var(--app-accent), 0.5); box-shadow: 0 0 0 2px rgba(var(--app-accent), 0.15); }
```

- [ ] **Step 2: Implement versions.js**

Create `js/versions.js`:
```javascript
/* ── versions.js ── Version panel UI ───────────────────────────────────────── */

let _versionSaveMode = false;

async function openVersionPanel() {
  _versionSaveMode = false;
  const overlay = document.getElementById('versionModal');
  if (!overlay) return;
  await renderVersionPanel(overlay.querySelector('.modal'));
  overlay.classList.add('active');
}

function closeVersionPanel() {
  document.getElementById('versionModal').classList.remove('active');
}

async function renderVersionPanel(modal) {
  const versions = await getVersions();
  const fileName = getCurrentFileName();

  let html = '<h2>Versions</h2>';

  // Working copy info
  html += '<div class="version-working">';
  html += '<div class="version-working-label">Working Copy</div>';
  html += '<div class="version-working-title">Current edits</div>';
  const lastSaved = _lastKnownSavedAt ? formatTimeAgo(_lastKnownSavedAt) : 'not yet saved';
  html += '<div class="version-working-meta">Auto-saved ' + esc(lastSaved) + '</div>';
  html += '</div>';

  // Save as version
  if (_versionSaveMode) {
    html += '<div class="version-save-inline">';
    html += '<input type="text" class="version-save-input" id="versionNameInput" placeholder="Version name (e.g., Draft for Review)">';
    html += '<button class="btn btn-primary" id="versionSaveConfirm" style="font-size:12px;">Save</button>';
    html += '<button class="btn" id="versionSaveCancel" style="font-size:12px;">Cancel</button>';
    html += '</div>';
  } else {
    html += '<button class="version-save-btn" id="versionSaveBtn">Save as Version\u2026</button>';
    html += '<div class="version-save-hint">Stamp the current state with a name</div>';
  }

  // Version list
  if (versions.length > 0) {
    html += '<div class="version-list-label">Saved Versions</div>';
    versions.forEach(v => {
      const time = v.savedAt ? new Date(v.savedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      const by = v.savedBy ? 'by ' + esc(v.savedBy) : '';
      html += '<div class="version-item" data-version-index="' + v.index + '">';
      html += '<div>';
      html += '<div class="version-item-name">' + esc(v.name) + '</div>';
      html += '<div class="version-item-meta">' + esc([time, by].filter(Boolean).join(' \u00b7 ')) + '</div>';
      html += '</div>';
      html += '<button class="version-restore-btn">Restore</button>';
      html += '</div>';
    });
  } else {
    html += '<div class="version-empty">No saved versions yet.</div>';
  }

  // Close
  html += '<div class="modal-actions"><button class="btn" id="versionCloseBtn">Close</button></div>';

  modal.innerHTML = html;
  wireVersionPanel(modal);
}

function wireVersionPanel(modal) {
  const closeBtn = modal.querySelector('#versionCloseBtn');
  if (closeBtn) closeBtn.onclick = () => closeVersionPanel();

  const saveBtn = modal.querySelector('#versionSaveBtn');
  if (saveBtn) {
    saveBtn.onclick = () => {
      _versionSaveMode = true;
      renderVersionPanel(modal);
    };
  }

  const nameInput = modal.querySelector('#versionNameInput');
  const confirmBtn = modal.querySelector('#versionSaveConfirm');
  const cancelBtn = modal.querySelector('#versionSaveCancel');

  if (nameInput) {
    setTimeout(() => nameInput.focus(), 50);

    const doSave = async () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); return; }
      const ok = await createVersion(name);
      if (ok) {
        toast('Version saved: ' + name);
        _versionSaveMode = false;
        renderVersionPanel(modal);
      } else {
        toast('Failed to save version.');
      }
    };

    if (confirmBtn) confirmBtn.onclick = doSave;
    nameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') doSave();
      if (e.key === 'Escape') {
        _versionSaveMode = false;
        renderVersionPanel(modal);
      }
    });
  }

  if (cancelBtn) {
    cancelBtn.onclick = () => {
      _versionSaveMode = false;
      renderVersionPanel(modal);
    };
  }

  // Restore buttons
  modal.querySelectorAll('.version-restore-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const item = btn.closest('.version-item');
      const index = parseInt(item.getAttribute('data-version-index'), 10);
      const ok = await restoreVersion(index);
      if (ok) {
        toast('Version restored');
        closeVersionPanel();
      } else {
        toast('Failed to restore version.');
      }
    });
  });
}

// Close version modal on backdrop click
document.addEventListener('click', e => {
  const overlay = document.getElementById('versionModal');
  if (overlay && e.target === overlay) closeVersionPanel();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('versionModal');
    if (overlay && overlay.classList.contains('active')) closeVersionPanel();
  }
});
```

- [ ] **Step 3: Add script tag in index.html**

After the `library.js` script tag, add:
```html
  <script src="js/versions.js"></script>
```

- [ ] **Step 4: Test version panel manually**

Open a schedule, click "Versions" button. Verify:
- Panel opens showing working copy info
- "Save as Version..." shows inline input
- Type a name, hit Enter — version appears in list
- Click "Restore" on a version — data loads, panel closes
- Undo buffer is preserved (the auto-backup version appears in the list on re-open)

- [ ] **Step 5: Commit**

```bash
git add js/versions.js index.html css/style.css
git commit -m "feat: add version panel — create named snapshots and restore with auto-backup"
```

---

### Task 5: Boot Flow & Migration

**Files:**
- Modify: `js/init.js` (replace entire file — new boot sequence)
- Modify: `index.html` (ensure script order is correct)

This task rewrites the initialization to support the library-first boot flow with migration from `scheduledata.js`.

- [ ] **Step 1: Rewrite init.js**

Replace the entire contents of `js/init.js`:
```javascript
/* ── init.js ── Application bootstrap ──────────────────────────────────────── */

(async function init() {
  wireToolbar();
  wireLibrary();

  // Check FSAPI support
  if (!hasFSAPI()) {
    const banner = document.getElementById('libraryFallbackBanner');
    if (banner) banner.style.display = 'block';
    // No directory access — try legacy load paths
    await legacyBoot();
    return;
  }

  // Try restoring saved directory handle
  let handle = null;
  try {
    handle = await restoreDirectoryHandle();
  } catch (e) {
    console.warn('Failed to restore directory handle:', e);
  }

  if (handle) {
    // Check for SAVED_STATE migration
    if (typeof SAVED_STATE !== 'undefined' && SAVED_STATE && SAVED_STATE.title) {
      await migrateSavedState(SAVED_STATE);
    }
    showLibrary();
    return;
  }

  // No handle — check if we have legacy data to migrate
  if (typeof SAVED_STATE !== 'undefined' && SAVED_STATE && SAVED_STATE.title) {
    // Load into Store so user can see their data while we prompt for folder
    Store.loadPersistedState(SAVED_STATE);
    const days = Store.getDays();
    if (days.length) Store.setActiveDay(days[0].id);
  } else if (sessionLoad()) {
    const days = Store.getDays();
    if (days.length && !Store.getActiveDay()) Store.setActiveDay(days[0].id);
  }

  // Show library with connect prompt
  const prompt = document.getElementById('libraryConnectPrompt');
  if (prompt) prompt.style.display = 'block';
  showLibrary();
})();

async function migrateSavedState(savedState) {
  // Check if already migrated (a file with this title exists)
  const files = await listScheduleFiles();
  const slug = scheduleNameToSlug(savedState.title || 'Imported Schedule');
  const fileName = slug + '.json';
  const alreadyExists = files.some(f => f.fileName === fileName);
  if (alreadyExists) return;

  const userName = getUserName() || 'Migration';
  const fileData = buildScheduleFile(
    savedState.title || 'Imported Schedule',
    savedState,
    [],
    userName
  );

  await writeScheduleFile(fileName, fileData);
  toast('Migrated "' + (savedState.title || 'schedule') + '" to library');
}

async function legacyBoot() {
  // FSAPI not available — fall back to old behavior
  if (typeof SAVED_STATE !== 'undefined' && SAVED_STATE && SAVED_STATE.title) {
    Store.loadPersistedState(SAVED_STATE);
  } else if (!sessionLoad()) {
    loadSampleData();
  }

  const days = Store.getDays();
  if (days.length && !Store.getActiveDay()) {
    Store.setActiveDay(days[0].id);
  }

  // wireToolbar() already called in init — just render
  renderActiveDay();
}

function loadSampleData() {
  Store.setTitle('April RSD');
  Store.setFooter({
    contact: '142d Fighter Wing \u00b7 Uniform: UOD \u00b7 Duty Day: 0700\u20131630',
    poc: 'TSgt Williams',
    updated: '10 Mar 2026',
  });

  const day = Store.addDay({
    date: '2026-03-15',
    startTime: '0700',
    endTime: '1630',
  });

  const d = day.id;

  Store.addEvent(d, { title: 'Formation', startTime: '0700', endTime: '0730', description: 'Accountability formation.', location: 'Bldg 200 Apron', poc: 'First Sergeant', groupId: 'grp_all', isMainEvent: true });
  Store.addEvent(d, { title: "Commander's Call", startTime: '0730', endTime: '0830', description: 'Wing CC addresses unit status.', location: 'Auditorium', poc: 'Wing Commander', groupId: 'grp_all', isMainEvent: true });
  Store.addEvent(d, { title: 'Safety Briefing', startTime: '0830', endTime: '0900', location: 'Auditorium', poc: 'Safety Office', groupId: 'grp_all' });
  Store.addEvent(d, { title: 'AFSC-Specific Training', startTime: '0900', endTime: '1100', description: 'Complete outstanding CBTs and certifications.', location: 'Respective Work Areas', poc: 'Flight Chiefs', groupId: 'grp_flight', isMainEvent: true });
  Store.addEvent(d, { title: 'Lunch', startTime: '1100', endTime: '1200', groupId: 'grp_all', isMainEvent: true, isBreak: true });
  Store.addEvent(d, { title: 'Ancillary / CBT Completion', startTime: '1200', endTime: '1400', description: 'Complete overdue ancillary training.', location: 'Computer Labs', poc: 'UTM', groupId: 'grp_all', isMainEvent: true });
  Store.addEvent(d, { title: 'End of Day Formation', startTime: '1600', endTime: '1630', description: 'Final accountability.', location: 'Bldg 200 Apron', poc: 'First Sergeant', groupId: 'grp_all', isMainEvent: true });

  Store.addNote(d, { category: 'Uniform', text: 'ABUs authorized for PT testing participants. UOD all others.' });
  Store.addNote(d, { category: 'Dining', text: 'DFAC open 1100\u20131230.' });
}
```

- [ ] **Step 2: Verify script order in index.html**

The final script order should be:
```html
  <script src="js/constants.js"></script>
  <!-- ... (in head) ... -->
  <script src="js/app-state.js"></script>
  <script src="js/utils.js"></script>
  <script src="js/ui-core.js"></script>
  <script src="js/schema.js"></script>
  <script src="js/data-helpers.js"></script>
  <script src="js/persistence.js"></script>
  <script src="js/storage.js"></script>
  <script src="js/library.js"></script>
  <script src="js/versions.js"></script>
  <script src="js/render.js"></script>
  <script src="js/print.js"></script>
  <script src="js/events.js"></script>
  <script src="js/inspector.js"></script>
  <script src="data/scheduledata.js"></script>
  <script src="js/init.js"></script>
```

- [ ] **Step 3: Test full boot flow**

Test each scenario:
1. **Fresh install (no data):** Should show library with connect prompt → pick folder → empty library with + button
2. **Has `scheduledata.js` with data:** Should show connect prompt → pick folder → migrate data → show in library
3. **Has directory handle from prior session:** Should show library with schedule list immediately
4. **Firefox/Safari:** Should fall back to legacy editor mode with fallback banner

- [ ] **Step 4: Commit**

```bash
git add js/init.js index.html
git commit -m "feat: rewrite boot flow — library-first with SAVED_STATE migration and FSAPI fallback"
```

---

### Task 6: CLAUDE.md & Project Structure Update

**Files:**
- Modify: `CLAUDE.md`

This task updates the project documentation to reflect the new architecture.

- [ ] **Step 1: Update CLAUDE.md**

Update the Project Structure section to include the new files:
```
├── js/
│   ├── constants.js        ← default groups, color palette, layout targets
│   ├── app-state.js        ← Store object + global state
│   ├── utils.js            ← generateId, esc, timeToMinutes, formatDuration
│   ├── ui-core.js          ← modal, toast, dropdown primitives
│   ├── schema.js           ← normalizeEvent, normalizeGroup, normalizeNote, normalizeDay
│   ├── data-helpers.js     ← eventsOverlap, classifyEvents, computeDuration
│   ├── persistence.js      ← session storage, undo/redo
│   ├── storage.js          ← FSAPI directory access, IndexedDB handle, auto-save, versions
│   ├── library.js          ← schedule library home screen, CRUD, context menu
│   ├── versions.js         ← version panel UI
│   ├── render.js           ← renderDay(), band HTML generation, concurrent row
│   ├── print.js            ← print layout engine, adaptive scaling
│   ├── events.js           ← click handlers, keyboard shortcuts
│   ├── inspector.js        ← inspector panel, settings modal, toolbar wiring
│   └── init.js             ← boot flow, migration, sample data (loads last)
```

Update the Script Load Order:
```
1. **Foundation:** constants.js → app-state.js (Store) → utils.js → ui-core.js
2. **Data layer:** schema.js → data-helpers.js → persistence.js → storage.js
3. **UI layer:** library.js → versions.js
4. **Rendering:** render.js → print.js
5. **Interaction:** events.js → inspector.js
6. **Data + Init:** data/scheduledata.js → init.js (must be last)
```

Update the Data Persistence section:
```
### Data Persistence
Schedule library with file-per-schedule JSON storage in `data/`. Uses File System Access API
`showDirectoryPicker()` to get read/write access to the `data/` folder. Directory handle is
persisted in IndexedDB across browser sessions. Auto-save (2-second debounce) writes after
every edit. Ctrl+S forces immediate save. sessionStorage runs underneath as crash recovery.

Fallback: browsers without FSAPI (Safari, Firefox) run in legacy mode with download-based
export. Named versions are embedded in each schedule's JSON file.

Three-tier loading priority on boot: IndexedDB directory handle → `data/scheduledata.js`
(legacy migration) → `sessionStorage` (crash recovery) → sample data.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for schedule library architecture"
```

---

### Task 7: Polish & Integration Testing

**Files:**
- Modify: `css/style.css` (print media query updates)
- Modify: `js/inspector.js` (title rename syncs filename)

This task handles remaining integration details and polish.

- [ ] **Step 1: Hide library view in print**

In `css/style.css`, update the `@media print` rule (around line 1107) to include:
```css
  .library-view, .library-context { display: none !important; }
```

- [ ] **Step 2: Sync title rename with filename**

In `js/inspector.js`, update the toolbar title input handler inside `wireToolbar()` (around line 680) to also update the schedule filename:
```javascript
  const tbTitle = document.getElementById('tbTitle');
  if (tbTitle) {
    tbTitle.value = Store.getTitle();
    tbTitle.addEventListener('input', () => {
      Store.setTitle(tbTitle.value.trim());
      renderActiveDay();
      sessionSave();
      // Update filename if we have directory access
      const oldFile = getCurrentFileName();
      if (oldFile && hasDirectoryAccess()) {
        const newSlug = scheduleNameToSlug(tbTitle.value.trim());
        const newFile = newSlug + '.json';
        if (newFile !== oldFile) {
          renameScheduleFile(oldFile, newFile).then(ok => {
            if (ok) setCurrentFile(newFile, _lastKnownSavedAt);
          });
        }
      }
    });
  }
```

- [ ] **Step 3: Disconnect indicator — clickable red dot**

In `js/storage.js`, add a click handler for the red dot. Add this near the bottom of the file:
```javascript
document.addEventListener('click', e => {
  if (e.target.id === 'saveIndicator' && e.target.classList.contains('save-disconnected')) {
    promptForDirectory().then(handle => {
      if (handle) {
        updateSaveIndicator('saved');
        toast('Reconnected');
      }
    });
  }
});
```

- [ ] **Step 4: Full integration test**

Test the complete flow end-to-end:
1. Open in Chrome → library loads
2. Connect data folder → empty library
3. Create "May Drill" → editor opens, auto-save creates file
4. Add days, events, notes → amber dot appears/disappears
5. Ctrl+S → "Saved" toast
6. Versions → "Save as Version" → "Draft" → version listed
7. Back to library → "May Drill" in list with correct metadata
8. Right-click → Duplicate → "May Drill (Copy)" appears
9. Open copy → data matches original
10. Back → right-click → Delete → confirm → removed
11. Close and reopen browser → library loads with saved schedules (no re-prompt)
12. Ctrl+P → print works from editor

- [ ] **Step 5: Commit**

```bash
git add css/style.css js/inspector.js js/storage.js
git commit -m "feat: polish — print hiding, title-to-filename sync, reconnect indicator"
```
