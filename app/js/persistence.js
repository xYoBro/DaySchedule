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
  }
  return state;
}

function sessionSave(options) {
  clearTimeout(_sessionSaveTimer);
  _sessionSaveTimer = setTimeout(() => {
    try {
      sessionStorage.setItem('schedule_state', JSON.stringify(buildSerializableState()));
    } catch (e) { /* ignore quota errors */ }
  }, 500);
  // Trigger auto-save if connected
  if ((!options || !options.skipDirty) && typeof markDirty === 'function') markDirty();
}

function sessionLoad() {
  try {
    const raw = sessionStorage.getItem('schedule_state');
    if (raw) {
      const state = normalizePersistedState(JSON.parse(raw));
      Store.loadPersistedState(state);
      if (state.theme && typeof setCurrentScheduleFileData === 'function') {
        setCurrentScheduleFileData({
          name: state.title || 'Local Draft',
          current: Store.getPersistedState(),
          versions: [],
          activity: [],
          theme: state.theme,
        });
      }
      return true;
    }
  } catch (e) { /* ignore */ }
  return false;
}

function cloneScheduleData(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildScheduleWorkbookEnvelope(fileData) {
  const source = fileData || (typeof getCurrentScheduleFileData === 'function' ? getCurrentScheduleFileData() : null);
  const state = source && source.current ? cloneScheduleData(source.current) : buildSerializableState();
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
  envelope.name = envelope.name || title;
  envelope.current = state;
  if (!Array.isArray(envelope.versions)) envelope.versions = [];
  if (!Array.isArray(envelope.activity)) envelope.activity = [];
  if (state && state.theme && !envelope.theme) envelope.theme = state.theme;
  return envelope;
}

function buildScheduleWorkbookObject(fileData) {
  const envelope = buildScheduleWorkbookEnvelope(fileData);
  return {
    fileType: SCHEDULE_WORKBOOK_FILE_TYPE,
    schemaVersion: SCHEDULE_WORKBOOK_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    schedule: envelope,
  };
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
  if (_saveInProgress) { toast('Save already in progress.'); return false; }
  _saveInProgress = true;
  try {
    const suggestedName = opts.suggestedName || getScheduleWorkbookSuggestedName();
    const content = opts.content || buildScheduleWorkbookContent(opts.fileData);

    if (window.showSaveFilePicker) {
      try {
        let handle = opts.reuseHandle === false ? null : _scheduleWorkbookHandle;
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
        if (opts.reuseHandle !== false) _scheduleWorkbookHandle = handle;
        sessionSave({ skipDirty: true });
        toast('Saved ' + (handle.name || suggestedName));
        return true;
      } catch (err) {
        if (err.name === 'AbortError') return false;
        console.warn('Schedule save failed, falling back:', err);
      }
    }

    const blob = new Blob([content], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = suggestedName;
    a.click();
    URL.revokeObjectURL(a.href);
    sessionSave({ skipDirty: true });
    toast('Downloaded ' + suggestedName);
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
    && parsed.schedule;
  const payload = isWorkbook ? extractSchedulePayload(parsed.schedule) : extractSchedulePayload(parsed);
  if (!payload.state || !Array.isArray(payload.state.days)) {
    throw new Error('Invalid schedule file \u2014 no days array found.');
  }
  const state = normalizePersistedState(payload.state, { requireDays: true });
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
  return {
    kind: isWorkbook ? 'schedule-workbook' : (payload.fileData ? 'schedule-envelope' : 'schedule-state'),
    sourceFormat: savedState !== undefined ? 'saved-state-js' : (String(fileName || '').toLowerCase().endsWith('.schedule') ? 'schedule' : 'json'),
    state,
    fileData,
  };
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
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'scheduledata.js';
    a.click();
    URL.revokeObjectURL(a.href);
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
    reader.onload = async () => {
      try {
        const parsed = parseScheduleWorkbookContent(reader.result, file.name);
        const state = parsed.state;

        if (options && typeof options.onImported === 'function') {
          await options.onImported({
            fileName: file.name,
            state: state,
            fileData: parsed.fileData,
          });
          return;
        }

        saveUndoState();
        Store.loadPersistedState(state);
        if (typeof setCurrentScheduleFileData === 'function') {
          setCurrentScheduleFileData(parsed.fileData);
        }
        _fileHandle = null; // reset so next save prompts for location
        sessionSave();
        renderActiveDay();
        syncToolbarTitle();
        if (typeof renderInspector === 'function') renderInspector();
        toast('Imported ' + file.name + ' (' + state.days.length + ' days)');
      } catch (err) {
        toast('Import failed: ' + err.message);
      }
    };
    reader.readAsText(file);
  });
  input.click();
}
