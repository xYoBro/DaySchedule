/* ── persistence.js ── Contract ────────────────────────────────────────────
 *
 * EXPORTS:
 *   saveUndoState()    — push current Store snapshot to undo stack (debounced 800ms)
 *   undo()             — pop undo stack, push to redo, render
 *   redo()             — pop redo stack, push to undo, render
 *   sessionSave(options?) — debounced write to sessionStorage (500ms) + triggers markDirty()
 *   sessionLoad()      → boolean — loads from sessionStorage if available
 *   saveDataFile()     → Promise<boolean> — legacy FSAPI single-file save or download fallback
 *   importDataFile()   — opens file picker, parses JS/JSON, loads into Store
 *   buildScheduleWorkbookContent(fileData?) — serializes a .schedule workbook JSON file
 *   parseScheduleWorkbookContent(text, fileName?) — parses .schedule/JSON/legacy JS wrappers
 *   clearScheduleWorkbookTarget() — detach workbook handle + data (must run before Start fresh)
 *   openScheduleWorkbookFromHandle(handle) → Promise<boolean> — reopen remembered file (Continue card)
 *   adoptScheduleWorkbookHandle(handle) → Promise<boolean> — reattach handle to a session draft
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
let _scheduleWorkbookData = null;
let _saveInProgress = false;
let _undoStack = [];
let _redoStack = [];
const UNDO_MAX = 30;
const SCHEDULE_WORKBOOK_FILE_TYPE = 'dayschedule';
const SCHEDULE_WORKBOOK_SCHEMA_VERSION = 1;
const SCHEDULE_WORKBOOK_DEFAULT_FILENAME = 'DaySchedule.schedule';

let _undoSaveTimer = null;
let _undoPending = false;

function saveUndoState() {
  // Debounce: only capture one snapshot per burst of rapid edits
  if (!_undoPending) {
    _undoStack.push(Store.snapshot());
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
  _redoStack.push(Store.snapshot());
  Store.restore(_undoStack.pop());
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
  _undoStack.push(Store.snapshot());
  Store.restore(_redoStack.pop());
  renderActiveDay();
  syncToolbarTitle();
  renderInspector();
  sessionSave();
  toast('Redo');
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

// Bumped on every real edit (not on post-save bookkeeping). Lets a save that
// was in flight tell whether edits landed after it built its content.
let _editSequence = 0;
function getEditSequence() {
  return _editSequence;
}

let _sessionBackupFailureNotified = false;

function sessionSave(options) {
  clearTimeout(_sessionSaveTimer);
  _sessionSaveTimer = setTimeout(() => {
    try {
      sessionStorage.setItem('schedule_state', JSON.stringify(buildSerializableState()));
    } catch (e) {
      // Usually quota (a large logo can exceed sessionStorage limits). A stale
      // draft is worse than none — the Continue card prefers the draft over
      // the remembered file, so an old draft would win over newer saved work.
      console.warn('Crash-recovery backup failed; unsaved work will not survive a crash:', e);
      try { sessionStorage.removeItem('schedule_state'); } catch (inner) { console.warn('Could not clear the stale backup either:', inner); }
      if (typeof logAppError === 'function') logAppError('error', 'Crash-recovery backup failed: ' + String(e && e.message || e), 'sessionSave');
      if (!_sessionBackupFailureNotified) {
        _sessionBackupFailureNotified = true;
        toast('Crash-recovery backup is off — this schedule is too large to back up in this tab (usually a big logo). Save your work now.', 8000);
      }
    }
  }, 500);
  if (!options || !options.skipDirty) {
    _editSequence++;
    // Trigger auto-save if connected
    if (typeof markDirty === 'function') markDirty();
  }
}

// Cancel any pending draft write and remove the stored draft (used when the
// editor is left cleanly — the file, not the draft, is now the truth).
function discardSessionDraft() {
  clearTimeout(_sessionSaveTimer);
  _sessionSaveTimer = null;
  try {
    sessionStorage.removeItem('schedule_state');
  } catch (e) {
    console.warn('Could not discard the session draft:', e);
  }
}

// Flush the debounced draft when the page is going away: an edit made in the
// last 500ms before a reload would otherwise be missing from the Continue card.
window.addEventListener('pagehide', () => {
  if (!_sessionSaveTimer) return;
  clearTimeout(_sessionSaveTimer);
  _sessionSaveTimer = null;
  try {
    sessionStorage.setItem('schedule_state', JSON.stringify(buildSerializableState()));
  } catch (e) {
    console.warn('Final crash-recovery backup failed:', e);
  }
});

function sessionLoad() {
  try {
    const raw = sessionStorage.getItem('schedule_state');
    if (raw) {
      const parsed = JSON.parse(raw);
      const state = normalizePersistedState(parsed);
      Store.loadPersistedState(state);
      if (typeof setCurrentScheduleFileData === 'function') {
        const fileData = {
          name: state.title || 'Local Draft',
          current: Store.getPersistedState(),
          versions: [],
          activity: [],
        };
        if (state.theme) fileData.theme = state.theme;
        const draftId = parsed && typeof parsed.workbookScheduleId === 'string' ? sanitizeEntityRef(parsed.workbookScheduleId) : '';
        if (draftId) fileData.id = draftId;
        setCurrentScheduleFileData(fileData);
      }
      return true;
    }
  } catch (e) {
    console.warn('Could not restore the session draft:', e);
  }
  return false;
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
  return _scheduleWorkbookHandle && _scheduleWorkbookHandle.name ? _scheduleWorkbookHandle.name : '';
}

// Detach the current workbook file. Must run before "Start fresh" — otherwise
// the new workbook inherits the previous file's handle and the next save
// silently overwrites that file.
function clearScheduleWorkbookTarget() {
  _scheduleWorkbookHandle = null;
  _scheduleWorkbookData = null;
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
    toast('Downloaded ' + fileName + '. Your workbook is a file in your Downloads folder — nothing is uploaded. Next time, use Open .schedule to open the newest copy.', 8000);
  } else {
    toast('Saved ' + fileName + '. Your workbook is a file on this computer — nothing is uploaded. Reopen it from the start screen anytime.', 8000);
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
  if (!handle || typeof handle.getFile !== 'function') return false;
  const granted = await ensureWorkbookHandlePermission(handle, false);
  if (!granted) {
    toast('Permission was declined — use Open .schedule to pick the file instead.', 4500);
    return false;
  }
  let file;
  try {
    file = await handle.getFile();
  } catch (err) {
    if (typeof clearWorkbookFileRecord === 'function') clearWorkbookFileRecord();
    toast('Couldn’t find ' + (handle.name || 'the workbook file') + ' — it may have been moved or renamed. Use Open .schedule to find it.', 5500);
    return false;
  }
  try {
    const content = await file.text();
    const parsed = parseScheduleWorkbookContent(content, file.name || handle.name);
    _scheduleWorkbookHandle = handle;
    _scheduleWorkbookData = parsed.workbookData || buildStandaloneScheduleWorkbookObject(parsed.fileData);
    loadParsedScheduleData(parsed);
    return true;
  } catch (err) {
    toast('Couldn’t open ' + (handle.name || 'the workbook file') + ': ' + err.message, 5500);
    return false;
  }
}

// Reattach the remembered handle to the in-memory session draft (no file read
// — the draft is newer than the file). Used when a session draft and the
// remembered file are the same workbook.
async function adoptScheduleWorkbookHandle(handle) {
  if (!handle || typeof handle.createWritable !== 'function') return false;
  const granted = await ensureWorkbookHandlePermission(handle, false);
  if (!granted) return false;
  // Permission can be granted for a file that has since been moved or
  // deleted; adopting that handle makes every later auto-save fail silently.
  let parsed;
  try {
    const file = await handle.getFile();
    parsed = parseScheduleWorkbookContent(await file.text(), file.name || handle.name);
  } catch (err) {
    if (typeof clearWorkbookFileRecord === 'function') clearWorkbookFileRecord();
    return false;
  }
  // Reattaching must bring the workbook's other schedules and this schedule's
  // identity and history back into memory. With only the session draft in
  // memory, the first auto-save rewrote the file as a one-schedule workbook —
  // every sibling schedule and every named version gone from disk.
  _scheduleWorkbookData = parsed.workbookData || buildStandaloneScheduleWorkbookObject(parsed.fileData);
  const draft = typeof getCurrentScheduleFileData === 'function' ? getCurrentScheduleFileData() : null;
  const draftId = draft && draft.id ? draft.id : getScheduleEnvelopeId({ name: Store.getTitle() });
  const candidates = Array.isArray(_scheduleWorkbookData.schedules) ? _scheduleWorkbookData.schedules : [parsed.fileData];
  const match = candidates.find(item => getScheduleEnvelopeId(item) === draftId) || null;
  if (match && typeof setCurrentScheduleFileData === 'function') {
    const merged = cloneScheduleData(match);
    merged.current = Store.getPersistedState(); // the draft is newer than the file
    if (draft && draft.theme) merged.theme = draft.theme;
    setCurrentScheduleFileData(merged);
  }
  _scheduleWorkbookHandle = handle;
  return true;
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
  return envelope;
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
  const opts = options || {};
  if (_saveInProgress) {
    if (!opts.silent) toast('Save already in progress.');
    return false;
  }
  _saveInProgress = true;
  try {
    const suggestedName = opts.suggestedName || getScheduleWorkbookSuggestedName();
    // Stamp the live envelope before serializing — otherwise every workbook
    // save carries the schedule's creation-time lastSavedAt forever and the
    // switcher/Versions panel report stale times.
    if (!opts.content) {
      const memFileData = typeof getCurrentScheduleFileData === 'function' ? getCurrentScheduleFileData() : null;
      if (memFileData && (!opts.fileData || opts.fileData === memFileData)) {
        memFileData.lastSavedAt = new Date().toISOString();
        if (typeof getUserName === 'function' && getUserName()) {
          memFileData.lastSavedBy = getUserName();
        }
      }
    }
    const content = opts.content || buildScheduleWorkbookContent(opts.fileData);

    if (window.showSaveFilePicker) {
      let handle = null;
      const editsWhenBuilt = _editSequence;
      try {
        handle = opts.reuseHandle === false ? null : _scheduleWorkbookHandle;
        if (handle) {
          // A handle restored from IndexedDB starts in 'prompt' state; silent
          // auto-saves must not pop a permission dialog mid-edit.
          const granted = await ensureWorkbookHandlePermission(handle, opts.silent);
          if (!granted) {
            if (opts.requireHandle) return false;
            handle = null;
          }
        }
        if (!handle && opts.requireHandle) return false;
        if (!handle) {
          handle = await window.showSaveFilePicker({
            suggestedName,
            types: [{
              description: 'DaySchedule Schedule',
              accept: { 'application/json': ['.schedule'] },
            }],
          });
        }
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        if (opts.reuseHandle !== false) {
          _scheduleWorkbookHandle = handle;
          if (typeof saveWorkbookFileRecord === 'function') {
            saveWorkbookFileRecord({
              handle,
              name: handle.name || suggestedName,
              savedAt: new Date().toISOString(),
            });
          }
        }
        _scheduleWorkbookData = JSON.parse(content);
        sessionSave({ skipDirty: true });
        if (_editSequence !== editsWhenBuilt) {
          // Edits landed while the write was in flight: what's on disk is
          // already behind. Stay dirty so auto-save runs again.
          if (typeof markDirty === 'function') markDirty();
        } else if (typeof markScheduleWorkbookSaved === 'function') {
          markScheduleWorkbookSaved();
        }
        if (!opts.silent && !showFirstSaveNoteOnce(handle.name || suggestedName)) {
          toast('Saved ' + (handle.name || suggestedName));
        }
        return true;
      } catch (err) {
        if (err.name === 'AbortError') return false;
        console.warn('Schedule save failed:', err);
        if (typeof logAppError === 'function') logAppError('error', String(err && err.message || err), 'save');
        if (handle) {
          // The write to the attached file failed (moved, deleted, permission
          // revoked). Falling through to a Downloads copy and saying "Saved"
          // hid that; detach so the next Save .schedule asks where to save.
          // Keep _scheduleWorkbookData — the sibling schedules must survive.
          _scheduleWorkbookHandle = null;
          if (typeof clearWorkbookFileRecord === 'function') clearWorkbookFileRecord();
          if (!opts.silent) {
            toast('Couldn’t write to ' + (handle.name || 'the workbook file') + ' — it may have been moved, deleted, or its permission revoked. Click Save .schedule to choose where to save.', 8000);
          }
          return false;
        }
        if (opts.requireHandle) return false;
      }
    }

    if (opts.requireHandle) return false;

    const blob = new Blob([content], { type: 'application/json' });
    triggerDownload(blob, suggestedName);
    _scheduleWorkbookData = JSON.parse(content);
    sessionSave({ skipDirty: true });
    if (typeof markScheduleWorkbookSaved === 'function') markScheduleWorkbookSaved();
    if (!opts.silent && !showFirstSaveNoteOnce(suggestedName, true)) {
      toast('Downloaded ' + suggestedName + ' to your Downloads folder — keep the newest copy.', 4500);
    }
    return true;
  } finally {
    _saveInProgress = false;
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
  if (droppedEventCount > 0 && typeof toast === 'function') {
    toast('Skipped ' + droppedEventCount + (droppedEventCount === 1 ? ' event' : ' events')
      + ' with missing or invalid data (title or times). Everything else loaded normally.', 6500);
  }

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
  };
}

function loadParsedScheduleData(parsed) {
  // Opening a file is a new starting point, not an edit: pushing the empty
  // pre-open Store onto the undo stack let one Ctrl+Z blank the schedule.
  if (typeof clearUndoHistory === 'function') clearUndoHistory();
  Store.loadPersistedState(parsed.state);
  if (typeof setCurrentScheduleFileData === 'function') {
    setCurrentScheduleFileData(parsed.fileData);
  }
  _fileHandle = null;
  _scheduleWorkbookData = parsed.workbookData || buildStandaloneScheduleWorkbookObject(parsed.fileData);
  // Nothing has been edited yet — an "Unsaved" chip right after opening is a lie.
  sessionSave({ skipDirty: true });
  renderActiveDay();
  syncToolbarTitle();
  if (typeof renderInspector === 'function') renderInspector();
}

async function openScheduleWorkbookFile(options) {
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
    if (handle) {
      try {
        const file = await handle.getFile();
        const content = await file.text();
        const parsed = parseScheduleWorkbookContent(content, file.name || handle.name);
        _scheduleWorkbookHandle = handle;
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
        } else {
          loadParsedScheduleData(parsed);
          if (typeof hideLibrary === 'function') hideLibrary();
          // The "Skipped N events" warning must not be wiped by this toast.
          if (!parsed.droppedEventCount) toast('Opened ' + (file.name || handle.name || 'schedule'));
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
        sessionSave();
        if (typeof notifyManualDraftExport === 'function') notifyManualDraftExport();
        toast('Saved to ' + _fileHandle.name);
        return true;
      } catch (err) {
        if (err.name === 'AbortError') return false;
        console.warn('FSAPI save failed, falling back:', err);
      }
    }

    const blob = new Blob([content], { type: 'text/javascript' });
    triggerDownload(blob, 'scheduledata.js');
    sessionSave();
    if (typeof notifyManualDraftExport === 'function') notifyManualDraftExport();
    toast('Downloaded scheduledata.js. Move it into shared app/data.');
    return true;
  } finally {
    _saveInProgress = false;
  }
}

function importDataFile(options) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.schedule,.js,.json';
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => {
      toast('Couldn’t read ' + file.name + ' — check the file is still available and try again.', 6000);
    };
    reader.onload = async () => {
      try {
        const parsed = parseScheduleWorkbookContent(reader.result, file.name);
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
          return;
        }

        _scheduleWorkbookHandle = null; // file input cannot provide a writable handle
        loadParsedScheduleData(parsed);
        if (!parsed.droppedEventCount) toast('Imported ' + file.name + ' (' + state.days.length + ' days)');
      } catch (err) {
        if (typeof logAppError === 'function') logAppError('error', String(err && err.message || err), 'import');
        toast('Import failed: ' + friendlyFileError(err) + '.', 6000);
      }
    };
    reader.readAsText(file);
  });
  input.click();
}
