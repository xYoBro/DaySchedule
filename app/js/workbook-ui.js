/* ── workbook-ui.js ── Simple multi-schedule workbook navigation ───────────
 *
 * Keeps the .schedule file mental model small: one workbook file contains many
 * schedules. This layer only owns the switcher UI; persistence.js owns data.
 */

let _workbookSearchText = '';

function formatWorkbookMeta(entry) {
  const parts = [];
  parts.push(entry.dayCount + (entry.dayCount === 1 ? ' day' : ' days'));
  parts.push(entry.eventCount + (entry.eventCount === 1 ? ' event' : ' events'));
  if (entry.noteCount) parts.push(entry.noteCount + (entry.noteCount === 1 ? ' note' : ' notes'));
  return parts.join(' · ');
}

function renderWorkbookSwitcher() {
  const btn = document.getElementById('workbookSwitchBtn');
  const label = document.getElementById('workbookSwitchLabel');
  if (!btn || !label) return;

  if (!Store.getTitle() && !Store.getDays().length) {
    btn.hidden = true;
    return;
  }

  const entries = typeof getScheduleWorkbookEntries === 'function' ? getScheduleWorkbookEntries() : [];
  btn.hidden = false;
  label.textContent = entries.length === 1 ? '1 schedule' : entries.length + ' schedules';
  btn.title = 'Schedules in this workbook';
}

function getFilteredWorkbookEntries() {
  const entries = typeof getScheduleWorkbookEntries === 'function' ? getScheduleWorkbookEntries() : [];
  const query = _workbookSearchText.trim().toLowerCase();
  if (!query) return entries;
  return entries.filter(entry => {
    return String(entry.name || '').toLowerCase().includes(query)
      || String(entry.lastSavedAt || '').toLowerCase().includes(query);
  });
}

function renderWorkbookModal() {
  const overlay = document.getElementById('workbookModal');
  if (!overlay) return;
  const content = overlay.querySelector('.modal');
  if (!content) return;

  const entries = typeof getScheduleWorkbookEntries === 'function' ? getScheduleWorkbookEntries() : [];
  const filtered = getFilteredWorkbookEntries();
  const active = entries.find(entry => entry.active) || entries[0];
  const defaultName = active && active.name ? active.name + ' Copy' : 'New Schedule';

  let html = '<div class="workbook-head">'
    + '<div>'
    + '<h2>Workbook Schedules</h2>'
    + '<p class="workbook-desc">One .schedule file can hold years of drills. Search, open, or create the next one here.</p>'
    + '</div>'
    + '<button class="modal-close-btn" id="workbookCloseBtn" aria-label="Close">&times;</button>'
    + '</div>'
    + '<div class="workbook-create">'
    + '<input type="text" id="workbookNewName" class="workbook-new-input" value="' + esc(defaultName) + '" aria-label="New schedule name">'
    + '<button class="btn" id="workbookNewBtn">New Blank</button>'
    + '<button class="btn btn-primary" id="workbookDuplicateBtn">Duplicate Current</button>'
    + '</div>'
    + '<input type="search" id="workbookSearch" class="workbook-search" value="' + esc(_workbookSearchText) + '" placeholder="Search 60+ schedules..." aria-label="Search schedules">'
    + '<div class="workbook-count">' + filtered.length + ' of ' + entries.length + ' schedules</div>'
    + '<div class="workbook-list">';

  if (!filtered.length) {
    html += '<div class="workbook-empty">No schedules match that search.</div>';
  } else {
    filtered.forEach(entry => {
      html += '<button class="workbook-item' + (entry.active ? ' active' : '') + '" data-schedule-id="' + esc(entry.id) + '">'
        + '<span class="workbook-item-main">'
        + '<span class="workbook-item-name">' + esc(entry.name) + '</span>'
        + '<span class="workbook-item-meta">' + esc(formatWorkbookMeta(entry)) + '</span>'
        + '</span>'
        + (entry.active ? '<span class="workbook-active-badge">Open</span>' : '')
        + '</button>';
    });
  }

  html += '</div>';
  content.className = 'modal workbook-modal';
  content.innerHTML = html;

  const search = content.querySelector('#workbookSearch');
  if (search) {
    search.addEventListener('input', () => {
      _workbookSearchText = search.value;
      renderWorkbookModal();
      const nextSearch = document.getElementById('workbookSearch');
      if (nextSearch) {
        nextSearch.focus();
        nextSearch.setSelectionRange(nextSearch.value.length, nextSearch.value.length);
      }
    });
  }

  const closeBtn = content.querySelector('#workbookCloseBtn');
  if (closeBtn) closeBtn.onclick = closeWorkbookModal;

  const newBtn = content.querySelector('#workbookNewBtn');
  if (newBtn) {
    newBtn.onclick = () => {
      const input = document.getElementById('workbookNewName');
      const name = input && input.value.trim() ? input.value.trim() : 'New Schedule';
      if (typeof createScheduleInWorkbook === 'function') createScheduleInWorkbook(name, { duplicate: false });
      closeWorkbookModal();
    };
  }

  const duplicateBtn = content.querySelector('#workbookDuplicateBtn');
  if (duplicateBtn) {
    duplicateBtn.onclick = () => {
      const input = document.getElementById('workbookNewName');
      const name = input && input.value.trim() ? input.value.trim() : defaultName;
      if (typeof createScheduleInWorkbook === 'function') createScheduleInWorkbook(name, { duplicate: true });
      closeWorkbookModal();
    };
  }

  content.querySelectorAll('.workbook-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.getAttribute('data-schedule-id');
      if (typeof switchScheduleInWorkbook === 'function') switchScheduleInWorkbook(id);
      closeWorkbookModal();
    });
  });
}

function openWorkbookModal() {
  const overlay = document.getElementById('workbookModal');
  if (!overlay) return;
  renderWorkbookModal();
  overlay.classList.add('active');
  const search = document.getElementById('workbookSearch');
  if (search) setTimeout(() => search.focus(), 0);
}

function closeWorkbookModal() {
  const overlay = document.getElementById('workbookModal');
  if (overlay) overlay.classList.remove('active');
}

function wireWorkbookUi() {
  const btn = document.getElementById('workbookSwitchBtn');
  if (btn) btn.onclick = openWorkbookModal;

  const overlay = document.getElementById('workbookModal');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeWorkbookModal();
    });
  }
  renderWorkbookSwitcher();
}
