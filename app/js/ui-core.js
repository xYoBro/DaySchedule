/* ── ui-core.js ── Contract ────────────────────────────────────────────────
 *
 * EXPORTS:
 *   openModal(id)       — shows modal overlay by DOM id, focuses first input
 *   closeModal(id)      — hides modal, restores focus
 *   toast(msg)          — shows 2.2s notification toast
 *   closeDropdowns()    — closes all .dropdown elements
 *
 * REQUIRES: nothing (only DOM)
 *
 * DOM ELEMENTS:
 *   #toast — toast notification container
 *   .modal-overlay — any modal with this class can be opened/closed
 *
 * CONSUMED BY:
 *   storage.js   — toast()
 *   library.js   — toast()
 *   versions.js  — toast()
 *   inspector.js — toast(), openModal(), closeModal()
 *   persistence.js — toast()
 *
 * SIDE EFFECTS:
 *   Registers global click listener to close dropdowns
 *   Registers global keydown listener for Escape → close active modal
 * ──────────────────────────────────────────────────────────────────────────── */

let _previousFocus = null;

function openModal(id) {
  _previousFocus = document.activeElement;
  const modal = document.getElementById(id);
  modal.classList.add('active');
  const focusable = modal.querySelector('input:not([type="hidden"]), select, textarea, button, [tabindex]:not([tabindex="-1"])');
  if (focusable) setTimeout(() => focusable.focus(), 50);
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
  if (_previousFocus && _previousFocus.focus) {
    _previousFocus.focus();
    _previousFocus = null;
  }
}

let _toastTimer = null;
function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

function closeDropdowns() {
  document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('open'));
}

document.addEventListener('click', e => {
  if (!e.target.closest('.dropdown')) closeDropdowns();
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const active = document.querySelector('.modal-overlay.active');
  if (active) { e.preventDefault(); closeModal(active.id); }
});
