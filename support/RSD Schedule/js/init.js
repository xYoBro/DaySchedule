/* ── init.js ── Application bootstrap & sample data ────────────────────────── */

(function init() {
  // 1. Try saved state
  if (typeof SAVED_STATE !== 'undefined' && SAVED_STATE && SAVED_STATE.title) {
    Store.loadPersistedState(SAVED_STATE);
  }
  // 2. Try session storage
  else if (!sessionLoad()) {
    // 3. Load sample data
    loadSampleData();
  }

  // Set active day
  const days = Store.getDays();
  if (days.length && !Store.getActiveDay()) {
    Store.setActiveDay(days[0].id);
  }

  wireToolbar();
  renderActiveDay();
})();

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

  // Main events
  Store.addEvent(d, {
    title: 'Formation',
    startTime: '0700', endTime: '0730',
    description: 'Accountability formation. Flight chiefs take roll and report to First Sergeant.',
    location: 'Bldg 200 Apron', poc: 'First Sergeant',
    groupId: 'grp_all', isMainEvent: true,
  });

  Store.addEvent(d, {
    title: "Commander's Call",
    startTime: '0730', endTime: '0830',
    description: 'Wing CC addresses unit status, upcoming deployments, quarterly awards presentation.',
    location: 'Auditorium', poc: 'Wing Commander',
    groupId: 'grp_all', isMainEvent: true,
  });

  Store.addEvent(d, {
    title: 'Safety Briefing',
    startTime: '0830', endTime: '0900',
    description: '',
    location: 'Auditorium', poc: 'Safety Office',
    groupId: 'grp_all', isMainEvent: false,
  });

  Store.addEvent(d, {
    title: 'AFSC-Specific Training',
    startTime: '0900', endTime: '1100',
    description: 'Complete all outstanding CBTs and hands-on task certifications. Bring CAC reader. See your flight chief for the task priority list.',
    location: 'Respective Work Areas', poc: 'Flight Chiefs',
    groupId: 'grp_flight', isMainEvent: true,
  });

  Store.addEvent(d, {
    title: 'Lunch',
    startTime: '1100', endTime: '1200',
    description: '',
    location: '', poc: '',
    groupId: 'grp_all', isMainEvent: true, isBreak: true,
  });

  Store.addEvent(d, {
    title: 'Ancillary / CBT Completion',
    startTime: '1200', endTime: '1400',
    description: 'Complete all overdue ancillary training items. Computer labs open. See UTM for login issues.',
    location: 'Computer Labs / Work Areas', poc: 'UTM',
    groupId: 'grp_all', isMainEvent: true,
  });

  Store.addEvent(d, {
    title: 'Outprocessing',
    startTime: '1400', endTime: '1430',
    description: '',
    location: 'CSS Office', poc: 'CSS',
    groupId: 'grp_all', isMainEvent: false,
  });

  Store.addEvent(d, {
    title: 'Flight Debrief',
    startTime: '1430', endTime: '1500',
    description: '',
    location: 'Respective Areas', poc: 'Flight CCs',
    groupId: 'grp_flight', isMainEvent: false,
  });

  Store.addEvent(d, {
    title: 'Readiness Standup',
    startTime: '1500', endTime: '1600',
    description: 'Review weekend readiness metrics, open action items, next UTA planning inputs.',
    location: 'Conf Rm A', poc: 'CCF',
    groupId: 'grp_snco', isMainEvent: false,
  });

  Store.addEvent(d, {
    title: 'End of Day Formation',
    startTime: '1600', endTime: '1630',
    description: 'Final accountability. Sunday schedule announcements. Dismissed upon flight chief release.',
    location: 'Bldg 200 Apron', poc: 'First Sergeant',
    groupId: 'grp_all', isMainEvent: true,
  });

  // Concurrent events (limited scope, overlap with main events)
  Store.addEvent(d, {
    title: 'PT Testing',
    startTime: '0600', endTime: '0800',
    description: '',
    location: 'Fitness Center / Track', poc: 'UFPM',
    groupId: 'grp_chiefs', isMainEvent: false,
  });

  Store.addEvent(d, {
    title: 'E-7 Promotion Board',
    startTime: '0800', endTime: '1100',
    description: 'Board convenes for E-7 promotion evaluation. Service dress required.',
    location: 'Bldg 100, Conf Rm A', poc: 'CCC',
    groupId: 'grp_chiefs', isMainEvent: false,
  });

  Store.addEvent(d, {
    title: 'TCCC Training',
    startTime: '1200', endTime: '1630',
    description: 'Tactical Combat Casualty Care recertification.',
    location: 'Bldg 250, Med Sim Lab', poc: 'Medical Group',
    groupId: 'grp_chiefs', isMainEvent: false,
  });

  Store.addEvent(d, {
    title: 'IG Inspection Prep',
    startTime: '1230', endTime: '1500',
    description: 'Self-assessment review and document staging.',
    location: 'Bldg 100, Various', poc: 'Wing IG',
    groupId: 'grp_chiefs', isMainEvent: false,
  });

  // Notes
  Store.addNote(d, { category: 'Medical', text: 'A1C Snuffy (0900\u20131030, Bldg 460), MSgt Doe (1300\u20131400, VA Clinic), SrA Peters (1400\u20131500)' });
  Store.addNote(d, { category: 'TDY', text: 'TSgt Martinez returns NCOA Sunday \u2014 Day 2 only. SSgt Kim arrives 1000.' });
  Store.addNote(d, { category: 'Facility', text: 'Bldg 300 HVAC down. Events relocated to Bldg 200 overflow.' });
  Store.addNote(d, { category: 'Uniform', text: 'ABUs authorized for PT testing participants. UOD all others.' });
  Store.addNote(d, { category: 'Visitors', text: 'State HQ delegation arriving 1300. Escort required \u2014 CSS.' });
  Store.addNote(d, { category: 'Vehicle', text: 'GOV #4372 reserved medical transport 0830\u20131200. Keys at CSS.' });
  Store.addNote(d, { category: 'Dining', text: 'DFAC open 1100\u20131230. Pizza authorized for flights through lunch.' });
}
