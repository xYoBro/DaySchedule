/* ── storage.js ── Contract ────────────────────────────────────────────────
 *
 * EXPORTS — Pure functions:
 *   scheduleNameToSlug(name) → string          — "May Drill" → "may-drill"
 *   buildScheduleFile(name, state, versions, savedBy) → ScheduleFile object
 *   parseScheduleMeta(fileData) → {name, dayCount, eventCount, noteCount, versionCount, lastSavedBy, lastSavedAt, createdAt}
 *
 * EXPORTS — Directory access:
 *   promptForDirectory()      → Promise<handle|null>  — opens picker, verifies folder, persists handle
 *   restoreDirectoryHandle()  → Promise<handle|null>  — loads from IndexedDB, checks permission
 *   getDirectoryHandle()      → handle|null
 *   hasDirectoryAccess()      → boolean
 *   hasFSAPI()                → boolean               — true if showDirectoryPicker exists
 *
 * EXPORTS — File I/O:
 *   listScheduleFiles()                → Promise<Array<meta>>  — scans data/ for .json files
 *   readScheduleFile(fileName)         → Promise<object|null>
 *   writeScheduleFile(fileName, data)  → Promise<boolean>      — aborts writable on error
 *   deleteScheduleFile(fileName)       → Promise<boolean>
 *   renameScheduleFile(old, new)       → Promise<boolean>      — warns on partial failure
 *
 * EXPORTS — Auto-save:
 *   markDirty()               — sets dirty flag, starts 2s debounce timer
 *   forceSave()               — clears debounce, saves immediately, toasts on success
 *   saveCurrentSchedule()     → Promise<boolean>  — reads file, detects stale data, writes
 *   setCurrentFile(name, ts)  — sets active file name and baseline timestamp
 *   getCurrentFileName()      → string|null
 *   isDirty()                 → boolean
 *   getLastSavedAt()          → string|null (ISO timestamp)
 *
 * EXPORTS — Save indicator:
 *   updateSaveIndicator(state) — state: 'dirty'|'saving'|'saved'|'disconnected'
 *
 * EXPORTS — Edit access / lock lease:
 *   getScheduleLockStatus(fileName)      → Promise<{state, lock}>
 *   syncCurrentScheduleAccess()          → Promise<{state, lock}> — refreshes current file mode
 *   claimCurrentScheduleLock()           → Promise<{ok, state, lock}>
 *   takeOverCurrentScheduleLock()        → Promise<{ok, state, lock}>
 *   releaseCurrentScheduleLock()         → Promise<boolean>
 *   isCurrentScheduleEditable()          → boolean
 *   getCurrentScheduleLock()             → object|null
 *
 * EXPORTS — User identity:
 *   getUserName()     → string
 *   setUserName(name)
 *   hasUserName()     → boolean
 *   ensureUserName()  → Promise<string> — prompts if missing
 *   promptUserName()  → Promise<string>  — shows modal, stores in localStorage
 *
 * EXPORTS — Versions:
 *   createVersion(name)          → Promise<boolean>
 *   restoreVersion(versionIndex) → Promise<boolean>  — auto-backs up current first
 *   getVersions()                → Promise<Array<{index, name, savedBy, savedAt}>>
 *   getRecentActivity()          → Promise<Array<{text, user, at}>>
 *
 * REQUIRES:
 *   app-state.js   — Store.getPersistedState(), Store.loadPersistedState()
 *   ui-core.js     — toast()
 *   utils.js       — esc()
 *   inspector.js   — renderActiveDay(), syncToolbarTitle() (called async from stale/restore)
 *   persistence.js — sessionSave() (called from saveCurrentSchedule on success)
 *
 * DOM ELEMENTS:
 *   #saveIndicator      — save status text span
 *   #staleWarningModal  — stale-data warning modal overlay
 *   #userNameModal      — user name prompt modal overlay
 *   #syncConfirmModal   — sync confirmation modal overlay
 *   #lockTakeoverModal  — lock takeover confirmation modal overlay
 *
 * CONSUMED BY:
 *   persistence.js — markDirty() (from sessionSave)
 *   library.js     — hasDirectoryAccess, listScheduleFiles, readScheduleFile, writeScheduleFile,
 *                    deleteScheduleFile, scheduleNameToSlug, buildScheduleFile, setCurrentFile,
 *                    saveCurrentSchedule, isDirty, promptForDirectory, hasUserName, promptUserName,
 *                    getUserName
 *   versions.js    — getVersions, createVersion, restoreVersion, getLastSavedAt
 *   inspector.js   — getCurrentFileName, hasDirectoryAccess, scheduleNameToSlug,
 *                    renameScheduleFile, setCurrentFile, getLastSavedAt
 *   events.js      — forceSave()
 *   init.js        — hasFSAPI, restoreDirectoryHandle, listScheduleFiles, scheduleNameToSlug,
 *                    buildScheduleFile, writeScheduleFile, getUserName
 *
 * SIDE EFFECTS:
 *   Registers global click listener on #saveIndicator for reconnect
 * ──────────────────────────────────────────────────────────────────────────── */

/* ── storage.js ── Directory handle persistence, file I/O, schedule envelope ── */

const STORAGE_DB_NAME = 'DayScheduleDB';
const STORAGE_DB_VERSION = 1;
const STORAGE_STORE_NAME = 'handles';
const STORAGE_HANDLE_KEY = 'dataDir';
const AUTOSAVE_DELAY = 2000;
const LOCK_LEASE_MS = 20 * 60 * 1000;
const LOCK_REFRESH_MS = 60 * 1000;
const LOCK_SESSION_KEY = 'dayschedule_lock_session';
const ACTIVITY_LIMIT = 25;

let _dirHandle = null;
let _autosaveTimer = null;
let _currentFileName = null;
let _lastKnownSavedAt = null;
let _dirty = false;
let _lockRefreshTimer = null;
let _currentScheduleLock = null;
let _editorReadOnly = true;
let _manualDraftExported = false;

// ── Slug generation ────────────────────────────────────────────────────────

function scheduleNameToSlug(name) {
  const slug = (name || '').trim().toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'schedule';
}

// ── Schedule file envelope ─────────────────────────────────────────────────

function buildActivityEntry(type, detail, user, at) {
  return {
    type: type || 'note',
    detail: detail || '',
    user: user || '',
    at: at || new Date().toISOString(),
  };
}

function ensureActivityLog(fileData) {
  if (!fileData.activity || !Array.isArray(fileData.activity)) fileData.activity = [];
  return fileData.activity;
}

function appendActivity(fileData, type, detail, user, at) {
  const activity = ensureActivityLog(fileData);
  activity.unshift(buildActivityEntry(type, detail, user, at));
  if (activity.length > ACTIVITY_LIMIT) activity.length = ACTIVITY_LIMIT;
  return activity;
}

function formatActivityText(entry) {
  const detail = entry && entry.detail ? entry.detail : '';
  switch (entry && entry.type) {
    case 'created':
      return 'Created schedule';
    case 'takeover':
      return 'Took over edit lock' + (detail ? ' from ' + detail : '');
    case 'version_saved':
      return 'Saved version "' + detail + '"';
    case 'version_restored':
      return 'Restored version "' + detail + '"';
    default:
      return detail || 'Updated schedule';
  }
}

function buildScheduleFile(name, storeState, versions, savedBy) {
  const now = new Date().toISOString();
  return {
    name: name,
    createdAt: now,
    lastSavedBy: savedBy || '',
    lastSavedAt: now,
    current: storeState,
    versions: versions || [],
    activity: savedBy ? [buildActivityEntry('created', '', savedBy, now)] : [],
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
      toast("Choose the shared DaySchedule 'app/data' folder.");
      return null;
    }
    // Confirm the user understands this must be the shared team folder
    const confirmed = await showSyncConfirmation();
    if (!confirmed) return null;

    _dirHandle = handle;
    await saveDirectoryHandle(handle);
    return handle;
  } catch (e) {
    if (e.name === 'AbortError') return null;
    console.warn('Directory picker failed:', e);
    return null;
  }
}

function showSyncConfirmation() {
  return new Promise(resolve => {
    const overlay = document.getElementById('syncConfirmModal');
    if (!overlay) { resolve(true); return; }
    overlay.classList.add('active');

    const confirmBtn = overlay.querySelector('#syncConfirmYes');
    const cancelBtn = overlay.querySelector('#syncConfirmNo');

    const cleanup = (result) => {
      overlay.classList.remove('active');
      overlay.removeEventListener('click', onBackdropClick);
      document.removeEventListener('keydown', onKeyDown, true);
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
      resolve(result);
    };

    const onBackdropClick = (e) => {
      if (e.target === overlay) cleanup(false);
    };
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      cleanup(false);
    };

    confirmBtn.onclick = () => cleanup(true);
    cancelBtn.onclick = () => cleanup(false);
    overlay.addEventListener('click', onBackdropClick);
    document.addEventListener('keydown', onKeyDown, true);
  });
}

function showLockTakeoverConfirmation(lock) {
  return new Promise(resolve => {
    const overlay = document.getElementById('lockTakeoverModal');
    if (!overlay || !lock) { resolve(false); return; }

    const ownerName = lock.ownerName || 'another editor';
    const content = overlay.querySelector('.modal');
    content.innerHTML = '<h2>Take over editing?</h2>'
      + '<p class="takeover-desc"><strong>' + esc(ownerName)
      + '</strong> has it until <strong>' + esc(formatLockExpiry(lock.expiresAt))
      + '</strong>.</p>'
      + '<div class="takeover-list">'
      + '<div class="takeover-item takeover-warn">If ' + esc(ownerName) + ' is still editing, recent work may be lost.</div>'
      + '</div>'
      + '<label class="takeover-check"><input type="checkbox" id="takeoverAcknowledge"> I confirmed they are done.</label>'
      + '<div class="modal-actions">'
      + '<button class="btn" id="takeoverCancelBtn">Cancel</button>'
      + '<button class="btn btn-danger" id="takeoverConfirmBtn" disabled>Take Over</button>'
      + '</div>';

    const acknowledge = content.querySelector('#takeoverAcknowledge');
    const confirmBtn = content.querySelector('#takeoverConfirmBtn');
    const cancelBtn = content.querySelector('#takeoverCancelBtn');

    const cleanup = (result) => {
      overlay.classList.remove('active');
      overlay.removeEventListener('click', onBackdropClick);
      document.removeEventListener('keydown', onKeyDown, true);
      acknowledge.onchange = null;
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
      resolve(result);
    };

    const onBackdropClick = (e) => {
      if (e.target === overlay) cleanup(false);
    };
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      cleanup(false);
    };

    acknowledge.onchange = () => {
      confirmBtn.disabled = !acknowledge.checked;
    };
    confirmBtn.onclick = () => cleanup(true);
    cancelBtn.onclick = () => cleanup(false);

    overlay.addEventListener('click', onBackdropClick);
    document.addEventListener('keydown', onKeyDown, true);
    overlay.classList.add('active');
  });
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

// ── Edit access / lease locks ───────────────────────────────────────────────

function isLockFileName(fileName) {
  return /\.lock\.json$/i.test(fileName || '');
}

function getLockFileName(fileName) {
  return (fileName || '').replace(/\.json$/i, '.lock.json');
}

function getLockSessionId() {
  try {
    let sessionId = sessionStorage.getItem(LOCK_SESSION_KEY);
    if (!sessionId) {
      sessionId = generateId('locksession');
      sessionStorage.setItem(LOCK_SESSION_KEY, sessionId);
    }
    return sessionId;
  } catch (e) {
    return 'locksession_fallback';
  }
}

function buildScheduleLock(fileName) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  return {
    scheduleFile: fileName,
    ownerName: getUserName() || 'Unknown editor',
    sessionId: getLockSessionId(),
    token: generateId('lock'),
    acquiredAt: nowIso,
    refreshedAt: nowIso,
    expiresAt: new Date(now + LOCK_LEASE_MS).toISOString(),
  };
}

function isScheduleLockExpired(lock) {
  if (!lock || !lock.expiresAt) return true;
  return Date.now() >= new Date(lock.expiresAt).getTime();
}

function isOwnScheduleLock(lock) {
  return !!lock && lock.sessionId === getLockSessionId();
}

function formatLockExpiry(expiresAt) {
  if (!expiresAt) return 'soon';
  return new Date(expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function getLostLockMessage(status) {
  if (status && status.state === 'locked' && status.lock) {
    return 'Edit lock was taken over by ' + (status.lock.ownerName || 'another editor') + '. Read-only now.';
  }
  return 'Edit lock is gone. Click Edit again.';
}

async function readScheduleLock(fileName) {
  if (!_dirHandle || !fileName) return null;
  const lock = await readScheduleFile(getLockFileName(fileName), { suppressErrors: true });
  if (!lock || lock.scheduleFile !== fileName) return null;
  return lock;
}

async function getScheduleLockStatus(fileName) {
  if (!fileName || !_dirHandle) return { state: 'available', lock: null };
  const lock = await readScheduleLock(fileName);
  if (!lock || isScheduleLockExpired(lock)) {
    return { state: 'available', lock: lock || null };
  }
  if (isOwnScheduleLock(lock)) {
    return { state: 'mine', lock };
  }
  return { state: 'locked', lock };
}

function stopLockRefreshTimer() {
  if (_lockRefreshTimer) {
    clearTimeout(_lockRefreshTimer);
    _lockRefreshTimer = null;
  }
}

function syncEditorChrome() {
  const editable = isCurrentScheduleEditable();
  document.body.classList.toggle('editor-readonly', !editable);

  [
    'addEventBtn',
    'addNoteBtn',
    'addDayBtn',
    'daySheetBtn',
    'customizeBtn',
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !editable;
  });

  const titleInput = document.getElementById('tbTitle');
  if (titleInput) titleInput.disabled = !editable;
}

function hasLocalDraftSession() {
  return !_currentFileName && (!!Store.getTitle() || Store.getDays().length > 0);
}

function updateEditorAccessBar(status) {
  const bar = document.getElementById('editorAccessBar');
  const textEl = document.getElementById('editorAccessText');
  const actionsEl = document.getElementById('editorAccessActions');
  if (!bar || !textEl || !actionsEl) return;

  let text = '';
  let actions = '';
  if (!_currentFileName) {
    if (!hasLocalDraftSession()) {
      bar.hidden = true;
      return;
    }
    text = '<span class="editor-access-mode">Local Draft</span>'
      + '<span class="editor-access-message">'
      + (_manualDraftExported
          ? 'Move <strong>scheduledata.js</strong> into shared <strong>app/data</strong> to sync it.'
          : 'Use <strong>Manual Export</strong> to save <strong>scheduledata.js</strong>.')
      + '</span>';
    actions = '<button class="btn btn-primary" id="editorManualExportBtn">'
      + (_manualDraftExported ? 'Export Again' : 'Manual Export')
      + '</button>';
    bar.className = 'editor-access-bar editor-access-local';
  } else if (status.state === 'mine' && status.lock) {
    text = '<span class="editor-access-mode">Editing</span>'
      + '<span class="editor-access-message">Editing as '
      + esc(status.lock.ownerName || getUserName() || 'You')
      + '. Wait for <strong>Saved</strong>.</span>';
    actions = '<button class="btn" id="editorReleaseBtn">Done Editing</button>';
    bar.className = 'editor-access-bar editor-access-editing';
  } else if (status.state === 'locked' && status.lock) {
    text = '<span class="editor-access-mode">Locked by '
      + esc(status.lock.ownerName || 'another editor')
      + '</span><span class="editor-access-message">Read-only until '
      + esc(formatLockExpiry(status.lock.expiresAt))
      + '.</span>';
    actions = '<button class="btn" id="editorRefreshLockBtn">Check Again</button>'
      + '<button class="btn btn-danger" id="editorTakeOverBtn">Take Over</button>';
    bar.className = 'editor-access-bar editor-access-readonly';
  } else {
    text = '<span class="editor-access-mode">Viewing</span>'
      + '<span class="editor-access-message">Read-only.</span>';
    actions = '<button class="btn btn-primary" id="editorClaimBtn">Edit</button>';
    bar.className = 'editor-access-bar editor-access-available';
  }

  textEl.textContent = '';
  textEl.innerHTML = text;
  actionsEl.innerHTML = actions;
  bar.hidden = false;

  const manualExportBtn = document.getElementById('editorManualExportBtn');
  if (manualExportBtn) {
    manualExportBtn.onclick = () => saveDataFile();
    return;
  }

  const claimBtn = document.getElementById('editorClaimBtn');
  if (claimBtn) {
    claimBtn.onclick = async () => {
      const result = await claimCurrentScheduleLock();
      if (!result.ok && result.state === 'locked' && result.lock) {
        toast((result.lock.ownerName || 'Another editor') + ' is editing right now.');
      }
    };
  }

  const refreshBtn = document.getElementById('editorRefreshLockBtn');
  if (refreshBtn) refreshBtn.onclick = () => syncCurrentScheduleAccess();

  const takeOverBtn = document.getElementById('editorTakeOverBtn');
  if (takeOverBtn) {
    takeOverBtn.onclick = async () => {
      await takeOverCurrentScheduleLock();
    };
  }

  const releaseBtn = document.getElementById('editorReleaseBtn');
  if (releaseBtn) {
    releaseBtn.onclick = async () => {
      if (isDirty()) {
        const saved = await saveCurrentSchedule();
        if (!saved) return;
      }
      await releaseCurrentScheduleLock();
      await syncCurrentScheduleAccess();
      renderInspector();
    };
  }
}

function applyCurrentScheduleAccess(status) {
  stopLockRefreshTimer();
  if (status.state === 'mine' && status.lock) {
    _currentScheduleLock = status.lock;
    _editorReadOnly = false;
    _lockRefreshTimer = setTimeout(() => refreshCurrentScheduleLock(), LOCK_REFRESH_MS);
  } else {
    _currentScheduleLock = null;
    _editorReadOnly = true;
  }
  syncEditorChrome();
  updateEditorAccessBar(status);
}

async function syncCurrentScheduleAccess() {
  if (!_currentFileName) {
    _currentScheduleLock = null;
    _editorReadOnly = true;
    stopLockRefreshTimer();
    syncEditorChrome();
    updateEditorAccessBar({ state: 'available', lock: null });
    return { state: 'available', lock: null };
  }
  const status = await getScheduleLockStatus(_currentFileName);
  applyCurrentScheduleAccess(status);
  return status;
}

async function claimCurrentScheduleLock(options) {
  if (!_currentFileName || !_dirHandle) return { ok: false, state: 'available', lock: null };
  const userName = await ensureUserName();
  if (!userName) return { ok: false, state: 'available', lock: null };
  const existingStatus = await getScheduleLockStatus(_currentFileName);
  if (existingStatus.state === 'mine' && existingStatus.lock) {
    applyCurrentScheduleAccess(existingStatus);
    return { ok: true, state: existingStatus.state, lock: existingStatus.lock };
  }
  if (existingStatus.state === 'locked' && (!options || !options.force)) {
    applyCurrentScheduleAccess(existingStatus);
    return { ok: false, state: existingStatus.state, lock: existingStatus.lock };
  }
  const nextLock = buildScheduleLock(_currentFileName);
  const wrote = await writeScheduleFile(getLockFileName(_currentFileName), nextLock);
  if (!wrote) {
    await syncCurrentScheduleAccess();
    return { ok: false, state: 'available', lock: null };
  }
  const confirmed = await readScheduleLock(_currentFileName);
  if (!confirmed || confirmed.token !== nextLock.token) {
    const raced = await getScheduleLockStatus(_currentFileName);
    applyCurrentScheduleAccess(raced);
    return { ok: false, state: raced.state, lock: raced.lock };
  }
  const status = { state: 'mine', lock: confirmed };
  applyCurrentScheduleAccess(status);
  renderActiveDay();
  renderInspector();
  if (!options || !options.silent) toast('Edit lock claimed');
  return { ok: true, state: status.state, lock: status.lock };
}

async function takeOverCurrentScheduleLock(options) {
  if (!_currentFileName || !_dirHandle) return { ok: false, state: 'available', lock: null };
  const userName = await ensureUserName();
  if (!userName) return { ok: false, state: 'available', lock: null };

  const status = await getScheduleLockStatus(_currentFileName);
  if (status.state === 'available' || !status.lock) {
    return claimCurrentScheduleLock(options);
  }
  if (status.state === 'mine') {
    applyCurrentScheduleAccess(status);
    return { ok: true, state: status.state, lock: status.lock };
  }

  const confirmed = options && options.confirmed ? true : await showLockTakeoverConfirmation(status.lock);
  if (!confirmed) {
    applyCurrentScheduleAccess(status);
    return { ok: false, state: status.state, lock: status.lock };
  }

  const result = await claimCurrentScheduleLock({ force: true, silent: true });
  if (result.ok) {
    const fileData = await readScheduleFile(_currentFileName);
    if (fileData) {
      const now = new Date().toISOString();
      appendActivity(fileData, 'takeover', status.lock.ownerName || 'another editor', userName, now);
      fileData.lastSavedBy = userName;
      fileData.lastSavedAt = now;
      const wrote = await writeScheduleFile(_currentFileName, fileData);
      if (wrote) {
        _lastKnownSavedAt = now;
        const memFileData = getCurrentScheduleFileData();
        if (memFileData) {
          memFileData.lastSavedAt = now;
          memFileData.lastSavedBy = userName;
          memFileData.activity = fileData.activity;
        }
      }
    }
  }
  if (result.ok && (!options || !options.silent)) {
    toast('Edit lock taken over from ' + (status.lock.ownerName || 'another editor'));
  }
  return result;
}

async function ensureCurrentScheduleLockOwnership() {
  if (!isCurrentScheduleEditable()) return false;
  if (!_currentFileName || !_dirHandle || !_currentScheduleLock) return false;

  const lock = await readScheduleLock(_currentFileName);
  if (lock && lock.token === _currentScheduleLock.token && isOwnScheduleLock(lock) && !isScheduleLockExpired(lock)) {
    return true;
  }

  const status = await getScheduleLockStatus(_currentFileName);
  applyCurrentScheduleAccess(status);
  if (typeof closeDayEventSheetModal === 'function') closeDayEventSheetModal();
  if (typeof renderInspector === 'function') renderInspector();
  updateSaveIndicator(_dirty ? 'dirty' : 'saved');
  toast(getLostLockMessage(status));
  return false;
}

async function refreshCurrentScheduleLock() {
  if (!_currentFileName || !_currentScheduleLock || !_dirHandle) return false;
  const current = await readScheduleLock(_currentFileName);
  if (!current || current.token !== _currentScheduleLock.token || !isOwnScheduleLock(current)) {
    const status = await getScheduleLockStatus(_currentFileName);
    applyCurrentScheduleAccess(status);
    if (typeof closeDayEventSheetModal === 'function') closeDayEventSheetModal();
    renderInspector();
    toast(getLostLockMessage(status));
    return false;
  }
  current.refreshedAt = new Date().toISOString();
  current.expiresAt = new Date(Date.now() + LOCK_LEASE_MS).toISOString();
  const ok = await writeScheduleFile(getLockFileName(_currentFileName), current);
  if (!ok) {
    const status = await getScheduleLockStatus(_currentFileName);
    applyCurrentScheduleAccess(status);
    if (typeof closeDayEventSheetModal === 'function') closeDayEventSheetModal();
    renderInspector();
    toast('Could not refresh the edit lock. Read-only now.');
    return false;
  }
  _currentScheduleLock = current;
  _lockRefreshTimer = setTimeout(() => refreshCurrentScheduleLock(), LOCK_REFRESH_MS);
  updateEditorAccessBar({ state: 'mine', lock: current });
  return true;
}

async function releaseCurrentScheduleLock() {
  stopLockRefreshTimer();
  if (!_currentFileName || !_dirHandle || !_currentScheduleLock) {
    _currentScheduleLock = null;
    _editorReadOnly = true;
    syncEditorChrome();
    return true;
  }
  const fileName = _currentFileName;
  const current = await readScheduleLock(fileName);
  let ok = true;
  if (current && current.token === _currentScheduleLock.token && isOwnScheduleLock(current)) {
    ok = await deleteScheduleFile(getLockFileName(fileName));
  }
  _currentScheduleLock = null;
  _editorReadOnly = true;
  syncEditorChrome();
  const bar = document.getElementById('editorAccessBar');
  if (bar && fileName !== _currentFileName) bar.hidden = true;
  return ok;
}

function isCurrentScheduleEditable() {
  if (!_currentFileName) return true;
  return !_editorReadOnly;
}

function getCurrentScheduleLock() {
  return _currentScheduleLock;
}

// ── File I/O ───────────────────────────────────────────────────────────────

async function listScheduleFiles() {
  if (!_dirHandle) return [];
  const files = [];
  for await (const [name, entry] of _dirHandle.entries()) {
    if (entry.kind !== 'file' || !name.endsWith('.json') || isLockFileName(name)) continue;
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

async function readScheduleFile(fileName, options) {
  if (!_dirHandle) return null;
  try {
    const fileHandle = await _dirHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text);
  } catch (e) {
    if (!options || !options.suppressErrors) {
      console.warn('Failed to read schedule:', fileName, e);
    }
    return null;
  }
}

async function writeScheduleFile(fileName, data) {
  if (!_dirHandle) return false;
  try {
    const fileHandle = await _dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();
    } catch (writeErr) {
      try { await writable.abort(); } catch (abortErr) { /* ignore abort errors */ }
      throw writeErr;
    }
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
  const existingTarget = await readScheduleFile(newName, { suppressErrors: true });
  if (existingTarget) {
    toast('A schedule with that name already exists.');
    return false;
  }
  const data = await readScheduleFile(oldName);
  if (!data) return false;
  const wrote = await writeScheduleFile(newName, data);
  if (!wrote) return false;
  const deleted = await deleteScheduleFile(oldName);
  if (!deleted) {
    console.warn('Rename partial failure: new file written but old file remains:', oldName);
  }
  const oldLockFile = getLockFileName(oldName);
  const newLockFile = getLockFileName(newName);
  const lockData = await readScheduleFile(oldLockFile, { suppressErrors: true });
  if (lockData) {
    lockData.scheduleFile = newName;
    const wroteLock = await writeScheduleFile(newLockFile, lockData);
    if (wroteLock) {
      await deleteScheduleFile(oldLockFile);
      if (_currentScheduleLock && _currentScheduleLock.token === lockData.token) {
        _currentScheduleLock = lockData;
      }
    }
  }
  return deleted;
}

// ── Auto-save engine ───────────────────────────────────────────────────────

function markDirty() {
  if (!isCurrentScheduleEditable()) return;
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
  if (!isCurrentScheduleEditable()) return false;
  if (!_currentFileName || !_dirHandle) return false;
  const userName = await ensureUserName();
  if (!userName) return false;
  const ownsLock = await ensureCurrentScheduleLockOwnership();
  if (!ownsLock) return false;
  updateSaveIndicator('saving');

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
  if (existing) fileData.name = state.title != null ? state.title : fileData.name;
  ensureActivityLog(fileData);

  // Sync theme from in-memory state (set by Appearance tab)
  const memFileData = getCurrentScheduleFileData();
  if (memFileData && memFileData.theme) {
    fileData.theme = memFileData.theme;
  }

  const ok = await writeScheduleFile(_currentFileName, fileData);
  if (ok) {
    _dirty = false;
    _lastKnownSavedAt = now;
    // Keep in-memory reference in sync with what was written
    if (memFileData) {
      memFileData.lastSavedAt = now;
      memFileData.lastSavedBy = userName;
      memFileData.activity = fileData.activity;
    }
    updateSaveIndicator('saved');
    sessionSave({ skipDirty: true });
  } else {
    updateSaveIndicator('dirty');
  }
  return ok;
}

function forceSave() {
  if (!isCurrentScheduleEditable()) { toast('Read-only. Click Edit.'); return; }
  clearTimeout(_autosaveTimer);
  saveCurrentSchedule().then(ok => {
    if (ok) toast('Saved');
  });
}

function setCurrentFile(fileName, lastSavedAt) {
  _currentFileName = fileName;
  _lastKnownSavedAt = lastSavedAt || null;
  _dirty = false;
  _manualDraftExported = false;
  if (!fileName) {
    _currentScheduleLock = null;
    _editorReadOnly = true;
    stopLockRefreshTimer();
    const bar = document.getElementById('editorAccessBar');
    if (bar) bar.hidden = true;
  }
  updateSaveIndicator('saved');
}

function getCurrentFileName() {
  return _currentFileName;
}

function isDirty() {
  return _dirty;
}

function getLastSavedAt() {
  return _lastKnownSavedAt;
}

function notifyManualDraftExport() {
  _manualDraftExported = true;
  if (hasLocalDraftSession()) updateEditorAccessBar({ state: 'available', lock: null });
}

// ── Save indicator ─────────────────────────────────────────────────────────

let _savedFadeTimer = null;

function updateSaveIndicator(state) {
  const el = document.getElementById('saveIndicator');
  if (!el) return;
  clearTimeout(_savedFadeTimer);
  el.className = 'save-status';

  if (state === 'dirty') {
    el.textContent = 'Unsaved';
    el.classList.add('save-dirty');
  } else if (state === 'saving') {
    el.textContent = 'Saving\u2026';
    el.classList.add('save-saving');
  } else if (state === 'disconnected') {
    el.textContent = 'Not connected';
    el.classList.add('save-disconnected');
  } else {
    el.textContent = 'Saved';
    el.classList.add('save-saved');
    // Fade out after 3 seconds so it doesn't clutter when everything is fine
    _savedFadeTimer = setTimeout(() => {
      el.classList.add('save-faded');
    }, 3000);
  }
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
    + '<button class="btn" id="staleLoadBtn">Load Latest</button>'
    + '<button class="btn btn-primary" id="staleOverwriteBtn">Keep Mine</button>'
    + '</div>';

  overlay.classList.add('active');

  content.querySelector('#staleLoadBtn').onclick = () => {
    overlay.classList.remove('active');
    Store.loadPersistedState(otherData.current);
    if (typeof setCurrentScheduleFileData === 'function') {
      setCurrentScheduleFileData(JSON.parse(JSON.stringify(otherData)));
    }
    const days = Store.getDays();
    if (!days.find(day => day.id === Store.getActiveDay())) {
      Store.setActiveDay(days[0] ? days[0].id : null);
    }
    _lastKnownSavedAt = otherData.lastSavedAt;
    _dirty = false;
    updateSaveIndicator('saved');
    renderActiveDay();
    syncToolbarTitle();
    renderInspector();
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

async function ensureUserName() {
  if (hasUserName()) return getUserName();
  return promptUserName();
}

function promptUserName() {
  return new Promise(resolve => {
    const overlay = document.getElementById('userNameModal');
    if (!overlay) { resolve(''); return; }
    const content = overlay.querySelector('.modal');
  content.innerHTML = '<h2>Welcome</h2>'
      + '<p style="margin:12px 0;font-size:14px;color:#48484a;">Enter the name your team will recognize.</p>'
      + '<input type="text" id="userNameInput" placeholder="e.g., SrA Martinez" style="width:100%;padding:8px 12px;font-size:14px;border:1px solid #d2d2d7;border-radius:6px;">'
      + '<div class="modal-actions">'
      + '<button class="btn btn-primary" id="userNameDone">Continue</button>'
      + '</div>';

    overlay.classList.add('active');
    const input = content.querySelector('#userNameInput');
    setTimeout(() => input.focus(), 50);

    const cleanup = (result) => {
      overlay.classList.remove('active');
      overlay.removeEventListener('click', onBackdropClick);
      document.removeEventListener('keydown', onKeyDown, true);
      doneBtn.onclick = null;
      input.removeEventListener('keydown', onInputKeyDown);
      resolve(result);
    };

    const done = () => {
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      setUserName(name);
      cleanup(name);
    };

    const onBackdropClick = (e) => {
      if (e.target === overlay) cleanup('');
    };
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      cleanup('');
    };
    const onInputKeyDown = (e) => {
      if (e.key === 'Enter') done();
    };

    const doneBtn = content.querySelector('#userNameDone');
    doneBtn.onclick = done;
    input.addEventListener('keydown', onInputKeyDown);
    overlay.addEventListener('click', onBackdropClick);
    document.addEventListener('keydown', onKeyDown, true);
  });
}

// ── Version management ─────────────────────────────────────────────────────

async function createVersion(versionName) {
  if (!isCurrentScheduleEditable()) return false;
  if (!_currentFileName || !_dirHandle) return false;
  const userName = await ensureUserName();
  if (!userName) return false;
  const ownsLock = await ensureCurrentScheduleLockOwnership();
  if (!ownsLock) return false;
  const fileData = await readScheduleFile(_currentFileName);
  if (!fileData) return false;

  const now = new Date().toISOString();
  const currentState = JSON.parse(JSON.stringify(Store.getPersistedState()));
  const version = {
    name: versionName,
    savedBy: userName,
    savedAt: now,
    data: JSON.parse(JSON.stringify(currentState)),
  };
  if (!fileData.versions) fileData.versions = [];
  fileData.versions.unshift(version);
  appendActivity(fileData, 'version_saved', versionName, userName, now);

  fileData.current = currentState;
  fileData.lastSavedBy = userName;
  fileData.lastSavedAt = now;

  const ok = await writeScheduleFile(_currentFileName, fileData);
  if (ok) {
    _dirty = false;
    _lastKnownSavedAt = fileData.lastSavedAt;
    const memFileData = getCurrentScheduleFileData();
    if (memFileData) {
      memFileData.lastSavedAt = fileData.lastSavedAt;
      memFileData.lastSavedBy = fileData.lastSavedBy;
      memFileData.activity = fileData.activity;
      memFileData.versions = fileData.versions;
    }
    updateSaveIndicator('saved');
    sessionSave({ skipDirty: true });
  }
  return ok;
}

async function restoreVersion(versionIndex) {
  if (!isCurrentScheduleEditable()) return false;
  if (!_currentFileName || !_dirHandle) return false;
  const userName = await ensureUserName();
  if (!userName) return false;
  const ownsLock = await ensureCurrentScheduleLockOwnership();
  if (!ownsLock) return false;
  const fileData = await readScheduleFile(_currentFileName);
  if (!fileData || !fileData.versions || !fileData.versions[versionIndex]) return false;

  // Save reference before mutating the array
  const target = fileData.versions[versionIndex];
  const currentState = JSON.parse(JSON.stringify(Store.getPersistedState()));

  const backup = {
    name: 'Auto-backup before restore, ' + new Date().toLocaleString(),
    savedBy: userName,
    savedAt: new Date().toISOString(),
    data: currentState,
  };
  fileData.versions.unshift(backup);

  fileData.current = JSON.parse(JSON.stringify(target.data));
  fileData.lastSavedBy = userName;
  fileData.lastSavedAt = new Date().toISOString();
  appendActivity(fileData, 'version_restored', target.name, userName, fileData.lastSavedAt);

  const ok = await writeScheduleFile(_currentFileName, fileData);
  if (ok) {
    Store.loadPersistedState(fileData.current);
    const days = Store.getDays();
    if (!days.find(day => day.id === Store.getActiveDay())) {
      Store.setActiveDay(days[0] ? days[0].id : null);
    }
    _lastKnownSavedAt = fileData.lastSavedAt;
    _dirty = false;
    const memFileData = getCurrentScheduleFileData();
    if (memFileData) {
      memFileData.lastSavedAt = fileData.lastSavedAt;
      memFileData.lastSavedBy = fileData.lastSavedBy;
      memFileData.activity = fileData.activity;
      memFileData.versions = fileData.versions;
    }
    updateSaveIndicator('saved');
    renderActiveDay();
    syncToolbarTitle();
    renderInspector();
    sessionSave({ skipDirty: true });
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

async function getRecentActivity() {
  if (!_currentFileName || !_dirHandle) return [];
  const fileData = await readScheduleFile(_currentFileName);
  if (!fileData) return [];
  return (fileData.activity || []).slice(0, 5).map(entry => ({
    text: formatActivityText(entry),
    user: entry.user || '',
    at: entry.at || '',
  }));
}

// ── Reconnect indicator ────────────────────────────────────────────────────

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

window.addEventListener('pagehide', () => {
  if (_currentScheduleLock && _currentFileName) releaseCurrentScheduleLock();
});
