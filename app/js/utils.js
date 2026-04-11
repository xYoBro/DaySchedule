/* ── utils.js ── Contract ──────────────────────────────────────────────────
 *
 * EXPORTS:
 *   timeToMinutes(t)       — "0730" → 450. Handles "07:30" and "730"
 *   minutesToTime(m)       — 450 → "0730"
 *   formatDuration(min)    — 90 → "1.5 hrs", 30 → "30 min"
 *   generateId(prefix)     — "evt" → "evt_lx1abc_k9f2z" (unique)
 *   esc(s)                 — HTML-escapes &, <, >, "
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
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
