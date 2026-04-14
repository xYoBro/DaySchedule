/* ── library.js ── Contract ────────────────────────────────────────────────
 *
 * EXPORTS:
 *   showLibrary()                — shows library view, hides toolbar + editor, refreshes list
 *   hideLibrary()                — hides library view, shows toolbar + editor
 *   refreshLibraryList()         — async — scans data/ and renders schedule list
 *   openSchedule(fileName)       — async — reads file, loads into Store, switches to editor
 *   createNewSchedule(name)      — async — creates file, loads empty schedule into editor
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
const HELP_COACHMARK_DISMISSED_KEY = 'dayschedule_help_coachmark_dismissed';

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
  if (!listEl) return;

  if (!hasDirectoryAccess()) {
    listEl.innerHTML = '<div class="library-empty">Connect the shared schedule folder to get started.</div>';
    return;
  }

  const files = await listScheduleFiles();
  if (files.length === 0) {
    listEl.innerHTML = '<div class="library-empty">No schedules yet. Create one to get started.</div>';
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
    const accessLine = lockStatus.state === 'mine'
      ? 'You are editing'
      : (lockStatus.state === 'locked' && lockStatus.lock
          ? 'Locked by ' + (lockStatus.lock.ownerName || 'another editor')
          : 'Available to edit');
    const metaLine = [stats, timeAgo, accessLine].filter(Boolean).join(' \u00b7 ');
    const badgeClass = meta.versionCount > 0 ? 'final' : 'draft';
    const badgeText = meta.versionCount > 0 ? 'Final' : 'Draft';
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
    html += '<span class="library-item-badge ' + badgeClass + '">' + badgeText + '</span>';
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

  Store.reset();
  Store.loadPersistedState(data.current);
  setCurrentScheduleFileData(data);
  const days = Store.getDays();
  if (days.length) Store.setActiveDay(days[0].id);

  setCurrentFile(fileName, data.lastSavedAt);
  hideLibrary();
  await syncCurrentScheduleAccess();
  syncToolbarTitle();
  renderActiveDay();
  renderInspector();
}

async function createNewSchedule(name) {
  if (!await ensureUserName()) return;

  const slug = scheduleNameToSlug(name);
  const fileName = slug + '.json';
  const userName = getUserName();

  Store.reset();
  Store.setTitle(name);
  const state = Store.getPersistedState();
  const fileData = buildScheduleFile(name, state, [], userName);
  setCurrentScheduleFileData(fileData);

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
  if (isDirty() && hasDirectoryAccess() && isCurrentScheduleEditable()) {
    const ok = await saveCurrentSchedule();
    if (!ok) return;
  }
  await releaseCurrentScheduleLock();
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

  // Help button in library header
  const libraryHelpBtn = document.getElementById('libraryHelpBtn');
  if (libraryHelpBtn) libraryHelpBtn.onclick = () => openHelpModal();

  const floatingHelpBtn = document.getElementById('floatingHelpBtn');
  if (floatingHelpBtn) floatingHelpBtn.onclick = () => openHelpModal();

  const coachmarkOpenBtn = document.getElementById('helpCoachmarkOpenBtn');
  if (coachmarkOpenBtn) coachmarkOpenBtn.onclick = () => openHelpModal();

  const coachmarkDismissBtn = document.getElementById('helpCoachmarkDismissBtn');
  if (coachmarkDismissBtn) coachmarkDismissBtn.onclick = () => dismissHelpCoachmark();

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
  localStorage.removeItem(HELP_COACHMARK_DISMISSED_KEY);
}

function isHelpCoachmarkDismissed() {
  return localStorage.getItem(HELP_COACHMARK_DISMISSED_KEY) === '1';
}

function dismissHelpCoachmark() {
  localStorage.setItem(HELP_COACHMARK_DISMISSED_KEY, '1');
  syncHelpEntryPoints();
}

function syncHelpEntryPoints() {
  const libraryVisible = document.getElementById('libraryView') && document.getElementById('libraryView').classList.contains('active');
  const helpOpen = document.getElementById('helpModal') && document.getElementById('helpModal').classList.contains('active');
  const seen = hasSeenStartupHelp();
  const label = seen ? 'Help' : 'Start Here';

  const libraryHelpBtn = document.getElementById('libraryHelpBtn');
  if (libraryHelpBtn) {
    libraryHelpBtn.textContent = label;
    libraryHelpBtn.classList.toggle('attention', !seen);
  }

  const floatingHelpBtn = document.getElementById('floatingHelpBtn');
  if (floatingHelpBtn) {
    floatingHelpBtn.textContent = label;
    floatingHelpBtn.classList.toggle('attention', !seen);
    floatingHelpBtn.title = seen ? 'Help & shortcuts' : 'Start here';
  }

  const coachmark = document.getElementById('helpCoachmark');
  if (coachmark) {
    coachmark.hidden = !!(seen || isHelpCoachmarkDismissed() || helpOpen || !libraryVisible);
  }
}

function openHelpModal() {
  const overlay = document.getElementById('helpModal');
  if (!overlay) return;
  markHelpSeen();
  overlay.classList.add('active');
  syncHelpEntryPoints();

  const closeBtn = overlay.querySelector('#helpCloseBtn');
  if (closeBtn) closeBtn.onclick = () => closeHelpModal();
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
