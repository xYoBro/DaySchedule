/* ── schema.js ── Contract ─────────────────────────────────────────────────
 *
 * EXPORTS:
 *   normalizeTime(t)    — "730" → "0730", "07:30" → "0730"
 *   normalizeEvent(raw) → {id, title, startTime, endTime, ...} | null
 *   normalizeGroup(raw) → {id, name, scope, color} | null
 *   normalizeNote(raw)  → {id, category, text} | null
 *   normalizeDay(raw)   → {id, date, label, startTime, endTime, events[], notes[]} | null
 *   extractSchedulePayload(raw) → {state, fileData}
 *   normalizePersistedState(raw, options?) → persisted Store shape
 *
 * REQUIRES:
 *   utils.js     — generateId()
 *   constants.js — DEFAULT_COLOR_PALETTE
 *
 * CONSUMED BY:
 *   persistence.js — normalizeDay, normalizeGroup (on import)
 * ──────────────────────────────────────────────────────────────────────────── */

function normalizeTime(t) {
  return String(t || '').replace(':', '').padStart(4, '0');
}

// Entity ids are interpolated into attribute selectors ('[data-event-id="…"]'),
// so they must stay in a safe charset. Stripping (not regenerating) keeps
// references consistent: a day id and the activeDay pointing at it sanitize
// to the same string.
function sanitizeEntityId(raw, prefix) {
  const id = String(raw == null ? '' : raw).replace(/[^A-Za-z0-9_-]/g, '');
  return id || generateId(prefix);
}

function sanitizeEntityRef(raw) {
  return String(raw == null ? '' : raw).replace(/[^A-Za-z0-9_-]/g, '');
}

const SAFE_HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

// "HHMM", minutes 00-59, within a single day. "2400" is a valid *end* time
// (end-of-day); the end>start check in normalizeEvent keeps it out of starts.
function isValidScheduleTime(hhmm) {
  if (!/^\d{4}$/.test(hhmm)) return false;
  if (parseInt(hhmm.slice(2, 4), 10) > 59) return false;
  return timeToMinutes(hhmm) <= 1440;
}

function normalizeEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  // A blank title must not erase the event: the editor writes '' to the Store
  // on every keystroke, so a reload mid-edit used to delete the whole record.
  const title = (raw.title || '').trim() || 'Untitled event';
  const startTime = normalizeTime(raw.startTime);
  const endTime = normalizeTime(raw.endTime);
  // Rejects malformed times (which would render as "NaN hrs" and sort
  // arbitrarily) and cross-midnight ranges (the day model is a 0000-2400
  // axis; every renderer assumes end > start within one day).
  if (!isValidScheduleTime(startTime) || !isValidScheduleTime(endTime)) return null;
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) return null;
  return {
    id:          sanitizeEntityId(raw.id, 'evt'),
    title,
    startTime,
    endTime,
    description: (raw.description || '').trim(),
    location:    (raw.location || '').trim(),
    poc:         (raw.poc || '').trim(),
    groupId:     sanitizeEntityRef(raw.groupId),
    attendees:   (raw.attendees || '').trim(),
    isBreak:     !!raw.isBreak,
    isMainEvent: raw.isMainEvent != null ? !!raw.isMainEvent : false,
  };
}

function normalizeGroup(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const color = typeof raw.color === 'string' ? raw.color.trim() : '';
  return {
    id:    sanitizeEntityId(raw.id, 'grp'),
    name:  (raw.name || 'Unnamed Group').trim(),
    scope: raw.scope === 'main' ? 'main' : 'limited',
    // Colors land inside style="…" attributes; only plain hex passes.
    color: SAFE_HEX_COLOR_RE.test(color) ? color : DEFAULT_COLOR_PALETTE[0],
  };
}

function normalizeNote(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const text = (raw.text || '').trim();
  const category = (raw.category || '').trim();
  // Only a note with nothing in it is dropped; a category with the text
  // momentarily cleared is still the user's note.
  if (!text && !category) return null;
  return {
    id:       sanitizeEntityId(raw.id, 'note'),
    category,
    text,
  };
}

function normalizeDay(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const startTime = normalizeTime(raw.startTime || '0700');
  const endTime = normalizeTime(raw.endTime || '1630');
  return {
    id:        sanitizeEntityId(raw.id, 'day'),
    date:      raw.date || '',
    label:     raw.label || null,
    startTime: isValidScheduleTime(startTime) ? startTime : '0700',
    endTime:   isValidScheduleTime(endTime) ? endTime : '1630',
    events:    Array.isArray(raw.events) ? raw.events.map(normalizeEvent).filter(Boolean) : [],
    notes:     Array.isArray(raw.notes) ? raw.notes.map(normalizeNote).filter(Boolean) : [],
  };
}

function extractSchedulePayload(raw) {
  if (raw && typeof raw === 'object' && raw.current && typeof raw.current === 'object') {
    return { state: raw.current, fileData: raw };
  }
  return { state: raw, fileData: null };
}

function normalizePersistedState(raw, options) {
  const opts = options || {};
  const source = raw && typeof raw === 'object' ? raw : {};
  const days = Array.isArray(source.days) ? source.days.map(normalizeDay).filter(Boolean) : [];
  if (opts.requireDays && !days.length) {
    throw new Error('Invalid schedule file \u2014 no valid days found.');
  }
  const groups = Array.isArray(source.groups)
    ? source.groups.map(normalizeGroup).filter(Boolean)
    : JSON.parse(JSON.stringify(DEFAULT_GROUPS));
  return {
    title: source.title != null ? String(source.title) : '',
    days,
    groups,
    // The logo goes straight into an <img src>; only inline image data is legal.
    logo: typeof source.logo === 'string' && /^data:image\//.test(source.logo) ? source.logo : null,
    footer: {
      contact: source.footer && source.footer.contact ? String(source.footer.contact) : '',
      poc: source.footer && source.footer.poc ? String(source.footer.poc) : '',
      updated: source.footer && source.footer.updated ? String(source.footer.updated) : '',
    },
    activeDay: sanitizeEntityRef(source.activeDay) || null,
    theme: normalizeScheduleTheme(source.theme),
  };
}

// Shape-level check only: keeps the three known keys as the right types.
// Value whitelisting (skin/palette names, hex colors) lives in
// getScheduleTheme (themes.js), the one funnel every consumer reads through.
function normalizeScheduleTheme(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const theme = {};
  if (typeof raw.skin === 'string') theme.skin = raw.skin;
  if (typeof raw.palette === 'string') theme.palette = raw.palette;
  if (raw.customColors && typeof raw.customColors === 'object' && !Array.isArray(raw.customColors)) {
    theme.customColors = raw.customColors;
  }
  return (theme.skin || theme.palette || theme.customColors) ? theme : null;
}
