// tests/print-test-data.js
// Stress case setup functions for print testing.
// Each function is self-contained JS that runs inside page.evaluate().
// It calls Store methods directly, then triggers renderActiveDay().

const PRINT_TEST_CASES = [
  {
    name: 'sample',
    expectedPages: 1,
    setupFn: `
      loadSampleData();
      Store.setActiveDay(Store.getDays()[0].id);
      renderActiveDay();
    `,
  },
  {
    name: 'heavy-events',
    expectedPages: 1,
    setupFn: `
      Store.reset();
      Store.setTitle('Stress Test — Heavy Events');
      Store.setFooter({ contact: 'Test Wing · Uniform: UOD', poc: 'Test POC' });
      const day = Store.addDay({ date: '2026-01-01', startTime: '0600', endTime: '1800' });
      const d = day.id;
      Store.setActiveDay(d);

      // 12 main events across the day
      const mainTimes = [
        ['0600','0700'], ['0700','0800'], ['0800','0900'], ['0900','1000'],
        ['1000','1100'], ['1100','1200'], ['1200','1300'], ['1300','1400'],
        ['1400','1500'], ['1500','1600'], ['1600','1700'], ['1700','1800'],
      ];
      const mainTitles = [
        'Morning Formation', 'Safety Briefing', 'Commander\\'s Call', 'Mission Brief',
        'Skills Training', 'Weapons Qualification', 'Lunch', 'CBRN Training',
        'Physical Readiness', 'Equipment Inspection', 'After Action Review', 'End of Day',
      ];
      mainTimes.forEach(([s, e], i) => {
        Store.addEvent(d, {
          title: mainTitles[i],
          startTime: s, endTime: e,
          description: i % 2 === 0 ? 'Detailed description for this event block.' : '',
          location: 'Bldg ' + (100 + i), poc: 'POC ' + (i + 1),
          groupId: 'grp_all',
          isMainEvent: mainTitles[i] !== 'Lunch',
          isBreak: mainTitles[i] === 'Lunch',
        });
      });

      // 6 supporting events
      const supTimes = [['0630','0700'],['0830','0900'],['1030','1100'],['1330','1400'],['1530','1600'],['1730','1800']];
      supTimes.forEach(([s, e], i) => {
        Store.addEvent(d, {
          title: 'Flight Detail ' + (i + 1),
          startTime: s, endTime: e,
          location: 'Area ' + (i + 1), poc: 'Flight CC',
          groupId: 'grp_flight', isMainEvent: false,
        });
      });

      // 4 breaks
      [['0555','0600'],['1155','1200'],['1355','1400'],['1755','1800']].forEach(([s, e], i) => {
        Store.addEvent(d, {
          title: ['Travel','Lunch Break','Transition','Closeout'][i],
          startTime: s, endTime: e,
          groupId: 'grp_all', isMainEvent: true, isBreak: true,
        });
      });

      // 3 notes
      Store.addNote(d, { category: 'Admin', text: 'Sign in at CSS by 0545.' });
      Store.addNote(d, { category: 'Medical', text: 'Sick call 0600-0700 at clinic.' });
      Store.addNote(d, { category: 'Uniform', text: 'ABUs all day. PT gear for Physical Readiness block.' });

      renderActiveDay();
    `,
  },
  {
    name: 'heavy-notes',
    expectedPages: 1,
    setupFn: `
      Store.reset();
      Store.setTitle('Stress Test — Heavy Notes');
      Store.setFooter({ contact: 'Test Wing', poc: 'Test POC' });
      const day = Store.addDay({ date: '2026-01-02', startTime: '0700', endTime: '1630' });
      const d = day.id;
      Store.setActiveDay(d);

      // 8 normal events
      const times = [['0700','0800'],['0800','0900'],['0900','1000'],['1000','1100'],['1100','1200'],['1200','1300'],['1300','1400'],['1400','1500']];
      const titles = ['Formation','Briefing','Training Block 1','Training Block 2','Lunch','Training Block 3','Debrief','Dismissal'];
      times.forEach(([s, e], i) => {
        Store.addEvent(d, {
          title: titles[i], startTime: s, endTime: e,
          description: 'Standard event description.',
          location: 'Bldg 200', poc: 'POC',
          groupId: 'grp_all', isMainEvent: true,
          isBreak: titles[i] === 'Lunch',
        });
      });

      // 12 notes with long-ish text
      const cats = ['Medical','TDY','Facility','Uniform','Visitors','Vehicle','Dining','Safety','Admin','Personnel','Equipment','Comms'];
      cats.forEach((cat, i) => {
        Store.addNote(d, {
          category: cat,
          text: 'Note detail line for ' + cat.toLowerCase() + ' operations. Contact section lead for questions. Ref: Policy ' + (100 + i) + '.',
        });
      });

      renderActiveDay();
    `,
  },
  {
    name: 'many-concurrent',
    expectedPages: 1,
    setupFn: `
      Store.reset();
      Store.setTitle('Stress Test — Many Concurrent');
      Store.setFooter({ contact: 'Test Wing', poc: 'Test POC' });
      const day = Store.addDay({ date: '2026-01-03', startTime: '0700', endTime: '1630' });
      const d = day.id;
      Store.setActiveDay(d);

      // 6 main events
      [['0700','0800'],['0800','0930'],['0930','1100'],['1100','1200'],['1200','1400'],['1400','1630']].forEach(([s, e], i) => {
        Store.addEvent(d, {
          title: ['Formation','Block 1','Block 2','Lunch','Block 3','Closeout'][i],
          startTime: s, endTime: e,
          description: i === 0 ? 'Accountability and announcements.' : '',
          location: 'Main Area', poc: 'OIC',
          groupId: 'grp_all', isMainEvent: true,
          isBreak: i === 3,
        });
      });

      // 8 limited-scope concurrent events overlapping main events
      const concTitles = ['Promo Board','Medical Evals','IG Prep','TCCC Cert','Weapons Draw','Intel Brief','Awards Board','Flight Chief Sync'];
      const concTimes = [['0730','1100'],['0800','1000'],['0900','1200'],['1200','1600'],['1300','1500'],['1400','1600'],['0700','0900'],['1500','1630']];
      concTimes.forEach(([s, e], i) => {
        Store.addEvent(d, {
          title: concTitles[i], startTime: s, endTime: e,
          description: 'Concurrent event detail.',
          location: 'Bldg ' + (300 + i), poc: 'Lead ' + (i + 1),
          groupId: 'grp_chiefs', isMainEvent: false,
        });
      });

      Store.addNote(d, { category: 'Admin', text: 'All concurrent events require prior coordination with CSS.' });

      renderActiveDay();
    `,
  },
  {
    name: 'minimal',
    expectedPages: 1,
    setupFn: `
      Store.reset();
      Store.setTitle('Minimal Schedule');
      Store.setFooter({ contact: 'Test Wing', poc: 'Test POC' });
      const day = Store.addDay({ date: '2026-01-04', startTime: '0800', endTime: '0900' });
      Store.setActiveDay(day.id);
      Store.addEvent(day.id, {
        title: 'Single Event',
        startTime: '0800', endTime: '0900',
        description: 'The only event.',
        location: 'Room 1', poc: 'OIC',
        groupId: 'grp_all', isMainEvent: true,
      });
      renderActiveDay();
    `,
  },
  {
    name: 'multi-day',
    expectedPages: 3,
    setupFn: `
      Store.reset();
      Store.setTitle('Multi-Day Stress');
      Store.setFooter({ contact: 'Test Wing', poc: 'Test POC' });

      // Day 1: heavy
      const d1 = Store.addDay({ date: '2026-02-01', startTime: '0600', endTime: '1800' });
      for (let i = 0; i < 10; i++) {
        const h = 6 + i;
        Store.addEvent(d1.id, {
          title: 'Event ' + (i + 1), startTime: String(h).padStart(2,'0') + '00', endTime: String(h + 1).padStart(2,'0') + '00',
          description: 'Description for event ' + (i + 1) + '.',
          location: 'Loc ' + i, poc: 'POC ' + i,
          groupId: 'grp_all', isMainEvent: true,
        });
      }
      for (let i = 0; i < 5; i++) {
        Store.addNote(d1.id, { category: 'Cat ' + i, text: 'Note text for category ' + i + '.' });
      }

      // Day 2: normal
      const d2 = Store.addDay({ date: '2026-02-02', startTime: '0700', endTime: '1630' });
      for (let i = 0; i < 5; i++) {
        const h = 7 + i * 2;
        Store.addEvent(d2.id, {
          title: 'Day 2 Event ' + (i + 1), startTime: String(h).padStart(2,'0') + '00', endTime: String(h + 2).padStart(2,'0') + '00',
          location: 'Area', poc: 'Lead',
          groupId: 'grp_all', isMainEvent: true,
        });
      }

      // Day 3: minimal
      const d3 = Store.addDay({ date: '2026-02-03', startTime: '0800', endTime: '1200' });
      Store.addEvent(d3.id, {
        title: 'Outbrief', startTime: '0800', endTime: '1000',
        groupId: 'grp_all', isMainEvent: true,
      });

      Store.setActiveDay(d1.id);
      renderActiveDay();
    `,
  },
];
