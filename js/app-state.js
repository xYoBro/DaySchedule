let _title = '';
let _days = [];
let _groups = JSON.parse(JSON.stringify(DEFAULT_GROUPS));
let _logo = null;
let _activeDay = null;
let _footer = { contact: '', poc: '', updated: '' };

function getValidActiveDay(candidate) {
  if (!_days.length) return null;
  return _days.some(day => day.id === candidate) ? candidate : _days[0].id;
}

const Store = {
  getTitle()    { return _title; },
  setTitle(v)   { _title = v; },
  getLogo()     { return _logo; },
  setLogo(v)    { _logo = v; },
  getFooter()   { return _footer; },
  setFooter(v)  { _footer = { ..._footer, ...v }; },

  getDays()     { return _days; },
  addDay(d) {
    const day = {
      id: d.id || generateId('day'),
      date: d.date || '',
      label: d.label || null,
      startTime: d.startTime || '0700',
      endTime: d.endTime || '1630',
      events: [],
      notes: [],
    };
    _days.push(day);
    _days.sort((a, b) => a.date.localeCompare(b.date));
    return day;
  },
  getDay(dayId) {
    return _days.find(d => d.id === dayId) || null;
  },
  updateDay(dayId, updates) {
    const day = Store.getDay(dayId);
    if (!day) return;
    Object.assign(day, updates);
    if (updates.date != null) _days.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  },
  removeDay(dayId) {
    _days = _days.filter(d => d.id !== dayId);
  },

  getActiveDay()  { return _activeDay; },
  setActiveDay(v) { _activeDay = v; },

  getEvents(dayId) {
    const day = Store.getDay(dayId);
    return day ? day.events : [];
  },
  addEvent(dayId, e) {
    const day = Store.getDay(dayId);
    if (!day) return null;
    const group = Store.getGroup(e.groupId);
    const event = {
      id: e.id || generateId('evt'),
      title: e.title || '',
      startTime: e.startTime || '0700',
      endTime: e.endTime || '0730',
      description: e.description || '',
      location: e.location || '',
      poc: e.poc || '',
      groupId: e.groupId || '',
      isBreak: e.isBreak || false,
      isMainEvent: e.isMainEvent != null ? e.isMainEvent : (group ? group.scope === 'main' : false),
    };
    day.events.push(event);
    day.events.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    return event;
  },
  updateEvent(dayId, eventId, updates) {
    const day = Store.getDay(dayId);
    if (!day) return;
    const evt = day.events.find(e => e.id === eventId);
    if (!evt) return;
    Object.assign(evt, updates);
    day.events.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  },
  removeEvent(dayId, eventId) {
    const day = Store.getDay(dayId);
    if (!day) return;
    day.events = day.events.filter(e => e.id !== eventId);
  },

  getGroups()   { return _groups; },
  getGroup(id)  { return _groups.find(g => g.id === id) || null; },
  addGroup(g) {
    const group = {
      id: g.id || generateId('grp'),
      name: g.name || 'New Group',
      scope: g.scope || 'limited',
      color: g.color || DEFAULT_COLOR_PALETTE[_groups.length % DEFAULT_COLOR_PALETTE.length],
    };
    _groups.push(group);
    return group;
  },
  updateGroup(id, updates) {
    const g = Store.getGroup(id);
    if (g) Object.assign(g, updates);
  },
  removeGroup(id) {
    _groups = _groups.filter(g => g.id !== id);
  },

  getNotes(dayId) {
    const day = Store.getDay(dayId);
    return day ? day.notes : [];
  },
  addNote(dayId, n) {
    const day = Store.getDay(dayId);
    if (!day) return null;
    const note = { id: n.id || generateId('note'), category: n.category || '', text: n.text || '' };
    day.notes.push(note);
    return note;
  },
  updateNote(dayId, noteId, updates) {
    const day = Store.getDay(dayId);
    if (!day) return;
    const note = day.notes.find(n => n.id === noteId);
    if (note) Object.assign(note, updates);
  },
  removeNote(dayId, noteId) {
    const day = Store.getDay(dayId);
    if (!day) return;
    day.notes = day.notes.filter(n => n.id !== noteId);
  },

  snapshot() {
    return JSON.parse(JSON.stringify({
      title: _title, days: _days, groups: _groups, logo: _logo, footer: _footer, activeDay: _activeDay,
    }));
  },
  restore(snap) {
    _title = snap.title || '';
    _days = snap.days || [];
    _groups = snap.groups || JSON.parse(JSON.stringify(DEFAULT_GROUPS));
    _logo = snap.logo || null;
    _footer = snap.footer || { contact: '', poc: '', updated: '' };
    _activeDay = getValidActiveDay(snap.activeDay);
  },

  reset() {
    _title = '';
    _days = [];
    _groups = JSON.parse(JSON.stringify(DEFAULT_GROUPS));
    _logo = null;
    _activeDay = null;
    _footer = { contact: '', poc: '', updated: '' };
  },

  getPersistedState() {
    return { title: _title, days: _days, groups: _groups, logo: _logo, footer: _footer };
  },
  loadPersistedState(state) {
    if (!state || typeof state !== 'object') return;
    if (state.title != null) _title = state.title;
    if (Array.isArray(state.days)) _days = state.days.map(normalizeDay).filter(Boolean);
    if (Array.isArray(state.groups)) _groups = state.groups.map(normalizeGroup).filter(Boolean);
    if (state.logo !== undefined) _logo = state.logo;
    if (state.footer && typeof state.footer === 'object') {
      _footer = {
        contact: state.footer.contact || '',
        poc: state.footer.poc || '',
        updated: state.footer.updated || '',
      };
    }
    _activeDay = getValidActiveDay(state.activeDay != null ? state.activeDay : _activeDay);
  },
};
