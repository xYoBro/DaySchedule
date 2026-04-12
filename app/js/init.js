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
 *   themes.js     — applyEditorTheme(), getEditorTheme()
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
  applyEditorTheme(getEditorTheme());

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

  // === Shared events (main scope — all personnel) ===
  Store.addEvent(d, { title: 'Formation', startTime: '0700', endTime: '0730', description: 'Accountability formation. Flight chiefs take roll and report to First Sergeant.', location: 'Bldg 200 Apron', poc: 'First Sergeant', groupId: 'grp_all', isMainEvent: true });
  Store.addEvent(d, { title: "Commander's Call", startTime: '0730', endTime: '0830', description: 'Wing CC addresses unit status, upcoming deployments, quarterly awards.', location: 'Auditorium', poc: 'Wing Commander', groupId: 'grp_all', isMainEvent: true });
  Store.addEvent(d, { title: 'Lunch', startTime: '1100', endTime: '1200', groupId: 'grp_all', isMainEvent: true, isBreak: true });
  Store.addEvent(d, { title: 'End of Day Formation', startTime: '1600', endTime: '1630', description: 'Final accountability. Sunday schedule announcements.', location: 'Bldg 200 Apron', poc: 'First Sergeant', groupId: 'grp_all', isMainEvent: true });

  // === By Flight events (main scope) ===
  Store.addEvent(d, { title: 'Safety Briefing', startTime: '0830', endTime: '0900', description: 'Quarterly safety stand-down briefing.', location: 'Auditorium', poc: 'Safety Office', groupId: 'grp_flight', isMainEvent: true });

  // === SNCOs — limited scope, concurrent with main ===
  Store.addEvent(d, { title: 'CBRN Training', startTime: '0900', endTime: '1100', description: 'MOPP gear donning/doffing, decon procedures. Bring canteen.', location: 'Bldg 250 Chem Lab', poc: 'TSgt Rivera', groupId: 'grp_snco' });
  Store.addEvent(d, { title: 'NCO Professional Development', startTime: '1200', endTime: '1400', description: 'Mentorship workshop and EPR writing clinic.', location: 'Bldg 100 Rm 204', poc: 'CMSgt Daniels', groupId: 'grp_snco' });
  Store.addEvent(d, { title: 'IG Self-Assessment Review', startTime: '1400', endTime: '1600', description: 'Review self-assessment checklists, stage binders for inspection.', location: 'Bldg 100 Conf Rm', poc: 'Wing IG', groupId: 'grp_snco' });

  // === Flight Chiefs — limited scope, concurrent with main ===
  Store.addEvent(d, { title: 'Weapons Qualification', startTime: '0900', endTime: '1100', description: 'M4 qualification tables. 80 rds per person. Eye/ear pro required.', location: 'Range 3', poc: 'MSgt Kowalski', groupId: 'grp_chiefs', attendees: 'RSO: TSgt Park, Ammo: SrA Bell' });
  Store.addEvent(d, { title: 'TCCC Recertification', startTime: '1200', endTime: '1400', description: 'Tactical Combat Casualty Care. Hands-on scenarios with IFAK.', location: 'Med Sim Lab, Bldg 460', poc: 'Medical Group', groupId: 'grp_chiefs' });
  Store.addEvent(d, { title: 'Convoy Operations Brief', startTime: '1400', endTime: '1530', description: 'Route planning, comms check, vehicle TM review for FTX next month.', location: 'Motor Pool', poc: 'MSgt Franklin', groupId: 'grp_chiefs' });

  // === Additional concurrent events using the existing By Flight group ===
  Store.addEvent(d, { title: 'CBT Completion Lab', startTime: '0900', endTime: '1100', description: 'Complete all overdue CBTs. Bring CAC reader. See UTM for login issues.', location: 'Computer Lab, Bldg 100', poc: 'UTM', groupId: 'grp_flight' });
  Store.addEvent(d, { title: 'Equipment Inventory', startTime: '1200', endTime: '1400', description: 'Annual inventory of flight equipment. Hand receipts required.', location: 'Supply Bldg 180', poc: 'SSgt Yamamoto', groupId: 'grp_flight' });
  Store.addEvent(d, { title: 'Readiness Standup', startTime: '1400', endTime: '1600', description: 'Review weekend readiness metrics, open action items, next UTA planning.', location: 'Conf Rm A', poc: 'CCF', groupId: 'grp_flight' });

  // === Notes ===
  Store.addNote(d, { category: 'Uniform', text: 'ABUs authorized for PT testing participants and range detail. UOD all others.' });
  Store.addNote(d, { category: 'Medical', text: 'A1C Snuffy (0900\u20131030, Bldg 460), MSgt Doe (1300\u20131400, VA Clinic)' });
  Store.addNote(d, { category: 'TDY', text: 'TSgt Martinez returns NCOA Sunday \u2014 Day 2 only.' });
  Store.addNote(d, { category: 'Facility', text: 'Bldg 300 HVAC down. Events relocated to Bldg 200 overflow.' });
  Store.addNote(d, { category: 'Vehicle', text: 'GOV #4372 reserved for medical transport 0830\u20131200. Keys at CSS.' });
  Store.addNote(d, { category: 'Dining', text: 'DFAC open 1100\u20131230. Pizza authorized for flights through lunch.' });
}
