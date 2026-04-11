/* ── init.js ── Contract ───────────────────────────────────────────────────
 *
 * EXPORTS:
 *   (IIFE — auto-executes on load, no callable exports)
 *   migrateSavedState(savedState)  — async — imports SAVED_STATE into library (idempotent)
 *   legacyBoot()                   — async — old-style boot for non-FSAPI browsers
 *   loadSampleData()               — populates Store with sample schedule
 *
 * REQUIRES:
 *   inspector.js  — wireToolbar(), renderActiveDay()
 *   library.js    — wireLibrary(), showLibrary()
 *   storage.js    — hasFSAPI(), restoreDirectoryHandle(), listScheduleFiles(),
 *                   scheduleNameToSlug(), buildScheduleFile(), writeScheduleFile(), getUserName()
 *   persistence.js — sessionLoad()
 *   app-state.js  — Store.loadPersistedState(), Store.getDays(), Store.setActiveDay(),
 *                   Store.reset(), Store.setTitle(), Store.setFooter(), Store.addDay(),
 *                   Store.addEvent(), Store.addNote()
 *   ui-core.js    — toast()
 *
 * LOAD ORDER: Must be the LAST script loaded. Depends on all other modules.
 *
 * BOOT FLOW:
 *   1. wireToolbar() + wireLibrary() — always, sets up UI event handlers
 *   2. hasFSAPI()? → No: legacyBoot() (old editor mode with fallback banner)
 *   3. restoreDirectoryHandle()? → Yes: migrate SAVED_STATE if present, showLibrary()
 *   4. No handle: load legacy data into Store, show connect prompt + library
 * ──────────────────────────────────────────────────────────────────────────── */

/* ── init.js ── Application bootstrap ──────────────────────────────────────── */

(async function init() {
  wireToolbar();
  wireLibrary();

  // Check FSAPI support
  if (!hasFSAPI()) {
    const banner = document.getElementById('libraryFallbackBanner');
    if (banner) banner.style.display = 'block';
    // No directory access — try legacy load paths
    await legacyBoot();
    return;
  }

  // Try restoring saved directory handle
  let handle = null;
  try {
    handle = await restoreDirectoryHandle();
  } catch (e) {
    console.warn('Failed to restore directory handle:', e);
  }

  if (handle) {
    // Check for SAVED_STATE migration
    if (typeof SAVED_STATE !== 'undefined' && SAVED_STATE && SAVED_STATE.title) {
      await migrateSavedState(SAVED_STATE);
    }
    showLibrary();
    return;
  }

  // No handle — check if we have legacy data to migrate
  if (typeof SAVED_STATE !== 'undefined' && SAVED_STATE && SAVED_STATE.title) {
    // Load into Store so user can see their data while we prompt for folder
    Store.loadPersistedState(SAVED_STATE);
    const days = Store.getDays();
    if (days.length) Store.setActiveDay(days[0].id);
  } else if (sessionLoad()) {
    const days = Store.getDays();
    if (days.length && !Store.getActiveDay()) Store.setActiveDay(days[0].id);
  }

  // Show library with connect prompt
  const prompt = document.getElementById('libraryConnectPrompt');
  if (prompt) prompt.style.display = 'block';
  showLibrary();
})();

async function migrateSavedState(savedState) {
  // Check if already migrated (a file with this title exists)
  const files = await listScheduleFiles();
  const slug = scheduleNameToSlug(savedState.title || 'Imported Schedule');
  const fileName = slug + '.json';
  const alreadyExists = files.some(f => f.fileName === fileName);
  if (alreadyExists) return;

  const userName = getUserName() || 'Migration';
  const fileData = buildScheduleFile(
    savedState.title || 'Imported Schedule',
    savedState,
    [],
    userName
  );

  await writeScheduleFile(fileName, fileData);
  toast('Migrated "' + (savedState.title || 'schedule') + '" to library');
}

async function legacyBoot() {
  // FSAPI not available — fall back to old behavior
  if (typeof SAVED_STATE !== 'undefined' && SAVED_STATE && SAVED_STATE.title) {
    Store.loadPersistedState(SAVED_STATE);
  } else if (!sessionLoad()) {
    loadSampleData();
  }

  const days = Store.getDays();
  if (days.length && !Store.getActiveDay()) {
    Store.setActiveDay(days[0].id);
  }

  // wireToolbar() already called in init — just render
  renderActiveDay();
}

function loadSampleData() {
  Store.setTitle('April RSD');
  Store.setFooter({
    contact: '142d Fighter Wing \u00b7 Uniform: UOD \u00b7 Duty Day: 0700\u20131630',
    poc: 'TSgt Williams',
    updated: '10 Mar 2026',
  });

  const day = Store.addDay({
    date: '2026-03-15',
    startTime: '0700',
    endTime: '1630',
  });

  const d = day.id;

  Store.addEvent(d, { title: 'Formation', startTime: '0700', endTime: '0730', description: 'Accountability formation.', location: 'Bldg 200 Apron', poc: 'First Sergeant', groupId: 'grp_all', isMainEvent: true });
  Store.addEvent(d, { title: "Commander's Call", startTime: '0730', endTime: '0830', description: 'Wing CC addresses unit status.', location: 'Auditorium', poc: 'Wing Commander', groupId: 'grp_all', isMainEvent: true });
  Store.addEvent(d, { title: 'Safety Briefing', startTime: '0830', endTime: '0900', location: 'Auditorium', poc: 'Safety Office', groupId: 'grp_all' });
  Store.addEvent(d, { title: 'AFSC-Specific Training', startTime: '0900', endTime: '1100', description: 'Complete outstanding CBTs and certifications.', location: 'Respective Work Areas', poc: 'Flight Chiefs', groupId: 'grp_flight', isMainEvent: true });
  Store.addEvent(d, { title: 'Lunch', startTime: '1100', endTime: '1200', groupId: 'grp_all', isMainEvent: true, isBreak: true });
  Store.addEvent(d, { title: 'Ancillary / CBT Completion', startTime: '1200', endTime: '1400', description: 'Complete overdue ancillary training.', location: 'Computer Labs', poc: 'UTM', groupId: 'grp_all', isMainEvent: true });
  Store.addEvent(d, { title: 'End of Day Formation', startTime: '1600', endTime: '1630', description: 'Final accountability.', location: 'Bldg 200 Apron', poc: 'First Sergeant', groupId: 'grp_all', isMainEvent: true });

  Store.addNote(d, { category: 'Uniform', text: 'ABUs authorized for PT testing participants. UOD all others.' });
  Store.addNote(d, { category: 'Dining', text: 'DFAC open 1100\u20131230.' });
}
