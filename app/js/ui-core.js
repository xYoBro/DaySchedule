/* ── ui-core.js ── Contract ────────────────────────────────────────────────
 *
 * EXPORTS:
 *   openModal(id)       — shows modal overlay by DOM id, focuses first input
 *   closeModal(id)      — hides modal, restores focus
 *   computeViewportUiScale(width?, height?) → number — monitor-aware chrome scale
 *   applyViewportUiScale() → number — writes --ui-scale based on current viewport
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

const _modalStack = [];
const _modalInertState = new Map();
let _viewportUiScaleFrame = null;

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function computeViewportUiScale(viewportWidth, viewportHeight) {
  const width = Math.max(0, viewportWidth || window.innerWidth || 0);
  const height = Math.max(0, viewportHeight || window.innerHeight || 0);
  const widthBoost = clampNumber((width - 1600) / 1840, 0, 1);
  const heightBoost = clampNumber((height - 900) / 540, 0, 1);
  return clampNumber(1 + (widthBoost * 0.16) + (heightBoost * 0.08), 1, 1.24);
}

function applyViewportUiScale() {
  const viewport = window.visualViewport;
  const scale = computeViewportUiScale(
    viewport ? viewport.width : window.innerWidth,
    viewport ? viewport.height : window.innerHeight
  );
  document.documentElement.style.setProperty('--ui-scale', scale.toFixed(3));
  return scale;
}

function scheduleViewportUiScale() {
  if (_viewportUiScaleFrame) return;
  const queueFrame = window.requestAnimationFrame
    ? window.requestAnimationFrame.bind(window)
    : function(cb) { return setTimeout(cb, 16); };
  _viewportUiScaleFrame = queueFrame(() => {
    _viewportUiScaleFrame = null;
    applyViewportUiScale();
  });
}

function getActiveModal() {
  for (let i = _modalStack.length - 1; i >= 0; i--) {
    const entry = _modalStack[i];
    if (entry.modal.isConnected && entry.modal.classList.contains('active')) return entry.modal;
    _modalStack.splice(i, 1);
  }
  return null;
}

function getModalFocusable(modal) {
  return Array.from(modal.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]'))
    .filter(el => !el.disabled && el.tabIndex >= 0 && !el.closest('[hidden], [inert]')
      && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
}

function syncModalBackground() {
  const active = getActiveModal();
  _modalStack.forEach((entry, index) => { entry.modal.style.zIndex = String(200 + index); });
  _modalInertState.forEach((wasInert, el) => { el.inert = wasInert; });
  if (!active) { _modalInertState.clear(); return; }
  // Walk outwards so this also works when an overlay lives in an app wrapper.
  let branch = active;
  while (branch.parentElement) {
    Array.from(branch.parentElement.children).forEach(el => {
      if (el === branch || el.id === 'toast' || ['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName)) return;
      if (!_modalInertState.has(el)) _modalInertState.set(el, el.inert);
      el.inert = true;
    });
    branch = branch.parentElement;
    if (branch === document.body) break;
  }
}

function focusModal(modal) {
  const focusable = getModalFocusable(modal);
  const target = focusable.find(el => el.hasAttribute('autofocus')) || focusable[0] || modal;
  target.focus();
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  if (!_modalStack.some(entry => entry.modal === modal)) {
    _modalStack.push({ modal, previousFocus: document.activeElement, zIndex: modal.style.zIndex });
  }
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('tabindex', '-1');
  const heading = modal.querySelector('h1, h2, h3');
  if (heading) {
    if (!heading.id) heading.id = id + '-heading';
    modal.setAttribute('aria-labelledby', heading.id);
    modal.removeAttribute('aria-label');
  } else if (!modal.hasAttribute('aria-label')) {
    modal.setAttribute('aria-label', id.replace(/Modal$/, '').replace(/([a-z])([A-Z])/g, '$1 $2'));
  }
  modal.classList.add('active');
  syncModalBackground();
  focusModal(modal);
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  const wasActive = modal.classList.contains('active');
  const index = _modalStack.findIndex(entry => entry.modal === modal);
  const entry = index < 0 ? null : _modalStack.splice(index, 1)[0];
  modal.classList.remove('active');
  if (entry) modal.style.zIndex = entry.zIndex;
  modal.removeAttribute('aria-modal');
  syncModalBackground();
  const active = getActiveModal();
  let previous = entry && entry.previousFocus;
  if (previous && !previous.isConnected) {
    previous = previous.id ? document.getElementById(previous.id)
      : previous.matches('.hdr, [data-band-customize]') ? document.querySelector('#scheduleContainer .hdr, #scheduleContainer [data-band-customize]') : null;
  }
  if (previous && previous.isConnected && !previous.closest('[inert]')
      && (!active || active.contains(previous))) previous.focus();
  else if (active) focusModal(active);
  if (wasActive) modal.dispatchEvent(new CustomEvent('modalclose'));
}

let _toastTimer = null;
function toast(msg, duration) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), duration || 2200);
}

function closeDropdowns() {
  document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('open'));
}

document.addEventListener('click', e => {
  if (!e.target.closest('.dropdown')) closeDropdowns();
});

document.addEventListener('keydown', e => {
  if (e.defaultPrevented) return;
  const active = getActiveModal();
  if (!active) return;
  if (e.key === 'Tab') {
    const focusable = getModalFocusable(active);
    const first = focusable[0] || active;
    const last = focusable[focusable.length - 1] || active;
    if (e.shiftKey && (document.activeElement === first || !active.contains(document.activeElement))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !active.contains(document.activeElement))) {
      e.preventDefault(); first.focus();
    }
    return;
  }
  if (e.key !== 'Escape') return;
  if (active.id === 'staleWarningModal' || active.dataset.modalRequired === 'true') {
    e.preventDefault();
    return;
  }
  if (active.id === 'settingsModal' && typeof closeSettingsModal === 'function') {
    e.preventDefault();
    closeSettingsModal();
    return;
  }
  if (active.id === 'dayEventSheetModal' && typeof closeDayEventSheetModal === 'function') {
    e.preventDefault();
    closeDayEventSheetModal();
    return;
  }
  if (active.id === 'helpModal' && typeof closeHelpModal === 'function') {
    e.preventDefault();
    closeHelpModal();
    return;
  }
  if (active.id === 'versionModal' && typeof closeVersionPanel === 'function') {
    e.preventDefault();
    closeVersionPanel();
    return;
  }
  e.preventDefault();
  closeModal(active.id);
});

document.addEventListener('focusin', e => {
  const active = getActiveModal();
  if (active && !active.contains(e.target)) focusModal(active);
});

applyViewportUiScale();
window.addEventListener('resize', scheduleViewportUiScale);
window.addEventListener('orientationchange', scheduleViewportUiScale);
if (window.visualViewport && window.visualViewport.addEventListener) {
  window.visualViewport.addEventListener('resize', scheduleViewportUiScale);
}
