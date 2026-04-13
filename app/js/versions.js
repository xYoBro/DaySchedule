/* ── versions.js ── Contract ───────────────────────────────────────────────
 *
 * EXPORTS:
 *   openVersionPanel()   — async — reads versions from file, renders modal
 *   closeVersionPanel()  — hides version modal
 *
 * REQUIRES:
 *   storage.js  — getVersions(), createVersion(), restoreVersion(), getLastSavedAt()
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

async function openVersionPanel() {
  _versionSaveMode = false;
  const overlay = document.getElementById('versionModal');
  if (!overlay) return;
  await renderVersionPanel(overlay.querySelector('.modal'));
  overlay.classList.add('active');
}

function closeVersionPanel() {
  document.getElementById('versionModal').classList.remove('active');
}

async function renderVersionPanel(modal) {
  const versions = await getVersions();
  const editable = typeof isCurrentScheduleEditable === 'function' ? isCurrentScheduleEditable() : true;
  if (!editable) _versionSaveMode = false;

  let html = '<h2>Versions</h2>';

  // Working copy info
  html += '<div class="version-working">';
  html += '<div class="version-working-label">Working Copy</div>';
  html += '<div class="version-working-title">Current edits</div>';
  const lastSavedAt = getLastSavedAt();
  const lastSaved = lastSavedAt ? formatTimeAgo(lastSavedAt) : 'not yet saved';
  html += '<div class="version-working-meta">Auto-saved ' + esc(lastSaved) + '</div>';
  html += '</div>';

  // Save as version
  if (!editable) {
    html += '<div class="version-readonly-note">Read-only mode. Claim edit access before saving or restoring versions.</div>';
  } else if (_versionSaveMode) {
    html += '<div class="version-save-inline">';
    html += '<input type="text" class="version-save-input" id="versionNameInput" placeholder="Version name (e.g., Draft for Review)">';
    html += '<button class="btn btn-primary" id="versionSaveConfirm" style="font-size:12px;">Save</button>';
    html += '<button class="btn" id="versionSaveCancel" style="font-size:12px;">Cancel</button>';
    html += '</div>';
  } else {
    html += '<button class="version-save-btn" id="versionSaveBtn">Save as Version\u2026</button>';
    html += '<div class="version-save-hint">Stamp the current state with a name</div>';
  }

  // Version list
  if (versions.length > 0) {
    html += '<div class="version-list-label">Saved Versions</div>';
    versions.forEach(v => {
      const time = v.savedAt ? new Date(v.savedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      const by = v.savedBy ? 'by ' + esc(v.savedBy) : '';
      html += '<div class="version-item" data-version-index="' + v.index + '">';
      html += '<div>';
      html += '<div class="version-item-name">' + esc(v.name) + '</div>';
      html += '<div class="version-item-meta">' + esc([time, by].filter(Boolean).join(' \u00b7 ')) + '</div>';
      html += '</div>';
      html += '<button class="version-restore-btn"' + (editable ? '' : ' disabled') + '>Restore</button>';
      html += '</div>';
    });
  } else {
    html += '<div class="version-empty">No saved versions yet.</div>';
  }

  // Close
  html += '<div class="modal-actions"><button class="btn" id="versionCloseBtn">Close</button></div>';

  modal.innerHTML = html;
  wireVersionPanel(modal);
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
    setTimeout(() => nameInput.focus(), 50);

    const doSave = async () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); return; }
      const ok = await createVersion(name);
      if (ok) {
        toast('Version saved: ' + name);
        _versionSaveMode = false;
        renderVersionPanel(modal);
      } else {
        toast('Failed to save version.');
      }
    };

    if (confirmBtn) confirmBtn.onclick = doSave;
    nameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') doSave();
      if (e.key === 'Escape') {
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

  // Restore buttons
  modal.querySelectorAll('.version-restore-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const item = btn.closest('.version-item');
      const index = parseInt(item.getAttribute('data-version-index'), 10);
      const ok = await restoreVersion(index);
      if (ok) {
        toast('Version restored — current state backed up');
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
  if (e.key === 'Escape') {
    const overlay = document.getElementById('versionModal');
    if (overlay && overlay.classList.contains('active')) closeVersionPanel();
  }
});
