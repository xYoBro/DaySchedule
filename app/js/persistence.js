/* ── persistence.js ── Contract ────────────────────────────────────────────
 *
 * EXPORTS:
 *   saveUndoState()    — push current Store snapshot to undo stack (debounced 800ms)
 *   undo()             — pop undo stack, push to redo, render
 *   redo()             — pop redo stack, push to undo, render
 *   sessionSave(options?) — marks edits; debounces complete tab + IndexedDB recovery (500ms)
 *   sessionLoad()      → boolean — restores selected complete recovery, preserving unsaved status
 *   saveDataFile()     → Promise<boolean> — legacy FSAPI single-file save or download fallback
 *   importDataFile()   — opens file picker, parses JS/JSON, loads into Store
 *   buildScheduleWorkbookContent(fileData?) — serializes a .schedule workbook JSON file
 *   parseScheduleWorkbookContent(text, fileName?) — parses .schedule/JSON/legacy JS wrappers
 *   clearScheduleWorkbookTarget() — detach workbook handle + data (must run before Start fresh)
 *   openScheduleWorkbookFromHandle(handle) → Promise<boolean> — reopen remembered file (Continue card)
 *   adoptScheduleWorkbookHandle(handle) → Promise<boolean> — reconcile recovery with latest file before attachment
 *
 * REQUIRES:
 *   app-state.js — Store.snapshot(), Store.restore(), Store.getPersistedState(),
 *                  Store.loadPersistedState(), Store.setActiveDay()
 *   ui-core.js   — toast()
 *   inspector.js — renderActiveDay(), syncToolbarTitle() (called from undo/redo/import)
 *   storage.js   — markDirty() (called from sessionSave, checked with typeof guard)
 *   schema.js    — normalizeDay(), normalizeGroup() (called from importDataFile)
 *
 * CONSUMED BY:
 *   inspector.js — saveUndoState() before every mutation, sessionSave() after every mutation
 *   events.js    — undo(), redo() on keyboard shortcuts
 *   storage.js   — sessionSave() called from saveCurrentSchedule on success
 *   init.js      — sessionLoad() during boot
 * ──────────────────────────────────────────────────────────────────────────── */

let _fileHandle = null;
let _scheduleWorkbookHandle = null;
let _openedWorkbookFileName = '';
let _scheduleWorkbookData = null;
let _saveInProgress = false;
let _workbookSavePromise = null;
let _workbookGeneration = 0;
let _workbookOpenRequest = 0;
let _workbookId = null;
let _workbookBaseline = null;
let _savedEditSequence = 0;
let _recoveryLoaded = false;
let _recoveryWriteQueue = Promise.resolve();
let _recoveryGeneration = 0;
let _recoveryUnavailableNotified = false;
const RECOVERY_FORMAT_VERSION = 1;
let _undoStack = [];
let _redoStack = [];
const UNDO_MAX = 30;
const SCHEDULE_WORKBOOK_FILE_TYPE = 'dayschedule';
// Version 3 protects explicit event placement from being silently dropped by
// older apps. Version 1/2 workbooks keep their original inferred placement.
const SCHEDULE_WORKBOOK_SCHEMA_VERSION = 3;
const SCHEDULE_WORKBOOK_DEFAULT_FILENAME = 'DaySchedule.schedule';

let _undoSaveTimer = null;
let _undoPending = false;

function saveUndoState() {
  if (_redoStack.length) _redoStack.length = 0;
  // Debounce: only capture one snapshot per burst of rapid edits
  if (!_undoPending) {
    _undoStack.push(captureUndoState());
    if (_undoStack.length > UNDO_MAX) _undoStack.shift();
    if (_redoStack.length) _redoStack.length = 0;
    _undoPending = true;
  }
  clearTimeout(_undoSaveTimer);
  _undoSaveTimer = setTimeout(() => { _undoPending = false; }, 800);
}

function clearUndoHistory() {
  _undoStack = [];
  _redoStack = [];
  _undoPending = false;
  clearTimeout(_undoSaveTimer);
  _undoSaveTimer = null;
}

function undo() {
  // Read-only viewers must not mutate the Store: markDirty() no-ops for them,
  // so an undone state would never save yet silently becomes the state a
  // later "Edit + save" writes over the file.
  if (typeof isCurrentScheduleEditable === 'function' && !isCurrentScheduleEditable()) {
    toast('Read-only. Click Edit.');
    return;
  }
  if (!_undoStack.length) return;
  finishUndoGroup();
  _redoStack.push(captureUndoState());
  restoreUndoState(_undoStack.pop());
  renderActiveDay();
  syncToolbarTitle();
  renderInspector();
  sessionSave();
  toast('Undo');
}

function redo() {
  if (typeof isCurrentScheduleEditable === 'function' && !isCurrentScheduleEditable()) {
    toast('Read-only. Click Edit.');
    return;
  }
  if (!_redoStack.length) return;
  finishUndoGroup();
  _undoStack.push(captureUndoState());
  restoreUndoState(_redoStack.pop());
  renderActiveDay();
  syncToolbarTitle();
  renderInspector();
  sessionSave();
  toast('Redo');
}

function captureUndoState() {
  const snapshot = Store.snapshot();
  const fileData = typeof getCurrentScheduleFileData === 'function' ? getCurrentScheduleFileData() : null;
  snapshot.theme = fileData && fileData.theme ? cloneScheduleData(fileData.theme) : null;
  return snapshot;
}

function restoreUndoState(snapshot) {
  Store.restore(snapshot);
  const fileData = typeof getCurrentScheduleFileData === 'function' ? getCurrentScheduleFileData() : null;
  if (fileData && Object.prototype.hasOwnProperty.call(snapshot, 'theme')) fileData.theme = snapshot.theme;
}

function finishUndoGroup() {
  clearTimeout(_undoSaveTimer);
  _undoSaveTimer = null;
  _undoPending = false;
}

let _sessionSaveTimer = null;
function buildSerializableState() {
  const state = Store.getPersistedState();
  state.activeDay = Store.getActiveDay();
  if (typeof getCurrentScheduleFileData === 'function') {
    const fileData = getCurrentScheduleFileData();
    if (fileData && fileData.theme) state.theme = fileData.theme;
    // Identity travels with the draft so a restored session can be matched
    // back to its envelope (id, versions, activity) instead of re-deriving
    // an id from the title and minting a duplicate.
    if (fileData && fileData.id) state.workbookScheduleId = fileData.id;
  }
  // Lets the Continue card verify a session draft belongs to the remembered
  // .schedule file before reattaching its handle.
  if (_scheduleWorkbookHandle && _scheduleWorkbookHandle.name) {
    state.workbookFileName = _scheduleWorkbookHandle.name;
  }
  return state;
}

// A complete document snapshot for versions; editor selection is included so
// restoring a checkpoint also returns to the day that was being reviewed.
function buildVersionState() {
  const state = cloneScheduleData(Store.getPersistedState());
  state.activeDay = Store.getActiveDay();
  const fileData = getCurrentScheduleFileData();
  state.theme = typeof getScheduleTheme === 'function'
    ? cloneScheduleData(getScheduleTheme(fileData && fileData.theme))
    : cloneScheduleData(fileData && fileData.theme || { skin: 'bands', palette: 'classic' });
  if (fileData?.theme?.bands) state.theme.bands = getBandSettings(fileData.theme);
  return state;
}

function loadVersionState(state) {
  Store.loadPersistedState(state);
  const fileData = getCurrentScheduleFileData();
  if (fileData && state.theme) fileData.theme = cloneScheduleData(state.theme);
}

// This checksum detects accidental file changes; it is not a security hash.
// Length plus two independent 32-bit accumulators avoids storing a second
// entire workbook (including every logo and version) in recovery metadata.
function fingerprintWorkbookContent(text) {
  let a = 2166136261;
  let b = 5381;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 16777619);
    b = Math.imul(b, 33) ^ code;
  }
  return text.length + ':' + (a >>> 0).toString(16) + ':' + (b >>> 0).toString(16);
}

function buildRecoveryRecord() {
  const workbook = getScheduleWorkbookSnapshot();
  return {
    recoveryFormat: RECOVERY_FORMAT_VERSION,
    backupId: generateId('recovery'),
    updatedAt: new Date().toISOString(),
    workbook,
    workbookFileName: getScheduleWorkbookFileName() || (_workbookBaseline && _workbookBaseline.fileName) || '',
    baseline: _workbookBaseline,
    dirty: isDirty(),
    revision: _editSequence,
    savedRevision: _savedEditSequence,
    sourceMode: getCurrentFileName() ? 'directory' : 'workbook',
    sourceFileName: getCurrentFileName() || '',
  };
}

function recoveryState(record) {
  if (!record) return null;
  if (record.recoveryFormat !== undefined) {
    if (record.recoveryFormat !== RECOVERY_FORMAT_VERSION || !record.workbook) return null;
    const parsed = parseScheduleWorkbookContent(JSON.stringify(record.workbook));
    return { ...parsed.state, workbookFileName: record.workbookFileName || '', recovery: record };
  }
  return Array.isArray(record.days) ? record : null;
}

function queueRecoveryWrite(record) {
  const generation = _recoveryGeneration;
  _recoveryWriteQueue = _recoveryWriteQueue.catch(e => console.warn('Recovery queue failed:', e)).then(async () => {
    if (generation !== _recoveryGeneration) return false;
    return typeof writeRecoveryRecord === 'function' ? writeRecoveryRecord(record) : false;
  });
  return _recoveryWriteQueue;
}

async function flushSessionBackup() {
  clearTimeout(_sessionSaveTimer);
  _sessionSaveTimer = null;
  if (!Store.getTitle() && !Store.getDays().length && !_scheduleWorkbookData) return false;
  const record = buildRecoveryRecord();
  _lastRecoveryRecord = record;
  let sessionOk = false;
  try {
    sessionStorage.setItem('schedule_state', JSON.stringify(record));
    sessionOk = true;
  } catch (e) {
    try { sessionStorage.removeItem('schedule_state'); } catch (inner) { console.warn('Could not remove stale recovery:', inner); }
    console.warn('Tab recovery unavailable:', e);
  }
  const durableOk = await queueRecoveryWrite(record);
  if (!durableOk && !_recoveryUnavailableNotified) {
    _recoveryUnavailableNotified = true;
    toast(sessionOk
      ? 'Recovery is available only in this tab. Save your workbook before closing it; this browser blocked durable local storage.'
      : 'Local recovery is unavailable. Save your workbook now; this browser could not back up your changes.', 9000);
  }
  if (durableOk) _recoveryUnavailableNotified = false;
  return sessionOk || durableOk;
}

async function restoreDurableRecovery() {
  const durable = typeof readRecoveryRecord === 'function' ? await readRecoveryRecord() : null;
  let session = null;
  try { session = JSON.parse(sessionStorage.getItem('schedule_state') || 'null'); }
  catch (e) {
    console.warn('Unreadable tab recovery:', e);
    try {
      const raw = sessionStorage.getItem('schedule_state');
      if (raw && typeof recoveryTransaction === 'function') {
        await recoveryTransaction('readwrite', store => store.put({ raw, savedAt: new Date().toISOString() }, 'unreadableTabRecovery'));
      }
    } catch (storageError) { console.warn('Could not preserve unreadable tab recovery:', storageError); }
  }
  let sessionValid = false;
  try { sessionValid = !!recoveryState(session); } catch (e) { console.warn('Unreadable session workbook:', e); }
  // Even two tabs with the same workbook ID can have divergent unsaved
  // histories. A valid tab-local copy is authoritative for that tab.
  const candidate = sessionValid ? session : (durable || session);
  if (!candidate) return false;
  let valid = false;
  try { valid = !!recoveryState(candidate); } catch (e) { console.warn('Unsupported recovery contents:', e); }
  if (!valid) {
    _unsupportedRecovery = true;
    toast('A recovery copy uses an unsupported format. It has been kept locally; reopen it with the app version that created it.', 9000);
    return false;
  }
  // A blocked sessionStorage must not prevent IndexedDB recovery.
  _pendingDurableRecovery = candidate;
  return true;
}

let _pendingDurableRecovery = null;
let _lastRecoveryRecord = null;

function getRecoveryDraftRecord() {
  if (_pendingDurableRecovery || _lastRecoveryRecord) return _pendingDurableRecovery || _lastRecoveryRecord;
  try { return JSON.parse(sessionStorage.getItem('schedule_state') || 'null'); } catch (e) { return null; }
}

// Bumped on every real edit (not on post-save bookkeeping). Lets a save that
// was in flight tell whether edits landed after it built its content.
let _editSequence = 0;
function getEditSequence() {
  return _editSequence;
}

function sessionSave(options) {
  clearTimeout(_sessionSaveTimer);
  if (!options || !options.skipDirty) {
    _editSequence++;
    if (typeof markDirty === 'function') markDirty();
  }
  _sessionSaveTimer = setTimeout(() => flushSessionBackup(), 500);
}

// Invalidating queued writes before deleting prevents a slow backup from
// resurrecting a document after the user has successfully left the editor.
function discardSessionDraft() {
  const record = getRecoveryDraftRecord();
  const backupId = record && record.backupId;
  clearTimeout(_sessionSaveTimer);
  _sessionSaveTimer = null;
  _pendingDurableRecovery = null;
  _lastRecoveryRecord = null;
  _recoveryGeneration++;
  try { sessionStorage.removeItem('schedule_state'); } catch (e) { console.warn('Could not discard tab recovery:', e); }
  _recoveryWriteQueue = _recoveryWriteQueue.catch(e => console.warn('Recovery write failed:', e)).then(() =>
    typeof deleteRecoveryRecord === 'function' ? deleteRecoveryRecord(backupId) : false);
  return _recoveryWriteQueue;
}

window.addEventListener('pagehide', () => {
  if (_sessionSaveTimer) flushSessionBackup();
});

function sessionLoad() {
  try {
    let parsed = _pendingDurableRecovery;
    if (!parsed) parsed = JSON.parse(sessionStorage.getItem('schedule_state') || 'null');
    const state = recoveryState(parsed);
    if (!state) return false;
    clearScheduleWorkbookTarget();
    _recoveryLoaded = true;
    setCurrentFile(null, null);
    if (parsed.recoveryFormat === RECOVERY_FORMAT_VERSION) {
      const workbook = parseScheduleWorkbookContent(JSON.stringify(parsed.workbook));
      _scheduleWorkbookData = workbook.workbookData;
      _workbookId = _scheduleWorkbookData.workbookId || generateId('workbook');
      _workbookBaseline = parsed.baseline || null;
      _editSequence = Number.isSafeInteger(parsed.revision) ? parsed.revision : 0;
      _savedEditSequence = Number.isSafeInteger(parsed.savedRevision) ? parsed.savedRevision : 0;
      Store.loadPersistedState(workbook.state);
      setCurrentScheduleFileData(workbook.fileData);
      // A clean recovery without a committed file baseline (e.g. a download)
      // must remain recoverable until the user explicitly saves or leaves it.
      _dirty = parsed.dirty !== false || !_workbookBaseline;
    } else {
      Store.loadPersistedState(normalizePersistedState(state));
      const fileData = { name: Store.getTitle() || 'Local Draft', current: Store.getPersistedState(), versions: [], activity: [] };
      if (state.theme) fileData.theme = state.theme;
      const draftId = typeof state.workbookScheduleId === 'string' ? sanitizeEntityRef(state.workbookScheduleId) : '';
      if (draftId) fileData.id = draftId;
      setCurrentScheduleFileData(fileData);
      _workbookBaseline = state.workbookFileName ? { fileName: state.workbookFileName, fingerprint: null } : null;
      _dirty = true; // Older recovery records never established save status.
    }
    if (_dirty) markDirty();
    else updateSaveIndicator('saved');
    _lastRecoveryRecord = parsed;
    _pendingDurableRecovery = null;
    return true;
  } catch (e) {
    console.warn('Could not restore the local recovery copy:', e);
    toast('The local recovery copy could not be opened. It has been kept; use Open .schedule to open a saved workbook.', 9000);
    return false;
  }
}

function cloneScheduleData(value) {
  return JSON.parse(JSON.stringify(value));
}

function getScheduleEnvelopeId(envelope) {
  const source = envelope || {};
  const name = source.name || (source.current && source.current.title) || Store.getTitle() || 'Schedule';
  const base = typeof scheduleNameToSlug === 'function'
    ? scheduleNameToSlug(name)
    : String(name || 'Schedule').trim().replace(/\s+/g, '-').toLowerCase();
  return source.id || base || 'schedule';
}

function buildScheduleWorkbookEnvelope(fileData) {
  const currentFileData = typeof getCurrentScheduleFileData === 'function' ? getCurrentScheduleFileData() : null;
  const source = fileData || currentFileData;
  const isCurrentSource = !fileData || fileData === currentFileData;
  const state = isCurrentSource
    ? buildSerializableState()
    : (fileData && fileData.current ? cloneScheduleData(fileData.current) : buildSerializableState());
  if (!state.activeDay) state.activeDay = Store.getActiveDay();
  if (!state.theme && source && source.theme) state.theme = source.theme;
  const title = state && state.title ? state.title : (Store.getTitle() || 'Untitled Schedule');
  const envelope = source && source.current
    ? cloneScheduleData(source)
    : {
        name: title,
        createdAt: new Date().toISOString(),
        lastSavedBy: '',
        lastSavedAt: new Date().toISOString(),
        current: state,
        versions: [],
        activity: [],
      };
  envelope.name = title;
  envelope.current = state;
  if (!Array.isArray(envelope.versions)) envelope.versions = [];
  if (!Array.isArray(envelope.activity)) envelope.activity = [];
  if (state && state.theme && !envelope.theme) envelope.theme = state.theme;
  envelope.id = getScheduleEnvelopeId(envelope);
  return envelope;
}

function buildScheduleWorkbookObject(fileData) {
  const envelope = buildScheduleWorkbookEnvelope(fileData);
  const existing = _scheduleWorkbookData && typeof _scheduleWorkbookData === 'object'
    ? cloneScheduleData(_scheduleWorkbookData)
    : null;
  const schedules = existing && Array.isArray(existing.schedules)
    ? existing.schedules.map(item => cloneScheduleData(item))
    : [];
  const activeId = envelope.id;
  const matchIndex = schedules.findIndex(item => getScheduleEnvelopeId(item) === activeId);
  if (matchIndex >= 0) {
    schedules[matchIndex] = envelope;
  } else {
    schedules.push(envelope);
  }
  return {
    ...(existing || {}),
    workbookId: _workbookId || (_workbookId = (existing && existing.workbookId) || generateId('workbook')),
    fileType: SCHEDULE_WORKBOOK_FILE_TYPE,
    schemaVersion: SCHEDULE_WORKBOOK_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    activeScheduleId: activeId,
    schedules,
    schedule: envelope,
  };
}

function hasScheduleWorkbookHandle() {
  return !!_scheduleWorkbookHandle;
}

function getScheduleWorkbookFileName() {
  return _scheduleWorkbookHandle && _scheduleWorkbookHandle.name ? _scheduleWorkbookHandle.name : _openedWorkbookFileName;
}

// Detach the current workbook file. Must run before "Start fresh" — otherwise
// the new workbook inherits the previous file's handle and the next save
// silently overwrites that file.
function clearScheduleWorkbookTarget() {
  _scheduleWorkbookHandle = null;
  _openedWorkbookFileName = '';
  _scheduleWorkbookData = null;
  _workbookId = null;
  _workbookBaseline = null;
  _savedEditSequence = 0;
  _recoveryLoaded = false;
  _workbookGeneration++;
  _workbookOpenRequest++;
  clearTimeout(_autosaveTimer);
}

async function ensureWorkbookHandlePermission(handle, silent) {
  if (!handle) return false;
  if (typeof handle.queryPermission !== 'function') return true;
  try {
    let perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm === 'prompt' && !silent && typeof handle.requestPermission === 'function') {
      perm = await handle.requestPermission({ mode: 'readwrite' });
    }
    return perm === 'granted';
  } catch (e) {
    return false;
  }
}

const FIRST_SAVE_NOTE_KEY = 'dayschedule_first_save_noted';
function showFirstSaveNoteOnce(fileName, downloaded) {
  try {
    if (localStorage.getItem(FIRST_SAVE_NOTE_KEY) === '1') return false;
    localStorage.setItem(FIRST_SAVE_NOTE_KEY, '1');
  } catch (e) {
    return false;
  }
  if (downloaded) {
    // No remembered handle exists on this path, so "reopen from the start
    // screen" would be a promise the app can't keep.
    toast('Downloaded ' + fileName + '. DaySchedule does not upload your workbook. Next time, use Open .schedule to open the newest copy from your Downloads folder.', 8000);
  } else {
    toast('Saved ' + fileName + '. DaySchedule does not upload your workbook. Your folder’s sync service may copy it. Reopen it from the start screen anytime.', 8000);
  }
  return true;
}

// Revoking the blob URL synchronously after click() can abort the download in
// Safari/Firefox — the only save path those browsers have. Keep the URL alive
// long enough for the download to start.
function triggerDownload(blob, fileName) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

// Reopen a remembered workbook file without a picker (Continue card path).
// The caller's click is the user gesture the permission prompt needs.
async function openScheduleWorkbookFromHandle(handle) {
  const generation = _workbookGeneration;
  const request = ++_workbookOpenRequest;
  const currentRequest = () => generation === _workbookGeneration && request === _workbookOpenRequest;
  if (!handle || typeof handle.getFile !== 'function') return false;
  const granted = await ensureWorkbookHandlePermission(handle, false);
  if (!currentRequest()) return false;
  if (!granted) {
    toast('Permission was declined — use Open .schedule to pick the file instead.', 4500);
    return false;
  }
  let file;
  try {
    file = await handle.getFile();
  } catch (err) {
    if (!currentRequest()) return false;
    if (typeof clearWorkbookFileRecord === 'function') clearWorkbookFileRecord();
    toast('Couldn’t find ' + (handle.name || 'the workbook file') + ' — it may have been moved or renamed. Use Open .schedule to find it.', 5500);
    return false;
  }
  try {
    const content = await file.text();
    if (!currentRequest()) return false;
    const parsed = parseScheduleWorkbookContent(content, file.name || handle.name);
    _scheduleWorkbookHandle = handle;
    _workbookBaseline = { fileName: handle.name, fingerprint: fingerprintWorkbookContent(content) };
    _scheduleWorkbookData = parsed.workbookData || buildStandaloneScheduleWorkbookObject(parsed.fileData);
    loadParsedScheduleData(parsed);
    if (!showScheduleImportNotice(parsed)) toast('Opened ' + (file.name || handle.name || 'workbook'));
    return true;
  } catch (err) {
    toast('Couldn’t open ' + (handle.name || 'the workbook file') + ': ' + err.message, 5500);
    return false;
  }
}

// Compare recovery to the exact file revision it came from. A clean draft
// must yield to a later handoff; conflicting unsaved work is never overwritten.
async function adoptScheduleWorkbookHandle(handle) {
  const generation = _workbookGeneration;
  if (!handle || typeof handle.createWritable !== 'function') return false;
  if (!await ensureWorkbookHandlePermission(handle, false)) { markDirty(); return false; }
  let parsed;
  let content;
  try {
    const file = await handle.getFile();
    content = await file.text();
    parsed = parseScheduleWorkbookContent(content, file.name || handle.name);
  } catch (err) {
    if (typeof clearWorkbookFileRecord === 'function') await clearWorkbookFileRecord();
    markDirty();
    return false;
  }
  if (generation !== _workbookGeneration) return false;
  const latest = parsed.workbookData || buildStandaloneScheduleWorkbookObject(parsed.fileData);
  const changed = !_workbookBaseline || _workbookBaseline.fingerprint !== fingerprintWorkbookContent(content);
  if (!isDirty()) {
    loadParsedScheduleData(parsed);
  } else if (changed) {
    if (!await reviewWorkbookConflict(latest) || generation !== _workbookGeneration) return false;
    keepBothWorkbookCopies(latest);
  }
  _scheduleWorkbookHandle = handle;
  _workbookBaseline = { fileName: handle.name || '', fingerprint: fingerprintWorkbookContent(content) };
  _workbookId = (_scheduleWorkbookData && _scheduleWorkbookData.workbookId) || latest.workbookId || generateId('workbook');
  if (isDirty()) markDirty();
  sessionSave({ skipDirty: true });
  return true;
}

function reviewWorkbookConflict(latest) {
  return new Promise(resolve => {
    const overlay = document.getElementById('staleWarningModal');
    if (!overlay) { resolve(false); return; }
    const content = overlay.querySelector('.modal');
    const names = (latest.schedules || []).map(item => item.name || 'Untitled schedule');
    content.innerHTML = '<h2>Review changed workbook</h2>'
      + '<p>The file changed since this copy was saved. Your local changes are still safe. Keep both adds your schedules as recovered copies alongside the latest file schedules.</p>'
      + '<p><strong>Latest file:</strong> ' + esc(names.join(', ')) + '</p>'
      + '<p><strong>Your copy:</strong> ' + esc(getScheduleWorkbookEntries().map(item => item.name).join(', ')) + '</p>'
      + '<div class="modal-actions"><button class="btn" id="recoveryCancelBtn">Cancel</button>'
      + '<button class="btn btn-primary" id="recoveryKeepBothBtn">Keep Both</button></div>';
    let finished = false;
    const finish = answer => {
      if (finished) return;
      finished = true;
      overlay.removeEventListener('modalclose', onClosed);
      overlay.removeEventListener('click', backdrop);
      document.removeEventListener('keydown', escape, true);
      closeModal('staleWarningModal');
      resolve(answer);
    };
    const onClosed = () => finish(false);
    overlay.addEventListener('modalclose', onClosed);
    const backdrop = event => { if (event.target === overlay) finish(false); };
    const escape = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false); }
    };
    content.querySelector('#recoveryCancelBtn').onclick = () => finish(false);
    content.querySelector('#recoveryKeepBothBtn').onclick = () => finish(true);
    overlay.addEventListener('click', backdrop);
    document.addEventListener('keydown', escape, true);
    openModal('staleWarningModal');
  });
}

function keepBothWorkbookCopies(latest) {
  const local = getScheduleWorkbookSnapshot();
  const merged = cloneScheduleData(latest);
  if (!Array.isArray(merged.schedules)) merged.schedules = [];
  let active = null;
  local.schedules.forEach(source => {
    const recovered = cloneScheduleData(source);
    recovered.name = (source.name || 'Schedule') + ' (Recovered)';
    recovered.current.title = recovered.name;
    recovered.id = getUniqueWorkbookScheduleId(recovered.name, merged.schedules);
    merged.schedules.push(recovered);
    if (source.id === local.activeScheduleId) active = recovered;
  });
  if (Array.isArray(local.archivedSchedules)) {
    merged.archivedSchedules = (merged.archivedSchedules || []).concat(cloneScheduleData(local.archivedSchedules));
  }
  active = active || merged.schedules[merged.schedules.length - 1];
  merged.activeScheduleId = active.id;
  merged.schedule = cloneScheduleData(active);
  _scheduleWorkbookData = merged;
  _workbookId = merged.workbookId || generateId('workbook');
  loadWorkbookScheduleEnvelope(active);
  toast('Both copies are preserved. Review the recovered schedules before removing duplicates.', 7000);
}

// Plain-English, no trailing period (callers add their own punctuation).
function friendlyFileError(err) {
  if (err && err.name === 'SyntaxError') return 'it isn’t a valid .schedule file';
  const message = err && err.message ? String(err.message) : 'unexpected error';
  return message
    .replace(/SAVED_STATE/g, 'the file')
    .replace(/— no days array found\.?/, '— it has no days')
    .replace(/[.\s]+$/, '');
}

function getScheduleWorkbookSnapshot(options) {
  const opts = options || {};
  let workbook = _scheduleWorkbookData && typeof _scheduleWorkbookData === 'object'
    ? cloneScheduleData(_scheduleWorkbookData)
    : null;

  if (!workbook || !Array.isArray(workbook.schedules)) {
    workbook = buildStandaloneScheduleWorkbookObject(
      typeof getCurrentScheduleFileData === 'function' ? getCurrentScheduleFileData() : null
    );
  }

  if (opts.includeCurrent !== false && (Store.getTitle() || Store.getDays().length)) {
    const envelope = buildScheduleWorkbookEnvelope(
      typeof getCurrentScheduleFileData === 'function' ? getCurrentScheduleFileData() : null
    );
    const activeId = getScheduleEnvelopeId(envelope);
    const schedules = Array.isArray(workbook.schedules)
      ? workbook.schedules.map(item => cloneScheduleData(item))
      : [];
    const index = schedules.findIndex(item => getScheduleEnvelopeId(item) === activeId);
    if (index >= 0) schedules[index] = envelope;
    else schedules.push(envelope);
    workbook.schedules = schedules;
    workbook.activeScheduleId = activeId;
    workbook.schedule = envelope;
  }

  workbook.schemaVersion = SCHEDULE_WORKBOOK_SCHEMA_VERSION;
  return workbook;
}

function summarizeWorkbookSchedule(envelope, index, activeId) {
  const payload = extractSchedulePayload(envelope);
  const state = payload.state || {};
  const days = Array.isArray(state.days) ? state.days : [];
  let eventCount = 0;
  let noteCount = 0;
  days.forEach(day => {
    eventCount += Array.isArray(day.events) ? day.events.length : 0;
    noteCount += Array.isArray(day.notes) ? day.notes.length : 0;
  });
  const id = getScheduleEnvelopeId(envelope);
  return {
    id,
    index,
    name: envelope.name || state.title || 'Untitled Schedule',
    dayCount: days.length,
    eventCount,
    noteCount,
    lastSavedAt: envelope.lastSavedAt || '',
    active: id === activeId,
  };
}

function getScheduleWorkbookEntries() {
  const workbook = getScheduleWorkbookSnapshot({ includeCurrent: true });
  const schedules = Array.isArray(workbook.schedules) ? workbook.schedules : [];
  const activeId = workbook.activeScheduleId || (workbook.schedule && getScheduleEnvelopeId(workbook.schedule));
  return schedules.map((item, index) => summarizeWorkbookSchedule(item, index, activeId));
}

function getUniqueWorkbookScheduleId(name, schedules) {
  const base = typeof scheduleNameToSlug === 'function'
    ? scheduleNameToSlug(name)
    : String(name || 'Schedule').trim().replace(/\s+/g, '-').toLowerCase();
  const used = new Set((schedules || []).map(item => getScheduleEnvelopeId(item)));
  let candidate = base || 'schedule';
  let counter = 2;
  while (used.has(candidate)) {
    candidate = (base || 'schedule') + '-' + counter;
    counter++;
  }
  return candidate;
}

function buildNewWorkbookScheduleEnvelope(name, options) {
  const opts = options || {};
  const title = (name || '').trim() || 'New Schedule';
  const currentState = Store.getPersistedState();
  const state = opts.duplicate
    ? cloneScheduleData(currentState)
    : {
        title,
        days: [],
        groups: cloneScheduleData(currentState.groups || []),
        logo: currentState.logo || null,
        footer: cloneScheduleData(currentState.footer || { contact: '', poc: '', updated: '' }),
      };
  state.title = title;
  const now = new Date().toISOString();
  const currentFileData = typeof getCurrentScheduleFileData === 'function' ? getCurrentScheduleFileData() : null;
  const envelope = {
    name: title,
    createdAt: now,
    lastSavedBy: typeof getUserName === 'function' ? getUserName() : '',
    lastSavedAt: now,
    current: state,
    versions: [],
    activity: [],
  };
  if (opts.duplicate && currentFileData) {
    if (currentFileData.theme) envelope.theme = cloneScheduleData(currentFileData.theme);
  } else if (currentFileData && currentFileData.theme) {
    envelope.theme = cloneScheduleData(currentFileData.theme);
  }
  if (opts.duplicate) applyDuplicateOptions(envelope.current, opts);
  return envelope;
}

function calendarDateValue(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = new Date(value + 'T00:00:00.000Z');
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date.getTime() : null;
}

function applyDuplicateOptions(state, options) {
  const days = state.days || [];
  if (options.firstDate) {
    const target = calendarDateValue(options.firstDate);
    const dates = days.map(day => calendarDateValue(day.date));
    if (target === null || !dates.length || dates.some(value => value === null)) {
      throw new Error('Give every source day a valid date before duplicating onto new dates.');
    }
    const offset = target - Math.min(...dates);
    days.forEach((day, index) => {
      const shifted = new Date(dates[index] + offset);
      if (shifted.getUTCFullYear() < 1 || shifted.getUTCFullYear() > 9999) throw new Error('The new dates are outside the supported calendar range.');
      day.date = shifted.toISOString().slice(0, 10);
    });
  }
  if (options.clearContacts) state.footer = { contact: '', poc: '', updated: '' };
  days.forEach(day => {
    if (options.clearNotes) day.notes = [];
    (day.events || []).forEach(event => {
      if (options.clearContacts) {
        event.poc = '';
        (event.flightActivities || []).forEach(activity => { activity.poc = ''; });
      }
      if (options.clearPeople) event.attendees = '';
    });
  });
}

function previewWorkbookDuplicate(name, options) {
  const envelope = buildNewWorkbookScheduleEnvelope(name, { ...options, duplicate: true });
  const source = Store.getDays();
  return {
    name: envelope.name,
    days: envelope.current.days.map((day, index) => ({ from: source[index].date || '', to: day.date || '' })),
  };
}

function loadWorkbookScheduleEnvelope(envelope, options) {
  const opts = options || {};
  const payload = extractSchedulePayload(envelope);
  const state = normalizePersistedState(payload.state || {}, { requireDays: false });
  const fileData = payload.fileData ? cloneScheduleData(payload.fileData) : {
    name: state.title || 'Untitled Schedule',
    current: state,
    versions: [],
    activity: [],
  };
  fileData.current = state;
  fileData.id = getScheduleEnvelopeId(fileData);
  if (!Array.isArray(fileData.versions)) fileData.versions = [];
  if (!Array.isArray(fileData.activity)) fileData.activity = [];

  if (typeof clearUndoHistory === 'function') clearUndoHistory();
  Store.reset();
  Store.loadPersistedState(state);
  if (typeof setCurrentScheduleFileData === 'function') setCurrentScheduleFileData(fileData);
  if (typeof syncToolbarTitle === 'function') syncToolbarTitle();
  if (typeof renderActiveDay === 'function') renderActiveDay();
  if (typeof renderInspector === 'function') renderInspector();
  if (typeof renderWorkbookSwitcher === 'function') renderWorkbookSwitcher();
  sessionSave(opts.skipDirty ? { skipDirty: true } : undefined);
}

function switchScheduleInWorkbook(scheduleId) {
  const workbook = getScheduleWorkbookSnapshot({ includeCurrent: true });
  const schedules = Array.isArray(workbook.schedules) ? workbook.schedules : [];
  const target = schedules.find(item => getScheduleEnvelopeId(item) === scheduleId);
  if (!target) return false;
  workbook.activeScheduleId = getScheduleEnvelopeId(target);
  workbook.schedule = cloneScheduleData(target);
  workbook.savedAt = new Date().toISOString();
  _scheduleWorkbookData = workbook;
  loadWorkbookScheduleEnvelope(target);
  toast('Opened ' + (target.name || 'schedule'));
  return true;
}

function createScheduleInWorkbook(name, options) {
  if (!isCurrentScheduleEditable()) return false;
  const workbook = getScheduleWorkbookSnapshot({ includeCurrent: true });
  if (!Array.isArray(workbook.schedules)) workbook.schedules = [];
  const envelope = buildNewWorkbookScheduleEnvelope(name, options);
  envelope.id = getUniqueWorkbookScheduleId(envelope.name, workbook.schedules);
  workbook.schedules.push(envelope);
  workbook.activeScheduleId = envelope.id;
  workbook.schedule = cloneScheduleData(envelope);
  workbook.savedAt = new Date().toISOString();
  _scheduleWorkbookData = workbook;
  loadWorkbookScheduleEnvelope(envelope);
  toast('Created ' + envelope.name);
  return envelope.id;
}

function archiveWorkbookSchedule(scheduleId) {
  if (!isCurrentScheduleEditable()) return false;
  const workbook = getScheduleWorkbookSnapshot();
  if (workbook.schedules.length < 2) {
    toast('Keep at least one schedule in the workbook. Create a blank schedule before archiving this one.');
    return false;
  }
  const index = workbook.schedules.findIndex(item => item.id === scheduleId);
  if (index < 0) return false;
  const removed = workbook.schedules.splice(index, 1)[0];
  removed.archivedAt = new Date().toISOString();
  if (!Array.isArray(workbook.archivedSchedules)) workbook.archivedSchedules = [];
  workbook.archivedSchedules.push(removed);
  _scheduleWorkbookData = workbook;
  if (workbook.activeScheduleId === scheduleId) {
    const next = workbook.schedules[Math.min(index, workbook.schedules.length - 1)];
    workbook.activeScheduleId = next.id;
    workbook.schedule = cloneScheduleData(next);
    loadWorkbookScheduleEnvelope(next);
  } else {
    sessionSave();
    if (typeof renderWorkbookSwitcher === 'function') renderWorkbookSwitcher();
  }
  toast('Archived ' + removed.name + '. Restore it from Archived schedules.');
  return true;
}

function getArchivedWorkbookSchedules() {
  const workbook = getScheduleWorkbookSnapshot();
  return (workbook.archivedSchedules || []).map((item, index) => ({ index, name: item.name || 'Schedule', archivedAt: item.archivedAt || '' }));
}

function restoreArchivedWorkbookSchedule(index) {
  if (!isCurrentScheduleEditable()) return false;
  const workbook = getScheduleWorkbookSnapshot();
  if (!Array.isArray(workbook.archivedSchedules) || !workbook.archivedSchedules[index]) return false;
  const restored = workbook.archivedSchedules.splice(index, 1)[0];
  if (workbook.schedules.some(item => item.id === restored.id)) restored.id = getUniqueWorkbookScheduleId(restored.name, workbook.schedules);
  delete restored.archivedAt;
  workbook.schedules.push(restored);
  workbook.activeScheduleId = restored.id;
  workbook.schedule = cloneScheduleData(restored);
  _scheduleWorkbookData = workbook;
  loadWorkbookScheduleEnvelope(restored);
  toast('Restored ' + restored.name);
  return true;
}

function buildStandaloneScheduleWorkbookObject(fileData) {
  const prior = _scheduleWorkbookData;
  _scheduleWorkbookData = null;
  const workbook = buildScheduleWorkbookObject(fileData);
  _scheduleWorkbookData = prior;
  return workbook;
}

function buildScheduleWorkbookContent(fileData) {
  return JSON.stringify(buildScheduleWorkbookObject(fileData), null, 2) + '\n';
}

function getScheduleWorkbookSuggestedName() {
  const fileData = typeof getCurrentScheduleFileData === 'function' ? getCurrentScheduleFileData() : null;
  const title = (fileData && (fileData.name || (fileData.current && fileData.current.title)))
    || Store.getTitle()
    || 'DaySchedule';
  const base = typeof scheduleNameToSlug === 'function'
    ? scheduleNameToSlug(title)
    : String(title || 'DaySchedule').trim().replace(/\s+/g, '-').toLowerCase();
  return (base || 'dayschedule') + '.schedule';
}

async function saveScheduleWorkbookFile(options) {
  const generation = _workbookGeneration;
  // Callers awaiting Save need the latest revision, not a false success from
  // an earlier snapshot. Serialize and take a fresh snapshot after the wait.
  while (_workbookSavePromise) {
    await _workbookSavePromise;
    if (generation !== _workbookGeneration) return false;
  }
  if (_saveInProgress) return false;
  _saveInProgress = true;
  _workbookSavePromise = performWorkbookSave(options || {}, generation);
  try {
    return await _workbookSavePromise;
  } finally {
    _saveInProgress = false;
    _workbookSavePromise = null;
  }
}

async function performWorkbookSave(opts, generation) {
  const suggestedName = opts.suggestedName || getScheduleWorkbookSuggestedName();
  let handle = opts.downloadOnly || opts.reuseHandle === false ? null : _scheduleWorkbookHandle;
  let writable = null;
  try {
    if (window.showSaveFilePicker && !opts.downloadOnly) {
      if (handle && !await ensureWorkbookHandlePermission(handle, opts.silent)) {
        if (opts.requireHandle || generation !== _workbookGeneration) return false;
        handle = null;
        _scheduleWorkbookHandle = null;
        await clearWorkbookFileRecord();
        if (generation !== _workbookGeneration) return false;
      }
      if (!handle && opts.requireHandle) return false;
      if (!handle) {
        handle = await window.showSaveFilePicker({
          suggestedName,
          types: [{ description: 'DaySchedule Schedule', accept: { 'application/json': ['.schedule'] } }],
        });
      } else if (_workbookBaseline && typeof handle.getFile === 'function') {
        // Check immediately before writing. OS/sync clients cannot provide an
        // atomic compare-and-swap; one editor at a time remains the contract.
        for (;;) {
          const file = await handle.getFile();
          const text = await file.text();
          if (generation !== _workbookGeneration) return false;
          const fingerprint = fingerprintWorkbookContent(text);
          if (fingerprint === _workbookBaseline.fingerprint) break;
          if (opts.silent) {
            toast('The workbook file changed. Save Now to review both copies; your changes are still here.', 8000);
            return false;
          }
          const parsed = parseScheduleWorkbookContent(text, handle.name);
          const latest = parsed.workbookData || buildStandaloneScheduleWorkbookObject(parsed.fileData);
          if (!await reviewWorkbookConflict(latest)) return false;
          if (generation !== _workbookGeneration) return false;
          keepBothWorkbookCopies(latest);
          _workbookBaseline = { fileName: handle.name, fingerprint };
        }
      }
    } else if (opts.requireHandle) {
      return false;
    }
    if (generation !== _workbookGeneration) return false;
    const revision = _editSequence;
    const now = new Date().toISOString();
    const workbook = opts.content ? JSON.parse(opts.content) : buildScheduleWorkbookObject(opts.fileData);
    const active = workbook.schedules.find(item => item.id === workbook.activeScheduleId);
    if (active) {
      active.lastSavedAt = now;
      active.lastSavedBy = getUserName() || active.lastSavedBy || '';
      workbook.schedule = cloneScheduleData(active);
    }
    const content = JSON.stringify(workbook, null, 2) + '\n';
    if (handle) {
      writable = await handle.createWritable({ mode: 'exclusive' });
      await writable.write(content);
      await writable.close();
      writable = null;
    } else {
      triggerDownload(new Blob([content], { type: 'application/json' }), suggestedName);
    }
    // The successful write belongs only to the document that initiated it.
    if (generation !== _workbookGeneration) return false;
    if (handle && opts.reuseHandle !== false) {
      _scheduleWorkbookHandle = handle;
      _workbookBaseline = { fileName: handle.name || suggestedName, fingerprint: fingerprintWorkbookContent(content) };
      await saveWorkbookFileRecord({ handle, name: handle.name || suggestedName, savedAt: now });
      if (generation !== _workbookGeneration) return false;
    }
    _savedEditSequence = revision;
    // Acknowledge metadata, never replace live sibling data with old content.
    _scheduleWorkbookData = getScheduleWorkbookSnapshot();
    const live = getCurrentScheduleFileData();
    if (live && active && live.id === active.id) {
      live.lastSavedAt = now;
      live.lastSavedBy = active.lastSavedBy;
    }
    if (_editSequence !== revision) markDirty();
    else if (handle) markScheduleWorkbookSaved();
    else markScheduleWorkbookDownloaded();
    sessionSave({ skipDirty: true });
    if (!opts.silent && !showFirstSaveNoteOnce(handle ? handle.name : suggestedName, !handle)) {
      toast(handle ? 'Saved ' + handle.name : 'Downloaded ' + suggestedName + ' — keep the newest copy.', 4500);
    }
    return true;
  } catch (err) {
    if (writable) {
      try { await writable.abort(); } catch (abortError) { console.warn('Could not abort failed workbook write:', abortError); }
    }
    if (err && err.name === 'AbortError') return false;
    if (!handle && !opts.requireHandle && !opts.downloadOnly) {
      toast('This browser or embedded page cannot open the save picker. A .schedule copy will download instead.', 7000);
      return performWorkbookSave({ ...opts, downloadOnly: true }, generation);
    }
    console.warn('Workbook save failed:', err);
    if (typeof logAppError === 'function') logAppError('error', String(err && err.message || err), 'save');
    if (generation === _workbookGeneration && handle && handle === _scheduleWorkbookHandle) {
      _scheduleWorkbookHandle = null;
      await clearWorkbookFileRecord();
    }
    if (generation === _workbookGeneration) markDirty();
    if (!opts.silent) toast('Could not write the workbook. Your changes are still here. Save .schedule again to choose a file.', 8000);
    return false;
  }
}

function findJsonValueEnd(text, startIndex) {
  const source = String(text || '');
  let i = Math.max(0, Number(startIndex) || 0);
  while (i < source.length && /\s/.test(source[i])) i++;
  const first = source[i];
  if (first !== '{' && first !== '[') {
    const literal = source.slice(i).match(/^(null|true|false|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
    if (literal) return i + literal[0].length;
    throw new Error('SAVED_STATE assignment must contain JSON data.');
  }

  const stack = [first];
  let inString = false;
  let escaped = false;
  for (i = i + 1; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{' || ch === '[') {
      stack.push(ch);
    } else if (ch === '}' || ch === ']') {
      const expected = ch === '}' ? '{' : '[';
      if (stack.pop() !== expected) throw new Error('SAVED_STATE JSON has mismatched brackets.');
      if (!stack.length) return i + 1;
    }
  }
  throw new Error('SAVED_STATE JSON is incomplete.');
}

function parseSavedStateFileContent(content) {
  const source = String(content || '').replace(/^\uFEFF/, '');
  const assignmentPattern = /(?:^|[;\n\r])\s*(?:(?:const|let|var)\s+SAVED_STATE|(?:window|globalThis|self)\.SAVED_STATE|SAVED_STATE)\s*=/g;
  const match = assignmentPattern.exec(source);
  if (!match) return undefined;
  const valueStart = assignmentPattern.lastIndex;
  const valueEnd = findJsonValueEnd(source, valueStart);
  return JSON.parse(source.slice(valueStart, valueEnd));
}

function parseScheduleWorkbookContent(content, fileName) {
  const source = String(content || '').replace(/^\uFEFF/, '').trim();
  if (!source) throw new Error('Schedule file is empty.');

  const savedState = parseSavedStateFileContent(source);
  const parsed = savedState !== undefined ? savedState : JSON.parse(source);
  const isWorkbook = parsed
    && typeof parsed === 'object'
    && !Array.isArray(parsed)
    && parsed.fileType === SCHEDULE_WORKBOOK_FILE_TYPE
    && (parsed.schedule || Array.isArray(parsed.schedules));
  let workbookData = null;
  let activeSchedule = null;
  if (isWorkbook) {
    if (parsed.schemaVersion !== undefined && ![1, 2, SCHEDULE_WORKBOOK_SCHEMA_VERSION].includes(parsed.schemaVersion)) {
      throw new Error('This workbook uses an unsupported format version. Open it in the app version that created it; the file has not been changed.');
    }
    const entries = Array.isArray(parsed.schedules) && parsed.schedules.length ? parsed.schedules : [parsed.schedule];
    if (parsed.archivedSchedules !== undefined && !Array.isArray(parsed.archivedSchedules)) {
      throw new Error('This workbook has an invalid archive list. The file has not been changed.');
    }
    (parsed.archivedSchedules || []).forEach(entry => {
      if (!entry || typeof entry !== 'object' || !entry.current || !Array.isArray(entry.current.days)) {
        throw new Error('An archived schedule cannot be read. The file has not been changed.');
      }
      entry.name = normalizeText(entry.name) || normalizeText(entry.current.title) || 'Archived schedule';
    });
    const ids = new Set();
    entries.forEach(entry => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) || (entry.id !== undefined && typeof entry.id !== 'string')) {
        throw new Error('A schedule in this workbook has an invalid identity. The file has not been changed.');
      }
      const entryState = extractSchedulePayload(entry).state;
      if (!entryState || !Array.isArray(entryState.days)) {
        throw new Error('A schedule in this workbook has no readable days list. The file has not been changed.');
      }
      entry.name = normalizeText(entry.name) || (entry.current && normalizeText(entry.current.title)) || 'Schedule';
      const id = getScheduleEnvelopeId(entry);
      if (ids.has(id)) throw new Error('This workbook repeats a schedule ID. Each schedule needs a unique ID; the file has not been changed.');
      ids.add(id);
    });
    workbookData = cloneScheduleData(parsed);
    if (Array.isArray(parsed.schedules) && parsed.schedules.length) {
      activeSchedule = parsed.schedules.find(item => getScheduleEnvelopeId(item) === parsed.activeScheduleId)
        || parsed.schedules[0];
    } else {
      activeSchedule = parsed.schedule;
    }
  }
  const payload = isWorkbook ? extractSchedulePayload(activeSchedule) : extractSchedulePayload(parsed);
  if (!payload.state || !Array.isArray(payload.state.days)) {
    throw new Error('Invalid schedule file \u2014 no days array found.');
  }
  // A workbook the app wrote can legitimately hold a schedule with no days yet
  // ("Start fresh" then Save, or the switcher's New Blank) — refusing it made
  // the whole file, siblings included, unopenable. Only loose JSON that isn't
  // a workbook still has to prove it carries at least one day.
  const state = normalizePersistedState(payload.state, { requireDays: !isWorkbook });

  // Normalization silently filters events with missing titles or invalid
  // times — tell the user instead of letting data vanish without a trace.
  const rawEventCount = payload.state.days.reduce(
    (n, d) => n + (d && Array.isArray(d.events) ? d.events.length : 0), 0);
  const keptEventCount = state.days.reduce((n, d) => n + d.events.length, 0);
  const droppedEventCount = rawEventCount - keptEventCount;
  const repairedDayCount = payload.state.days.reduce((count, day, index) => {
    const normalized = day && normalizeDay(day);
    if (!day || !normalized) return count;
    return count + ((day.date && day.date !== normalized.date)
      || (day.startTime && day.startTime !== normalized.startTime)
      || (day.endTime && day.endTime !== normalized.endTime) ? 1 : 0);
  }, 0);
  showScheduleImportNotice({ repairedDayCount, droppedEventCount });

  if (payload.fileData && payload.fileData.theme && !state.theme) state.theme = payload.fileData.theme;
  const fileData = payload.fileData
    ? cloneScheduleData(payload.fileData)
    : {
        name: state.title || String(fileName || SCHEDULE_WORKBOOK_DEFAULT_FILENAME).replace(/\.[^.]+$/, '') || 'Imported Schedule',
        current: state,
        versions: [],
        activity: [],
      };
  fileData.current = state;
  if (state.theme && !fileData.theme) fileData.theme = state.theme;
  if (!Array.isArray(fileData.versions)) fileData.versions = [];
  if (!Array.isArray(fileData.activity)) fileData.activity = [];
  fileData.id = getScheduleEnvelopeId(fileData);
  if (workbookData) {
    workbookData.activeScheduleId = fileData.id;
    if (Array.isArray(workbookData.schedules)) {
      const index = workbookData.schedules.findIndex(item => getScheduleEnvelopeId(item) === fileData.id);
      if (index >= 0) workbookData.schedules[index] = cloneScheduleData(fileData);
    } else {
      workbookData.schedules = [cloneScheduleData(fileData)];
    }
    workbookData.schedule = cloneScheduleData(fileData);
  }
  return {
    kind: isWorkbook ? 'schedule-workbook' : (payload.fileData ? 'schedule-envelope' : 'schedule-state'),
    sourceFormat: savedState !== undefined ? 'saved-state-js' : (String(fileName || '').toLowerCase().endsWith('.schedule') ? 'schedule' : 'json'),
    state,
    fileData,
    workbookData,
    droppedEventCount,
    repairedDayCount,
  };
}

function showScheduleImportNotice(parsed) {
  const repaired = parsed.repairedDayCount || 0;
  const dropped = parsed.droppedEventCount || 0;
  if (repaired) {
    toast('Repaired invalid dates or day hours in ' + repaired + ' day(s). Review each day before saving.'
      + (dropped ? ' Also skipped ' + dropped + ' invalid event(s).' : ''), 8500);
  } else if (dropped) {
    toast('Skipped ' + dropped + (dropped === 1 ? ' event' : ' events')
      + ' with missing or invalid data (title or times). Everything else loaded normally.', 6500);
  }
  return !!(repaired || dropped);
}

function loadParsedScheduleData(parsed) {
  _workbookGeneration++;
  // Opening a file is a new starting point, not an edit: pushing the empty
  // pre-open Store onto the undo stack let one Ctrl+Z blank the schedule.
  if (typeof clearUndoHistory === 'function') clearUndoHistory();
  Store.loadPersistedState(parsed.state);
  if (typeof setCurrentScheduleFileData === 'function') {
    setCurrentScheduleFileData(parsed.fileData);
  }
  _fileHandle = null;
  _workbookId = parsed.workbookData && parsed.workbookData.workbookId || generateId('workbook');
  _savedEditSequence = _editSequence;
  _dirty = false;
  _scheduleWorkbookData = parsed.workbookData || buildStandaloneScheduleWorkbookObject(parsed.fileData);
  // Nothing has been edited yet — an "Unsaved" chip right after opening is a lie.
  sessionSave({ skipDirty: true });
  renderActiveDay();
  syncToolbarTitle();
  if (typeof renderInspector === 'function') renderInspector();
}

async function openScheduleWorkbookFile(options) {
  const generation = _workbookGeneration;
  const request = ++_workbookOpenRequest;
  const currentRequest = () => generation === _workbookGeneration && request === _workbookOpenRequest;
  const opts = options || {};
  if (window.showOpenFilePicker) {
    let handle = null;
    try {
      const handles = await window.showOpenFilePicker({
        multiple: false,
        types: [{
          description: 'DaySchedule Schedule',
          accept: { 'application/json': ['.schedule', '.json'] },
        }],
      });
      handle = handles && handles[0];
    } catch (err) {
      if (err && err.name === 'AbortError') return false;
      // The picker itself is unavailable — the classic <input type=file> path
      // is the right fallback. A file that fails to parse is not.
      console.warn('File picker unavailable, falling back:', err);
    }
    if (!currentRequest()) return false;
    if (handle) {
      try {
        const file = await handle.getFile();
        const content = await file.text();
        if (!currentRequest()) return false;
        const parsed = parseScheduleWorkbookContent(content, file.name || handle.name);
        _workbookGeneration++;
        _scheduleWorkbookHandle = handle;
        _workbookBaseline = { fileName: handle.name, fingerprint: fingerprintWorkbookContent(content) };
        if (typeof saveWorkbookFileRecord === 'function') {
          saveWorkbookFileRecord({
            handle,
            name: file.name || handle.name || SCHEDULE_WORKBOOK_DEFAULT_FILENAME,
            savedAt: new Date(file.lastModified || Date.now()).toISOString(),
          });
        }
        _scheduleWorkbookData = parsed.workbookData || buildStandaloneScheduleWorkbookObject(parsed.fileData);
        if (opts && typeof opts.onImported === 'function') {
          await opts.onImported({
            fileName: file.name || handle.name,
            state: parsed.state,
            fileData: parsed.fileData,
            workbookData: parsed.workbookData,
          });
          showScheduleImportNotice(parsed);
        } else {
          loadParsedScheduleData(parsed);
          if (typeof hideLibrary === 'function') hideLibrary();
          // The "Skipped N events" warning must not be wiped by this toast.
          if (!parsed.droppedEventCount && !parsed.repairedDayCount) toast('Opened ' + (file.name || handle.name || 'schedule'));
        }
        return true;
      } catch (err) {
        console.warn('Schedule open failed:', err);
        if (typeof logAppError === 'function') logAppError('error', String(err && err.message || err), 'open');
        toast('Couldn’t open ' + (handle.name || 'that file') + ' — ' + friendlyFileError(err) + '. Check it’s a .schedule file saved by DaySchedule.', 7000);
        return false;
      }
    }
  }
  if (!currentRequest()) return false;
  importDataFile(opts);
  return false;
}

async function saveDataFile() {
  if (_saveInProgress) { toast('Save already in progress.'); return false; }
  _saveInProgress = true;
  try {
    const state = buildSerializableState();
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
        sessionSave({ skipDirty: true });
        toast('Exported current schedule only to ' + _fileHandle.name + '. Other schedules and versions are not included.', 6500);
        return true;
      } catch (err) {
        if (err.name === 'AbortError') return false;
        console.warn('FSAPI save failed, falling back:', err);
      }
    }

    const blob = new Blob([content], { type: 'text/javascript' });
    triggerDownload(blob, 'scheduledata.js');
    sessionSave({ skipDirty: true });
    toast('Downloaded current schedule only as scheduledata.js. Use Save .schedule for a complete workbook backup.', 6500);
    return true;
  } finally {
    _saveInProgress = false;
  }
}

function importDataFile(options) {
  const generation = _workbookGeneration;
  const request = ++_workbookOpenRequest;
  const currentRequest = () => generation === _workbookGeneration && request === _workbookOpenRequest;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.schedule,.js,.json';
  input.addEventListener('change', () => {
    if (!currentRequest()) return;
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => {
      if (!currentRequest()) return;
      toast('Couldn’t read ' + file.name + ' — check the file is still available and try again.', 6000);
    };
    reader.onload = async () => {
      if (!currentRequest()) return;
      try {
        const parsed = parseScheduleWorkbookContent(reader.result, file.name);
        _workbookGeneration++;
        _workbookBaseline = null;
        _workbookId = parsed.workbookData && parsed.workbookData.workbookId || generateId('workbook');
        const state = parsed.state;

        if (options && typeof options.onImported === 'function') {
          _scheduleWorkbookHandle = null;
          _scheduleWorkbookData = parsed.workbookData || buildStandaloneScheduleWorkbookObject(parsed.fileData);
          await options.onImported({
            fileName: file.name,
            state: state,
            fileData: parsed.fileData,
            workbookData: parsed.workbookData,
          });
          showScheduleImportNotice(parsed);
          return;
        }

        _scheduleWorkbookHandle = null; // file input cannot provide a writable handle
        loadParsedScheduleData(parsed);
        if (!parsed.droppedEventCount && !parsed.repairedDayCount) toast('Imported ' + file.name + ' (' + state.days.length + ' days)');
      } catch (err) {
        if (typeof logAppError === 'function') logAppError('error', String(err && err.message || err), 'import');
        toast('Import failed: ' + friendlyFileError(err) + '.', 6000);
      }
    };
    reader.readAsText(file);
  });
  input.click();
}
