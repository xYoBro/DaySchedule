/* ── persistence.js ── Contract ────────────────────────────────────────────
 *
 * EXPORTS:
 *   saveUndoState()    — push current Store snapshot to undo stack (debounced 800ms)
 *   undo()             — pop undo stack, push to redo, render
 *   redo()             — pop redo stack, push to undo, render
 *   sessionSave()      — debounced write to sessionStorage (500ms) + triggers markDirty()
 *   sessionLoad()      → boolean — loads from sessionStorage if available
 *   saveDataFile()     → Promise<boolean> — legacy FSAPI single-file save or download fallback
 *   importDataFile()   — opens file picker, parses JS/JSON, loads into Store
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
let _saveInProgress = false;
let _undoStack = [];
let _redoStack = [];
const UNDO_MAX = 30;

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

let _sessionSaveTimer = null;
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

function importDataFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.js,.json';
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        let text = reader.result.trim();
        let state;
        if (file.name.endsWith('.json')) {
          state = JSON.parse(text);
        } else {
          // Strip the JS wrapper: "const SAVED_STATE = {...};"
          const match = text.match(/=\s*([\s\S]*?)\s*;?\s*$/);
          if (!match) throw new Error('Could not parse file — expected SAVED_STATE assignment.');
          state = JSON.parse(match[1]);
        }
        if (!state.days || !Array.isArray(state.days)) {
          throw new Error('Invalid schedule file — no days array found.');
        }
        // Normalize all data through schema validators
        if (state.days) state.days = state.days.map(normalizeDay);
        if (state.groups) state.groups = state.groups.map(normalizeGroup);

        saveUndoState();
        Store.loadPersistedState(state);
        _fileHandle = null; // reset so next save prompts for location
        if (state.days.length) Store.setActiveDay(state.days[0].id);
        sessionSave();
        renderActiveDay();
        syncToolbarTitle();
        toast('Imported ' + file.name + ' (' + state.days.length + ' days)');
      } catch (err) {
        toast('Import failed: ' + err.message);
      }
    };
    reader.readAsText(file);
  });
  input.click();
}
