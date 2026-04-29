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
    if (typeof SAVED_STATE !== 'undefined' && hasSavedScheduleState(SAVED_STATE)) {
      await migrateSavedState(SAVED_STATE);
    }
    showLibrary();
    return;
  }

  // No handle — check if we have legacy data to migrate
  if (typeof SAVED_STATE !== 'undefined' && hasSavedScheduleState(SAVED_STATE)) {
    // Load into Store so user can see their data while we prompt for folder
    Store.loadPersistedState(SAVED_STATE);
  } else if (sessionLoad()) {
    const days = Store.getDays();
    if (days.length && !Store.getActiveDay()) Store.setActiveDay(days[0].id);
  }

  showLibrary();
})();

function hasSavedScheduleState(state) {
  return !!(state && Array.isArray(state.days));
}

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
  if (typeof SAVED_STATE !== 'undefined' && hasSavedScheduleState(SAVED_STATE)) {
    Store.loadPersistedState(SAVED_STATE);
  } else if (!sessionLoad()) {
    loadSampleData();
  }

  const days = Store.getDays();
  if (days.length && !Store.getActiveDay()) {
    Store.setActiveDay(days[0].id);
  }

  if (typeof syncCurrentScheduleAccess === 'function') {
    await syncCurrentScheduleAccess();
  }
  syncToolbarTitle();
  renderActiveDay();
  renderInspector();
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

  // Add two more groups for density
  Store.addGroup({ id: 'grp_mx', name: 'Maintenance', scope: 'limited', color: '#1a7a40' });
  Store.addGroup({ id: 'grp_med', name: 'Medical', scope: 'limited', color: '#c23616' });

  // === Shared events (main scope — all personnel) ===
  Store.addEvent(d, { title: 'Formation', startTime: '0700', endTime: '0715', description: 'Accountability formation. Flight chiefs take roll.', location: 'Bldg 200 Apron', poc: 'First Sergeant', groupId: 'grp_all', isMainEvent: true });
  Store.addEvent(d, { title: "Commander's Call", startTime: '0715', endTime: '0800', description: 'Wing CC addresses unit status, awards, deployment update.', location: 'Auditorium', poc: 'Wing Commander', groupId: 'grp_all', isMainEvent: true });
  Store.addEvent(d, { title: 'Safety Stand-Down', startTime: '0800', endTime: '0830', description: 'Quarterly safety briefing — road hazards, heat cat procedures.', location: 'Auditorium', poc: 'Safety Office', groupId: 'grp_all', isMainEvent: true });
  Store.addEvent(d, { title: 'Lunch', startTime: '1100', endTime: '1200', groupId: 'grp_all', isMainEvent: true, isBreak: true });
  Store.addEvent(d, { title: 'All-Hands Cyber Awareness', startTime: '1500', endTime: '1530', description: 'Annual cyber awareness training — mandatory for all.', location: 'Auditorium', poc: 'Comm Sq', groupId: 'grp_all', isMainEvent: true });
  Store.addEvent(d, { title: 'End of Day Formation', startTime: '1600', endTime: '1630', description: 'Final accountability. Sunday schedule. Dismissed by flight.', location: 'Bldg 200 Apron', poc: 'First Sergeant', groupId: 'grp_all', isMainEvent: true });

  // === By Flight (main scope — anchor events that limited groups run concurrent with) ===
  Store.addEvent(d, { title: 'Flight PT Test', startTime: '0600', endTime: '0700', description: 'Diagnostic PT test — run, push-ups, sit-ups.', location: 'Fitness Center / Track', poc: 'UFPM', groupId: 'grp_flight', isMainEvent: true });
  Store.addEvent(d, { title: 'AFSC-Specific Training', startTime: '0830', endTime: '1100', description: 'Report to respective work areas. Complete task certifications and hands-on training per flight chief task list.', location: 'Respective Work Areas', poc: 'Flight Chiefs', groupId: 'grp_flight', isMainEvent: true });
  Store.addEvent(d, { title: 'Ancillary / CBT Completion', startTime: '1200', endTime: '1500', description: 'Complete all overdue ancillary training items. Computer labs open. See UTM for login issues.', location: 'Computer Labs / Work Areas', poc: 'UTM', groupId: 'grp_flight', isMainEvent: true });

  // === SNCOs — limited scope ===
  Store.addEvent(d, { title: 'CBRN Training', startTime: '0830', endTime: '1000', description: 'MOPP gear donning/doffing, decon procedures. Bring canteen and wet weather gear.', location: 'Bldg 250 Chem Lab', poc: 'TSgt Rivera', groupId: 'grp_snco' });
  Store.addEvent(d, { title: 'NCO Professional Dev', startTime: '1000', endTime: '1100', description: 'Mentorship workshop and EPR writing clinic.', location: 'Bldg 100 Rm 204', poc: 'CMSgt Daniels', groupId: 'grp_snco' });
  Store.addEvent(d, { title: 'IG Self-Assessment', startTime: '1200', endTime: '1400', description: 'Review checklists, stage binders for inspection.', location: 'Bldg 100 Conf Rm', poc: 'Wing IG', groupId: 'grp_snco' });
  Store.addEvent(d, { title: 'SNCO Induction Rehearsal', startTime: '1400', endTime: '1500', description: 'Run-through for next month ceremony.', location: 'Heritage Hall', poc: 'CCC', groupId: 'grp_snco' });

  // === Flight Chiefs — limited scope ===
  Store.addEvent(d, { title: 'Weapons Qualification', startTime: '0830', endTime: '1100', description: 'M4 qual tables. 80 rds/person. Eye/ear pro required.', location: 'Range 3', poc: 'MSgt Kowalski', groupId: 'grp_chiefs', attendees: 'RSO: TSgt Park, Ammo: SrA Bell' });
  Store.addEvent(d, { title: 'TCCC Recertification', startTime: '1200', endTime: '1400', description: 'Tactical Combat Casualty Care scenarios with IFAK.', location: 'Med Sim Lab, Bldg 460', poc: 'Medical Group', groupId: 'grp_chiefs' });
  Store.addEvent(d, { title: 'Convoy Ops Brief', startTime: '1400', endTime: '1500', description: 'Route planning, comms check, vehicle TM review.', location: 'Motor Pool', poc: 'MSgt Franklin', groupId: 'grp_chiefs' });

  // === Maintenance — limited scope ===
  Store.addEvent(d, { title: 'Tool Inventory', startTime: '0830', endTime: '0930', description: 'CTK accountability. All shadow boards verified.', location: 'Hangar 4', poc: 'MSgt Reeves', groupId: 'grp_mx' });
  Store.addEvent(d, { title: 'TO Library Update', startTime: '0930', endTime: '1100', description: 'Update tech orders, verify TCTO compliance status.', location: 'Hangar 4 Office', poc: 'TSgt Okonkwo', groupId: 'grp_mx' });
  Store.addEvent(d, { title: 'Aircraft Launch Sim', startTime: '1200', endTime: '1400', description: 'Simulated aircraft generation exercise. Full crew sequence.', location: 'Hangar 4 / Apron', poc: 'Pro Super', groupId: 'grp_mx', attendees: 'Crew chiefs, specialists, AGE' });
  Store.addEvent(d, { title: 'FOD Walk', startTime: '1400', endTime: '1430', description: 'Flight line FOD walk-down.', location: 'Flight Line', poc: 'QA', groupId: 'grp_mx' });
  Store.addEvent(d, { title: 'MX Debrief', startTime: '1430', endTime: '1500', description: 'Maintenance status, discrepancies, next UTA prep.', location: 'Hangar 4 Office', poc: 'MX Sup', groupId: 'grp_mx' });

  // === Medical — limited scope ===
  Store.addEvent(d, { title: 'PHA Screenings', startTime: '0830', endTime: '1100', description: 'Periodic health assessments. Fasting required for labs.', location: 'Clinic, Bldg 460', poc: 'Capt Nguyen', groupId: 'grp_med', attendees: 'All members due PHA per IMR' });
  Store.addEvent(d, { title: 'SABC Refresher', startTime: '1200', endTime: '1330', description: 'Self/buddy aid recertification — tourniquet, NPA, chest seal.', location: 'Clinic Training Rm', poc: 'TSgt Adams', groupId: 'grp_med' });
  Store.addEvent(d, { title: 'Immunization Clinic', startTime: '1330', endTime: '1500', description: 'Flu, anthrax series, COVID boosters. Walk-ins OK.', location: 'Clinic, Bldg 460', poc: 'Immunizations', groupId: 'grp_med' });

  // === Notes ===
  Store.addNote(d, { category: 'Uniform', text: 'ABUs authorized for PT test, range detail, and MX. UOD all others.' });
  Store.addNote(d, { category: 'Medical', text: 'A1C Snuffy (0900\u20131030, Bldg 460), MSgt Doe (1300\u20131400, VA Clinic), SrA Peters (1400\u20131500)' });
  Store.addNote(d, { category: 'TDY', text: 'TSgt Martinez returns NCOA Sunday \u2014 Day 2 only. SSgt Kim arrives 1000.' });
  Store.addNote(d, { category: 'Facility', text: 'Bldg 300 HVAC down. Events relocated to Bldg 200 overflow.' });
  Store.addNote(d, { category: 'Vehicle', text: 'GOV #4372 reserved medical transport 0830\u20131200. GOV #4501 reserved range detail. Keys at CSS.' });
  Store.addNote(d, { category: 'Dining', text: 'DFAC open 1100\u20131230. Pizza authorized for flights through lunch.' });
  Store.addNote(d, { category: 'Equipment', text: 'Range: M4s drawn from armory NLT 0800. Return by 1130. POC: MSgt Kowalski.' });
  Store.addNote(d, { category: 'Visitors', text: 'State HQ delegation arriving 1300. Escort required \u2014 CSS.' });

  // Keep the sample schedule immediately interactive for render and shell flows.
  Store.setActiveDay(d);
}
