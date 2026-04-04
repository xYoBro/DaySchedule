// schedule-setup.js — Schedule configuration, day tabs, notes, rendering orchestration

function renderActiveDay() {
  const dayId = Store.getActiveDay();
  if (dayId) renderDay(dayId);
  renderDayTabs();
}

function renderDayTabs() {
  const tabs = document.getElementById('dayTabs');
  if (!tabs) return;
  const days = Store.getDays();
  const activeDay = Store.getActiveDay();
  let html = '';
  days.forEach((day, i) => {
    const label = day.label || ('Day ' + (i + 1));
    const active = day.id === activeDay ? ' active' : '';
    html += '<button class="day-tab' + active + '" data-day-id="' + esc(day.id) + '">' + esc(label) + '</button>';
  });
  tabs.innerHTML = html;

  // Wire up tab clicks
  tabs.querySelectorAll('.day-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      Store.setActiveDay(tab.getAttribute('data-day-id'));
      renderActiveDay();
    });
  });
}

function openSettingsModal() {
  const modal = document.getElementById('settingsModalContent');
  renderSettingsModal(modal);
  openModal('settingsModal');
}

function renderSettingsModal(container) {
  const title = Store.getTitle();
  const footer = Store.getFooter();
  const days = Store.getDays();

  let html = '<h2>Schedule Settings</h2>';

  // Title
  html += '<div class="editor-row">';
  html += '<label>Schedule Title <input type="text" id="settingsTitle" value="' + esc(title) + '"></label>';
  html += '</div>';

  // Logo
  html += '<div class="editor-row">';
  html += '<label>Logo <input type="file" id="settingsLogo" accept="image/*"></label>';
  html += '</div>';

  // Footer info
  html += '<div class="editor-row">';
  html += '<label>Contact Info <input type="text" id="settingsContact" value="' + esc(footer.contact) + '" placeholder="e.g., 142d Fighter Wing · Uniform: UOD"></label>';
  html += '</div>';
  html += '<div class="editor-row editor-row-half">';
  html += '<label>Schedule POC <input type="text" id="settingsPoc" value="' + esc(footer.poc) + '"></label>';
  html += '<label>Updated Date <input type="text" id="settingsUpdated" value="' + esc(footer.updated) + '" placeholder="e.g., 10 Mar 2026"></label>';
  html += '</div>';

  // Day management
  html += '<h3 style="margin-top:16px;margin-bottom:8px;font-size:14px;">Days</h3>';
  html += '<div id="settingsDayList">';
  days.forEach((day, i) => {
    html += '<div class="editor-row editor-row-time" data-day-id="' + esc(day.id) + '">';
    html += '<label>Date <input type="date" class="sd-date" value="' + esc(day.date) + '"></label>';
    html += '<label>Start <input type="text" class="sd-start" value="' + esc(day.startTime) + '" placeholder="0700"></label>';
    html += '<label>End <input type="text" class="sd-end" value="' + esc(day.endTime) + '" placeholder="1630"></label>';
    html += '<label>Label <input type="text" class="sd-label" value="' + esc(day.label || '') + '" placeholder="auto"></label>';
    html += '<button class="btn btn-danger" style="padding:3px 8px;font-size:11px;align-self:flex-end;" onclick="removeDayFromSettings(\'' + esc(day.id) + '\')">Remove</button>';
    html += '</div>';
  });
  html += '</div>';
  html += '<button class="btn" onclick="addDayFromSettings()" style="margin-top:4px;">+ Add Day</button>';

  // Manage groups link
  html += '<div style="margin-top:16px;border-top:1px solid #e8e8ed;padding-top:12px;">';
  html += '<button class="btn" onclick="closeModal(\'settingsModal\'); setTimeout(openGroupsModal, 200);">Manage Audience Groups</button>';
  html += '</div>';

  // Actions
  html += '<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">';
  html += '<button class="btn btn-primary" onclick="saveSettings()">Save</button>';
  html += '<button class="btn" onclick="closeModal(\'settingsModal\')">Cancel</button>';
  html += '</div>';

  container.innerHTML = html;

  // Logo upload handler
  document.getElementById('settingsLogo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { Store.setLogo(ev.target.result); };
    reader.readAsDataURL(file);
  });
}

function addDayFromSettings() {
  const list = document.getElementById('settingsDayList');
  const newId = generateId('day');
  const html = '<div class="editor-row editor-row-time" data-day-id="' + newId + '">'
    + '<label>Date <input type="date" class="sd-date" value=""></label>'
    + '<label>Start <input type="text" class="sd-start" value="0700" placeholder="0700"></label>'
    + '<label>End <input type="text" class="sd-end" value="1630" placeholder="1630"></label>'
    + '<label>Label <input type="text" class="sd-label" value="" placeholder="auto"></label>'
    + '<button class="btn btn-danger" style="padding:3px 8px;font-size:11px;align-self:flex-end;" onclick="this.closest(\'.editor-row\').remove()">Remove</button>'
    + '</div>';
  list.insertAdjacentHTML('beforeend', html);
}

function removeDayFromSettings(dayId) {
  const row = document.querySelector('[data-day-id="' + dayId + '"]');
  if (row) row.remove();
}

function saveSettings() {
  saveUndoState();
  Store.setTitle(document.getElementById('settingsTitle').value.trim());
  Store.setFooter({
    contact: document.getElementById('settingsContact').value.trim(),
    poc: document.getElementById('settingsPoc').value.trim(),
    updated: document.getElementById('settingsUpdated').value.trim(),
  });

  // Sync days
  const dayRows = document.querySelectorAll('#settingsDayList [data-day-id]');
  const existingDayIds = new Set(Store.getDays().map(d => d.id));
  const keptDayIds = new Set();

  dayRows.forEach(row => {
    const dayId = row.getAttribute('data-day-id');
    const date = row.querySelector('.sd-date').value;
    const startTime = row.querySelector('.sd-start').value.trim() || '0700';
    const endTime = row.querySelector('.sd-end').value.trim() || '1630';
    const label = row.querySelector('.sd-label').value.trim() || null;

    if (existingDayIds.has(dayId)) {
      Store.updateDay(dayId, { date, startTime, endTime, label });
      keptDayIds.add(dayId);
    } else {
      Store.addDay({ id: dayId, date, startTime, endTime, label });
      keptDayIds.add(dayId);
    }
  });

  // Remove days that were deleted in the modal
  Store.getDays().filter(d => !keptDayIds.has(d.id)).forEach(d => Store.removeDay(d.id));

  // Ensure active day is valid
  const days = Store.getDays();
  if (days.length && !days.find(d => d.id === Store.getActiveDay())) {
    Store.setActiveDay(days[0].id);
  }

  sessionSave();
  closeModal('settingsModal');
  renderActiveDay();
  toast('Settings saved');
}

// Note management
function openAddNote(dayId) {
  const category = prompt('Note category (e.g., Medical, TDY, Facility):');
  if (category === null) return;
  const text = prompt('Note text:');
  if (!text) return;
  saveUndoState();
  Store.addNote(dayId, { category: category.trim(), text: text.trim() });
  sessionSave();
  renderActiveDay();
}

// Wire up toolbar buttons (called from init.js)
function wireToolbar() {
  const addBtn = document.getElementById('addEventBtn');
  if (addBtn) addBtn.onclick = () => {
    const dayId = Store.getActiveDay();
    if (dayId) openAddEvent(dayId);
    else toast('Add a day first in Settings');
  };

  const addNoteBtn = document.getElementById('addNoteBtn');
  if (addNoteBtn) addNoteBtn.onclick = () => {
    const dayId = Store.getActiveDay();
    if (dayId) openAddNote(dayId);
    else toast('Add a day first in Settings');
  };

  const printBtn = document.getElementById('printBtn');
  if (printBtn) printBtn.onclick = () => printActiveDay();

  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) settingsBtn.onclick = () => openSettingsModal();

  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) saveBtn.onclick = () => saveDataFile();
}
