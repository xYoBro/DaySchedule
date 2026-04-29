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

function normalizeEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = (raw.title || '').trim();
  if (!title) return null;
  const startTime = normalizeTime(raw.startTime);
  const endTime = normalizeTime(raw.endTime);
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) return null;
  return {
    id:          raw.id || generateId('evt'),
    title,
    startTime,
    endTime,
    description: (raw.description || '').trim(),
    location:    (raw.location || '').trim(),
    poc:         (raw.poc || '').trim(),
    groupId:     raw.groupId || '',
    attendees:   (raw.attendees || '').trim(),
    isBreak:     !!raw.isBreak,
    isMainEvent: raw.isMainEvent != null ? !!raw.isMainEvent : false,
  };
}

function normalizeGroup(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id:    raw.id || generateId('grp'),
    name:  (raw.name || 'Unnamed Group').trim(),
    scope: raw.scope === 'main' ? 'main' : 'limited',
    color: raw.color || DEFAULT_COLOR_PALETTE[0],
  };
}

function normalizeNote(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const text = (raw.text || '').trim();
  if (!text) return null;
  return {
    id:       raw.id || generateId('note'),
    category: (raw.category || '').trim(),
    text,
  };
}

function normalizeDay(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id:        raw.id || generateId('day'),
    date:      raw.date || '',
    label:     raw.label || null,
    startTime: normalizeTime(raw.startTime || '0700'),
    endTime:   normalizeTime(raw.endTime || '1630'),
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
    logo: source.logo !== undefined ? source.logo : null,
    footer: {
      contact: source.footer && source.footer.contact ? String(source.footer.contact) : '',
      poc: source.footer && source.footer.poc ? String(source.footer.poc) : '',
      updated: source.footer && source.footer.updated ? String(source.footer.updated) : '',
    },
    activeDay: source.activeDay || null,
    theme: source.theme || null,
  };
}
