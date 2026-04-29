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
