let _previousFocus = null;

function openModal(id) {
  _previousFocus = document.activeElement;
  const modal = document.getElementById(id);
  modal.classList.add('active');
  const focusable = modal.querySelector('input:not([type="hidden"]), select, textarea, button, [tabindex]:not([tabindex="-1"])');
  // 50ms delay: modal transitions from display:none to display:flex;
  // focus() fails if called before the browser completes the layout shift.
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
  document.querySelectorAll('.tb-overflow').forEach(d => d.classList.remove('open'));
}

document.addEventListener('click', e => {
  if (!e.target.closest('.tb-overflow')) closeDropdowns();
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const active = document.querySelector('.modal-overlay.active');
  if (!active) return;
  e.preventDefault();
  if (active.id === 'settingsModal' && typeof closeSettingsModal === 'function') {
    closeSettingsModal();
    return;
  }
  closeModal(active.id);
});
