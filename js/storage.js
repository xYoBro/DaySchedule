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
      } catch (e) { /* not found */ }
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
    sessionSave();
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

  const backup = {
    name: 'Auto-backup before restore, ' + new Date().toLocaleString(),
    savedBy: getUserName(),
    savedAt: new Date().toISOString(),
    data: JSON.parse(JSON.stringify(fileData.current)),
  };
  fileData.versions.unshift(backup);

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
