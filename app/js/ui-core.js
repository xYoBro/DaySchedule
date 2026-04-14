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

let _previousFocus = null;
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

applyViewportUiScale();
window.addEventListener('resize', scheduleViewportUiScale);
window.addEventListener('orientationchange', scheduleViewportUiScale);
if (window.visualViewport && window.visualViewport.addEventListener) {
  window.visualViewport.addEventListener('resize', scheduleViewportUiScale);
}
