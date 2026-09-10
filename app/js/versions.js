/* ── versions.js ── Contract ───────────────────────────────────────────────
 *
 * EXPORTS:
 *   openVersionPanel()   — async — reads versions from file, renders modal
 *   closeVersionPanel()  — hides version modal
 *
 * REQUIRES:
 *   storage.js  — getVersions(), getRecentActivity(), createVersion(), restoreVersion(), getLastSavedAt()
 *   library.js  — formatTimeAgo()
 *   utils.js    — esc()
 *   ui-core.js  — toast()
 *
 * DOM ELEMENTS:
 *   #versionModal — modal overlay containing version panel
 *
 * CONSUMED BY:
 *   inspector.js — openVersionPanel() (from Versions toolbar button)
 *
 * SIDE EFFECTS:
 *   Registers global click listener to close version modal on backdrop
 *   Registers global keydown listener for Escape → close version modal
 * ──────────────────────────────────────────────────────────────────────────── */

/* ── versions.js ── Version panel UI ───────────────────────────────────────── */

let _versionSaveMode = false;
let _versionOperationPending = false;
let _versionRenderRequest = 0;

async function openVersionPanel() {
  _versionSaveMode = false;
  const overlay = document.getElementById('versionModal');
  if (!overlay) return;
  const content = overlay.querySelector('.modal');
  content.innerHTML = '<h2>Versions</h2><p role="status">Loading versions…</p><button class="btn" id="versionLoadingClose">Close</button>';
  content.querySelector('#versionLoadingClose').onclick = closeVersionPanel;
  openModal('versionModal');
  await renderVersionPanel(content);
}

function closeVersionPanel() {
  _versionRenderRequest++;
  closeModal('versionModal');
}

async function renderVersionPanel(modal) {
  const overlay = document.getElementById('versionModal');
  if (!overlay || !overlay.classList.contains('active')) return;
  const request = ++_versionRenderRequest;
  const generation = _workbookGeneration;
  const scheduleId = getScheduleEnvelopeId(getCurrentScheduleFileData());
  const versions = await getVersions();
  const activity = await getRecentActivity();
  if (request !== _versionRenderRequest || generation !== _workbookGeneration
      || scheduleId !== getScheduleEnvelopeId(getCurrentScheduleFileData())) return;
  const editable = typeof isCurrentScheduleEditable === 'function' ? isCurrentScheduleEditable() : true;
  if (!editable) _versionSaveMode = false;

  let html = '<h2>Versions</h2>';

  html += '<div class="version-working">' + esc(getWorkbookSaveStatus()) + '</div>';
  html += '<p class="version-storage-note">Workbook size: about ' + esc(getWorkbookSizeLabel())
    + '. Versions include appearance and logos; remove unneeded versions to reduce the file size.</p>';

  // Save as version
  if (!editable) {
    html += '<div class="version-readonly-note">Read-only. Click Edit.</div>';
  } else if (_versionSaveMode) {
    html += '<div class="version-save-inline">';
    html += '<input type="text" class="version-save-input" id="versionNameInput" aria-label="Version name" placeholder="Version name (e.g., Draft for Review)">';
    html += '<button class="btn btn-primary" id="versionSaveConfirm" style="font-size:12px;">Save</button>';
    html += '<button class="btn" id="versionSaveCancel" style="font-size:12px;">Cancel</button>';
    html += '</div>';
  } else {
    html += '<button class="version-save-btn" id="versionSaveBtn">Save Version\u2026</button>';
  }

  if (activity.length > 0) {
    html += '<div class="version-list-label">Recent</div>';
    activity.forEach(item => {
      const time = item.at ? new Date(item.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      const by = item.user ? 'by ' + item.user : '';
      html += '<div class="version-activity-item">';
      html += '<div class="version-activity-name">' + esc(item.text) + '</div>';
      html += '<div class="version-activity-meta">' + esc([time, by].filter(Boolean).join(' \u00b7 ')) + '</div>';
      html += '</div>';
    });
  }

  // Version list
  if (versions.length > 0) {
    html += '<div class="version-list-label">Saved</div>';
    versions.forEach(v => {
      const time = v.savedAt ? new Date(v.savedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      const by = v.savedBy ? 'by ' + v.savedBy : '';
      html += '<div class="version-item" data-version-index="' + v.index + '">';
      html += '<div>';
      html += '<div class="version-item-name">' + esc(v.name) + '</div>';
      html += '<div class="version-item-meta">' + esc([time, by].filter(Boolean).join(' \u00b7 ')) + '</div>';
      html += '</div>';
      html += '<div class="version-item-actions"><button class="version-restore-btn"' + (editable ? '' : ' disabled') + '>Restore</button>'
        + '<button class="btn version-rename-btn"' + (editable ? '' : ' disabled') + '>Rename</button>'
        + '<button class="btn version-delete-btn"' + (editable ? '' : ' disabled') + '>Delete</button></div>';
      html += '</div>';
    });
  } else {
    html += '<div class="version-empty">No saved versions yet.</div>';
  }

  // Close
  html += '<div class="modal-actions"><button class="btn" id="versionCloseBtn">Close</button></div>';

  const hadFocus = overlay.contains(document.activeElement);
  modal.innerHTML = html;
  wireVersionPanel(modal);
  const heading = modal.querySelector('h2');
  if (heading) heading.id = 'versionModal-heading';
  overlay.setAttribute('aria-labelledby', 'versionModal-heading');
  if (hadFocus && typeof getActiveModal === 'function' && getActiveModal() === overlay) focusModal(overlay);
}

function wireVersionPanel(modal) {
  const editable = typeof isCurrentScheduleEditable === 'function' ? isCurrentScheduleEditable() : true;
  const closeBtn = modal.querySelector('#versionCloseBtn');
  if (closeBtn) closeBtn.onclick = () => closeVersionPanel();

  const saveBtn = modal.querySelector('#versionSaveBtn');
  if (saveBtn && editable) {
    saveBtn.onclick = () => {
      _versionSaveMode = true;
      renderVersionPanel(modal);
    };
  }

  const nameInput = modal.querySelector('#versionNameInput');
  const confirmBtn = modal.querySelector('#versionSaveConfirm');
  const cancelBtn = modal.querySelector('#versionSaveCancel');

  if (nameInput && editable) {
    setTimeout(() => {
      if (nameInput.isConnected && getActiveModal() === document.getElementById('versionModal')) nameInput.focus();
    }, 50);

    const doSave = async () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); return; }
      if (_versionOperationPending) return;
      _versionOperationPending = true;
      confirmBtn.disabled = true;
      let ok;
      try { ok = await createVersion(name); }
      finally { _versionOperationPending = false; confirmBtn.disabled = false; }
      if (ok) {
        if (typeof lastVersionWasWritten === 'function' && typeof getCurrentFileName === 'function'
            && !getCurrentFileName() && !lastVersionWasWritten()) {
          toast('Version "' + name + '" kept in this session — click Save .schedule to write it to the file.', 6000);
        } else {
          toast('Version saved: ' + name);
        }
        _versionSaveMode = false;
        renderVersionPanel(modal);
      } else {
        toast('Couldn’t save the version — the file may be read-only or missing. Use Save .schedule, then try again.', 6000);
      }
    };

    if (confirmBtn) confirmBtn.onclick = doSave;
    nameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') doSave();
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        _versionSaveMode = false;
        renderVersionPanel(modal);
      }
    });
  }

  if (cancelBtn) {
    cancelBtn.onclick = () => {
      _versionSaveMode = false;
      renderVersionPanel(modal);
    };
  }

  if (!editable) return;

  modal.querySelectorAll('.version-rename-btn').forEach(button => {
    button.onclick = () => {
      if (_versionOperationPending) return;
      const row = button.closest('.version-item');
      const index = Number(row.getAttribute('data-version-index'));
      const title = row.querySelector('.version-item-name');
      const original = title.textContent;
      title.innerHTML = '<input class="version-save-input" aria-label="New version name" value="' + esc(original) + '">'
        + '<button class="btn" type="button">Save name</button>';
      const input = title.querySelector('input');
      const save = title.querySelector('button');
      const rename = async () => {
        if (_versionOperationPending || !input.value.trim()) return;
        _versionOperationPending = true;
        save.disabled = true;
        try {
          const ok = await renameVersion(index, input.value);
          toast(ok ? 'Version renamed' : 'Could not rename this version. Your copy is still here.');
        } finally {
          _versionOperationPending = false;
          await renderVersionPanel(modal);
        }
      };
      save.onclick = rename;
      input.onkeydown = event => {
        if (event.key === 'Enter') { event.preventDefault(); rename(); }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); renderVersionPanel(modal); }
      };
      input.focus();
      input.select();
    };
  });
  modal.querySelectorAll('.version-delete-btn').forEach(button => {
    button.onclick = async () => {
      if (_versionOperationPending) return;
      const row = button.closest('.version-item');
      const name = row.querySelector('.version-item-name').textContent;
      if (!confirm('Delete version "' + name + '"? The current schedule will stay unchanged.')) return;
      _versionOperationPending = true;
      button.disabled = true;
      try {
        const ok = await deleteVersion(Number(row.getAttribute('data-version-index')));
        toast(ok ? 'Version deleted' : 'Could not delete this version.');
      } finally {
        _versionOperationPending = false;
        await renderVersionPanel(modal);
      }
    };
  });

  // Restore buttons
  modal.querySelectorAll('.version-restore-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const item = btn.closest('.version-item');
      const index = parseInt(item.getAttribute('data-version-index'), 10);
      if (_versionOperationPending) return;
      _versionOperationPending = true;
      btn.disabled = true;
      let ok;
      try { ok = await restoreVersion(index); }
      finally { _versionOperationPending = false; btn.disabled = false; }
      if (ok) {
        toast(lastVersionWasWritten() || getCurrentFileName()
          ? 'Version restored — current state backed up'
          : 'Version restored with a local backup. Save .schedule to write both to the file.', 6500);
        closeVersionPanel();
      } else {
        toast('Failed to restore version.');
      }
    });
  });
}

// Close version modal on backdrop click
document.addEventListener('click', e => {
  const overlay = document.getElementById('versionModal');
  if (overlay && e.target === overlay) closeVersionPanel();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !e.defaultPrevented) {
    const overlay = document.getElementById('versionModal');
    if (overlay && overlay.classList.contains('active')) closeVersionPanel();
  }
});
