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
  const value = normalizeText(t);
  if (!/^(?:\d{1,4}|\d{1,2}:\d{2})$/.test(value)) return '';
  return value.replace(':', '').padStart(4, '0');
}

function normalizeText(value) {
  return ['string', 'number', 'boolean'].includes(typeof value) ? String(value).trim() : '';
}

function isValidScheduleDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Entity ids are interpolated into attribute selectors ('[data-event-id="…"]'),
// so they must stay in a safe charset. Collection normalization also allocates
// unique IDs and maps exact source references before sanitizing those references.
function sanitizeEntityId(raw, prefix) {
  const id = sanitizeEntityRef(raw);
  return id || generateId(prefix);
}

function sanitizeEntityRef(raw) {
  const id = normalizeText(raw).replace(/[^A-Za-z0-9_-]/g, '');
  // Many renderers index plain objects by entity ID. Keep inherited object
  // keys out of that namespace as well as keeping selectors syntactically safe.
  return Object.prototype.hasOwnProperty.call(Object.prototype, id) ? 'id_' + id : id;
}

const SAFE_HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function normalizeEntityList(rawItems, normalize, prefix, usedIds, references) {
  const used = usedIds || new Set();
  return (Array.isArray(rawItems) ? rawItems : []).map(raw => {
    const item = normalize(raw);
    if (!item) return null;
    const base = item.id || generateId(prefix);
    let id = base;
    let suffix = 2;
    while (used.has(id)) id = base + '_' + suffix++;
    used.add(id);
    item.id = id;
    const sourceId = normalizeText(raw.id);
    if (references && sourceId && !references.has(sourceId)) {
      references.set(sourceId, id);
    }
    return item;
  }).filter(Boolean);
}

// "HHMM", minutes 00-59, within a single day. "2400" is a valid *end* time
// (end-of-day); the end>start check in normalizeEvent keeps it out of starts.
function isValidScheduleTime(hhmm) {
  if (!/^\d{4}$/.test(hhmm)) return false;
  if (parseInt(hhmm.slice(2, 4), 10) > 59) return false;
  return timeToMinutes(hhmm) <= 1440;
}

function normalizeEvent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  // A blank title must not erase the event: the editor writes '' to the Store
  // on every keystroke, so a reload mid-edit used to delete the whole record.
  const title = normalizeText(raw.title) || 'Untitled event';
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
    description: normalizeText(raw.description),
    location:    normalizeText(raw.location),
    poc:         normalizeText(raw.poc),
    groupId:     sanitizeEntityRef(raw.groupId),
    attendees:   normalizeText(raw.attendees),
    isBreak:     !!raw.isBreak,
    isMainEvent: raw.isMainEvent != null ? !!raw.isMainEvent : false,
  };
}

function normalizeGroup(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const color = typeof raw.color === 'string' ? raw.color.trim() : '';
  return {
    id:    sanitizeEntityId(raw.id, 'grp'),
    name:  normalizeText(raw.name) || 'Unnamed Group',
    scope: raw.scope === 'main' ? 'main' : 'limited',
    // Colors land inside style="…" attributes; only plain hex passes.
    color: SAFE_HEX_COLOR_RE.test(color) ? color : DEFAULT_COLOR_PALETTE[0],
  };
}

function normalizeNote(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const text = normalizeText(raw.text);
  const category = normalizeText(raw.category);
  // Only a note with nothing in it is dropped; a category with the text
  // momentarily cleared is still the user's note.
  if (!text && !category) return null;
  return {
    id:       sanitizeEntityId(raw.id, 'note'),
    category,
    text,
  };
}

function normalizeDay(raw, context) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const ctx = context || {};
  const startTime = normalizeTime(raw.startTime || '0700');
  const endTime = normalizeTime(raw.endTime || '1630');
  const validRange = isValidScheduleTime(startTime) && isValidScheduleTime(endTime)
    && timeToMinutes(endTime) > timeToMinutes(startTime);
  return {
    id:        sanitizeEntityId(raw.id, 'day'),
    date:      isValidScheduleDate(raw.date) ? raw.date : '',
    label:     normalizeText(raw.label) || null,
    startTime: validRange ? startTime : '0700',
    endTime:   validRange ? endTime : '1630',
    events:    normalizeEntityList(raw.events, event => {
      const normalized = normalizeEvent(event);
      if (normalized && ctx.groupRefs && ctx.groupRefs.has(normalizeText(event.groupId))) {
        normalized.groupId = ctx.groupRefs.get(normalizeText(event.groupId));
      }
      return normalized;
    }, 'evt', ctx.eventIds),
    notes:     normalizeEntityList(raw.notes, normalizeNote, 'note', ctx.noteIds),
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
  const groupRefs = new Map();
  const dayRefs = new Map();
  const groups = normalizeEntityList(Array.isArray(source.groups) ? source.groups : DEFAULT_GROUPS,
    normalizeGroup, 'grp', new Set(), groupRefs);
  const context = { groupRefs, eventIds: new Set(), noteIds: new Set() };
  const days = normalizeEntityList(source.days, day => normalizeDay(day, context), 'day', new Set(), dayRefs);
  if (opts.requireDays && !days.length) {
    throw new Error('Invalid schedule file \u2014 no valid days found.');
  }
  return {
    title: normalizeText(source.title),
    days,
    groups,
    // The logo goes straight into an <img src>; only inline image data is legal.
    logo: typeof source.logo === 'string' && /^data:image\//.test(source.logo) ? source.logo : null,
    footer: {
      contact: normalizeText(source.footer && source.footer.contact),
      poc: normalizeText(source.footer && source.footer.poc),
      updated: normalizeText(source.footer && source.footer.updated),
    },
    activeDay: dayRefs.get(normalizeText(source.activeDay)) || sanitizeEntityRef(source.activeDay) || null,
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
