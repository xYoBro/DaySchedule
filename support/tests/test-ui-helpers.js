const UiMockFS = (() => {
  let _files = {};

  function reset() { _files = {}; }
  function getFiles() { return JSON.parse(JSON.stringify(_files)); }

  function createMockWritable(fileName) {
    let _buffer = '';
    return {
      write(content) { _buffer = content; return Promise.resolve(); },
      close() { _files[fileName] = _buffer; return Promise.resolve(); },
      abort() { _buffer = ''; return Promise.resolve(); },
    };
  }

  function createMockFileHandle(fileName) {
    return {
      kind: 'file',
      name: fileName,
      getFile() {
        if (!(fileName in _files)) return Promise.reject(new Error('File not found: ' + fileName));
        return Promise.resolve({
          text() { return Promise.resolve(_files[fileName]); }
        });
      },
      createWritable() { return Promise.resolve(createMockWritable(fileName)); },
    };
  }

  function createMockDirHandle(name) {
    return {
      name: name || 'data',
      kind: 'directory',
      queryPermission() { return Promise.resolve('granted'); },
      requestPermission() { return Promise.resolve('granted'); },
      async *entries() {
        for (const fileName of Object.keys(_files)) {
          yield [fileName, createMockFileHandle(fileName)];
        }
      },
      async *values() {
        for (const fileName of Object.keys(_files)) {
          yield createMockFileHandle(fileName);
        }
      },
      getFileHandle(name, opts) {
        if (name in _files || (opts && opts.create)) {
          if (!(name in _files)) _files[name] = '';
          return Promise.resolve(createMockFileHandle(name));
        }
        return Promise.reject(new Error('File not found: ' + name));
      },
      removeEntry(name) {
        if (name in _files) {
          delete _files[name];
          return Promise.resolve();
        }
        return Promise.reject(new Error('File not found: ' + name));
      },
    };
  }

  return { reset, getFiles, createMockDirHandle };
})();

function installUiMockDir(name) {
  const handle = UiMockFS.createMockDirHandle(name);
  _dirHandle = handle;
  return handle;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function resetUiHarnessState() {
  UiMockFS.reset();
  Store.reset();
  Store.setActiveDay(null);
  setCurrentFile(null, null);
  setCurrentScheduleFileData(null);
  clearTimeout(_autosaveTimer);
  _autosaveTimer = null;
  clearTimeout(_sessionSaveTimer);
  _sessionSaveTimer = null;
  clearTimeout(_undoSaveTimer);
  _undoSaveTimer = null;
  _undoPending = false;
  _undoStack = [];
  _redoStack = [];
  _dirHandle = null;
  _currentFileName = null;
  _lastKnownSavedAt = null;
  _dirty = false;
  _selection = { type: null, dayId: null, entityId: null };
  _expandedDayId = null;
  _settingsActiveTab = 'look';
  _daySheetSelectedEventId = null;
  _versionSaveMode = false;
  _contextMenuTarget = null;

  sessionStorage.clear();
  localStorage.removeItem('dayschedule_user_name');
  localStorage.removeItem('dayschedule_editor_theme');
  applyEditorTheme('light');

  document.getElementById('libraryView').className = 'library-view';
  document.querySelector('.toolbar').style.display = '';
  document.querySelector('.app-body').style.display = '';
  document.getElementById('libraryList').innerHTML = '';
  document.getElementById('libraryConnectPrompt').style.display = 'none';
  document.getElementById('libraryFallbackBanner').style.display = 'none';
  document.getElementById('libraryNewInline').style.display = 'none';
  document.getElementById('libraryNewBtn').style.display = '';
  document.getElementById('libraryNewName').value = '';
  document.getElementById('editorThemeToggle').textContent = 'Theme';
  document.getElementById('tbTitle').value = '';
  document.getElementById('saveIndicator').textContent = '';
  document.getElementById('saveIndicator').className = 'save-status';
  const accessBar = document.getElementById('editorAccessBar');
  if (accessBar) accessBar.hidden = true;
  const accessText = document.getElementById('editorAccessText');
  if (accessText) accessText.innerHTML = '';
  const accessActions = document.getElementById('editorAccessActions');
  if (accessActions) accessActions.innerHTML = '';
  document.getElementById('dayTabs').innerHTML = '';
  document.getElementById('scheduleContainer').innerHTML = '';
  document.getElementById('inspectorPanel').innerHTML = '';
  document.getElementById('toast').textContent = '';
  document.getElementById('previewPage').className = 'page';

  [
    'helpModal',
    'syncConfirmModal',
    'staleWarningModal',
    'userNameModal',
    'versionModal',
    'settingsModal',
    'dayEventSheetModal',
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });

  document.querySelector('#staleWarningModal .modal').innerHTML = '';
  document.querySelector('#userNameModal .modal').innerHTML = '';
  document.querySelector('#versionModal .modal').innerHTML = '';
  document.getElementById('settingsModalContent').innerHTML = '';
  document.getElementById('dayEventSheetModalContent').innerHTML = '';

  const printContainer = document.getElementById('printContainer');
  if (printContainer) printContainer.remove();
  const contextMenu = document.getElementById('libraryContextMenu');
  if (contextMenu) contextMenu.remove();
}

function ensureUiGroups() {
  if (!Store.getGroup('grp_mx')) {
    Store.addGroup({ id: 'grp_mx', name: 'Maintenance', scope: 'limited', color: '#1a7a40' });
  }
  if (!Store.getGroup('grp_med')) {
    Store.addGroup({ id: 'grp_med', name: 'Medical', scope: 'limited', color: '#c23616' });
  }
}

function seedUiSchedule(options) {
  const opts = options || {};
  ensureUiGroups();
  Store.setTitle(opts.title || 'Harness Schedule');

  const day1 = Store.addDay({
    date: '2026-04-13',
    startTime: '0700',
    endTime: '1630',
  });

  Store.addEvent(day1.id, {
    title: 'Formation',
    startTime: '0700',
    endTime: '0730',
    description: 'Accountability formation.',
    location: 'Bldg 200 Apron',
    groupId: 'grp_all',
    isMainEvent: true,
  });
  Store.addEvent(day1.id, {
    title: 'AFSC Training',
    startTime: '0800',
    endTime: '1100',
    description: 'Hands-on flight training.',
    location: 'Respective Work Areas',
    groupId: 'grp_flight',
    isMainEvent: true,
  });
  Store.addEvent(day1.id, {
    title: 'Weapons Qualification',
    startTime: '0830',
    endTime: '1030',
    description: 'Range tables and safety checks.',
    location: 'Range 3',
    groupId: 'grp_chiefs',
    attendees: opts.longConcurrentAttendees
      ? 'RSO TSgt Park, Ammo SrA Bell, Tower SSgt Reeves, Safety MSgt Cole'
      : 'RSO: TSgt Park',
  });
  Store.addEvent(day1.id, {
    title: 'Lunch',
    startTime: '1100',
    endTime: '1200',
    groupId: 'grp_all',
    isMainEvent: true,
    isBreak: true,
  });
  Store.addEvent(day1.id, {
    title: 'Ancillary / CBT Completion',
    startTime: '1200',
    endTime: '1500',
    description: 'Computer lab open for training catch-up.',
    location: 'Computer Labs',
    groupId: 'grp_flight',
    isMainEvent: true,
  });
  Store.addEvent(day1.id, {
    title: 'Aircraft Launch Sim',
    startTime: '1230',
    endTime: '1400',
    description: 'Full crew launch sequence.',
    location: 'Hangar 4',
    groupId: 'grp_mx',
    attendees: 'Crew chiefs, specialists, AGE',
  });
  Store.addNote(day1.id, { category: 'Uniform', text: 'OCP unless mission tasking requires otherwise.' });

  let day2 = null;
  if (opts.dayCount && opts.dayCount > 1) {
    day2 = Store.addDay({
      date: '2026-04-14',
      startTime: '0700',
      endTime: '1630',
    });
    Store.addEvent(day2.id, {
      title: 'Day 2 Formation',
      startTime: '0700',
      endTime: '0730',
      groupId: 'grp_all',
      isMainEvent: true,
    });
    Store.addEvent(day2.id, {
      title: 'Medical Readiness',
      startTime: '0900',
      endTime: '1100',
      location: 'Clinic',
      groupId: 'grp_med',
      attendees: 'All members due PHA per IMR',
    });
  }

  Store.setActiveDay(day1.id);
  const fileData = {
    name: Store.getTitle(),
    current: Store.getPersistedState(),
    versions: [],
    theme: {
      skin: opts.skin || 'bands',
      palette: opts.palette || 'classic',
      customColors: opts.customColors || null,
    },
  };
  setCurrentScheduleFileData(fileData);
  return { day1, day2, fileData };
}

async function seedUiScheduleFile(name, options) {
  const opts = options || {};
  installUiMockDir('data');
  setUserName(opts.savedBy || 'Tester');
  seedUiSchedule({
    title: name,
    skin: opts.skin || 'bands',
    palette: opts.palette || 'classic',
    dayCount: opts.dayCount || 1,
    longConcurrentAttendees: !!opts.longConcurrentAttendees,
  });
  const fileName = scheduleNameToSlug(name) + '.json';
  const fileData = buildScheduleFile(name, Store.getPersistedState(), opts.versions || [], getUserName());
  fileData.theme = {
    skin: opts.skin || 'bands',
    palette: opts.palette || 'classic',
    customColors: null,
  };
  await writeScheduleFile(fileName, fileData);
  return { fileName, fileData };
}
