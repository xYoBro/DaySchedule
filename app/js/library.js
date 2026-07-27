/* ── library.js ── Contract ────────────────────────────────────────────────
 *
 * EXPORTS:
 *   showLibrary()                — shows library view, hides toolbar + editor, refreshes list
 *   hideLibrary()                — hides library view, shows toolbar + editor
 *   refreshLibraryList()         — async — scans data/ and renders schedule list
 *   openSchedule(fileName)       — async — reads file, loads into Store, switches to editor
 *   createNewSchedule(name)      — async — creates file, loads empty schedule into editor
 *   importScheduleFromLibrary()  — opens file picker, imports exported JS/JSON from home screen
 *   duplicateSchedule(fileName)  — async — copies file with collision avoidance, opens copy
 *   deleteSchedule(fileName)     — async — deletes file, refreshes list
 *   returnToLibrary()            — async — saves if dirty, resets Store, shows library
 *   wireLibrary()                — wires connect button, new schedule flow, help button
 *   formatTimeAgo(isoStr)        → string — "3h ago", "Apr 5", etc.
 *   openHelpModal()              — shows help modal
 *   closeHelpModal()             — hides help modal
 *
 * REQUIRES:
 *   storage.js    — hasDirectoryAccess, listScheduleFiles, readScheduleFile, writeScheduleFile,
 *                   deleteScheduleFile, scheduleNameToSlug, buildScheduleFile, setCurrentFile,
 *                   saveCurrentSchedule, isDirty, promptForDirectory, hasUserName, ensureUserName,
 *                   getUserName
 *   app-state.js  — Store.reset(), Store.loadPersistedState(), Store.getDays(),
 *                   Store.setActiveDay(), Store.setTitle(), Store.getPersistedState()
 *   utils.js      — esc()
 *   ui-core.js    — toast()
 *   inspector.js  — syncToolbarTitle(), renderActiveDay(), renderInspector()
 *   themes.js     — applyEditorTheme(), getEditorTheme()
 *
 * DOM ELEMENTS:
 *   #libraryView         — library view container
 *   #libraryList         — schedule list container
 *   #libraryConnectPrompt — connect folder prompt
 *   #libraryConnectBtn   — choose folder button
 *   #libraryNewBtn       — new schedule button
 *   #libraryImportBtn    — import exported JS/JSON from home screen
 *   #libraryNewInline    — inline name input container
 *   #libraryNewName      — name input field
 *   #libraryNewConfirm   — create button
 *   #libraryNewCancel    — cancel button
 *   #libraryHelpBtn      — help button in library header
 *   #helpModal           — help modal overlay
 *   #helpCloseBtn        — help modal close button
 *   .toolbar             — editor toolbar (hidden when library active)
 *   .app-body            — editor body (hidden when library active)
 *
 * CONSUMED BY:
 *   init.js      — wireLibrary(), showLibrary()
 *   inspector.js — returnToLibrary() (from back button)
 *   storage.js   — (none — library calls storage, not the reverse)
 *
 * SIDE EFFECTS:
 *   Registers global click listener to close context menu
 *   Registers global click listener to close help modal on backdrop
 *   Registers global keydown listener for Escape → close help modal
 *   Creates #libraryContextMenu element dynamically on first right-click
 * ──────────────────────────────────────────────────────────────────────────── */

/* ── library.js ── Schedule library home screen ────────────────────────────── */

let _contextMenuTarget = null;
const HELP_SEEN_KEY = 'dayschedule_help_seen';
let _helpActiveTab = 'start';

function showLibrary() {
  document.getElementById('libraryView').classList.add('active');
  document.querySelector('.toolbar').style.display = 'none';
  document.querySelector('.app-body').style.display = 'none';
  closeContextMenu();
  syncHelpEntryPoints();
  refreshLibraryList();
  renderLibraryContinueCard();
}

// ── Continue card ───────────────────────────────────────────────────────────
// Non-technical users shouldn't have to know where their .schedule file lives.
// Priority: in-memory session draft (newest state, also the only way back into
// an unsaved draft) → workbook file remembered in IndexedDB → hidden.

function formatWorkbookSavedAt(iso) {
  if (!iso) return '';
  const then = new Date(iso);
  if (isNaN(then.getTime())) return '';
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return days + ' days ago';
  return then.toLocaleDateString();
}

function readSessionDraftState() {
  try {
    const state = JSON.parse(sessionStorage.getItem('schedule_state') || 'null');
    if (state && Array.isArray(state.days) && state.days.length) return state;
  } catch (e) { /* corrupt session data — ignore */ }
  return null;
}

// The action behind the Continue/Reopen button. Set by renderLibraryContinueCard
// and invoked through a delegated listener wired once in wireLibrary() — a
// per-render `onclick` assignment proved fragile (render races / clobbering),
// and a swallowed click here looks like a dead button to the user.
let _libraryContinueAction = null;

async function runLibraryContinueAction() {
  if (typeof _libraryContinueAction !== 'function') return;
  try {
    await _libraryContinueAction();
  } catch (err) {
    console.error('Continue failed:', err);
    toast('Couldn’t continue: ' + (err && err.message ? err.message : 'unexpected error') + '. Use Open .schedule instead.', 5500);
  }
}

async function renderLibraryContinueCard() {
  const strip = document.getElementById('libraryContinueStrip');
  if (!strip) return;
  strip.hidden = true;
  _libraryContinueAction = null;
  if (hasDirectoryAccess()) return; // directory mode has its own schedule list

  const labelEl = document.getElementById('libraryContinueLabel');
  const titleEl = document.getElementById('libraryContinueTitle');
  const metaEl = document.getElementById('libraryContinueMeta');
  const btn = document.getElementById('libraryContinueBtn');
  if (!labelEl || !titleEl || !metaEl || !btn) return;

  const sessionState = readSessionDraftState();
  const record = typeof loadWorkbookFileRecord === 'function' ? await loadWorkbookFileRecord() : null;

  if (sessionState) {
    const eventCount = sessionState.days.reduce((n, d) => n + ((d.events && d.events.length) || 0), 0);
    const dayCount = sessionState.days.length;
    const parts = [dayCount + (dayCount === 1 ? ' day' : ' days'), eventCount + (eventCount === 1 ? ' event' : ' events')];
    parts.push(sessionState.workbookFileName ? sessionState.workbookFileName : 'not saved to a file yet');
    labelEl.textContent = 'Continue where you left off';
    titleEl.textContent = sessionState.title || 'Untitled workbook';
    metaEl.textContent = parts.join(' · ');
    btn.textContent = 'Continue';
    _libraryContinueAction = async () => {
      // Same workbook as the remembered file? Reattach its handle so
      // auto-save writes back to it (the click is the permission gesture).
      if (record && sessionState.workbookFileName === record.name
          && typeof hasScheduleWorkbookHandle === 'function' && !hasScheduleWorkbookHandle()
          && typeof adoptScheduleWorkbookHandle === 'function') {
        await adoptScheduleWorkbookHandle(record.handle);
      }
      if (!Store.getDays().length) sessionLoad();
      const days = Store.getDays();
      if (days.length && !Store.getActiveDay()) Store.setActiveDay(days[0].id);
      hideLibrary();
      if (typeof syncCurrentScheduleAccess === 'function') await syncCurrentScheduleAccess();
      syncToolbarTitle();
      renderActiveDay();
      renderInspector();
    };
    strip.hidden = false;
    return;
  }

  if (record) {
    labelEl.textContent = 'Welcome back';
    titleEl.textContent = record.name || 'Your workbook';
    const savedAt = formatWorkbookSavedAt(record.savedAt);
    metaEl.textContent = savedAt ? 'Last saved ' + savedAt : 'Pick up where you stopped';
    btn.textContent = 'Reopen';
    _libraryContinueAction = async () => {
      const opened = typeof openScheduleWorkbookFromHandle === 'function'
        ? await openScheduleWorkbookFromHandle(record.handle)
        : false;
      if (!opened) {
        renderLibraryContinueCard(); // record may have been cleared (file moved)
        return;
      }
      hideLibrary();
      if (typeof syncCurrentScheduleAccess === 'function') await syncCurrentScheduleAccess();
      toast('Opened ' + (record.name || 'workbook'));
    };
    strip.hidden = false;
  }
}

function hideLibrary() {
  document.getElementById('libraryView').classList.remove('active');
  document.querySelector('.toolbar').style.display = '';
  document.querySelector('.app-body').style.display = '';
  syncHelpEntryPoints();
}

async function refreshLibraryList() {
  const listEl = document.getElementById('libraryList');
  const stackEl = document.querySelector('.library-stack');
  if (!listEl) return;

  if (!hasDirectoryAccess()) {
    if (stackEl) stackEl.style.display = 'none';
    listEl.innerHTML = '';
    return;
  }
  if (stackEl) stackEl.style.display = '';

  const files = await listScheduleFiles();
  if (files.length === 0) {
    listEl.innerHTML = '<div class="library-empty">No schedules yet.</div>';
    return;
  }

  let html = '';
  const entries = await Promise.all(files.map(async meta => ({
    meta,
    lockStatus: await getScheduleLockStatus(meta.fileName),
  })));
  entries.forEach(entry => {
    const meta = entry.meta;
    const lockStatus = entry.lockStatus;
    const timeAgo = meta.lastSavedAt ? formatTimeAgo(meta.lastSavedAt) : '';
    const stats = meta.dayCount + (meta.dayCount === 1 ? ' day' : ' days') + ' \u00b7 '
      + meta.eventCount + (meta.eventCount === 1 ? ' event' : ' events');
    const metaLine = [stats, timeAgo].filter(Boolean).join(' \u00b7 ');
    const accessBadgeClass = lockStatus.state === 'mine'
      ? 'editing'
      : (lockStatus.state === 'locked' ? 'locked' : 'available');
    const accessBadgeText = lockStatus.state === 'mine'
      ? 'Editing'
      : (lockStatus.state === 'locked' ? 'Read Only' : 'Available');

    html += '<div class="library-item" data-file="' + esc(meta.fileName) + '">';
    html += '<div class="library-item-info">';
    html += '<div class="library-item-name">' + esc(meta.name) + '</div>';
    html += '<div class="library-item-meta">' + esc(metaLine) + '</div>';
    html += '</div>';
    html += '<div class="library-item-badges">';
    html += '<span class="library-item-badge library-item-access ' + accessBadgeClass + '">' + accessBadgeText + '</span>';
    html += '</div>';
    html += '</div>';
  });
  listEl.innerHTML = html;

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
  if (!data || !data.current) { toast('Failed to open schedule — file may be corrupt.'); return; }

  if (!await ensureUserName()) return;

  if (typeof clearUndoHistory === 'function') clearUndoHistory();
  Store.reset();
  Store.loadPersistedState(data.current);
  setCurrentScheduleFileData(data);

  setCurrentFile(fileName, data.lastSavedAt);
  hideLibrary();
  await syncCurrentScheduleAccess();
  syncToolbarTitle();
  renderActiveDay();
  renderInspector();
}

async function createNewSchedule(name) {
  if (hasDirectoryAccess() && !await ensureUserName()) return;

  const slug = scheduleNameToSlug(name);
  const fileName = slug + '.json';
  const userName = getUserName() || '';

  if (hasDirectoryAccess()) {
    const existing = await readScheduleFile(fileName, { suppressErrors: true });
    if (existing) {
      toast('A schedule named ' + name + ' already exists.');
      return;
    }
  }

  if (typeof clearUndoHistory === 'function') clearUndoHistory();
  if (typeof clearScheduleWorkbookTarget === 'function') clearScheduleWorkbookTarget();
  Store.reset();
  Store.setTitle(name);
  const state = Store.getPersistedState();
  const fileData = buildScheduleFile(name, state, [], userName);
  setCurrentScheduleFileData(fileData);

  if (!hasDirectoryAccess()) {
    setCurrentFile(null, null);
    hideLibrary();
    if (typeof syncCurrentScheduleAccess === 'function') {
      await syncCurrentScheduleAccess();
    }
    syncToolbarTitle();
    renderActiveDay();
    renderInspector();
    sessionSave();
    toast('Created ' + name);
    return;
  }

  const ok = await writeScheduleFile(fileName, fileData);
  if (!ok) { toast('Failed to create schedule.'); return; }

  setCurrentFile(fileName, fileData.lastSavedAt);
  hideLibrary();
  await claimCurrentScheduleLock({ silent: true });
  syncToolbarTitle();
  renderActiveDay();
  renderInspector();
  toast('Created ' + name);
}

function getImportedScheduleBaseName(fileName, state) {
  const stateTitle = state && state.title ? String(state.title).trim() : '';
  if (stateTitle) return stateTitle;

  const baseName = String(fileName || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();

  if (baseName && baseName.toLowerCase() !== 'scheduledata') return baseName;
  return 'Imported Schedule';
}

async function getAvailableImportedScheduleName(baseName) {
  const files = await listScheduleFiles();
  const existing = new Set(files.map(file => file.fileName));

  let candidateName = baseName;
  let candidateFile = scheduleNameToSlug(candidateName) + '.json';
  if (!existing.has(candidateFile)) return candidateName;

  candidateName = baseName + ' (Imported)';
  candidateFile = scheduleNameToSlug(candidateName) + '.json';
  let counter = 2;
  while (existing.has(candidateFile)) {
    candidateName = baseName + ' (Imported ' + counter + ')';
    candidateFile = scheduleNameToSlug(candidateName) + '.json';
    counter++;
  }
  return candidateName;
}

async function openImportedLocalDraft(state, sourceFileName, importedName, sourceFileData) {
  if (typeof clearUndoHistory === 'function') clearUndoHistory();
  Store.reset();
  const draftState = JSON.parse(JSON.stringify(state));
  draftState.title = importedName;
  Store.loadPersistedState(draftState);

  setCurrentFile(null, null);
  const fileData = sourceFileData && typeof sourceFileData === 'object'
    ? JSON.parse(JSON.stringify(sourceFileData))
    : { versions: [], activity: [] };
  fileData.name = importedName;
  fileData.current = Store.getPersistedState();
  if (!Array.isArray(fileData.versions)) fileData.versions = [];
  if (!Array.isArray(fileData.activity)) fileData.activity = [];
  if (!fileData.theme) fileData.theme = (sourceFileData && sourceFileData.theme) || state.theme || undefined;
  setCurrentScheduleFileData(fileData);

  hideLibrary();
  if (typeof syncCurrentScheduleAccess === 'function') {
    await syncCurrentScheduleAccess();
  }
  syncToolbarTitle();
  renderActiveDay();
  renderInspector();
  sessionSave((typeof hasScheduleWorkbookHandle === 'function' && hasScheduleWorkbookHandle()) ? { skipDirty: true } : undefined);
  toast('Opened ' + sourceFileName);
}

async function importScheduleIntoLibrary(state, sourceFileName, importedName, sourceFileData) {
  const uniqueName = await getAvailableImportedScheduleName(importedName);
  const userName = getUserName();
  const targetFile = scheduleNameToSlug(uniqueName) + '.json';

  const importedState = JSON.parse(JSON.stringify(state));
  importedState.title = uniqueName;
  const fileData = buildScheduleFile(uniqueName, importedState, [], userName);
  if (sourceFileData && sourceFileData.theme) fileData.theme = sourceFileData.theme;
  const ok = await writeScheduleFile(targetFile, fileData);
  if (!ok) {
    toast('Failed to import ' + sourceFileName + '.');
    return;
  }

  if (typeof clearUndoHistory === 'function') clearUndoHistory();
  Store.reset();
  Store.loadPersistedState(fileData.current);

  setCurrentScheduleFileData(fileData);
  setCurrentFile(targetFile, fileData.lastSavedAt);
  hideLibrary();
  await claimCurrentScheduleLock({ silent: true });
  syncToolbarTitle();
  renderActiveDay();
  renderInspector();
  toast('Imported ' + sourceFileName + ' as ' + uniqueName);
}

async function importScheduleFromLibrary() {
  if (hasDirectoryAccess() && !getUserName()) {
    if (!await ensureUserName()) return;
  }

  importDataFile({
    onImported: async ({ fileName, state, fileData }) => {
      const importedName = getImportedScheduleBaseName(fileName, state);
      if (hasDirectoryAccess()) {
        await importScheduleIntoLibrary(state, fileName, importedName, fileData);
        return;
      }
      await openImportedLocalDraft(state, fileName, importedName, fileData);
    },
  });
}

async function duplicateSchedule(fileName) {
  const data = await readScheduleFile(fileName);
  if (!data) { toast('Failed to read schedule.'); return; }

  const baseName = (data.name || 'Schedule') + ' (Copy)';
  let newName = baseName;
  let newFileName = scheduleNameToSlug(newName) + '.json';

  // Avoid filename collisions
  const existing = await listScheduleFiles();
  const existingNames = new Set(existing.map(f => f.fileName));
  let counter = 2;
  while (existingNames.has(newFileName)) {
    newName = baseName + ' ' + counter;
    newFileName = scheduleNameToSlug(newName) + '.json';
    counter++;
  }

  const userName = getUserName();
  const newData = buildScheduleFile(newName, data.current, [], userName);
  newData.current.title = newName;

  const ok = await writeScheduleFile(newFileName, newData);
  if (!ok) { toast('Failed to duplicate.'); return; }

  // Open the copy immediately per spec
  openSchedule(newFileName);
  toast('Duplicated as ' + newName);
}

async function deleteSchedule(fileName) {
  const lockStatus = await getScheduleLockStatus(fileName);
  if (lockStatus.state === 'locked' && lockStatus.lock) {
    toast((lockStatus.lock.ownerName || 'Another editor') + ' is editing this schedule right now.');
    return;
  }
  const ok = await deleteScheduleFile(fileName);
  if (ok) {
    const lockFileName = getLockFileName(fileName);
    const existingLock = await readScheduleFile(lockFileName, { suppressErrors: true });
    if (existingLock) await deleteScheduleFile(lockFileName);
  }
  if (ok) {
    refreshLibraryList();
    toast('Deleted');
  } else {
    toast('Failed to delete.');
  }
}

async function returnToLibrary() {
  if (isDirty() && isCurrentScheduleEditable()) {
    const ok = hasDirectoryAccess()
      ? await saveCurrentSchedule()
      : (typeof saveScheduleWorkbookFile === 'function' ? await saveScheduleWorkbookFile() : false);
    if (!ok) return;
  }
  await releaseCurrentScheduleLock();
  if (typeof clearUndoHistory === 'function') clearUndoHistory();
  setCurrentFile(null, null);
  Store.reset();
  setCurrentScheduleFileData(null);
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
  const importBtn = document.getElementById('libraryImportBtn');
  const newInline = document.getElementById('libraryNewInline');
  const newInput = document.getElementById('libraryNewName');
  const newConfirm = document.getElementById('libraryNewConfirm');
  const newCancel = document.getElementById('libraryNewCancel');

  if (newBtn && newInline && newInput) {
    const doCreate = () => {
      const name = (newInput.value || '').trim() || 'New Schedule';
      createNewSchedule(name);
    };

    newBtn.onclick = doCreate;
    if (newConfirm) newConfirm.onclick = doCreate;
    newInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') doCreate();
      if (e.key === 'Escape') {
        newInput.value = 'New Schedule';
        newInput.blur();
      }
    });
    if (newCancel) newCancel.onclick = () => {
      newInput.value = 'New Schedule';
      newInput.blur();
    };
  }

  if (importBtn) {
    importBtn.onclick = () => {
      if (hasDirectoryAccess()) {
        importScheduleFromLibrary();
        return;
      }
      if (typeof openScheduleWorkbookFile === 'function') {
        openScheduleWorkbookFile({
          onImported: async ({ fileName, state, fileData, workbookData }) => {
            const importedName = getImportedScheduleBaseName(fileName, state);
            await openImportedLocalDraft(state, fileName, importedName, fileData, workbookData);
          },
        });
        return;
      }
      importScheduleFromLibrary();
    };
  }

  // Help button in library header
  const libraryHelpBtn = document.getElementById('libraryHelpBtn');
  if (libraryHelpBtn) libraryHelpBtn.onclick = () => openHelpModal();

  // Build stamp in the Help modal — distinguishes a stale distributed copy
  // from the current build when debugging user reports.
  const helpVersionValue = document.getElementById('helpVersionValue');
  if (helpVersionValue && typeof APP_VERSION !== 'undefined') {
    helpVersionValue.textContent = APP_VERSION;
  }

  // Continue card: delegated, wired once — the button's content re-renders,
  // the listener never does.
  const continueStrip = document.getElementById('libraryContinueStrip');
  if (continueStrip) {
    continueStrip.addEventListener('click', (e) => {
      if (e.target.closest('#libraryContinueBtn')) runLibraryContinueAction();
    });
  }

  const themeToggle = document.getElementById('editorThemeToggle');
  if (themeToggle) {
    themeToggle.textContent = getEditorTheme() === 'dark' ? '\u2600' : '\u263E';
    themeToggle.title = 'UI theme';
    themeToggle.onclick = () => {
      const current = getEditorTheme();
      const next = current === 'dark' ? 'light' : 'dark';
      applyEditorTheme(next);
      themeToggle.textContent = next === 'dark' ? '\u2600' : '\u263E';
      themeToggle.title = 'UI theme';
    };
  }

  syncHelpEntryPoints();
}

// ── Help modal ─────────────────────────────────────────────────────────────

function hasSeenStartupHelp() {
  return localStorage.getItem(HELP_SEEN_KEY) === '1';
}

function markHelpSeen() {
  localStorage.setItem(HELP_SEEN_KEY, '1');
}

function syncHelpEntryPoints() {
  const libraryHelpBtn = document.getElementById('libraryHelpBtn');
  if (libraryHelpBtn) {
    libraryHelpBtn.textContent = 'Help';
    libraryHelpBtn.title = 'Help & shortcuts';
  }
}

function setHelpTab(tabName) {
  _helpActiveTab = tabName || 'start';
  const overlay = document.getElementById('helpModal');
  if (!overlay) return;
  overlay.querySelectorAll('[data-help-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-help-tab') === _helpActiveTab);
  });
  overlay.querySelectorAll('[data-help-panel]').forEach(panel => {
    panel.classList.toggle('active', panel.getAttribute('data-help-panel') === _helpActiveTab);
  });
}

function wireHelpModal(overlay) {
  if (!overlay) return;
  const closeBtn = overlay.querySelector('#helpCloseBtn');
  if (closeBtn) closeBtn.onclick = () => closeHelpModal();

  overlay.querySelectorAll('[data-help-tab]').forEach(btn => {
    btn.onclick = () => setHelpTab(btn.getAttribute('data-help-tab'));
  });

  setHelpTab(_helpActiveTab || 'start');
}

function renderHelpErrorLog() {
  const container = document.getElementById('helpErrorLog');
  if (!container) return;
  const log = typeof getAppErrorLog === 'function' ? getAppErrorLog() : [];
  if (!log.length) {
    container.innerHTML = '<div class="help-error-empty">No errors recorded on this browser.</div>';
    return;
  }
  container.innerHTML = log.slice(0, 5).map(entry => {
    const when = entry.at ? new Date(entry.at).toLocaleString() : '';
    return '<div class="help-error-item">'
      + '<div class="help-error-meta">' + esc(when) + (entry.source ? ' · ' + esc(entry.source) : '') + '</div>'
      + '<div class="help-error-message">' + esc(entry.message) + '</div>'
      + '</div>';
  }).join('');
}

function openHelpModal(options) {
  const overlay = document.getElementById('helpModal');
  if (!overlay) return;
  const wasSeen = hasSeenStartupHelp();
  const defaultTab = options && options.tab
    ? options.tab
    : (wasSeen ? (_helpActiveTab || 'faq') : 'start');
  markHelpSeen();
  _helpActiveTab = defaultTab;
  overlay.classList.add('active');
  syncHelpEntryPoints();
  wireHelpModal(overlay);
  renderHelpErrorLog();
}

function closeHelpModal() {
  const overlay = document.getElementById('helpModal');
  if (overlay) overlay.classList.remove('active');
  syncHelpEntryPoints();
}

document.addEventListener('click', e => {
  const overlay = document.getElementById('helpModal');
  if (overlay && e.target === overlay) closeHelpModal();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('helpModal');
    if (overlay && overlay.classList.contains('active')) closeHelpModal();
  }
});
