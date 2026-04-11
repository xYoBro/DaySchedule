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
