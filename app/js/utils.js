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
  // Two decimals, trailing zeros trimmed: 75 min is "1.25 hrs", not "1.3 hrs".
  const hrs = Math.round((minutes / 60) * 100) / 100;
  return hrs + (hrs === 1 ? ' hr' : ' hrs');
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

function parseHexColor(color) {
  let hex = String(color || '').trim().replace(/^#/, '');
  if (/^[\da-f]{3,4}$/i.test(hex)) hex = hex.split('').map(ch => ch + ch).join('');
  if (!/^(?:[\da-f]{6}|[\da-f]{8})$/i.test(hex)) return null;
  return { rgb: [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255),
    alpha: hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1 };
}

function compositeColor(foreground, background) {
  return foreground.rgb.map((channel, i) => channel * foreground.alpha + background[i] * (1 - foreground.alpha));
}

function rgbLuminance(rgb) {
  const channels = rgb.map(channel => {
    return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function colorLuminance(color) {
  const parsed = parseHexColor(color);
  return parsed ? rgbLuminance(compositeColor(parsed, [1, 1, 1])) : null;
}

function getColorContrast(text, background) {
  const foreground = parseHexColor(text);
  const surface = parseHexColor(background);
  if (!foreground || !surface) return 0;
  const bg = compositeColor(surface, [1, 1, 1]);
  const a = rgbLuminance(compositeColor(foreground, bg));
  const b = rgbLuminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function getContrastingTextColor(bgColor) {
  if (colorLuminance(bgColor) === null) return '#1d1d1f';
  // Measure the actual dark ink, not black followed by a different return value.
  const dark = getColorContrast('#1d1d1f', bgColor);
  const white = getColorContrast('#ffffff', bgColor);
  if (dark >= 4.5 && dark >= white) return '#1d1d1f';
  return getColorContrast('#000000', bgColor) >= white ? '#000000' : '#ffffff';
}
