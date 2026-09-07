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

  // Legacy directory-library mode: each schedule is its own .json file, and
  // switching/creating here would auto-save the other schedule's state into
  // the currently open file. The switcher is workbook-only.
  if (typeof getCurrentFileName === 'function' && getCurrentFileName()) {
    btn.hidden = true;
    return;
  }

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
  // Names only: matching the hidden ISO timestamp meant any digit, 't', 'z',
  // '-' or ':' matched nearly every schedule.
  return entries.filter(entry => String(entry.name || '').toLowerCase().includes(query));
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
    + '<input type="search" id="workbookSearch" class="workbook-search" value="' + esc(_workbookSearchText) + '" placeholder="Search schedules" aria-label="Search schedules">'
    + '<div class="workbook-count">' + filtered.length + ' of ' + entries.length + (entries.length === 1 ? ' schedule' : ' schedules') + '</div>'
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
      // The re-render replaces this input; restore the caret where it was,
      // not at the end, so editing mid-word doesn't jump.
      const caretStart = search.selectionStart;
      const caretEnd = search.selectionEnd;
      renderWorkbookModal();
      const nextSearch = document.getElementById('workbookSearch');
      if (nextSearch) {
        nextSearch.focus();
        const len = nextSearch.value.length;
        nextSearch.setSelectionRange(Math.min(caretStart, len), Math.min(caretEnd, len));
      }
    });
  }

  const closeBtn = content.querySelector('#workbookCloseBtn');
  if (closeBtn) closeBtn.onclick = closeWorkbookModal;

  const newBtn = content.querySelector('#workbookNewBtn');
  if (newBtn) {
    newBtn.onclick = () => {
      const input = document.getElementById('workbookNewName');
      const typed = input ? input.value.trim() : '';
      // The shared name box is prefilled with "<Active> Copy" for Duplicate;
      // an untouched box must not name a blank schedule after the active one.
      const name = typed && typed !== defaultName ? typed : 'New Schedule';
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
  // Same guard as renderWorkbookSwitcher — never expose workbook switching
  // while a directory-library file is open.
  if (typeof getCurrentFileName === 'function' && getCurrentFileName()) return;
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
