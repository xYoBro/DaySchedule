/* ── utils.js ── Contract ──────────────────────────────────────────────────
 *
 * EXPORTS:
 *   timeToMinutes(t)       — "0730" → 450. Handles "07:30" and "730"
 *   minutesToTime(m)       — 450 → "0730"
 *   formatDuration(min)    — 90 → "1.5 hrs", 30 → "30 min"
 *   generateId(prefix)     — "evt" → "evt_lx1abc_k9f2z" (unique)
 *   esc(s)                 — HTML-escapes &, <, >, ", '
 *   getContrastingTextColor(bgColor) — "#ffee88" → "#1d1d1f" or "#ffffff"
 *
 * REQUIRES: nothing
 *
 * CONSUMED BY:
 *   app-state.js   — generateId, timeToMinutes
 *   render.js      — esc, formatDuration, timeToMinutes
 *   inspector.js   — esc, timeToMinutes
 *   storage.js     — esc (via showStaleDataWarning, promptUserName)
 *   library.js     — esc
 *   versions.js    — esc
 *   data-helpers.js — timeToMinutes
 * ──────────────────────────────────────────────────────────────────────────── */

function timeToMinutes(t) {
  const s = String(t).replace(':', '').padStart(4, '0');
  return parseInt(s.slice(0, 2), 10) * 60 + parseInt(s.slice(2, 4), 10);
}

function minutesToTime(m) {
  const h = Math.floor(m / 60), min = m % 60;
  return String(h).padStart(2, '0') + String(min).padStart(2, '0');
}

function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) return '';
  if (minutes < 60) return minutes + ' min';
  const hrs = minutes / 60;
  return (hrs === Math.floor(hrs) ? hrs : hrs.toFixed(1)) + (hrs === 1 ? ' hr' : ' hrs');
}

function generateId(prefix) {
  return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Local error log ────────────────────────────────────────────────────────
// Zero-egress diagnostics: uncaught errors land in a small localStorage ring
// buffer that the Help modal shows next to the build stamp, so a user bug
// report can say what actually failed. Nothing leaves the machine.

const ERROR_LOG_KEY = 'dayschedule_error_log';
const ERROR_LOG_MAX = 20;

function getAppErrorLog() {
  try {
    const log = JSON.parse(localStorage.getItem(ERROR_LOG_KEY));
    return Array.isArray(log) ? log : [];
  } catch (e) {
    return [];
  }
}

function logAppError(kind, message, source) {
  try {
    const log = getAppErrorLog();
    log.unshift({
      at: new Date().toISOString(),
      kind: kind,
      message: String(message == null ? 'Unknown error' : message).slice(0, 500),
      source: String(source || '').slice(0, 200),
    });
    if (log.length > ERROR_LOG_MAX) log.length = ERROR_LOG_MAX;
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(log));
  } catch (e) {
    console.warn('Could not record error to the local log:', e);
  }
}

window.addEventListener('error', e => {
  logAppError('error', e.message, (e.filename || '') + (e.lineno ? ':' + e.lineno : ''));
});

window.addEventListener('unhandledrejection', e => {
  const reason = e.reason;
  logAppError('promise', reason && reason.message ? reason.message : reason, '');
});

function getContrastingTextColor(bgColor) {
  const fallback = '#1d1d1f';
  if (!bgColor) return fallback;

  const hex = String(bgColor).trim().replace(/^#/, '');
  const normalized = hex.length === 3
    ? hex.split('').map(ch => ch + ch).join('')
    : hex;

  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return fallback;

  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;

  function linearize(channel) {
    return channel <= 0.04045
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  }

  const luminance = (0.2126 * linearize(r)) + (0.7152 * linearize(g)) + (0.0722 * linearize(b));
  const whiteContrast = 1.05 / (luminance + 0.05);
  const darkContrast = (luminance + 0.05) / 0.05;
  return darkContrast >= whiteContrast ? '#1d1d1f' : '#ffffff';
}
